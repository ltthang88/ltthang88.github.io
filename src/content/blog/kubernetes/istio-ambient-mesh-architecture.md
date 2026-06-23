---
title: "Istio Ambient Mesh: kiến trúc mới thay thế sidecar"
description: "Ambient Mesh đã GA từ Istio 1.24. Bài này phân tích từng thành phần — Istiod, Ztunnel, Waypoint Proxy, CNI — và lý do tại sao nó xóa được 'proxy bloat' của mô hình sidecar cũ."
pubDate: 2026-06-18
category: Kubernetes
tags: ["istio", "service-mesh", "ambient-mesh", "ztunnel", "envoy", "networking"]
---

> Ambient Mesh đạt GA trong Istio 1.24 (tháng 11/2024). Toàn bộ API — ztunnel, waypoint — đều ở trạng thái **Stable** và production-ready.

## Tại sao lại cần kiến trúc mới?

Mô hình sidecar truyền thống của Istio inject một Envoy proxy vào **mỗi pod**. Với cluster 10.000 pod, bạn có 10.000 Envoy đang chạy song song — tiêu tốn khoảng 1.000 vCPU và hàng chục GB RAM chỉ để làm nhiệm vụ proxy.

Ambient Mesh giải quyết vấn đề này bằng cách tách data plane thành hai lớp riêng biệt và dùng proxy **chia sẻ theo node** thay vì theo pod.

---

## Tổng quan kiến trúc

![Istio Ambient Mesh Architecture Overview](/images/istio/01-ambient-overview.svg)

Ambient Mesh gồm 5 thành phần chính:

1. **Istiod** — Control plane (màu vàng)
2. **Ztunnel** — L4 proxy chạy DaemonSet, 1 pod/node (màu xanh lá)
3. **Waypoint Proxy** — L7 proxy tuỳ chọn (màu tím)
4. **Istio Gateway** — xử lý traffic từ ngoài vào (màu cam)
5. **Istio CNI** — node agent cấu hình iptables redirect

---

## Istiod — bộ não của mesh

Istiod là control plane, **không xử lý traffic thực**. Nó chỉ làm một việc: nói cho các proxy biết phải làm gì.

Trước đây Istio tách control plane thành 3 service riêng (Galley, Pilot, Citadel). Hiện tại tất cả đã được gộp vào một binary duy nhất — `istiod`.

Istiod làm những việc sau:

- Watch Kubernetes để phát hiện Istio CRD thay đổi (`VirtualService`, `DestinationRule`…)
- Validate và convert config đó thành routing/policy rules
- Push config đến tất cả proxy qua **xDS protocol** (đường mũi tên vàng trong diagram)
- Quản lý certificate cho mTLS — tự cấp, rotate, revoke
- Khi pod chết, detect endpoint change và push update routing ngay lập tức

---

## Data Plane: Ztunnel và Waypoint

### Ztunnel — L4 proxy

Ztunnel (Zero Trust Tunnel) là thành phần cốt lõi, viết bằng Rust. Nó chạy như **DaemonSet** — một pod trên mỗi node. Tất cả traffic từ pod đi qua ztunnel của node đó trước.

Ztunnel xử lý **L3/L4**: mTLS, authentication, authorization (theo IP, port, identity), và thu thập L4 telemetry.

![Ztunnel traffic flow step by step](/images/istio/02-ztunnel-flow.svg)

Cơ chế hoạt động từng bước:

1. **Pod gửi request** đến Pod C — không cần biết Istio tồn tại
2. **iptables intercept** (do Istio CNI cấu hình) chuyển hướng traffic sang Ztunnel local
3. **Ztunnel Node 1** verify workload identity, enforce L4 policy, bật mTLS
4. Dùng **HBONE protocol** (HTTP CONNECT tunnel trên HTTP/2 + mTLS, port 15008) tạo encrypted tunnel sang Node 2
5. **Ztunnel Node 2** nhận và deliver traffic đến Pod C

**Benchmark từ Istio 1.24**: ở 1.000 req/s, một ztunnel chỉ dùng ~0.06 vCPU và 12 MB RAM — giảm 3x so với sidecar.

### Waypoint Proxy — L7 proxy (tuỳ chọn)

Ztunnel không hiểu HTTP. Khi cần HTTP routing, canary deployment, circuit breaking, rate limiting, hay fault injection — bạn cần **Waypoint Proxy**.

