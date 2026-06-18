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

Ambient Mesh giải quyết vấn đề này bằng cách tách data plane thành hai lớp riêng biệt và dùng proxy chia sẻ theo node thay vì theo pod.

---

## Tổng quan kiến trúc

Ambient Mesh gồm 5 thành phần chính:

1. **Istiod** — Control plane
2. **Ztunnel** — L4 proxy (DaemonSet, 1 pod/node)
3. **Waypoint Proxy** — L7 proxy (tuỳ chọn, theo namespace/service)
4. **Istio Gateway** — xử lý traffic từ bên ngoài vào cluster
5. **Istio CNI** — node agent, cấu hình iptables redirect

---

## Istiod — bộ não của mesh

Istiod là control plane, **không xử lý traffic thực**. Nó chỉ làm một việc: nói cho các proxy biết phải làm gì.

Trước đây Istio tách control plane thành 3 service riêng (Galley, Pilot, Citadel). Hiện tại tất cả đã được gộp vào một binary duy nhất — `istiod`.

Istiod làm những việc sau:

- Watch Kubernetes để phát hiện Istio CRD thay đổi (`VirtualService`, `DestinationRule`…)
- Validate và convert config đó thành routing/policy rules
- Push config đến tất cả proxy qua **xDS protocol**
- Quản lý certificate cho mTLS — tự cấp, rotate, revoke
- Khi pod chết, detect endpoint change và push update routing ngay lập tức

---

## Data Plane: Ztunnel và Waypoint

### Ztunnel — L4 proxy

Ztunnel (Zero Trust Tunnel) là thành phần cốt lõi, viết bằng Rust. Nó chạy như **DaemonSet** — một pod trên mỗi node.

Tất cả traffic từ pod đi qua ztunnel của node đó trước. Ztunnel xử lý **L3/L4**: mTLS, authentication, authorization (theo IP, port, identity), và thu thập L4 telemetry (TCP metrics, connection logs).

Cơ chế hoạt động:
1. Traffic vào node bị **iptables intercept** (hoặc eBPF nếu bật)
2. Ztunnel xử lý L3/L4, enforce mTLS
3. Dùng **HBONE protocol** (HTTP-Based Overlay Network Environment) để tạo encrypted tunnel đến ztunnel ở node đích
4. Nhận config update từ Istiod qua xDS

**Benchmark từ Istio 1.24**: ở 1.000 req/s, một ztunnel chỉ dùng ~0.06 vCPU và 12 MB RAM — giảm 3x so với sidecar.

### Waypoint Proxy — L7 proxy (tuỳ chọn)

Ztunnel không hiểu HTTP. Khi cần HTTP routing, canary deployment, circuit breaking, rate limiting, hay fault injection — bạn cần **Waypoint Proxy**.

Waypoint là Envoy (C++), chạy **bên trên** Ztunnel — nó không thể hoạt động nếu không có Ztunnel. Ztunnel lo tunnel bảo mật, Waypoint ngồi bên trong tunnel đó để xử lý L7.

Tại sao Waypoint là optional? Vì **không phải service nào cũng cần L7 features**. Chỉ deploy khi thực sự cần — đây là design choice của Ambient Mesh.

Flow khi có Waypoint:
1. Enable L7 bằng cách label Service/Namespace
2. Source ztunnel nhận config từ Istiod, biết phải route đến waypoint thay vì thẳng đến destination
3. Ztunnel mở HBONE tunnel đến waypoint
4. Waypoint xử lý L7 (retries, traffic splitting…)
5. Waypoint forward tiếp qua HBONE tunnel khác đến destination ztunnel → pod

---

## Istio Gateway — traffic từ ngoài vào

Ztunnel và Waypoint chỉ xử lý **east-west traffic** (nội bộ cluster). Traffic từ internet vào cluster đi qua **Istio Gateway**.

Gateway hoạt động giống Kubernetes Ingress controller: khi bạn tạo Istio Gateway object, nó spin up một external Load Balancer. Traffic đi qua: Load Balancer → Gateway pod → Ztunnel → service.

Istio hỗ trợ đầy đủ [Kubernetes Gateway API](https://kubernetes.io/docs/concepts/services-networking/gateway/) theo chuẩn GAMMA — được khuyến nghị thay cho Istio Gateway resource thuần tuý trong các cluster mới.

---

## Istio CNI — kết nối pod với Ztunnel

Pod không biết Istio tồn tại. Không có proxy nào inject vào pod cả. Vậy traffic từ pod đến được Ztunnel bằng cách nào?

Đó là việc của **Istio CNI** — một DaemonSet chạy trên mỗi node. Khi bạn label namespace với `istio.io/dataplane-mode=ambient`, CNI agent:

1. Detect namespace label change
2. Với mỗi pod trong namespace đó trên node của nó, CNI agent **cấu hình iptables rules** bên trong network namespace của pod để redirect traffic đến local ztunnel
3. Pod không trong namespace được label → không có rules → traffic chạy bình thường ngoài mesh

Istio CNI **không thay thế** CNI plugin đang dùng (Calico, Cilium…). Nó là chaining plugin — CNI thực lo việc networking (IP, interface, routes), Istio CNI chỉ thêm iptables redirect rules sau đó.

Muốn giảm latency và CPU overhead hơn nữa? Bật **eBPF mode** thay cho iptables.

---

## Ztunnel có phải Single Point of Failure không?

Câu hỏi hay. Mỗi node có một ztunnel, nếu ztunnel chết thì traffic đến pod trên node đó bị ảnh hưởng.

Nhưng:
- Pod trên **các node khác không bị ảnh hưởng**
- Ztunnel chạy như **DaemonSet** — Kubernetes tự restart nếu nó crash
- Trong distributed systems, node failure là chuyện bình thường. Thiết kế này assume điều đó

**Kết luận: Không phải SPOF.** Nó là per-node fault, không phải cluster-wide.

---

## Chi phí thực tế: Ambient vs Sidecar

Với cluster **10.000 pod / 50 namespace / 100 node**:

| Thành phần | Sidecar | Ambient Mesh |
|-----------|---------|--------------|
| Số proxy | 10.000 (1/pod) | ~100 (1 ztunnel/node) |
| CPU cần | ~1.000 vCPU | ~20–74 vCPU |
| Tiết kiệm ước tính | — | **~$430K/năm** |

Memory overhead cũng giảm đến **90%**. Đây là lý do tại sao Ambient đang trở thành default.

---

## Sidecar còn cần không trong 2026?

Trước 2025, sidecar là lựa chọn duy nhất. Từ 2026 trở đi, **Ambient là default**. Chỉ chuyển sang sidecar nếu bạn có yêu cầu kỹ thuật đặc thù mà Ambient chưa đáp ứng được.

Nếu bạn đang vận hành Istio với sidecar và chưa có kế hoạch migration — đây là thời điểm tốt để bắt đầu đánh giá.

---

*Nguồn tham khảo: [Istio Ambient Mesh Architecture — devopscube.com](https://devopscube.com/istio-architecture/)*
