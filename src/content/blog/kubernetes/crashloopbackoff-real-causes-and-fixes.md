---
title: "CrashLoopBackOff: nó không phải lỗi, và vì sao xóa pod chẳng sửa được gì"
description: "CrashLoopBackOff là trạng thái pod, không phải mã lỗi: container start, crash, rồi bị restart với exponential backoff. Xóa và tạo lại pod chỉ reset đồng hồ backoff — cái crash sẽ quay lại y nguyên cho tới khi bạn sửa gốc. Bài này đi qua sáu nguyên nhân thật, một vòng chẩn đoán cố định get → describe → logs → events, cách đọc exit code, và phần dễ sai nhất: phân biệt liveness với readiness probe."
pubDate: 2026-06-30T14:00:00+07:00
category: Kubernetes
tags: ["kubernetes", "debugging", "sre", "oomkilled", "probes", "devops"]
---

> `CrashLoopBackOff` là một trong những trạng thái đầu tiên ai làm Kubernetes cũng gặp, và cũng là một trong những trạng thái bị hiểu sai nhiều nhất. Nó không phải mã lỗi. Nó là một trạng thái chờ: container khởi động, thoát với mã khác 0, kubelet restart lại — và lặp, với khoảng chờ tăng dần. Hệ quả thực tế quan trọng nhất: xóa rồi tạo lại pod chỉ reset đồng hồ backoff, không đụng gì tới nguyên nhân. Cái crash sẽ quay lại nguyên vẹn. Muốn dừng vòng lặp, bạn phải đọc đúng thứ Kubernetes đang nói.

Mình viết lại bài này từ một bài khá đầy đủ của Roberto Pesce trên blog Cast AI. Bản gốc có phần kỹ thuật tốt nhưng đan khá nhiều quảng cáo sản phẩm của họ; ở đây mình giữ phần lõi thực sự hữu dụng — vòng chẩn đoán, cách đọc exit code, phân biệt probe — lược phần marketing, và thêm vài thứ mình học được khi vận hành chuyện này ở quy mô thật. Nếu bạn muốn bức tranh rộng hơn về việc giỏi Kubernetes nghĩa là gì, mình có viết riêng [một bài về chuyện đó](/blog/kubernetes/how-to-become-great-at-kubernetes/).

---

## CrashLoopBackOff thật ra là gì

Về mặt kỹ thuật, `CrashLoopBackOff` là giá trị của `Waiting.Reason` trong trạng thái pod. Container chạy, thoát với mã khác 0, kubelet khởi động lại, và để khỏi dồn tải lên node, Kubernetes giãn khoảng chờ giữa các lần thử theo cấp số nhân:

```
10s → 20s → 40s → 80s → 160s → 300s (chặn trần ở 5 phút)
```

Sau 10 phút container chạy ổn liên tục, bộ đếm reset về 0. Đó là lý do một pod "thỉnh thoảng" crash trông khác hẳn một pod crash liên tục: cái sau bị giam ở mức chờ 5 phút, mỗi lần bạn `kubectl get pods` lại thấy số `RESTARTS` nhích lên.

Đừng nhầm nó với `ImagePullBackOff`. Hai cái nghe giống nhau và đều dùng backoff, nhưng xảy ra ở hai giai đoạn khác nhau của vòng đời pod. `ImagePullBackOff` là *trước khi* container chạy — Kubernetes không kéo được image (sai tag, thiếu credential, lỗi mạng). `CrashLoopBackOff` là image đã kéo về ngon lành, container chạy được, rồi mới thoát với mã khác 0. Sửa hai cái này là hai việc hoàn toàn khác nhau, nên bước đầu tiên luôn là phân biệt mình đang ở giai đoạn nào.

---

## Sáu nguyên nhân thật

Phần lớn ca `CrashLoopBackOff` quy về sáu nhóm. Cái khó không phải là danh sách này, mà là phân biệt chúng — vì triệu chứng nhìn ngoài rất giống nhau, còn cách sửa thì khác hẳn.

| Nguyên nhân | Triệu chứng | Exit code điển hình | Thấy ở đâu |
|---|---|---|---|
| Sai config (env var, entrypoint, quyền) | Container thoát ngay khi start | 1 hoặc 2 | `logs --previous` báo lỗi config |
| OOM kill | Container bị kernel giết | 137 | `describe pod` hiện `OOMKilled: true` |
| Liveness probe fail | Pod restart dù app trông vẫn ổn | 143 (SIGTERM) hoặc 137 (SIGKILL nếu quá grace period) | `describe pod` hiện `Liveness probe failed` |
| Image hỏng / sai entrypoint | Container thoát trong vài mili-giây | 127 hoặc 1 | `logs --previous` rỗng hoặc lỗi exec |
| Thiếu dependency (ConfigMap, Secret, service) | App crash khi chờ dependency | 1 hoặc 2 | `describe pod` hiện lỗi mount hoặc thiếu resource |
| Init container fail | Pod kẹt trước khi container chính chạy | 1 hoặc 2 | STATUS hiện `Init:CrashLoopBackOff` |