![Waypoint proxy L7 traffic flow](/images/istio/03-waypoint-flow.svg)

Hai điểm quan trọng cần hiểu:

- **Waypoint là optional** — không phải service nào cũng cần L7 features
- **Waypoint chạy trên nền Ztunnel** — không thể deploy riêng. Ztunnel lo tunnel bảo mật, Waypoint ngồi bên trong tunnel đó để xử lý L7

Flow khi có Waypoint:
1. Label namespace/service với `istio.io/use-waypoint=<name>`
2. Source ztunnel nhận config từ Istiod, biết phải route đến waypoint
3. Ztunnel mở HBONE tunnel đến Waypoint
4. Waypoint (Envoy C++) xử lý: retries, traffic splitting, circuit break, rate limit…
5. Waypoint forward tiếp qua HBONE tunnel khác → destination ztunnel → pod

---

## Istio Gateway — traffic từ ngoài vào

Ztunnel và Waypoint chỉ xử lý **east-west traffic** (nội bộ cluster). Traffic từ internet vào cluster đi qua **Istio Gateway**.

Gateway hoạt động giống Kubernetes Ingress controller: khi bạn tạo Istio Gateway object, nó spin up một external Load Balancer. Traffic đi qua: `Internet → Load Balancer → Gateway pod → Ztunnel → service`.

