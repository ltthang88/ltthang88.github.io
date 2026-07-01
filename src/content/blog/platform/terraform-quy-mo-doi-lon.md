---
title: "Khi 60 kỹ sư cùng viết Terraform: thứ tutorial không dạy"
description: "Tutorial dạy bạn viết Terraform với một repo, một state file, một môi trường, apply từ laptop. Nhưng vào một công ty thật, gần như không ai apply lên production từ laptop. Bài này nói về những gì xảy ra sau khi bạn đã biết cơ bản và bắt đầu chia sẻ hạ tầng với hàng chục kỹ sư khác — và vì sao gần như mọi vấn đề đều quy về một thứ: ownership."
pubDate: 2026-06-27T10:00:00+07:00
category: Platform
tags: ["terraform", "infrastructure-as-code", "platform-engineering", "devops", "ci-cd", "gitops"]
---

> Tutorial dạy bạn cú pháp Terraform. Cái nó không dạy là chuyện gì xảy ra khi 60 kỹ sư cùng viết Terraform trên cùng một hệ hạ tầng. Lúc học, bạn có một repo, một state file, một môi trường, và `terraform apply` chạy từ laptop. Vào một tổ chức lớn, phần lớn những gì bạn thấy sẽ không khớp với cái bạn từng tập.

Mô hình "một repo, một state, apply từ máy mình" chạy ngon cho tới đúng cái ngày bạn nhận ra: ở quy mô đội lớn, gần như không ai apply lên production từ laptop cả. Thay đổi hạ tầng đi qua pull request và pipeline. State nằm trong bucket có khóa, không ai chạm tay trực tiếp. Và phần lớn các quy ước trông như thủ tục rườm rà thực ra đều sinh ra từ một sự cố cụ thể nào đó trong quá khứ.

Bài này đi qua cách các đội lớn thực sự vận hành Terraform: state file được chia và bảo vệ thế nào, module dùng chung được version ra sao, vì sao thay đổi phải đi qua pipeline, làm sao phát hiện những thay đổi xảy ra ngoài Terraform, và cách khôi phục khi state hỏng. Mỗi thực hành ở đây tồn tại vì một đội nào đó từng đâm vào tường rồi dựng ra cái rào để lần sau không đâm nữa.

> Bài giả định bạn đã quen Terraform và hiểu pull request / merge branch của Git hoạt động ra sao. Đây không phải bài nhập môn — nó nói về giai đoạn sau khi bạn đã biết cơ bản và bắt đầu chia hạ tầng với người khác.

---

## State file: vì sao nó được đối xử như một production database

Trước khi nói tới chuyện chia state hay dựng pipeline, cần hiểu vì sao đội lớn lại nâng niu cái state file đến vậy. Nhìn bề ngoài nó chỉ là sổ ghi chép — danh sách những gì Terraform đã tạo. Lý do thật nằm ở chỗ khác: state thường chứa secret ở dạng plaintext.

Mọi giá trị nhạy cảm truyền vào một resource trong lúc apply — mật khẩu database, API key, connection string — đều nằm lại trong state. Kể cả khi bạn đánh dấu biến là `sensitive` trong code, giá trị vẫn rơi vào state file, vì Terraform cần nó để tính diff cho các plan sau. Hệ quả thẳng thừng: ai đọc được state là đọc được mật khẩu database của bạn.

Đó là lý do trong tổ chức lớn, kỹ sư thường không có quyền chạm trực tiếp vào bucket chứa production state. Terraform chạy qua pipeline CI/CD, pipeline assume một IAM role riêng có quyền đọc/ghi state và thực thi apply. Kỹ sư tương tác với hạ tầng qua pull request và plan output, không qua việc sờ vào bucket. Tách như vậy vừa giảm rủi ro lộ secret, vừa tạo ra một audit trail: mọi thay đổi state đều do pipeline làm và đều được log, nên muốn truy lại "ai đổi gì, lúc nào" cũng chỉ là chuyện mở log ra xem.

---

## State hỏng xảy ra như thế nào

State file là cách Terraform nhớ nó đã dựng những gì: từng resource, từng ID, từng giá trị cấu hình. Khi nó lệch khỏi hiện trạng thật trên cloud, ta gọi đó là state hỏng. Nó bị đổ lỗi cho đủ thứ, nhưng người từng dọn nó trên production đều biết: phần lớn quy về một nhúm tình huống, mỗi cái một nguyên nhân và một cách chữa khác nhau.

### Hai kỹ sư apply cùng lúc

Muốn hiểu ca này, cần nhớ một điều về cách `terraform apply` làm việc: nó gồm hai bước tách rời nhau.

<img src="https://cdn.hashnode.com/uploads/covers/698d563262d4ce66226a844a/1fdf9458-9c60-4b65-8bd7-2126b8d47065.png" alt="terraform apply gồm hai bước tách rời: bước 1 Terraform bảo AWS tạo subnet và AWS tạo nó trên cloud; bước 2 Terraform cập nhật state file để ghi lại subnet đã tồn tại" loading="lazy" />

