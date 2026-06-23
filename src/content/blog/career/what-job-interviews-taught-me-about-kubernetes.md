---
title: "Những buổi phỏng vấn đã dạy tôi điều gì về Kubernetes"
description: "Sau hơn chục buổi phỏng vấn, tôi nhận ra hầu như công ty nào cũng dùng Kubernetes — kể cả startup 10 người không có vấn đề về scale. Bài này phân tích vì sao, với tình huống minh họa cụ thể cho từng lý do, và khi nào bạn thực sự KHÔNG nên dùng K8s."
pubDate: 2026-06-22T09:00:00+07:00
category: Career
tags: ["kubernetes", "career", "gitops", "devops", "platform-engineering"]
---

> Đây là phiên bản viết lại và mở rộng (kèm tình huống minh họa) từ bài luận gốc của notnotp.com. Quan điểm trong bài là góc nhìn tổ chức — vì sao công ty *chọn* Kubernetes — chứ không phải hướng dẫn kỹ thuật.

Gần đây tôi đi tìm việc: đọc job posting, phỏng vấn, nói chuyện với đội kỹ thuật của khoảng hơn chục công ty. Và tôi nhận ra một điều khác hẳn so với lần tìm việc cách đây 5 năm: **gần như công ty nào cũng đang chạy trên Kubernetes.** Không sót một chỗ nào.

Lần trước thì không như vậy. Hồi đó thị trường chia làm 3 phe rõ rệt:

- Nhóm hiếm hoi đã adopt Kubernetes sớm.
- Nhóm đông đảo chạy `systemd` trên VM/VPS/EC2.
- Nhóm serverless (Lambda, Cloud Run...).

Điều làm tôi bất ngờ: chỗ tôi đang làm có bài toán quy mô thật sự lớn nên K8s là lựa chọn hiển nhiên. Nhưng một startup 10 người với đúng hai service thì sao? Không ai trong số họ làm microservices hay có nhu cầu scale cao cả. Vậy mà vẫn Kubernetes. Nên tôi hỏi thẳng: tại sao?

Câu trả lời bất ngờ: **họ không quan tâm nhiều đến khía cạnh kỹ thuật của K8s.**

---

## Tại sao? Hỏi thẳng CTO trong buổi phỏng vấn

Phỏng vấn kỹ thuật hóa ra là nơi lý tưởng để hỏi "tại sao", nhất là khi bạn ngồi đối diện trực tiếp với CTO. Và câu trả lời ở các nơi gần như giống hệt nhau, gói gọn trong ba điều dưới đây.

### 1. Tính đồng nhất (Uniformity)

Lý do đầu tiên: **mọi service deploy theo cùng một cách.** Không còn cảnh service *payment* âm thầm chạy trên một con VM trần với cái script bash "thần thánh" từ 2019, trong khi API thì nằm trên Docker Compose vì chẳng ai dám đụng vào. Một cách deploy duy nhất, áp dụng cho tất cả.

> **Tình huống minh họa.** Công ty B có 4 service: `api`, `payment`, `worker`, `cron-billing`. Trước khi lên K8s, mỗi service được "ai dựng nấy chịu":
> - `api` deploy bằng `git pull && pm2 restart` qua SSH.
> - `payment` chạy `systemd` trên một con EC2 riêng, biến môi trường nhét trong `/etc/payment.env` mà chỉ một anh đã nghỉ việc biết.
> - `worker` thì... chạy trong một `screen` session, ai cũng sợ reboot máy.
>
> Sau khi chuẩn hóa về K8s, cả 4 service đều là một `Deployment` + `Service` mô tả trong YAML, biến môi trường nằm trong `ConfigMap`/`Secret`, deploy bằng đúng một lệnh `helm upgrade`. Người mới vào nhìn 4 thư mục chart giống hệt nhau về cấu trúc — không còn "ngoại lệ bí ẩn" nào để mà sợ.

### 2. Kiến thức được chuẩn hóa và có thể tuyển được

Lý do thứ hai: **kiến thức dùng chung, tuyển được trên thị trường.** Kubernetes giờ gần như là một thứ "tiếng phổ thông". Ngày đầu đi làm ở công ty hiện tại, tôi mở repo chứa Helm charts và Kube config, và trong vòng một tiếng tôi đã nắm được bức tranh tổng thể của cả kiến trúc. Kiến thức nằm trong YAML, không bị kẹt trong đầu một người nào đó. Mất một người, người thay thế không phải mất ba tuần lục tài liệu để hiểu mọi thứ chạy thế nào.