Istio hỗ trợ đầy đủ [Kubernetes Gateway API](https://kubernetes.io/docs/concepts/services-networking/gateway/) theo chuẩn GAMMA — được khuyến nghị thay cho Istio Gateway resource thuần tuý trong các cluster mới.

---

## Istio CNI — kết nối pod với Ztunnel

Pod không biết Istio tồn tại. Không có proxy nào inject vào pod cả. Vậy traffic từ pod đến được Ztunnel bằng cách nào?

Đó là việc của **Istio CNI** — một DaemonSet chạy trên mỗi node. Khi bạn label namespace với `istio.io/dataplane-mode=ambient`, CNI agent:

1. Detect namespace label change
2. Với mỗi pod trong namespace đó trên node của nó, CNI agent **cấu hình iptables rules** bên trong network namespace của pod để redirect traffic đến local ztunnel
3. Pod không trong namespace được label → không có rules → traffic chạy bình thường ngoài mesh

Istio CNI **không thay thế** CNI plugin đang dùng (Calico, Cilium…). Nó là chaining plugin — CNI thực lo việc networking (IP, interface, routes), Istio CNI chỉ thêm iptables redirect rules sau đó.

> Muốn giảm latency và CPU overhead hơn nữa? Bật **eBPF mode** thay cho iptables.

---

## Ztunnel có phải Single Point of Failure không?

Mỗi node có một ztunnel, nếu ztunnel chết thì traffic đến pod trên node đó bị ảnh hưởng.

Nhưng:
- Pod trên **các node khác không bị ảnh hưởng**
- Ztunnel chạy như **DaemonSet** — Kubernetes tự restart nếu nó crash
- Trong distributed systems, node failure là chuyện bình thường. Thiết kế này assume điều đó

**Kết luận: Không phải SPOF.** Nó là per-node fault, không phải cluster-wide failure.

---

## Chi phí thực tế: Ambient vs Sidecar

![Sidecar vs Ambient Mesh resource comparison](/images/istio/04-sidecar-vs-ambient.svg)

Với cluster **10.000 pod / 50 namespace / 100 node**:

| | Sidecar | Ambient Mesh |
|---|---|---|
| Số proxy | 10.000 (1/pod) | ~100 (1 ztunnel/node) |
| CPU overhead | ~1.000 vCPU | ~20–74 vCPU |
| Tiết kiệm ước tính | — | **~$430K/năm** |
| Memory | baseline | giảm ~90% |
| Restart pod khi upgrade | ✗ Cần | ✅ Không cần |

> **Lưu ý về cách tính:** Đây là con số *ước lượng minh hoạ*, không phải benchmark đo thực. Giả định: mỗi sidecar Envoy chiếm ~0.1 vCPU (10.000 sidecar → ~1.000 vCPU); ztunnel ~0.06 vCPU ở 1.000 req/s, scale theo tải nên dải 20–74 vCPU phản ánh khoảng từ cluster nhàn rỗi đến cluster tải cao. Con số tiết kiệm ~$430K/năm tính theo đơn giá on-demand vCPU của instance EC2 nhóm `c`/`m` ở `ap-southeast-1`. Chi phí thực tế phụ thuộc loại instance, mức commit (Savings Plan/RI) và tỷ lệ service cần waypoint — hãy thay số liệu của chính cluster bạn vào.

---

## Đánh đổi & hạn chế cần biết

Ambient không phải "bữa trưa miễn phí". Trước khi migrate, hãy cân nhắc:

- **Debug khó hơn vì HBONE.** Traffic east-west được bọc trong HBONE tunnel (mTLS, port 15008). `tcpdump` trên dây chỉ thấy gói đã mã hóa, không thấy HTTP của ứng dụng. Bạn buộc phải dựa vào `istioctl zc workloads/services`, ztunnel access log và config dump — khác hẳn thói quen debug sidecar. Thêm nữa, một ztunnel phục vụ **mọi pod trên node**, nên log của nó trộn lẫn traffic của nhiều workload, khó cô lập.

- **Mô hình shared-node giảm mức cô lập so với sidecar.** Với sidecar, mỗi proxy chỉ giữ identity/khóa mTLS của *đúng một* workload — blast radius khi một proxy bị xâm nhập là tối thiểu. Với ambient, ztunnel là tiến trình per-node xử lý traffic và identity cho **tất cả** pod trên node đó; nếu ztunnel bị compromise, phạm vi ảnh hưởng rộng hơn. Trong môi trường multi-tenant đòi hỏi cô lập mạnh, đây là điểm cần đánh giá kỹ.

- **L7 cần thêm một hop.** Ztunnel chỉ làm L4. Khi cần policy L7 chi tiết, traffic phải vòng qua waypoint (hai HBONE tunnel) — thêm latency và thêm một thành phần phải vận hành/scale.

- **Vài mảng còn đang hoàn thiện.** Multicluster ở chế độ ambient vẫn đang trưởng thành; một số use case `EnvoyFilter`/WASM quen dùng ở sidecar chưa được hỗ trợ tương đương. Nếu mesh hiện tại của bạn phụ thuộc nặng vào các tính năng này, hãy kiểm tra parity trước.

---

## Thử nghiệm nhanh: bật ambient & waypoint

Lý thuyết là đủ — phần hay là bạn có thể thử ngay trên một cluster test (kind/minikube) chỉ với vài lệnh.

**1. Cài Istio kèm ambient profile:**

```bash
istioctl install --set profile=ambient --skip-confirmation
```

**2. Thêm namespace vào mesh — chỉ cần một label, không restart pod:**

```bash
kubectl label namespace bookinfo istio.io/dataplane-mode=ambient
```

Ngay lập tức mọi pod trong `bookinfo` đã có mTLS + L4 authz qua ztunnel. Kiểm tra ztunnel "nhìn thấy" workload nào:

```bash
istioctl ztunnel-config workloads
```

**3. Cần L7 (HTTP routing, retries, traffic split)? Tạo một Waypoint:**

```bash
istioctl waypoint apply -n bookinfo --enroll-namespace
```

Hoặc khai báo tường minh qua Gateway API:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: waypoint
  namespace: bookinfo
  labels:
    istio.io/waypoint-for: service
spec:
  gatewayClassName: istio-waypoint
  listeners:
    - name: mesh
      port: 15008
      protocol: HBONE
```

**4. Trỏ một service đi qua waypoint:**

```bash
kubectl label service reviews -n bookinfo istio.io/use-waypoint=waypoint
```

Xong. Phần lớn workload chỉ cần bước 1–2 (L4 free); waypoint chỉ bật ở nơi thực sự cần L7.

---

## Sidecar còn cần không trong 2026?

Trước 2025, sidecar là lựa chọn duy nhất. Từ 2026, **Ambient là lựa chọn được khuyến nghị cho mọi cluster mới (greenfield)** — đơn giản hơn khi vận hành, nhẹ tài nguyên hơn, và là hướng đi chính của dự án. Lưu ý: profile cài đặt *mặc định* của Istio hiện vẫn là sidecar-based; bạn cần bật ambient một cách tường minh. Chỉ giữ/chọn sidecar nếu bạn có yêu cầu kỹ thuật đặc thù mà Ambient chưa đáp ứng được.

Nếu bạn đang vận hành Istio với sidecar và chưa có kế hoạch migration — đây là thời điểm tốt để bắt đầu đánh giá.

---

*Nguồn tham khảo: [Istio Ambient Mesh Architecture — devopscube.com](https://devopscube.com/istio-architecture/)*