Cái bẫy hay gặp nhất là gộp OOM kill với liveness probe fail, vì cả hai đều có thể cho exit code 137. Lát nữa mình sẽ tách chúng ra rõ ràng — đây là chỗ tốn thời gian on-call nhiều nhất nếu đoán mò.

---

## Vòng chẩn đoán: get → describe → logs → events

Đừng nhảy cóc. Mỗi bước thu hẹp nguyên nhân một chút, và thứ trông như OOM kill có khi lại là probe timeout. Mình luôn đi đúng trình tự này, kể cả khi "đã đoán ra rồi".

**Bước 1 — xác nhận trạng thái và số lần restart:**

```bash
kubectl get pods -n <namespace>
# NAME                         READY   STATUS                  RESTARTS   AGE
# payments-api-7d9f4b-xkj2p    0/1     CrashLoopBackOff        14         47m
# db-migrations-9c3a1b-zzz9k   0/1     Init:CrashLoopBackOff   3          12m
```

**Bước 2 — `describe pod` để lấy exit code và events:**

```bash
kubectl describe pod <pod-name> -n <namespace>
# Các trường cần nhìn:
#   Last State: Terminated
#     Reason:   OOMKilled       <-- bị OOM
#     Exit Code: 137
#   Liveness probe failed: ...  <-- vấn đề probe
#   Warning  FailedMount ...    <-- thiếu ConfigMap/Secret
```

**Bước 3 — đọc log của lần chạy TRƯỚC.** Đây là cờ quan trọng nhất và hay bị quên nhất. Không có `--previous`, bạn đọc log của container hiện tại (thường rỗng vì nó vừa mới restart):

```bash
kubectl logs <pod-name> -n <namespace> --previous

# Pod nhiều container: chỉ rõ container
kubectl logs <pod-name> -n <namespace> -c <container-name> --previous
```

**Bước 4 — xem events của cluster, sắp theo thời gian:**

```bash
kubectl get events -n <namespace> --sort-by='.lastTimestamp'
```

**Bước 5 — nếu nghi tài nguyên, lấy exit code bằng máy cho chắc** thay vì đọc bằng mắt:

```bash
# 137=OOMKilled, 1/2=lỗi app, 127=không tìm thấy lệnh
kubectl get pod <pod-name> -n <namespace> \
  -o jsonpath='{.status.containerStatuses[0].lastState.terminated.exitCode}'
```

Một lưu ý từ thực chiến mà bản gốc nói đúng và mình muốn nhấn: với pod nhiều container, **kiểm tra từng container một**. Sidecar service mesh — `istio-proxy`, agent của Datadog — ăn memory đủ để đẩy tổng pod vượt trần, khiến container chính bị OOM-kill dù bản thân nó dùng rất ít. Lần đầu gặp ca này mình mất nửa buổi soi container chính trong khi thủ phạm là cái sidecar bên cạnh.

---

## Sửa theo từng nguyên nhân

### Lỗi config hoặc app

Khi `logs --previous` hiện kiểu `Error: required environment variable DATABASE_URL is not set` hay `exec: "myapp": executable file not found in $PATH`, đây là vấn đề config hoặc đóng gói image, không phải tài nguyên.

- **Thiếu env var:** xác nhận ConfigMap/Secret được tham chiếu có tồn tại *trong cùng namespace*. Trỏ tới một object không tồn tại làm container thoát ngay.
- **Sai entrypoint:** kiểm tra `spec.containers[].command` và `args`. Nếu bạn ghi đè CMD của image, xác nhận đường dẫn binary bên trong image là đúng.
- **Lỗi quyền:** volume mount có thể không cho UID non-root của container ghi. Soi `fsGroup` và `runAsUser` trong `securityContext`.

Để debug sống mà không kích thêm một lần restart, gắn ephemeral container vào:

```bash
kubectl debug -it <pod-name> -n <namespace> \
  --image=busybox \
  --target=<container-name>
```

### OOM kill (exit code 137)

Exit code 137 kèm `OOMKilled: true` nghĩa là kernel Linux đã giết container vì vượt memory limit. Đặt limit cho đúng khó hơn vẻ ngoài của nó: cluster tổng thể thường thừa memory rất nhiều, nhưng từng pod riêng lẻ lại bị đặt thiếu — hai chuyện này không mâu thuẫn, và nó là lý do "cluster còn cả đống RAM" mà pod vẫn OOM.