> **Tình huống minh họa.** 2 giờ sáng, service `checkout` sập. SRE trực đêm tên Linh chưa từng đụng vào service này. Nhưng vì nó là K8s như mọi service khác, Linh làm đúng các bước phản xạ:
> ```bash
> kubectl get pods -n checkout            # thấy 3/5 pod CrashLoopBackOff
> kubectl logs -n checkout deploy/checkout --previous   # đọc log lần crash trước
> kubectl describe pod -n checkout checkout-xxux         # OOMKilled — hết RAM
> ```
> Linh tăng `resources.limits.memory`, `helm upgrade`, service sống lại. Cô ấy không cần biết `checkout` được team nào viết hay viết bằng ngôn ngữ gì — **pattern điều tra giống nhau cho mọi service.** Thử làm điều này với một rừng VM mà mỗi service cấu hình một kiểu xem: Linh sẽ phải đi tìm xem service này nằm ở máy nào, log ghi ở đâu, restart bằng lệnh gì.
>
> *Lưu ý: điều này chỉ đúng nếu không ai "sáng tạo" quá đà với setup.*

### 3. Truy vết được ai làm gì (Traceability)

Lý do thứ ba: **khả năng truy vết — và đi kèm là compliance.** Ở công ty hiện tại, không ai được phép `kubectl apply -f` thẳng vào cluster. Bạn push Helm chart lên git, có dấu vết, có quy trình duyệt merge request, rồi FluxCD hoặc ArgoCD mới thực sự deploy. Không có gì xảy ra trong bóng tối. Cái này ăn khớp tuyệt vời với compliance: về cơ bản đó là cách chúng tôi vượt qua các kỳ chứng nhận ISO một cách nhẹ nhàng. Và vì GitOps gắn liền tự nhiên với Kubernetes, bạn gần như có được tất cả những thứ đó miễn phí.

> **Tình huống minh họa.** Tuần trước production có sự cố: rate limit của API bị nới lỏng bất thường lúc 14:32. Auditor hỏi: "Ai đổi? Khi nào? Ai duyệt?"
>
> Với mô hình GitOps, câu trả lời nằm trong một lệnh `git log`:
> ```
> commit a1b2c3d  Author: Tuan  Date: 14:05
>   feat(api): raise rate limit 100 -> 1000 rps for campaign
>   Reviewed-by: Mai (MR #482, approved 14:20)
>   Deployed-by: ArgoCD (synced 14:32)
> ```
> Có người đề xuất, có người duyệt, có thời điểm sync tự động — chuỗi trách nhiệm khép kín. So với kịch bản cũ: một ai đó SSH vào server sửa nginx config rồi `reload`, không log, không reviewer. Khi auditor hỏi, cả team nhìn nhau.

---

## Điều tôi rút ra

Các CTO tôi nói chuyện không hề lựa chọn ngu ngốc. Họ đang giải quyết những vấn đề có thật.

Trước đây tôi chỉ nhìn K8s ở khía cạnh kỹ thuật — với tôi nó luôn là một giải pháp kỹ thuật cho vấn đề kỹ thuật. Nhưng hóa ra rất nhiều CTO quan tâm trước hết đến **lợi ích phi kỹ thuật** — nhiều hơn tôi tưởng. Vấn đề kỹ thuật của họ đơn giản không đòi hỏi K8s. Tôi cá là bạn sẽ không tìm thấy [topologySpreadConstraints](https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/) trong manifest của họ — họ chẳng quan tâm. Không HPA, không Pod Disruption Budget, không node affinity. Số node họ chạy cũng đúng bằng số VM họ sẽ dùng nếu không có K8s. Nhưng họ **chấp nhận trả giá bằng việc vận hành một phần mềm phức tạp để đổi lấy lợi ích tổ chức.**

> **Tình huống minh họa.** Startup C có đúng một stateless service và một database. Họ vẫn dựng EKS. Manifest của họ chỉ vỏn vẹn: một `Deployment` `replicas: 2`, một `Service`, một `Gateway` và một `HTTPRoute`. Không autoscaling, không gì cao siêu. Một kỹ sư hỏi: "Hai con VM với một load balancer là xong, sao phải EKS?" CTO trả lời: "Vì sáu tháng nữa tôi sẽ tuyển thêm 3 kỹ sư, và tôi không muốn dành tuần đầu của mỗi người để giải thích server của chúng ta hoạt động ra sao." Họ mua **sự đồng nhất cho tương lai**, không phải sức mạnh kỹ thuật cho hiện tại.

Thành thật mà nói, tôi nghĩ phần lớn là ổn. Nhưng tôi vẫn cho rằng đa số công ty nên **bắt đầu mà không có K8s.** Cluster thực sự khó debug khi có sự cố, và ở giai đoạn đầu bạn muốn dồn năng lượng cho sản phẩm, không phải hạ tầng. Khi bạn còn đang pitch cho khách hàng lớn tiếp theo, việc dựng một con VPS và `git pull` bẩn một phát là một bản vá khẩn cấp hoàn toàn hợp lệ. Chưa tối ưu, đúng. Nhưng nhanh, và bạn biết chính xác chuyện gì đang diễn ra. Bạn thật sự không muốn ngồi hai tiếng tìm hiểu vì sao cái pod kẹt ở `CrashLoopBackOff` ngay trước một cuộc gọi với khách hàng.