Đầu tiên Terraform nói chuyện với AWS, resource được tạo trên cloud. Sau đó Terraform cập nhật state để ghi lại thứ vừa dựng. Đây là hai hệ thống khác nhau: AWS giữ hạ tầng thật, state file là cuốn sổ của Terraform về nó. Nếu có gì cắt ngang giữa hai bước, chúng lệch nhau.

Giờ xem chuyện gì xảy ra khi hai người apply cùng lúc mà không có khóa:

<img src="https://cdn.hashnode.com/uploads/covers/698d563262d4ce66226a844a/724c562a-ef35-42e5-a9f2-4683f8acef31.png" alt="Sarah và Marcus cùng mở một state file, mỗi người đổi một thứ; Marcus lưu sau cùng và ghi đè mất subnet của Sarah — last write wins" loading="lazy" />

Sarah mở state, bắt đầu thêm một subnet. Marcus mở đúng state đó cùng lúc, bắt đầu sửa một NAT gateway. Cả hai làm việc trên cùng một bản state ban đầu. Sarah xong trước: subnet được tạo trên AWS, state ghi lại. Marcus xong sau: NAT gateway được cập nhật trên AWS, rồi Terraform ghi state dựa trên bản mà Marcus đọc lúc bắt đầu — bản đó chưa có subnet của Sarah. Thế là bản ghi subnet biến mất.

<img src="https://cdn.hashnode.com/uploads/covers/698d563262d4ce66226a844a/07d237af-96dd-450c-8284-7b2be89b2a41.png" alt="AWS chứa cả subnet lẫn NAT gateway, nhưng state file của Terraform thiếu bản ghi subnet" loading="lazy" />

Subnet vẫn nằm trên AWS. Nhưng cuốn sổ của Terraform không còn nhớ nó. Lần `terraform plan` kế tiếp tưởng subnet chưa từng được tạo và đề xuất dựng lại. State locking sinh ra để chặn đúng việc này: apply của Sarah giành lock trước khi chạy, Marcus phải chờ, và khi Sarah xong, lock nhả ra thì Marcus mới apply trên state đã cập nhật — cả hai thay đổi đều được ghi đúng.

### Một apply bị cắt ngang giữa chừng

Một pipeline GitHub Actions đang apply thay đổi cho hạ tầng payments: thêm ba security group rule và một database parameter group. Giữa chừng, runner đụng giới hạn 60 phút và bị giết.

<img src="https://cdn.hashnode.com/uploads/covers/698d563262d4ce66226a844a/40cba2d8-56c4-4b03-bd46-0c33a7b1b7af.png" alt="Terminal cho thấy ba security group rule tạo xong, database parameter group chưa kịp tạo, và state file chưa kịp ghi vì job chết trước" loading="lazy" />

```
Security group rule 1  → đã tạo ✓
Security group rule 2  → đã tạo ✓
Security group rule 3  → đã tạo ✓
Database parameter     → chưa tạo ✗
State file update      → chưa ghi (job chết trước)
```

Ba rule giờ tồn tại trên AWS, nhưng pipeline chết trước khi Terraform kịp ghi state. AWS biết các rule này, state thì không. May là ca này thường dễ gỡ: lần chạy lại, Terraform soi xem AWS đang có gì, thấy ba rule rồi nên không tạo lại, và chỉ tạo nốt database parameter group còn thiếu. Lần hai chạy xong, state đuổi kịp hiện thực. Cái cứu bạn ở đây là tính idempotent của Terraform — chạy lại cùng cấu hình sẽ kéo hạ tầng về trạng thái mong muốn, chứ không mù quáng dựng lại từ đầu.

Còn một biến chứng nhỏ: cái lock. Nếu pipeline bị cắt lúc đang giữ lock, Terraform có thể vẫn tưởng có một apply khác đang chạy, và lần kế tiếp fail ngay:

<img src="https://cdn.hashnode.com/uploads/covers/698d563262d4ce66226a844a/cbb56e69-7c40-4e61-8966-4cedbdaf2649.png" alt="terraform apply fail vì job trước để lại state lock; lỗi kèm lock ID, đường dẫn state và process đã giành lock" loading="lazy" />

Trước khi xóa lock, phải chắc chắn không còn apply nào đang chạy. Mở CI/CD lên — GitHub Actions, GitLab CI, Jenkins, hay bất cứ thứ gì đội dùng — và xem lịch sử pipeline của môi trường đó:

<img src="https://cdn.hashnode.com/uploads/covers/698d563262d4ce66226a844a/716f6d0c-62d7-4bea-b7f4-ce6cfdda1188.png" alt="Lịch sử GitHub Actions: terraform-plan thành công, hai terraform-apply bị cancelled và timeout (lock có thể đã cũ), một terraform-apply đang chạy không được unlock" loading="lazy" />

