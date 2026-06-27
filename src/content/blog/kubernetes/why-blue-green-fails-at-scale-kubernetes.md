---
title: "Vì sao blue-green vỡ ở quy mô lớn trên Kubernetes — và dùng gì thay"
description: "Blue-green nghe rất gọn: hai môi trường giống hệt, chuyển hướng traffic để release, chuyển ngược để rollback. Nhưng ở quy mô lớn trên Kubernetes, mô hình này vấp phải vài vấn đề mà sơ đồ đẹp không vẽ ra. Bài này nói rõ cái 'vì sao', và những chiến lược thực sự hiệu quả cho từng loại thay đổi."
pubDate: 2026-06-25T09:00:00+07:00
category: Kubernetes
tags: ["kubernetes", "progressive-delivery", "argo-rollouts", "canary", "feature-flags", "devops"]
---

> Blue-green là kiểu ý tưởng nghe gần như quá đẹp: hai môi trường giống hệt, chuyển hướng traffic để release, chuyển ngược để rollback, không downtime. Nhưng khi áp nguyên xi vào một cluster Kubernetes chạy vài chục microservice với backend stateful dùng chung, nó tích lũy vấn đề nhanh hơn nhiều đội kịp nhận ra.

Phần lớn người ta rời bỏ blue-green một cách lặng lẽ, không giải thích đầy đủ lý do. Bài này cố nói cái lý do đó ra cho rõ, rồi đi qua những gì thực sự hoạt động cho từng nhóm bài toán.

## Mô hình blue-green kinh điển

Bạn duy trì hai môi trường production hoàn chỉnh: một cái đang live nhận toàn bộ traffic, một cái nằm chờ. Khi deploy bản mới, bạn đẩy nó vào môi trường chờ, chạy smoke test, rồi chuyển traffic qua bằng load balancer hoặc đổi DNS. Môi trường cũ vẫn được giữ ấm trong một khoảng để phòng rollback — và vì nó chưa bị xóa, rollback chỉ là đảo lại hướng traffic, không cần build lại gì.

Với hạ tầng đơn giản, cách này chạy tốt. Rắc rối bắt đầu khi bạn mang nó lên cluster Kubernetes lớn.

## Vì sao nó phức tạp lên ở quy mô lớn

### Chi phí tài nguyên là thật

Chạy song song hai môi trường production đầy đủ nghĩa là nhân đôi compute, memory, và có thể cả storage. Với một app nhỏ thì không đáng kể. Với một hệ Kubernetes hàng trăm service, nhiều thành phần stateful, baseline tiêu thụ tài nguyên đã cao sẵn, việc giữ ấm một môi trường chờ đầy đủ tốn tiền thật sự.

Nhiều đội xử lý bằng cách hạ công suất môi trường chờ — ít replica hơn, instance nhỏ hơn. Nhưng làm vậy là tự tạo một cái bẫy: bạn đang validate bản mới trên một môi trường không khớp sizing với production, nên các bug nhạy với tải có thể không lộ ra cho tới sau khi đã chuyển hướng traffic. Lúc đó thì "instant rollback" không còn cứu bạn khỏi việc đã đẩy lỗi ra cho người dùng.

### Database và service stateful không chuyển theo khi traffic đổi hướng

Đây mới là chỗ đau nhất, và cũng là chỗ sơ đồ blue-green hay bỏ qua. Việc chuyển hướng traffic xảy ra ở tầng mạng — Service hoặc Ingress của Kubernetes đổi selector để request đi vào môi trường mới. Nhưng database, Redis, message queue thì dùng chung giữa hai môi trường và không di chuyển theo. Hệ quả là một loạt ràng buộc thực tế:

- Schema migration phải tương thích ngược với cả bản cũ lẫn bản mới cùng lúc.
- Dữ liệu bản mới ghi ra phải đọc được bởi bản cũ, phòng khi rollback.
- Dữ liệu bản cũ ghi trong khoảng rollback phải được xử lý đúng khi bạn deploy lại.