> **Tình huống minh họa.** 30 phút trước demo cho nhà đầu tư, bản build mới bị lỗi config.
> - **Đội VPS:** SSH vào, `git pull`, sửa một dòng `.env`, `systemctl restart app`. 90 giây. Xong, kịp demo.
> - **Đội K8s non kinh nghiệm:** sửa `ConfigMap`, pod restart nhưng kẹt `CrashLoopBackOff`. `kubectl describe` báo `readinessProbe failed`. Loay hoay xem probe sai port hay app chậm khởi động... 25 phút trôi qua, mồ hôi vã ra. Sự phức tạp mà họ chưa cần đến lại quay ra cắn họ đúng lúc không nên.

---

## Vì sao bước ngoặt lại diễn ra gần đây?

Tôi vẫn chưa hiểu hẳn vì sao cú dịch chuyển lại xảy ra đúng vào lúc này. 5 năm trước cả 3 phe đều sống khỏe. Giờ thì phe `VM` +`systemd` gần như biến mất khỏi các tin tuyển dụng, serverless vẫn ở thị trường ngách, còn `K8s` thì thắng tuyệt đối.

Phỏng đoán của tôi:

- **Managed Kubernetes trưởng thành.** EKS, GKE, AKS đã đủ ổn định để bạn không phải tự vận hành control plane.
- **Lợi thế nhân lực đã đảo chiều.** K8s trở thành tiêu chuẩn mặc định, khiến việc tìm kiếm kỹ sư cho các kiến trúc phi-K8s trở nên khó khăn và đắt đỏ hơn.
- **Helm biến "dùng chart của người khác" thành lựa chọn thực tế.**

> **Tình huống minh họa.** Công ty cần dựng Redis, Postgres, và một message queue. Năm 2020: ba lần đọc tài liệu, ba kiểu cài `systemd`, tự lo backup và HA. Năm 2026: ba lệnh.
> ```bash
> helm install redis bitnami/redis
> helm install pg bitnami/postgresql
> helm install rabbitmq bitnami/rabbitmq
> ```
> Khi rào cản dựng hạ tầng tụt xuống mức này, lý do để *không* dùng K8s cũng mỏng đi theo.

---

## Vậy khi nào nên dùng Kubernetes?


Ranh giới chuyển đổi của tôi rất rõ ràng: đó là khi **CTO không còn là một 'one-man show'**. Ngay khoảnh khắc kỹ sư thứ hai bước vào đội ngũ, những bài toán mà K8s sinh ra để giải quyết mới thực sự hiện hình:

- Giờ có một người *không* dựng server nhưng *cần* deploy.
- Có người cần access control đàng hoàng, chứ không phải SSH key cho mọi thứ.
- Có người rồi sẽ nghỉ việc và mang theo tất cả những gì họ biết.

Đó là lúc bạn muốn **hệ thống giữ kiến thức, chứ không phải con người giữ kiến thức.**

> **Tình huống minh họa — bài test ngược.** Hỏi: "Nếu người duy nhất biết hệ thống chạy thế nào nghỉ việc ngày mai, công ty có deploy được bản vá khẩn không?"
> - Nếu câu trả lời là "không" hoặc "phải đợi người đó trả lời tin nhắn" → bạn đã đến ngưỡng cần một hệ thống chuẩn hóa (K8s hoặc tương đương).
> - Nếu vẫn là "có, mọi thứ trong git và ai cũng deploy được" → bạn chưa cần vội.

---

## Tóm lại

Kubernetes thắng không hẳn vì nó là giải pháp kỹ thuật xuất sắc cho mọi quy mô — mà vì nó giải được ba bài toán *tổ chức*: đồng nhất cách làm việc, biến kiến thức thành thứ tuyển được, và để lại dấu vết cho mọi thay đổi. Đó là lý do cả những công ty không cần đến sức mạnh kỹ thuật của nó vẫn chọn nó.

Nhưng "ai cũng dùng" không có nghĩa "bạn phải dùng ngay từ ngày đầu". Hãy bắt đầu đơn giản, và lên K8s khi nỗi đau tổ chức bắt đầu xuất hiện (chứ không phải nỗi đau kỹ thuật) 

---

*Nguồn tham khảo & cảm hứng: [What job interviews taught me about Kubernetes — notnotp.com](https://notnotp.com/notes/what-job-interviews-taught-me-about-kubernetes). Bài viết này được viết lại bằng tiếng Việt và bổ sung các tình huống minh họa; nội dung đã được diễn giải lại để phù hợp với mục đích chia sẻ.*
