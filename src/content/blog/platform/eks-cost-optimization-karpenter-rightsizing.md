---
title: "Tối ưu chi phí EKS: thứ tự mới là tất cả, không phải mẹo"
description: "Phản xạ phổ biến khi nhận một hóa đơn EKS lớn là mua Savings Plans ngay — và khóa luôn phần lãng phí vào hợp đồng 1-3 năm. Bài này đi qua bảy bước tối ưu chi phí EKS theo đúng trình tự: rightsize request trước, rồi Karpenter, Spot, Graviton, VPC endpoint, EBS, gom load balancer — và vì sao thứ tự đó không phải tùy chọn. Kèm góc nhìn cho môi trường regulated."
pubDate: 2026-06-30T16:00:00+07:00
category: Platform
tags: ["eks", "finops", "cost-optimization", "karpenter", "kubernetes", "aws"]
---

> Phản xạ phổ biến nhất khi một đội nhận hóa đơn EKS lớn là mua Savings Plans ngay lập tức — và đó là sai lầm đắt nhất trong cả quá trình. Bạn vừa khóa phần lãng phí vào một cam kết 1-3 năm với mức giảm 30%, trong khi lẽ ra có thể xóa hẳn phần lãng phí đó trong vài tuần. Tối ưu chi phí EKS không thiếu kỹ thuật; cái thiếu là làm đúng thứ tự. Rightsize trước, cam kết sau. Mọi thứ khác xếp ở giữa, và thứ tự ở giữa cũng không phải ngẫu nhiên.

Mình viết lại bài này từ một handbook khá đầy đủ của Ayobami Adejumo trên freeCodeCamp. Bản gốc trình bày một playbook bảy bước kèm rất nhiều con số từ trải nghiệm audit của tác giả; ở đây mình giữ phần khung và kỹ thuật cốt lõi, đọc các con số với con mắt dè dặt (chúng là ví dụ từ một ngữ cảnh cụ thể, không phải bảo đảm), và thêm góc nhìn vận hành cho môi trường regulated. Nếu bạn muốn bức tranh rộng hơn về kỷ luật hạ tầng, mình có bài [đừng dựng lại hạ tầng cho mỗi project](/blog/platform/avoid-rebuilding-infrastructure-with-paas/) và [Terraform ở quy mô đội lớn](/blog/platform/terraform-quy-mo-doi-lon/).

Một lưu ý ngay từ đầu về các con số: bản gốc dẫn một case "85.000$/tháng xuống 34.000$" và "giảm 50-60%". Mình không lặp lại chúng như cam kết — chúng là kết quả của một cluster cụ thể với mức over-provision cụ thể. Mức giảm thật của bạn phụ thuộc bạn đang lãng phí ở đâu và bao nhiêu. Cái đáng mang đi không phải con số phần trăm, mà là *trình tự*.

---

## Trước khi sửa: tiền đang đi đâu

Tối ưu nhầm hạng mục là cách nhanh nhất để đốt vài tuần công sức mà hóa đơn không nhúc nhích. Nên bước số 0 luôn là đo. Với một cluster EKS điển hình, compute (EC2 node) và data transfer thường chiếm áp đảo — bản gốc đưa ra phân bổ kiểu compute ~61%, data transfer ~18%, storage ~12%, còn lại nhỏ. Tỉ lệ cụ thể sẽ khác nhau, nhưng *hình dạng* thì khá phổ biến: compute và data transfer gộp lại là nơi gần như toàn bộ phần lãng phí sửa được nằm ở đó.

Kéo phân bổ chi phí tháng trước ra trước khi đụng vào bất cứ thứ gì, và lưu lại — đây là con số "before" để đối chiếu sau mỗi bước:

```bash
aws ce get-cost-and-usage \
  --time-period Start=$(date -d 'last month' +%Y-%m-01),End=$(date +%Y-%m-01) \
  --granularity MONTHLY \
  --group-by Type=DIMENSION,Key=SERVICE \
  --metrics UnblendedCost \
  --output table
```

