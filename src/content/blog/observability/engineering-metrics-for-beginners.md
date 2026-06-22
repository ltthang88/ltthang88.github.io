---
title: "Engineering Metrics cho người mới bắt đầu"
description: "Story Points để đánh giá năng suất, lines of code để đo hiệu quả — ngành này lạm dụng metrics quá nhiều. Bài này dựng một framework đơn giản: bắt đầu từ 'tại sao', đo sức khoẻ delivery pipeline, độ bền vận hành, và khả năng observability của sản phẩm — kèm tình huống minh họa cụ thể."
pubDate: 2026-06-22
category: Observability
tags: ["metrics", "dora", "observability", "sre", "engineering-leadership", "devops"]
---

> Phiên bản viết lại bằng tiếng Việt và bổ sung tình huống minh họa, dựa trên bài *"Engineering Metrics for Beginners"* của Joseph Gefroh. Xem nguồn ở cuối bài.

Tôi thấy ngành này lạm dụng metrics quá nhiều. Từ việc dùng **Story Points** như công cụ đánh giá năng lực, đến dùng **số dòng code** như thước đo năng suất. Phần lớn là sự nhầm lẫn vô hại của những người làm theo framework như Scrum hay DORA mà không chịu hiểu nguyên lý gốc của chúng. Một số khác dùng metrics với ý đồ không trong sáng — để "đánh lừa" người khác.

Nếu bạn là engineering leader, bạn nợ team của mình một **framework rõ ràng** cho những metric mình đang theo dõi.

---

## Bắt đầu từ "tại sao"

Thứ đầu tiên cần nhìn không phải bản thân metric, mà là **vì sao bạn nhìn vào nó**. Thường gói gọn trong vài lý do:

- Để tuân theo chỉ đạo của lãnh đạo/quản lý
- Để phục vụ một câu chuyện hoặc một quyết định
- Để đánh giá và phán xét
- Để thoả mãn sự tò mò
- Để cải thiện theo thời gian

Việc bạn nhìn metric nào và dùng nó ra sao phụ thuộc hoàn toàn vào *tại sao* bạn nhìn nó.

- **Theo chỉ đạo lãnh đạo:** trước hết cứ làm theo, nhưng hãy đào sâu xem họ thực sự hỏi vì điều gì — lý do nhiều khả năng rơi vào một trong các mục còn lại.
- **Phục vụ quyết định:** hãy tự hỏi — người ra quyết định có *thật sự* quan tâm đến số liệu không? Rất nhiều nơi nói "data-driven" cho có. Nếu họ không quan tâm, đừng phí công; tìm ra thứ họ thật sự quan tâm và làm thứ đó.
- **Để đánh giá/phán xét:** đây gần như là cách dùng sai. Kỹ thuật phụ thuộc rất nhiều vào ngữ cảnh; phán xét một kỹ sư hay một team chỉ bằng con số là cực kỳ thiếu chính xác.
- **Thoả mãn tò mò:** lãng phí thời gian. Chỉ thu thập metric nếu bạn thực sự định *làm gì đó* với nó.
- **Cải thiện theo thời gian:** đây mới chính xác là mục đích nên dùng metrics.

> **Tình huống minh họa.** Sếp yêu cầu: "Từ giờ báo cáo velocity hằng tuần." Một leader non kinh nghiệm lao đi đo Story Points và làm dashboard màu mè. Một leader có framework thì hỏi lại: "Anh cần velocity để làm gì?" Hoá ra sếp đang lo *dự đoán ngày release* cho khách hàng. Vậy metric đúng phải là **Cycle Time** và độ ổn định của nó, không phải velocity — thứ vốn không so sánh được giữa các team.

---

## Bạn đang cố cải thiện điều gì?

Metric là *chỉ báo* về thuộc tính của thứ nó đo. Là engineering leader, bạn thường quan tâm:

- **Delivery** — tốc độ, chất lượng, số lượng, hiệu suất, tính dự đoán được
- **Service** — uptime, chất lượng
- **Capability** — nhu cầu nhân lực, năng lực kỹ thuật, năng lực team
- **People** — mức độ hạnh phúc, sự phát triển, tỉ lệ giữ chân
- **Impact** — chi phí vận hành