Quản được mấy điều này đòi hỏi kỷ luật về schema evolution mà phần lớn đội chưa có sẵn. Khi nó gãy — một migration không tương thích ngược, hay bản mới ghi ra thứ bản cũ không đọc nổi — thì cái rollback đáng lẽ tức thời biến thành một bài tập khôi phục dữ liệu.

Ở một hệ tôi từng tham gia vận hành trong môi trường tài chính, đúng tình huống này từng xảy ra: bản mới thêm một cột NOT NULL và bắt đầu ghi vào đó, rồi một sự cố không liên quan buộc phải rollback. Bản cũ không biết cột đó tồn tại, các bản ghi mới làm gãy luồng đọc của nó, và việc "đảo lại traffic trong 30 giây" kéo thành mấy tiếng dọn dữ liệu. Sau lần đó, quy ước nội bộ đổi thẳng: mọi migration phải expand trước, deploy code đọc-ghi tương thích cả hai chiều, rồi mới contract ở một release sau — bất kể chiến lược deploy là gì.

### Request đang dang dở và session

Khi chuyển hướng traffic sang môi trường mới, các request đang được môi trường cũ xử lý hoặc bị bỏ, hoặc phải chờ hoàn tất trước khi môi trường đó bị rút ra. Với service stateless, request ngắn, chuyện này quản được. Nó khó lên với hai loại kết nối: WebSocket / gRPC stream bị cắt giữa chừng khi môi trường cũ bị drain, và session lưu phía server khiến người dùng đang thao tác mất trạng thái nếu bạn chưa chuyển sang token hay một session store dùng chung. Cả hai đều giải được, nhưng là việc kiến trúc phải làm trước, không phải thứ chữa vội lúc đang chuyển hướng.

### Kubernetes mặc định không phải blue-green

Cơ chế deploy mặc định của Kubernetes là rolling update. Muốn blue-green, bạn phải cố ý dựng thêm: hoặc hai Deployment tách rời với việc đổi Service thủ công, hoặc một service mesh như Istio/Linkerd với policy chia traffic, hoặc một công cụ progressive delivery như Argo Rollouts/Flagger. Mỗi lựa chọn thêm độ phức tạp vận hành, và thiếu tooling cùng kỷ luật quy trình thì đội dễ kết thúc với một bản tự chế chạy được cho ca đơn giản nhưng gãy theo những cách tinh vi khi có tải.

![Blue-green ở quy mô lớn: tầng mạng chuyển hướng được giữa hai môi trường, nhưng database/cache/queue dùng chung không chuyển theo](/images/deploy-strategies/01-blue-green-shared-state.svg)

## Dùng gì thay — và khi nào

Không có chiến lược deploy nào đúng cho mọi trường hợp. Lựa chọn phụ thuộc vào mức chấp nhận rủi ro, nhịp release, độ trưởng thành của đội, và bản chất thay đổi đang deploy.

Rolling update là điểm xuất phát hợp lý cho phần lớn đội. Kubernetes thay pod dần dần, giữ tính sẵn sàng suốt quá trình, không nhân đôi tài nguyên và được hỗ trợ native. Hạn chế chính là tốc độ rollback: rollback nghĩa là chạy một rolling update ngược lại, và việc đó mất thời gian. Nếu cửa sổ 5–10 phút chấp nhận được và thay đổi tương thích ngược, rolling update là lựa chọn không cần phải biện minh.

Canary giải quyết đúng giới hạn đó khi bạn muốn kiểm chứng trên traffic thật trước khi rollout đầy đủ — đẩy 1–5% traffic sang bản mới, quan sát metric, rồi tăng dần hoặc rollback. Argo Rollouts và Flagger lo phần promote/rollback tự động dựa trên metric, còn Istio/Linkerd lo cơ chế chia traffic.

Điều kiện thực sự để canary hoạt động không phải tooling, mà là tiêu chí thành công được định nghĩa trước. Tiêu chí tốt nghe như:

```
promote nếu error rate < 0.5% VÀ p99 latency < 200ms, giữ trong 10 phút
```