Thói quen này nghe hiển nhiên nhưng hay bị bỏ qua: nếu không có con số before cho từng hạng mục, bạn sẽ không biết bước nào thật sự có tác dụng, và sẽ tranh cãi bằng cảm giác thay vì bằng dữ liệu.

---

## Sai lầm đắt nhất: sai thứ tự

Kịch bản mình thấy lặp đi lặp lại, và bản gốc mô tả rất đúng: đội nhận bill lớn → mua Savings Plans ngay để "giảm 30%" → sau đó mới dựng Karpenter và phát hiện đã commit nhầm họ instance → rồi muốn chuyển sang Graviton và phát hiện Savings Plan không cover ARM. Kết cục là một cam kết 12-36 tháng trả tiền cho đúng phần lãng phí lẽ ra đã xóa được.

Trình tự đúng là:

```
Bước 1: Rightsize pod request       ← luôn làm đầu tiên
Bước 2: Triển khai Karpenter        ← provision động dựa trên request đã rightsize
Bước 3: Bật Spot cho non-prod       ← Karpenter tự lo fallback
Bước 4: Chuyển sang Graviton        ← Karpenter làm việc này gần như liền mạch
Bước 5: Thêm VPC endpoint           ← xóa phí data transfer
Bước 6: Tối ưu EBS volume           ← quick win, chạy song song được
Bước 7: Gom load balancer           ← dọn dẹp cấu trúc cuối cùng
```

Rồi, và chỉ khi đó, mới mua Savings Plans — trên cái baseline đã tối ưu. Một quy tắc duy nhất: **tối ưu trước, cam kết sau.** Mỗi bước trước khi mua Savings Plan đều làm nhỏ lại phần bạn sắp khóa trong 1-3 năm. Lý do rightsize phải đứng đầu là vì mọi bước sau đều dựa trên request chính xác — Karpenter provision theo request, bin-packing tính theo request, commitment tính theo baseline. Request sai thì cả chuỗi sai theo.

---

## Bước 1 — Rightsize pod request

Đây là điểm dễ hiểu sai nhất về Kubernetes scheduling: **pod được xếp chỗ theo resource request, không phải theo mức dùng thật.** Một pod request 2 vCPU và 4GB cần một node có chừng đó dung lượng trống, bất kể nó thực sự dùng bao nhiêu. Khi mọi pod đều request gấp 8 lần nhu cầu thật, cluster cần gấp 8 lần số node — và đó chính là cái dòng "compute 61%" trong hóa đơn.

Kiểm tra mức dùng thật trước khi đổi bất cứ gì:

```bash
kubectl top pods --all-namespaces --sort-by=cpu
```

Nếu pod request 2 core nhưng thực dùng 15-25m, bạn có tỉ lệ over-request hàng chục lần, và mỗi node phần lớn là khoảng trống bạn đang trả tiền. Cách lấy con số "nên đặt bao nhiêu" mà không phải đoán là dùng Vertical Pod Autoscaler ở chế độ chỉ-gợi-ý (`updateMode: "Off"`) — nó quan sát usage thật rồi khuyến nghị, không tự restart pod:

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: payment-api-vpa
  namespace: production
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: payment-api
  updatePolicy:
    updateMode: "Off"      # chỉ gợi ý — bạn tự áp sau khi review
  resourcePolicy:
    containerPolicies:
    - containerName: "*"
      minAllowed: { cpu: "100m", memory: "256Mi" }
      maxAllowed: { cpu: "2", memory: "4Gi" }