Muốn cải thiện Delivery, bạn nhìn tập metric khác hẳn so với khi muốn cải thiện Service. Và sau khi hái hết "quả thấp", metrics bắt đầu trở thành **đánh đổi**: cải thiện cái này làm xấu cái kia. Tăng tốc độ có thể kéo theo lỗi chất lượng; tăng uptime có thể làm tụt morale vì on-call dài hơn.

Đánh đổi là có thật — và việc của bạn là **nói rõ ra** các đánh đổi đó, đồng thời tạo năng lực mới để giảm hoặc xoá bỏ chúng.

> **Tình huống minh họa.** Team được ép "deploy nhanh hơn nữa". Sau 2 tháng, deployment frequency tăng gấp đôi — nhưng change failure rate nhảy từ 8% lên 22%, và on-call kiệt sức. Leader trình bày với sếp dưới dạng đánh đổi rõ ràng: "Tốc độ tăng X, nhưng đổi lại lỗi và morale tụt Y." Rồi đề xuất một *năng lực mới* để gỡ đánh đổi: đầu tư test tự động + feature flag, để vừa nhanh vừa an toàn.

---

## Bắt đầu từ đâu?

Ba câu hỏi dễ nhất trước:

1. Delivery pipeline của bạn khoẻ tới mức nào?
2. Vận hành hệ thống của bạn bền vững tới mức nào?
3. Sản phẩm của bạn observable tới mức nào?

---

### 1. Delivery pipeline khoẻ tới mức nào?

Kỹ sư thì *build ra thứ gì đó*. Để build, bạn cần một pipeline từ **Ý tưởng → Production**. Pipeline đó có các giai đoạn đo được, mỗi giai đoạn có những điểm dễ thành nút thắt.

Một delivery pipeline tốt phải đưa được một thay đổi code lên production một cách **bền vững**, nghĩa là: lặp lại được vô hạn, xử lý thay đổi *kịp tốc độ* thay đổi được tạo ra, và hoàn tất thành công trong một tỉ lệ lỗi chấp nhận được.

Các metric chỉ báo sức khoẻ pipeline:

- **Deployment Frequency** — số lần deploy mỗi ngày.
- **Deploy Failure Rate** — tỉ lệ lần deploy gặp sự cố.
- **Change Volume Rate** — số thay đổi mỗi lần deploy (thường là số Pull Request).
- **Change Failure Rate** — tỉ lệ thay đổi gây lỗi/defect.
- **Cycle Time** — thời gian một thay đổi nằm trong giai đoạn kỹ thuật, đầu-cuối.

**Cân bằng các metric.** Đừng vội nghĩ "cứ tăng deployment frequency và change volume là tốt". Số cao hơn nói chung khoẻ hơn, nhưng **không phải mục tiêu**. Mục tiêu là *delivery bền vững*: pipeline deploy được đúng tần suất và đúng lượng mà bạn *cần*. Hãy đặt **trần** cho Change Failure Rate và **sàn** cho Deployment Frequency tỉ lệ với Change Volume. Deploy nhiều hơn mức cần → lãng phí. Ít hơn mức cần → nghẽn.

> **Tình huống minh họa — "deploy thừa".** Team tự hào tăng từ 3 lên 4 deploy/ngày. Nhưng họ chỉ tạo ra 3 đơn vị thay đổi (PR)/ngày. Lần deploy thứ 4 thực chất *vô nghĩa* — không có gì để chở. Ngược lại, nếu team tạo 4 PR/ngày mà chỉ deploy 3 lần, thì có một PR luôn bị kẹt qua đêm — đó mới là nút thắt thật cần gỡ.

**Chỉ báo qua baseline.** Hầu hết công ty chưa từng đo đều sốc khi lần đầu tính ra change failure rate trên 20%. Theo thời gian, dùng thay đổi so với baseline làm chỉ báo: áp dụng QA process → xem cycle time đổi thế nào; tăng test coverage → xem change failure rate đổi ra sao.