Còn "nhìn ổn áp" thì không phải tiêu chí. Mình đã thấy canary bị promote bằng mắt thường rồi vỡ sau đó, đơn giản vì không ai viết ra ngưỡng cụ thể để máy tự quyết.

Blue-green vẫn có chỗ, nhưng phạm vi hẹp hơn nhiều người nghĩ. Nó hợp lý nhất khi thay đổi đủ rủi ro để xứng đáng có khả năng rollback tức thời, khi các service liên quan thực sự stateless hoặc phần stateful đã được xử lý riêng, hoặc khi bạn làm một đợt đổi major version ở tầng hạ tầng mà canary tăng dần không hợp. Nếu dùng blue-green trên Kubernetes, Argo Rollouts có bản triển khai trưởng thành lo việc quản hai ReplicaSet và đổi selector của Service — tốt hơn hẳn tự code tay.

Thứ bị đánh giá thấp nhất trong bộ này là feature flag — đáng chú ý là nó không phải chiến lược deploy theo nghĩa hạ tầng. Tách việc deploy code khỏi việc bật tính năng cho người dùng nghĩa là bạn có thể deploy liên tục mà không phơi hành vi mới ra, rồi bật dần cho từng nhóm. LaunchDarkly, Flagsmith, Unleash cho bạn khả năng này. Kết hợp với rolling update, bạn có sự đơn giản vận hành của rolling update cộng với khả năng kiểm soát rủi ro kiểu blue-green — vì rollback một tính năng giờ chỉ là tắt một flag, không đụng tới deployment.

## Một khung quyết định

| Tình huống | Chiến lược nên dùng |
|---|---|
| Service stateless, thay đổi tương thích ngược | Rolling update |
| Service traffic cao, có rủi ro regression | Canary kèm metric tự động |
| Thay đổi rủi ro cao, cần rollback tức thời | Blue-green (giới hạn phạm vi) |
| Tính năng mới, cần kiểm chứng hành vi | Feature flag + canary |
| Migration hạ tầng lớn | Blue-green kèm kế hoạch stateful cẩn thận |

Trong thực tế, một đội trưởng thành dùng gần như tất cả cùng lúc: rolling update cho thay đổi thường ngày, canary cho cái rủi ro hơn, feature flag cho hành vi sản phẩm, và blue-green dành riêng cho đúng những ca mà sự đảm bảo của nó thực sự xứng với chi phí.

## Công cụ nên biết

- **Argo Rollouts** — lựa chọn trưởng thành nhất cho progressive delivery trên Kubernetes; hỗ trợ canary, blue-green, và experiment native.
- **Flagger** — progressive delivery hiểu service mesh; tích hợp tốt với Istio và Linkerd.
- **Istio** — quản traffic ở tầng mesh; cho điều khiển routing canary chi tiết.
- **Flux / Argo CD** — GitOps, ghép tốt với các chiến lược progressive delivery.
- **LaunchDarkly / Unleash** — quản feature flag để tách deploy khỏi release.

## Chốt lại

Những đội deploy tin cậy nhất hiện nay không dùng một chiến lược duy nhất. Rolling update là mặc định hằng ngày; canary cho thay đổi rủi ro hoặc hướng người dùng; feature flag để tách release khỏi deploy; blue-green được để dành cho đúng những ca mà rollback tức thời xứng với chi phí.

Với bối cảnh regulated — ngành tài chính, nơi chính sách kiểm soát thay đổi đôi khi bắt buộc khả năng rollback tức thời — blue-green giới hạn phạm vi vẫn giữ vai trò, dù tốn kém. Câu trả lời "tùy ngữ cảnh" nghe kém dứt khoát hơn một chiến lược vạn năng — nhưng nó là câu đúng.

---

*Nguồn tham khảo: [Why Blue-Green Deployments Fail at Scale in Kubernetes — and What Works Instead — Bala Priya C, Cloud Native Now](https://cloudnativenow.com/contributed-content/why-blue-green-deployments-fail-at-scale-in-kubernetes-and-what-works-instead/). Bài viết được viết lại bằng tiếng Việt theo góc nhìn vận hành thực tế; sơ đồ do blog tự vẽ.*