Nếu apply trước đã bị hủy hoặc timeout, lock là lock cũ, xóa bằng `terraform force-unlock` kèm lock ID trong thông báo lỗi. Chỉ force-unlock khi chắc chắn không có gì đang chạy. Xóa một lock còn sống đồng nghĩa cho phép hai apply cùng ghi vào một state — đúng cái thảm họa mà lock sinh ra để ngăn.

### Chạy lệnh state nhầm môi trường

Một kỹ sư database dọn một test database cũ ở staging. Database vẫn còn trên AWS, nhưng anh ta muốn Terraform thôi quản nó, nên dùng `terraform state rm`. Lệnh này không xóa gì trên AWS — nó chỉ gỡ bản ghi resource khỏi state. Kiểu như bảo Terraform: "quên resource này đi, nhưng cứ để nó chạy".

Ý định là chạy trên staging:

```
Định làm:  state staging     → quên test database cũ
```

Nhưng anh ta đang ở nhầm thư mục, và chạy nó trên production:

```
Thực tế:   state production  → quên database payments đang live
```

<img src="https://cdn.hashnode.com/uploads/covers/698d563262d4ce66226a844a/5a1dd566-4f38-4ceb-8b41-70bf6ebc69c3.png" alt="Database vẫn tồn tại trên AWS nhưng đã biến mất khỏi state của Terraform" loading="lazy" />

Không có gì bị xóa. Database production vẫn chạy. Nhưng Terraform đã quên nó tồn tại. Lần `terraform plan` kế tiếp thấy database được khai báo trong code mà không có trong state, liền cho rằng nó chưa tồn tại và đề xuất tạo mới. Nếu không ai bắt được trong plan output, Terraform dựng một database production thứ hai song song với cái cũ — hai database chạy production, không cái nào được quản trọn vẹn, và một mớ rất đắt tiền để gỡ.

`terraform state rm`, `terraform import`, `terraform state mv` đổi state ngay lập tức, không có prompt xác nhận. Chạy nhầm thư mục, nhầm workspace, hay nhầm địa chỉ resource là bạn đổi nhầm state trong vài giây.

### Hai đội cùng quản một resource

Đội networking sở hữu một security group kiểm soát truy cập vào database payments. Khi một microservice mới cần truy cập DB, kỹ sư payments có hai lựa chọn: nhờ networking thêm rule, hoặc tự quản security group đó. Anh ta chọn cách hai — import security group hiện có vào state payments rồi thêm rule cho Microservice C. Từ giây phút đó, cả hai đội đều tưởng mình sở hữu cùng một security group.

<img src="https://cdn.hashnode.com/uploads/covers/698d563262d4ce66226a844a/a7780c50-c6c0-49f5-b161-7b4884bc0394.png" alt="Hai state file cùng quản một security group với hai bộ rule khác nhau" loading="lazy" />

Vấn đề là Terraform làm đúng y những gì mỗi state bảo nó. State networking nói security group nên cho A và B. State payments nói nên cho A, B, và Microservice C. Hai điều đó không thể cùng đúng.

<img src="https://cdn.hashnode.com/uploads/covers/698d563262d4ce66226a844a/df2c9e46-2d6a-49dc-9f5a-f23a06575452.png" alt="Payments apply thì Microservice C có quyền; đêm đó pipeline networking chạy, đọc state networking thấy chỉ A và B nên xóa rule của Microservice C đi" loading="lazy" />

Payments apply, Microservice C có quyền. Đêm đó pipeline networking chạy, đọc state networking, thấy chỉ A và B, và sửa security group về đúng vậy — rule của Microservice C lặng lẽ biến mất. Không lỗi nào hiện ra, cả hai pipeline đều pass, và đó chính là thứ khiến nó khó debug kinh khủng. Terraform không hỏng; nó nhận hai bộ chỉ dẫn mâu thuẫn từ hai state và làm đúng từng cái.

Đây không phải thứ chữa bằng lệnh Terraform. Nó là một quyết định về ownership, lẽ ra phải được chốt trước khi ai đó chạy import. Nếu payments gửi pull request sang repo networking nhờ thêm rule, thì một đội sở hữu security group, một state quản nó, và xung đột không bao giờ có cơ hội xảy ra.

---

## Cách các đội lớn tổ chức repo Terraform

Vào một tổ chức lớn, thứ đập vào mắt đầu tiên là số lượng repo. Bạn tưởng sẽ có một repo cho toàn bộ hạ tầng, nhưng thực tế là hàng chục. Cấu trúc đó ánh xạ thẳng vào ownership: mỗi repo thuộc một đội, đội đó chịu trách nhiệm mọi thứ trong nó.