> **Tình huống minh họa — batch lớn = rủi ro lớn.** Một team gom 15 PR vào một lần deploy cuối tuần. Khi production lỗi, không ai biết PR nào gây ra — phải rollback cả cụm, và bề mặt giám sát sau deploy quá rộng. Sau đó họ chuyển sang deploy nhỏ và thường xuyên: mỗi lần 1–2 PR, lỗi xảy ra thì khoanh vùng trong vài phút. **Tăng số deploy để giảm change volume mỗi lần** — đó là quy tắc vàng.

**Và:** nếu change failure rate tăng mạnh → *chậm lại*, giảm tần suất deploy và lượng thay đổi, đi sửa gốc rễ phía thượng nguồn. Còn **số dòng code không phải metric delivery** — kỹ sư giỏi nhất có thể viết 10 dòng, kỹ sư tệ nhất viết 100.000 dòng. Lines of code chẳng nói lên gì.

**Đo bằng gì?** Không cần tốn kém: đếm PR trên GitHub, nhờ một script (hoặc LLM viết hộ) đếm merge và cycle time từ git history, hay tạo một webhook deploy ghi dữ liệu vào một bảng.

---

### 2. Vận hành hệ thống bền vững tới mức nào?

**Uptime.** Trong đa số trường hợp, mục tiêu *không phải* 100% uptime:

| Uptime | Downtime mỗi tháng (xấp xỉ) |
|---|---|
| 99% | ~7 giờ |
| 99.9% | ~43 phút |
| 99.99% | ~4 phút |
| 99.999% | ~26 giây |

Nếu ứng dụng của bạn chỉ dùng trong một vùng, giờ hành chính 9–5, thì uptime "thảm hại" vẫn có thể là vận hành thành công. **Khung giờ downtime quan trọng:** 99% uptime vẫn ổn nếu bạn có 100% uptime *trong giờ làm việc*. Giành lấy "số 9 thứ năm" cực kỳ tốn kém — đòi hỏi tăng theo cấp số nhân chi phí về availability zone, replica, failover... Với nhiều công ty, số 9 thứ năm không đáng.

> **Tình huống minh họa.** Một startup B2B nội địa định chi lớn để đạt 99.99%. Nhưng khách hàng của họ chỉ làm việc 8h–18h trong tuần. Họ chuyển mục tiêu thành "100% uptime trong giờ hành chính" và chấp nhận bảo trì ban đêm. Tiết kiệm được khoản đầu tư hạ tầng khổng lồ mà không một khách hàng nào nhận ra khác biệt.

**Mean Time to Restore (MTTR).** Nhiều leader tối ưu cho việc *không có sự cố*, nhưng tối ưu cho **phục hồi nhanh** thường hiệu quả hơn. "Không sự cố" nhiều khi chỉ là may mắn và sự thận trọng thái quá — và sự cố thực ra ổn với nhiều bài toán kinh doanh, miễn là không gây tổn hại lâu dài. Thời gian phục hồi phụ thuộc vào: bạn *phát hiện* lỗi nhanh ra sao, team/hệ thống *phản ứng* nhanh ra sao, và phản ứng đó *khôi phục* dịch vụ nhanh ra sao — tất cả lại phụ thuộc vào mức observability/alerting, quy trình chuẩn, đào tạo team, và năng lực kỹ thuật.

Mục tiêu của bạn nên là: phát hiện sự cố *bằng tự động hoá, không bằng con người*; có cơ chế giảm thiệt hại mạnh (backup, staged release) và đòn bẩy rollback (feature flag); và đào tạo team về incident response (playbook, runbook).

> **Tình huống minh họa.** Hai team cùng gặp sự cố DB. Team A "không bao giờ có sự cố" nhưng khi sập thì loay hoay 3 tiếng vì không có alert tự động, không runbook. Team B chấp nhận sự cố là bình thường: alert bắn sau 30 giây, có feature flag tắt tính năng lỗi, có runbook rollback — khôi phục trong 8 phút. Team B "thua" về số lần sự cố nhưng *thắng* ở thứ thật sự quan trọng: MTTR.