```

Chờ VPA gom đủ dữ liệu (bản gốc nói 24 giờ; thực tế mình muốn ít nhất vài ngày để bắt được chu kỳ tải ngày/đêm và cuối tuần), rồi đọc khuyến nghị bằng `kubectl describe vpa`, lấy giá trị `Target` làm request mới và đặt limit khoảng gấp đôi để chừa headroom cho spike thật.

Một sắc thái mình muốn thêm: đừng rightsize bằng một cửa sổ quan sát quá ngắn. Một service báo cáo cuối tháng, một job chạy theo lịch, một đợt khuyến mãi — nếu VPA chỉ thấy ngày thường, nó sẽ khuyến nghị thiếu, và bạn đổi một hóa đơn cao lấy một loạt OOM kill. Rightsize là việc nên làm liên tục, không phải một lần.

---

## Bước 2 — Karpenter: bin-packing và Spot

Cluster Autoscaler cũ làm việc với node group định sẵn: bạn cấu hình trước vài loại instance và nó scale các group đó lên xuống. Giới hạn là nó chỉ provision được đúng những loại bạn khai trước, nên thường phải dựng song song một group CPU-optimized và một group memory-optimized — và tại bất kỳ thời điểm nào, một group thừa trong khi group kia đang scale. Không group nào vừa.

Karpenter (do AWS viết, đã donate cho CNCF) tiếp cận khác: nó nhìn request thật của các pod đang chờ và provision đúng loại instance vừa khít, chọn từ hàng nghìn họ instance thay vì hai ba loại định sẵn. Quan trọng không kém, nó liên tục theo dõi node bị dùng dưới mức và gom workload về ít node hơn, tự terminate node trống:

```yaml
apiVersion: karpenter.sh/v1beta1
kind: NodePool
metadata:
  name: default
spec:
  template:
    spec:
      requirements:
        # cho phép cả x86 và ARM (Graviton) — Karpenter chọn loại rẻ hơn
        - key: kubernetes.io/arch
          operator: In
          values: ["amd64", "arm64"]
        # thử Spot trước, tự fallback về On-Demand khi Spot hết
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["spot", "on-demand"]
  disruption:
    consolidationPolicy: WhenUnderutilized   # gom node thiếu tải, dời pod đi
    expireAfter: 720h                         # thay node sau 30 ngày → AMI mới, đã vá
```

Cách di chuyển an toàn từ Cluster Autoscaler là cài Karpenter *song song* trước (đừng gỡ CAS ngay), taint dần các node cũ để pod mới xếp sang node Karpenter, theo dõi vài tuần rồi mới xóa node group cũ.

Đây là chỗ mình muốn cắm một cảnh báo vận hành mà bản gốc nói nhẹ: `consolidationPolicy: WhenUnderutilized` rất tốt cho hóa đơn, nhưng nó nghĩa là Karpenter sẽ *chủ động* dời pod và recycle node. Với workload stateless thì vô hình. Với stateful — hoặc bất kỳ service nào nhạy với việc bị evict — bạn phải có **PodDisruptionBudget** đặt đúng, nếu không consolidation có thể dời nhiều replica cùng lúc và tạo một nhịp gián đoạn ngay giữa giờ cao điểm. Tiết kiệm node mà đổi lấy một sự cố availability là một món hời rất tệ. Đặt PDB trước, bật consolidation sau.

---

## Bước 3 — Spot cho non-production

Staging và dev không cần bảo đảm độ tin cậy như On-Demand. Chuyển chúng sang Spot tiết kiệm rất nhiều (bản gốc nói 60-90% cho phần node đó), và Karpenter tự xử lý Spot interruption bằng cách reschedule pod. Một NodePool Spot-only gắn taint để chỉ pod non-prod xếp vào là đủ.

Nhưng câu "Spot cho non-prod" cần một dấu hoa thị cho môi trường regulated, và đây là chỗ mình tách khỏi lời khuyên phổ quát của bản gốc. "Non-prod" trong ngân hàng không phải lúc nào cũng là "được phép gián đoạn tùy ý": môi trường UAT trước một đợt kiểm thử tuân thủ, hay một staging giữ dữ liệu đã được masking nhưng vẫn nằm trong phạm vi audit, có thể có ràng buộc về tính sẵn sàng hoặc data residency mà Spot interruption làm phức tạp thêm. Spot vẫn đúng cho phần lớn dev/test, chỉ là đừng coi nhãn "non-prod" là tấm vé miễn suy nghĩ.

---

## Bước 4 — Graviton: ARM rẻ hơn mà không phải đổi code

Graviton là dòng chip ARM của AWS, instance kết thúc bằng `g` (`m7g`, `c7g`, `r7g`). Giá thường thấp hơn instance x86 tương đương khoảng 20%, và với nhiều workload server-side (Node.js, Python, Go, Java) còn cho hiệu năng trên mỗi đô tốt hơn. Bạn không đổi code; bạn đổi flag kiến trúc lúc build image và node selector lúc deploy.

Điều kiện tiên quyết là image phải hỗ trợ ARM64. Kiểm tra manifest, và nếu chưa có, build multi-arch bằng buildx:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag your-registry/your-app:latest \
  --push .
```