<img src="https://cdn.hashnode.com/uploads/covers/698d563262d4ce66226a844a/ca81c9b1-b310-4321-8001-f59ab258c652.png" alt="Sơ đồ cách platform team, security team và product team tổ chức repo Terraform và ownership" loading="lazy" />

Có hai loại repo. Loại thứ nhất thuộc platform team, chứa module dùng lại được: cấu hình VPC, template database, pattern security group. Những repo này không tạo resource production trực tiếp. Loại thứ hai thuộc từng product team — payments, auth — gọi các module của platform để dựng hạ tầng thật của mình.

Phân biệt này quan trọng vì nó quyết định blast radius. Một lỗi trong repo của product team thường chỉ ảnh hưởng đội đó. Một lỗi trong module dùng chung ảnh hưởng mọi đội phụ thuộc vào nó.

<img src="https://cdn.hashnode.com/uploads/covers/698d563262d4ce66226a844a/7fbefdda-c8bb-4e66-a8bc-adc19ae931e7.png" alt="Bug trong module dùng chung ảnh hưởng nhiều đội hơn bug trong repo riêng của product team" loading="lazy" />

Một bug trong `payments-infra` chỉ chạm payments. Một bug trong module `terraform-aws-postgres` chạm mọi đội dùng nó để dựng database. Một bug trong repo `terraform-policies` chạm mọi pipeline trong công ty. Module càng dùng rộng, blast radius càng lớn. Đó là lý do kỹ sư có kinh nghiệm soi rất kỹ module dùng chung và repo policy. Payments hỏng thì lỗi gần như chắc nằm trong repo payments. Nhưng năm đội cùng thấy một lỗi giống nhau một lúc, thì module dùng chung và repo policy là chỗ đầu tiên cần ngó.

---

## Chia state file để các đội bảo vệ lẫn nhau

Một state file quản tất cả — VPC, cluster Kubernetes, database, monitoring — vẫn ổn khi chỉ một người vận hành. Nó thành vấn đề ngay khi nhiều đội dùng chung. Ba thứ trục trặc lần lượt lộ ra:

1. **Blast radius.** Nếu cấu hình networking và database nằm chung state, một apply networking tồi có thể vô tình động vào resource database chẳng liên quan gì. State tách rời thì lỗi bị giữ trong phạm vi của nó.
2. **Tốc độ deploy.** Networking có thể đổi vài lần một năm; ứng dụng deploy vài chục lần một ngày. Chung state là các đội chờ lock của nhau.
3. **Xung đột ownership.** Chung state, một đội có thể đổi thứ đội khác phụ thuộc mà không hề biết.

Cách giải là chia state theo ranh giới ownership:

<img src="https://cdn.hashnode.com/uploads/covers/698d563262d4ce66226a844a/5abbcdbd-af2b-42b7-8dce-00389dbb91eb.png" alt="Cấu trúc một state file cho mỗi domain dưới thư mục production" loading="lazy" />

```
production/
  networking/terraform.tfstate   → VPC, subnet, routing, NAT gateway
  identity/terraform.tfstate     → IAM role, policy, service account
  platform/terraform.tfstate     → cluster Kubernetes, node pool, add-on
  database/terraform.tfstate     → RDS, Redis, backup
  security/terraform.tfstate     → security group, WAF rule, certificate
  monitoring/terraform.tfstate   → Prometheus, Grafana, alerting
  payments/terraform.tfstate     → hạ tầng payment service
```

Đây là một ví dụ, không phải chuẩn phổ quát; tổ chức lớn hơn thường chia nhỏ hơn nữa. Nguyên tắc vẫn vậy: một đội sở hữu một state, một pipeline, một blast radius. Quy tắc gọn lại thành một câu: mỗi resource thuộc đúng một state. Nếu networking sở hữu một security group, nó ở lại trong state networking; đội khác có thể tham chiếu nó như data source, nhưng không import vào state của mình. Đó chính là thứ ngăn cái va chạm ownership ở phần trên.

---

## Vì sao nhiều đội thích thư mục hơn workspace cho production

Workspace của Terraform CLI cho bạn quản nhiều môi trường — dev, staging, production — từ một thư mục. Mỗi workspace có state riêng, nhưng dùng chung file `.tf`.

```
infra/
  main.tf          ← cùng một code chạy cho MỌI môi trường
  variables.tf
  terraform.tfstate.d/
    dev/
    staging/
    production/    ← state riêng, code chung
```

<img src="https://cdn.hashnode.com/uploads/covers/698d563262d4ce66226a844a/4461ccbb-3d64-45d2-af7b-143a778b5649.png" alt="Cách dùng workspace: một thư mục infra, một main.tf chạy cho mọi môi trường, state tách dưới terraform.tfstate.d" loading="lazy" />

Bạn đổi môi trường bằng `terraform workspace select production` rồi apply. Rủi ro nằm ở chỗ chuyển workspace là một bước thủ công: nếu đang đứng nhầm workspace, thay đổi định cho staging có thể rơi vào production.