Vài thứ kiểm tra trước khi vội nâng limit:

```bash
# Kiểm tra OOM event ở mức kernel trên node
journalctl -k | grep "Out of memory"

# LimitRange có thể âm thầm áp limit lên pod không tự khai báo
kubectl get limitrange -n <namespace>
kubectl describe limitrange -n <namespace>
```

Cái `LimitRange` này từng làm mình mất kha khá thời gian: một pod deploy ra *không* khai báo `resources.limits.memory`, nhìn tưởng "chạy không giới hạn", nhưng namespace có một `LimitRange` default (ví dụ 128Mi) tự áp vào — và pod bị giết ở đúng 128Mi. Đừng giả định pod không có limit; hãy kiểm tra.

Với workload JVM thì có một quy tắc gần như bắt buộc: đặt `-Xmx` khoảng 75% memory limit của container. Limit 512Mi thì `-Xmx384m`, chừa chỗ cho phần non-heap — metaspace, thread stack, native library. Bỏ qua bước này là một trong những nguyên nhân OOM phổ biến nhất của Java trên Kubernetes, vì heap phình tới sát limit rồi phần non-heap không còn chỗ.

Về tự động hóa: VPA giúp được, với `updateMode` là `Off` (chỉ gợi ý), `Initial` (đặt lúc tạo pod), `Recreate` (áp bằng cách evict pod), hay `Auto` (in-place trên K8s 1.33+). Có những tool thương mại đẩy xa hơn — bắt sự kiện OOMKill và áp limit mới ngay lập tức. Nhưng mình muốn nói thẳng một sắc thái mà bài gốc (vốn là blog vendor) không nhấn: tự động chỉnh limit theo thời gian thực rất hợp với môi trường thay đổi nhanh, *nhưng* ở hệ regulated, mỗi thay đổi resource production thường phải đi qua change control và để lại audit trail. Một hệ thống tự áp "tới 240 thay đổi mỗi giờ" nghe tuyệt về vận hành lại có thể vướng đúng ở khâu duyệt. Không phải lý do để bỏ tự động hóa, mà là lý do để cấu hình nó cho khớp ràng buộc của mình.

### Liveness và readiness probe

Đây là phần dễ tự bắn vào chân nhất, vì hai probe làm hai việc khác nhau:

- **Liveness fail** → kubelet **restart** container → gây `CrashLoopBackOff`.
- **Readiness fail** → pod bị **gỡ khỏi Service endpoint**, **không** restart container.

Gộp hai cái này là đẻ ra restart vô nghĩa. Quy tắc số một mình rút ra sau vài sự cố: **đừng bao giờ probe dependency bên ngoài trong liveness check.** Một cú chớp 30 giây của database không nên restart toàn bộ pod trong deployment — mà đó đúng là thứ xảy ra nếu liveness probe của bạn gọi sang DB.

> **Tình huống minh họa.** Một dịch vụ ở hệ mình từng vận hành có liveness probe gọi tới một endpoint mà bên trong nó lại check kết nối database. Khi DB có một nhịp chậm ngắn, *mọi* pod của deployment cùng fail liveness cùng lúc, cùng bị restart, cùng dồn vào DB lúc khởi động lại — biến một sự cố nhỏ thành một cơn cascade tự khuếch đại. Cái blip 30 giây ở DB hóa thành mấy phút downtime của service, và nguyên nhân không nằm ở DB. Sửa đơn giản đến mức bực mình: cho liveness chỉ kiểm tra tiến trình còn sống, đẩy phần kiểm tra dependency sang readiness.

Một điểm về exit code dễ gây nhầm: khi liveness fail, kubelet gửi `SIGTERM` trước, nên exit code thường là 143 (128 + signal 15), hoặc bất cứ mã nào app trả về trong signal handler. 137 (SIGKILL) chỉ đến *sau* nếu container vẫn chạy quá `terminationGracePeriodSeconds`. Nên nếu bạn thấy 137 từ một liveness fail, app của bạn đang phớt lờ SIGTERM và bị giết cưỡng bức — đó là một vấn đề riêng, đáng sửa.

Với app khởi động chậm, dùng `startupProbe` (K8s 1.18+) thay vì nhồi `initialDelaySeconds` cao một cách vô lý vào liveness:

```yaml
# failureThreshold * periodSeconds = cửa sổ grace lúc khởi động
# 30 * 10s = 5 phút trước khi liveness/readiness kích hoạt
startupProbe:
  httpGet:
    path: /healthz
    port: 8080
  failureThreshold: 30
  periodSeconds: 10

livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  periodSeconds: 10
  failureThreshold: 3
```

### Init container fail

Init container fail trông hơi khác trong `kubectl get pods`: STATUS hiện `Init:CrashLoopBackOff` hoặc `Init:Error`, và container chính *không bao giờ* chạy — Kubernetes chạy init container tuần tự, một cái thoát khác 0 là cả pod restart.

Lệnh chẩn đoán cũng khác, vì `kubectl logs <pod>` mặc định trỏ tới container chính (chưa chạy). Phải gọi tên init container ra:

```bash
# Liệt kê tên các init container
kubectl get pod <pod-name> -o jsonpath='{.spec.initContainers[*].name}'

# Đọc log lần chạy trước của một init container cụ thể
kubectl logs <pod-name> -c <init-container-name> --previous
```

Init container thường fail vì một trong hai lý do: chờ một dependency bên ngoài chưa sẵn sàng (DB readiness, một service endpoint chưa lên, network policy chặn probe), hoặc thiếu một Secret/ConfigMap mà nó cố mount. Cả hai đều lộ ra ở phần Events của `describe pod` dưới dạng `FailedMount` hoặc lỗi timeout kết nối — thường thấy được trước cả khi bạn kéo log.

---

## Phòng ngừa: ít crash loop hơn bằng vài thói quen

Chẩn đoán giỏi là cần, nhưng phần lớn `CrashLoopBackOff` né được từ đầu:

- **Đặt resource request và limit sát thực tế.** Request điều phối scheduling, limit chặn tiêu thụ. Profile dưới tải thật, đừng đoán. Limit memory đặt thiếu sinh OOM; không đặt limit lại để một container rò rỉ ngốn sạch node.
- **Dùng startupProbe cho workload khởi động nặng.** Với JVM, `startupProbe` với `failureThreshold` cao cộng với *bỏ CPU limit* trong pha khởi động giúp class-loading hoàn tất mà không bị throttle — CPU limit gây throttling làm pha nạp class của JVM chậm thê thảm. Dựa vào CPU request để scheduling, theo dõi utilization thật thay vì cắt cứng.
- **Graceful shutdown.** Xử lý SIGTERM, drain request đang dở, đặt `terminationGracePeriodSeconds` cho khớp. Một pod crash lúc shutdown có thể làm hỏng state khiến lần khởi động sau fail tiếp — và bạn có một crash loop chẳng liên quan gì tới nguyên nhân ban đầu.
- **Chuẩn bị đường lùi trước khi đổi gì ở production:**

```bash
kubectl rollout history deployment/<name> -n <namespace>
kubectl rollout undo deployment/<name> -n <namespace>
```

Điểm cuối này nghe hiển nhiên nhưng hay bị bỏ qua lúc 2 giờ sáng: trước khi sửa limit hay probe trên production, đảm bảo bạn undo được nhanh. Nhiều sự cố kéo dài không phải vì bản sửa sai, mà vì không có ai chắc cách quay lại trạng thái cũ.

---

## Chốt lại

`CrashLoopBackOff` không phải thứ để sợ, nó là Kubernetes đang nói cho bạn nghe — chỉ là nói bằng exit code và events chứ không bằng câu chữ. Đi đúng vòng `get → describe → logs --previous → events`, đọc đúng exit code (137 là OOM hoặc SIGKILL, 143 là SIGTERM, 1/2 là lỗi app, 127 là sai lệnh), và phân biệt cho rõ liveness với readiness — chừng đó xử lý được phần lớn ca thực tế.

Thứ mình muốn nhắn lại, từ ghế người trực: xóa pod gần như không bao giờ là cách sửa. Nó reset đồng hồ backoff, dashboard xanh lại vài phút, rồi crash quay về đúng như cũ — và bạn vừa mất luôn `--previous` log để truy nguyên. Chậm lại một nhịp, đọc cái Kubernetes đang nói, sửa đúng gốc. Đó là khác biệt giữa dập một sự cố và dập đi dập lại cùng một sự cố.

---

*Nguồn tham khảo: [CrashLoopBackOff in Kubernetes: The Real Causes and How We Fix It — Roberto Pesce, Cast AI](https://cast.ai/blog/crashloopbackoff). Bài viết được viết lại bằng tiếng Việt theo mạch riêng, lược phần quảng cáo sản phẩm và bổ sung tình huống vận hành cùng góc nhìn cho môi trường regulated; các số liệu trong bài gốc là của vendor và nên được đối chiếu tại nguồn.*