Với Karpenter đã chạy, chuyển sang Graviton chỉ là thêm `nodeSelector: { kubernetes.io/arch: arm64 }` vào deployment — Karpenter tự provision node ARM. Di chuyển dần, bắt đầu từ service stateless, theo dõi 48 giờ rồi đi tiếp.

Bản gốc có liệt kê khi nào *không* nên chuyển: workload GPU, app có native binary x86. Mình thêm một cái thường gặp ở môi trường regulated mà bản gốc bỏ sót: **các sidecar bắt buộc của đội security.** Agent quét runtime, agent thu log tuân thủ, hay một số service mesh proxy phiên bản cũ có thể chưa có image ARM64. Bạn không kiểm soát lịch phát hành của chúng, và nếu một sidecar bắt buộc chưa hỗ trợ ARM, cả pod không lên Graviton được. Kiểm tra toàn bộ sidecar, không chỉ container chính, trước khi lên kế hoạch di chuyển.

---

## Bước 5 — VPC endpoint: gỡ thuế NAT Gateway

Mỗi byte đi từ pod EKS tới một dịch vụ AWS (S3, DynamoDB, ECR, SQS) đều chui qua NAT Gateway nếu bạn chưa cấu hình VPC endpoint — và NAT Gateway tính phí theo GB xử lý (khoảng 0.045$/GB). Một cluster bận kéo image từ ECR, ghi S3, poll SQS có thể đẩy hàng trăm TB/tháng qua NAT, sinh phí cho lưu lượng *chưa bao giờ rời mạng AWS*.

VPC endpoint tạo đường riêng giữa VPC và dịch vụ AWS, đi qua backbone của AWS thay vì NAT. Gateway endpoint cho S3 và DynamoDB *miễn phí* tạo; interface endpoint cho ECR tốn vài đô mỗi tháng — rẻ hơn nhiều so với phí NAT nó thay thế:

```bash
# S3 gateway endpoint — miễn phí, xóa toàn bộ traffic S3 qua NAT
aws ec2 create-vpc-endpoint \
  --vpc-id $VPC_ID \
  --service-name com.amazonaws.us-east-1.s3 \
  --route-table-ids $ROUTE_TABLE_ID
```

Lưu ý ECR cần *hai* interface endpoint (`ecr.api` và `ecr.dkr`) mới phủ hết đường kéo image. Đây là một trong những bước ROI cao nhất so với công bỏ ra — gần như chỉ tốn nửa buổi cấu hình.

Một điểm bản gốc không nhấn nhưng đáng tiền không kém ở quy mô lớn: **data transfer cross-AZ**. Pod ở AZ này gọi service ở AZ khác cũng bị tính phí. Dùng topology spread và topology-aware routing để giữ lưu lượng trong cùng AZ khi có thể, là một khoản tiết kiệm âm thầm mà nhiều đội bỏ qua vì nó không hiện thành một dòng to trong hóa đơn.

---

## Bước 6 — EBS: gp2 sang gp3 và dọn volume mồ côi

gp3 rẻ hơn gp2 khoảng 20% mỗi GB và cho 3.000 IOPS baseline bất kể dung lượng; chuyển đổi chạy online, không downtime. Đây là quick win thuần túy:

```bash
aws ec2 modify-volume --volume-id $vol --volume-type gp3
```