Vì vậy nhiều đội chọn tách thư mục cho các môi trường sống lâu:

```
environments/
  dev/
    main.tf      ← code path riêng
    backend.tf   ← trỏ tới state bucket của dev
  staging/
    main.tf
    backend.tf   ← trỏ tới state bucket của staging
  production/
    main.tf
    backend.tf   ← trỏ tới state bucket của production
```

<img src="https://cdn.hashnode.com/uploads/covers/698d563262d4ce66226a844a/83604abf-302c-400e-a322-f53e7d0b7d56.png" alt="Cấu trúc thư mục tách riêng dev, staging, production, mỗi môi trường có main.tf và backend.tf riêng" loading="lazy" />

Muốn apply lên production, bạn buộc phải đứng trong thư mục production. Mỗi môi trường có state, backend và execution path riêng. Cái giá phải trả là trùng lặp code, và đội thường giải bằng module dùng chung để mỗi thư mục môi trường chỉ còn cấu hình riêng của nó. Workspace vẫn hữu ích, nhưng cho môi trường ngắn hạn: feature branch, preview deploy, hạ tầng test tạm.

---

## Chia sẻ hạ tầng qua module trên GitHub

Khi 30 đội đều cần một PostgreSQL database mà không có chuẩn chung, mỗi đội tự viết cấu hình riêng. Sáu tháng sau, một đợt security audit chạy khắp các môi trường và phát hiện:

<img src="https://cdn.hashnode.com/uploads/covers/698d563262d4ce66226a844a/392e5cee-408e-49d5-9cc5-5a53f3537562.png" alt="Bốn đội với bốn lỗi cấu hình database: đội A không backup, đội B không mã hóa storage, đội C không gắn tag, đội D tắt deletion protection" loading="lazy" />

Đội A để `backup_retention_period = 0` — database chưa từng được backup. Đội B để `storage_encrypted = false` — dữ liệu nằm plaintext. Đội C truyền `tags = {}` — không có cost tracking. Đội D để `deletion_protection = false` — chỉ cách mất dữ liệu vĩnh viễn đúng một cú lỡ tay. Không ai cố tình bỏ qua mấy thứ đó; chỉ là không có chuẩn chung.

Với module dùng chung, platform team viết một module `postgres` một lần, mã hóa mọi yêu cầu của tổ chức vào trong: mã hóa bật, backup giữ 7 ngày, alarm monitoring, tag bắt buộc, deletion protection bật. Họ publish lên một repo `terraform-aws-postgres`. Đội nào cần database giờ chỉ viết:

```hcl
module "payments_db" {
  source         = "git::ssh://github.company.com/platform/terraform-aws-postgres.git?ref=v2.1.0"
  name           = "payments"
  environment    = "production"
  instance_class = "db.m5.large"
}
```

Bốn dòng input, còn lại module lo. Tổ chức lớn thường để lộ các module đã duyệt qua một internal registry để kỹ sư tìm và version mà không phải lội GitHub. Khi đó tham chiếu gọn lại còn:

```hcl
module "payments_db" {
  source  = "app.terraform.io/mycompany/postgres/aws"
  version = "~> 2.1"
}
```

HCP Terraform và Terraform Enterprise đều có private registry kết nối GitHub, theo dõi version tag trên repo module và tự publish version mới.

---

## Version và phát hành module

Cái `?ref=v2.1.0` trong source URL không phải để trang trí. Ở quy mô 40 đội dùng chung một module, nó là thứ ngăn một thay đổi thiện chí biến thành một sự cố toàn công ty.

Không pin version, payments tham chiếu module Postgres từ `main` — tức là bất cứ code mới nhất nào tại thời điểm đó. Chủ module đổi tên output `db_endpoint` thành `database_endpoint` cho khớp quy ước mới. Lần kế tiếp bất kỳ đội nào chạy `terraform init`, họ kéo về thay đổi đó, mà cấu hình của họ vẫn tham chiếu `db_endpoint`. Plan gãy hàng loạt:

```
payments-infra    → plan fail
analytics-infra   → plan fail
auth-infra        → plan fail
reporting-infra   → plan fail
```

Pin version chặn đúng việc này. Payments ở yên trên `v2.1.0`. Chủ module phát hành `v2.2.0` với output đổi tên kèm changelog. Các đội nâng cấp khi đã sẵn sàng, sau khi test ở staging. Không pipeline nào gãy mà không được báo trước. Quy ước version gọi là semantic versioning:

<img src="https://cdn.hashnode.com/uploads/covers/698d563262d4ce66226a844a/e23a58d7-0f3b-4f12-921e-1128f33d6c40.png" alt="Bảng semantic versioning cho module: patch v2.1.1, minor v2.2.0, major v3.0.0" loading="lazy" />