**Đo bằng gì?** Dựng một công cụ như Pingdom (vài đô/tháng), trỏ vào hệ thống, chạy mỗi phút. Với MTTR: bắt buộc *mọi* sự cố đều có postmortem ghi rõ timestamp lúc bắt đầu và lúc giải quyết, rồi cộng lại và phân loại (outage, gãy workflow, mất dữ liệu...). Một quy trình thủ công cũng đã đi được rất xa.

---

### 3. Sản phẩm observable tới mức nào?

Nếu công ty bạn kiếm tiền qua một **business event**, bạn phải theo dõi chính event đó. Ví dụ eCommerce thì event là "Bán một món hàng". Bạn cần biết *theo thời gian thực*: đã có bao nhiêu event trong vài phút/giờ/ngày/tuần qua, và xu hướng đó thay đổi ra sao (kể cả 5 phút gần nhất).

Từ đó thêm thuộc tính để phân khúc chi tiết hơn: loại user nào thực hiện, ở đâu, event đó giá trị bao nhiêu theo thời gian. Không cần phức tạp — gắn một product analytics tool, ghi một record vào DB, hoặc log rồi dựng dashboard từ log stream. Tiến thêm: theo dõi click/view để xem funnel nào tốt, thêm event signup/acquisition/churn để bắt "nhịp tim" của sản phẩm.

Điều quan trọng nhất: **biết nó đang diễn ra và canh chừng sự thay đổi**. Nếu success rate đột ngột tụt — đó là một sự cố cần điều tra, *dù hệ thống vẫn chạy bình thường*. Đó là vấn đề về *kết quả kinh doanh*, không phải về kỹ thuật.

> **Tình huống minh họa.** Mọi dashboard hạ tầng đều xanh: CPU ổn, latency ổn, 0 lỗi 5xx. Nhưng biểu đồ "số đơn hàng/giờ" tụt 70% lúc 10h sáng. Hoá ra một thay đổi frontend khiến nút "Thanh toán" bị ẩn trên mobile. Không một metric hệ thống nào bắt được — chỉ có **business event** mới lộ ra sự cố này. Đây là lý do observability sản phẩm quan trọng ngang observability hệ thống.

---

## Đi tiếp

Khi đã có nền tảng, bạn có thể theo dõi thêm:

- **Team morale** — qua khảo sát, retention rate...
- **Chi phí** — tiền chi cho vendor, headcount...

Nhưng hãy nhớ: **metric là chỉ báo.** Chúng nói cho bạn biết *điều gì đó đã xảy ra*, chứ không nói *vì sao* hay *tốt hay xấu*. Mục tiêu không phải "số tăng lên" — mục tiêu là "hiểu điều gì đã thay đổi, và tại sao".

Có thể hoàn toàn chấp nhận được khi change failure tăng gấp đôi nếu đổi lại throughput tăng gấp ba. Cũng hoàn toàn hợp lý khi throughput giảm một nửa vì nửa team đi offsite. **Đừng phán xét thuần bằng con số — hãy dùng nó để chỉ báo.**

> **Tình huống minh họa.** Cuối quý, throughput của team giảm 40%. Một sếp nhìn số liền kết luận "team yếu đi". Nhưng đào sâu: quý đó team dành 3 tuần trả nợ kỹ thuật để gỡ một nút thắt deploy tồn tại 2 năm. Con số "xấu" thực ra là một khoản đầu tư đúng đắn. Metric chỉ ra *cái gì đổi*; chỉ có ngữ cảnh mới nói được *nó tốt hay xấu*.

---

*Nguồn tham khảo: [Engineering Metrics for Beginners — Joseph Gefroh, blog.jgefroh.com](https://blog.jgefroh.com/p/engineering-metrics-for-beginners). Bài viết được viết lại bằng tiếng Việt và bổ sung tình huống minh họa; nội dung đã được diễn giải lại để phù hợp mục đích chia sẻ.*