Song song đó, dọn volume mồ côi. Khi PersistentVolumeClaim bị xóa, EBS volume bên dưới đôi khi không được dọn theo — chúng vẫn chạy và vẫn tính tiền vô thời hạn. Tìm volume `status=available` (không gắn vào instance nào) và snapshot quá cũ. Một cảnh báo trước khi xóa: đối chiếu snapshot với lịch backup — đừng xóa nhầm bản backup duy nhất của một database production. Quick win không có nghĩa làm ẩu.

---

## Bước 7 — Gom load balancer

Nhiều đội tạo một Service `type: LoadBalancer` cho mỗi microservice, và mỗi ALB là một khoản phí cố định hàng tháng cộng phí theo lưu lượng. Hai mươi service là hai mươi ALB trước khi xử lý một request nào.

Cách sửa là một Ingress controller dùng chung: một ALB duy nhất định tuyến theo host và path tới nhiều service:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shared-ingress
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}, {"HTTPS": 443}]'
spec:
  rules:
  - host: api.company.com
    http:
      paths:
      - path: /payments
        pathType: Prefix
        backend: { service: { name: payment-service, port: { number: 8080 } } }
      - path: /users
        pathType: Prefix
        backend: { service: { name: user-service, port: { number: 8080 } } }
```

Cùng hành vi định tuyến, chi phí bằng một phần nhỏ. Đánh đổi cần biết: một ALB dùng chung là một điểm cấu hình tập trung — annotation sai hay cert hết hạn ảnh hưởng nhiều service cùng lúc, nên quản version cho cái Ingress này cẩn thận.

---

## Góc nhìn vận hành: thứ tự là kỷ luật, không phải mẹo

Thứ mình mang đi nhiều nhất từ bài gốc không phải con số tiết kiệm, mà là tư duy trình tự. Phần lớn đội biết từng kỹ thuật riêng lẻ — ai cũng nghe về Karpenter, về Graviton, về gp3. Cái họ làm sai là thứ tự, và sai tốn nhất ở đúng một chỗ: cam kết tài chính trước khi dọn nhà. Một Savings Plan mua trên baseline chưa tối ưu là khóa lãng phí vào hợp đồng dài hạn — và đó là loại sai lầm rất khó lùi.

Với môi trường mình làm, mình thêm ba sắc thái lên trên playbook này. Một, mọi thay đổi resource và topology trên production đều đi qua change control và để lại audit trail — nên "tự động áp tới hàng trăm thay đổi mỗi giờ" cần được cấu hình cho khớp ràng buộc, không bật hết cỡ. Hai, Spot và consolidation tuyệt vời cho chi phí nhưng phải đi kèm PodDisruptionBudget và một bài kiểm thử chịu-gián-đoạn thật, nếu không bạn đổi tiền lấy rủi ro availability. Ba, một phần "lãng phí" ở hệ regulated là chủ đích — dự phòng cross-AZ, headroom cho đợt kiểm toán, môi trường tách biệt vì compliance — và tối ưu mù quáng những thứ đó là cắt vào xương chứ không phải cắt mỡ.

Nói vậy không phải để bàn lùi. Playbook này đúng, và bảy bước theo đúng thứ tự sẽ cắt được phần lớn lãng phí thật ở gần như mọi cluster EKS. Chỉ là con số cuối cùng của bạn sẽ là con số của bạn — đo trước, đo sau từng bước, và để dữ liệu nói thay vì một lời hứa phần trăm.

---

*Nguồn tham khảo: [The EKS Cost Optimization Handbook — Ayobami Adejumo, freeCodeCamp](https://www.freecodecamp.org/news/eks-cost-optimization-reduce-your-aws-bill-using-karpenter-and-rightsizing). Bài viết được viết lại bằng tiếng Việt theo mạch riêng, lược phần quảng bá repo đi kèm và bổ sung góc nhìn cho môi trường regulated; các con số chi phí và mức tiết kiệm trong bài gốc là ví dụ từ ngữ cảnh của tác giả, nên được đối chiếu và đo lại trên hệ thống của chính bạn.*