```
v2.1.1  → patch:  sửa bug. Nâng cấp an toàn, không phải đổi gì trong code.
v2.2.0  → minor:  tính năng tùy chọn mới. Nâng cấp an toàn, không đổi gì.
v3.0.0  → major:  breaking change. Đọc changelog, sửa code trước khi nâng.
```

---

## Bảo trì module ở quy mô lớn

Dựng một module Terraform mất một buổi chiều; bảo trì nó suốt hai năm lại là một công việc hoàn toàn khác. Một kỹ sư networking cần một module VPC. Platform team có sẵn, nhưng backlog đầy, nên anh ta tự tạo một bản hơi khác. Ba tháng sau, đội khác làm y vậy. Rồi đội nữa. Cuối cùng có cái này:

```
terraform-aws-vpc           ← bản gốc, platform team bảo trì
terraform-aws-vpc-v2        ← do app team tạo, không rõ tác giả
terraform-aws-vpc-shared    ← không biết môi trường nào đang dùng
terraform-aws-vpc-prod      ← không rõ có từng khác bản gốc không
```

Không ai cố ý tạo ra một nghĩa địa module. Nó lớn lên từng cái "thôi làm nhanh một biến thể" một. Mỗi biến thể security setting hơi khác, tagging khác, default khác. Đến khi một đợt audit compliance bắt mọi VPC phải bật flow logging, đội phải lục bốn module để biết môi trường nào đang tuân thủ.

Đội tránh được chuyện này đối xử với module như một dịch vụ dùng chung: có owner đứng tên, đóng góp qua pull request, breaking change đi kèm major version và hướng dẫn migrate, module bị bỏ thì có ngày khai tử. Một file `CODEOWNERS` tự định tuyến mọi pull request tới đúng người review. Bỏ qua phần này, bạn kết thúc với những module không ai sở hữu, không ai dám đụng, và không ai chắc có xóa được an toàn hay không.

---

## Chia sẻ dữ liệu giữa các state file

Khi hạ tầng đã bị chia thành nhiều state, một vấn đề thực tế lộ ra: các đội cần thông tin từ hạ tầng của nhau. State Kubernetes của platform cần VPC ID từ state networking. State database cần subnet ID. State payments cần database endpoint. Có hai cách giải.

**Đọc output state của đội khác.** Data source `terraform_remote_state` cho một state đọc output của state khác. Networking đánh dấu VPC ID và subnet ID làm output, database đọc rồi đặt RDS vào đúng subnet:

```
State networking
  └── outputs: vpc_id, private_subnet_ids
                          ↓
               State database đọc chúng
               └── đặt RDS vào đúng subnet
```

Cách này chạy được, nhưng có một giới hạn đáng kể: đọc state đội khác đòi quyền đọc toàn bộ state đó, không phải chỉ vài output bạn cần. Mà state chứa mật khẩu database, API key ở plaintext. Càng nhiều phụ thuộc kiểu này, càng nhiều đội đọc được secret của nhau.

**Tra cứu resource trực tiếp từ cloud.** Cách thay thế, và là cách HashiCorp giờ khuyến nghị, là tra cứu qua API của cloud provider thay vì đọc state đội khác:

```hcl
data "aws_vpc" "main" {
  tags = {
    Name        = "production-vpc"
    Environment = "production"
  }
}
```

Không cần truy cập state chéo, state mỗi đội vẫn cô lập. Cái giá là tagging phải nhất quán: networking phải gắn tag cho VPC theo cách database tìm được đáng tin, buộc các đội phải thống nhất quy ước đặt tên sớm. Nhiều đội dùng cả hai — remote state cho một số ít phụ thuộc tin cậy và gắn chặt, cloud data source cho mọi thứ rộng hơn.

---

## Thay đổi hạ tầng thực sự lên production thế nào

Ở tổ chức lớn quản Terraform production, thay đổi không đến từ laptop ai cả. Apply trực tiếp từ máy cá nhân đòi credential production nằm trên máy đó — một rủi ro bảo mật — và không để lại audit trail nếu có gì hỏng. Thay vào đó, mọi thay đổi đi qua pull request và pipeline làm phần việc:

```
Kỹ sư mở pull request
        ↓
Pipeline: terraform validate + kiểm tra fmt
        ↓
Pipeline: security scan (Checkov, tfsec, hoặc tương đương)
        ↓
Pipeline: terraform plan → đăng toàn bộ output làm comment trên PR
        ↓
Reviewer đọc plan output (không chỉ đọc code)
        ↓
Reviewer bắt buộc approve (ép bởi CODEOWNERS + branch protection)
        ↓
Merge kích hoạt pipeline apply
        ↓
Pipeline: giành lock → apply → nhả lock → log kết quả
```

<img src="https://cdn.hashnode.com/uploads/covers/698d563262d4ce66226a844a/d154589a-67b6-41e0-bda1-d7243521878f.png" alt="Sơ đồ pipeline CI cho Terraform: validate, security scan, plan, review, approve, apply" loading="lazy" />

Điều làm kỹ sư bất ngờ khi lần đầu gặp mô hình này: reviewer không approve code. Họ approve plan output — danh sách chính xác những gì sẽ được tạo, đổi, hay xóa trên cloud. Một thay đổi code trông vô hại vẫn có thể đẻ ra một plan phá hủy. Đổi một database parameter có thể buộc resource phải replace, nghĩa là Terraform xóa database hiện tại rồi tạo cái mới. Thấy điều này trong plan output trước khi merge:

<img src="https://cdn.hashnode.com/uploads/covers/698d563262d4ce66226a844a/4b39ca51-ab6d-4187-b7b7-a68b35d13959.png" alt="Plan output cho thấy aws_db_instance.payments phải bị replace — Terraform sẽ xóa database hiện tại rồi tạo mới" loading="lazy" />

Bắt được cái `-/+ must be replaced` đó trước khi merge chính là toàn bộ ý nghĩa của việc review plan. Không phải review code.

### CODEOWNERS ép ai review cái gì

Module VPC thuộc platform team, hạ tầng database thuộc database team. Thách thức là làm sao đảm bảo thay đổi thực sự được review bởi đúng người sở hữu. GitHub giải bằng `CODEOWNERS`: repo khai báo đội nào chịu trách nhiệm thư mục nào, và khi ai đó mở PR động vào file đó, GitHub tự động request review từ đúng đội. Sửa module PostgreSQL? GitHub bắt buộc phải có approve từ platform team trước khi merge. Không có CODEOWNERS, kỹ sư phải tự nhớ ai sở hữu phần nào — và trí nhớ là thứ không scale.

---

## Phát hiện drift hạ tầng

Drift là cái diff giữa "Terraform nói nên có gì" và "thực tế trên cloud đang có gì". Kịch bản đẻ ra drift đáng tin cậy hơn mọi thứ khác:

<img src="https://cdn.hashnode.com/uploads/covers/698d563262d4ce66226a844a/a1d72ad3-42f2-45d1-8d5a-3fdc8a4cbb99.png" alt="Bốn khung cảnh drift: 3h sáng CPU database tăng vọt, 3h15 kỹ sư resize tay trên console, 3h20 hết sự cố, 3h21 state file vẫn ghi kích thước cũ" loading="lazy" />

```
Thứ Hai 3:00  CPU database production tăng vọt. Sự cố.
Thứ Hai 3:15  Kỹ sư resize database trên console AWS: db.m5.large → db.m5.4xlarge
Thứ Hai 3:20  Hết sự cố. Kỹ sư đi ngủ.
Thứ Hai 3:21  State file: vẫn ghi db.m5.large
```

Sự cố bị quên, ticket đóng lại, cuộc sống tiếp diễn. Ba tháng sau, một apply Terraform thường lệ chạy. Terraform thấy `db.m5.large` trong cấu hình nhưng `db.m5.4xlarge` đang chạy trên AWS, liền đề xuất đổi nó về cho khớp. Không ai để ý dòng đó trong plan, apply trôi qua, database bị hạ kích thước, và người dùng bắt đầu báo query chậm. Đội mất hàng giờ điều tra trước khi lần ra thủ phạm là một thay đổi Terraform đã revert mất bản vá khẩn cấp từ ba tháng trước.

Đội xử lý tốt việc này chạy `terraform plan` theo lịch trên mọi state production. Nếu `terraform plan` thoát với exit code `2`, nghĩa là có khác biệt, và alert nổ. Đội khi đó tự quyết: apply để khôi phục trạng thái khai báo, hay sửa cấu hình cho khớp thực tế. Kiểu nào cũng được, miễn thay đổi là thứ nhìn thấy được và có chủ đích. Drift vô hình thì luôn tệ dần lên.

---

## Khôi phục khi state hỏng

State gần như luôn cứu được, với điều kiện đội đã chuẩn bị từ trước sự cố. Những đội phục hồi trong hai mươi phút thay vì ba ngày không phải đội giỏi Terraform nhất — họ là đội đã chuẩn bị.

**Bước 1 — Pull một bản backup trước khi đụng vào bất cứ thứ gì.**

```bash
terraform state pull > backup-$(date +%Y%m%d-%H%M%S).json
```

Dù làm gì tiếp theo, bạn cũng có điểm để quay về.

**Bước 2 — Chạy `terraform plan` và đọc kỹ nó đề xuất gì.** Nếu Terraform đòi xóa resource vẫn đang tồn tại trên cloud, state đang tụt sau hiện thực. Nếu nó đòi tạo resource vốn đã tồn tại, hiện thực đang đi trước state. Plan output cho bạn biết lệch theo chiều nào.

**Bước 3 — Khôi phục từ S3 versioning nếu state hỏng.** Mỗi lần ghi vào bucket S3 có versioning đều tự lưu một version mới. Liệt kê các version cũ, tải bản tốt cuối cùng, đẩy lại:

```bash
# Liệt kê các version cũ
aws s3api list-object-versions \
  --bucket mycompany-terraform-state \
  --prefix production/database/terraform.tfstate

# Tải một version cụ thể
aws s3api get-object \
  --bucket mycompany-terraform-state \
  --key production/database/terraform.tfstate \
  --version-id "the-version-id-here" \
  recovered-state.json

# Đẩy lại
terraform state push recovered-state.json
```

Chạy `terraform plan` sau khi khôi phục để xác nhận trông đúng trước khi apply.

**Bước 4 — Xóa lock cũ nếu pipeline bị kẹt.**

```bash
terraform force-unlock LOCK_ID
```

Chỉ làm sau khi chắc chắn không có apply nào đang chạy. Xóa một lock còn sống sẽ làm hỏng state.

**Bước 5 — Import lại resource đã rơi khỏi state.** Nếu resource còn trên cloud nhưng Terraform không còn biết tới nó — vì một lần `terraform state rm` lỡ tay — kéo nó về mà không tạo lại:

```bash
terraform import aws_db_instance.payments db-ABCD1234EFGH5678
```

Lại chạy `terraform plan` sau import để chắc không có thay đổi bất ngờ nào bị đề xuất.

---

## Chốt lại: mọi con đường đều dẫn về ownership

Mỗi thực hành trong bài đều truy về một vấn đề cụ thể các đội đâm phải khi Terraform lớn dần. State locking ngăn người này ghi đè thay đổi người kia. Chia state thu hẹp blast radius. Version module chặn hạ tầng dùng chung gãy bất ngờ. Drift detection bắt những thay đổi làm ngoài Terraform. CODEOWNERS đảm bảo đúng người review đúng thứ. Vấn đề khác nhau, lời giải khác nhau, nhưng tất cả chỉ về cùng một thứ: **khi đội lớn lên, phần lớn rắc rối Terraform ít liên quan tới hạ tầng mà liên quan tới ownership.**

Va chạm state xảy ra khi nhiều người cùng sửa được một state. Module sprawl xảy ra khi không ai chịu trách nhiệm bảo trì một chuẩn chung. Drift trở nên nguy hiểm khi thay đổi được làm mà không ai nhận trách nhiệm kéo Terraform và hiện thực về khớp nhau. Cả cái nghẽn review cũng thường truy về sự mơ hồ "ai nên approve cái gì".

Hiểu điều này đổi cả cách bạn đọc một repo Terraform lạ. Hàng chục state file nhỏ chưa chắc là over-engineering — chúng thường là ranh giới ownership. Một file CODEOWNERS không phải thủ tục hành chính; nó là tấm bản đồ trách nhiệm. Một pipeline đăng plan output lên pull request không chỉ là tự động hóa; nó là một quy trình review xây quanh hệ quả lên hạ tầng, chứ không phải quanh code.

Một sắc thái mình muốn thêm từ bối cảnh riêng: ở ngành tài chính, nơi mình vận hành multi-cluster Kubernetes trên cả hạ tầng on-prem vì lý do data residency, những quy ước này không phải "đẹp thì làm" mà là điều kiện sống còn. Khi state nằm trong vành đai compliance và mọi thay đổi production phải truy vết được cho auditor, thì pipeline-bắt-buộc và audit trail không còn là lựa chọn. Nhưng cũng chính ở đó mình thấy mặt trái: quy trình ownership chặt chẽ quá mức cho một đội nhỏ lại biến thành ma sát thuần túy. Nếu cả "hệ hạ tầng" của bạn là ba state file và hai kỹ sư, dựng nguyên bộ máy registry, branch protection, scheduled drift scan có khi chậm hơn là chỉ cẩn thận và nói chuyện với nhau. Mấy thực hành này sinh ra cho quy mô; áp đúng quy mô thì chúng là đòn bẩy, áp non quy mô thì chúng là gánh nặng.

Hạ tầng vẫn quan trọng. Nhưng khi đội lớn lên, ownership mới là thứ giữ cho hệ thống còn hiểu được.

---

*Nguồn tham khảo: [How Enterprise Teams Manage Infrastructure at Scale with Terraform — Osomudeya Zudonu, freeCodeCamp](https://www.freecodecamp.org/news/how-enterprise-teams-manage-infrastructure-at-scale-with-terraform). Bài viết được viết lại bằng tiếng Việt theo mạch và góc nhìn vận hành riêng, bổ sung sắc thái cho bối cảnh ngành tài chính. Các sơ đồ và ảnh minh họa được dẫn trực tiếp từ bài gốc và thuộc bản quyền của tác giả/freeCodeCamp.*
