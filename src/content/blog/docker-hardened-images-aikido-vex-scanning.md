---
title: "Docker Hardened Images + Aikido: quét lỗ hổng mà không còn ngập trong báo động giả"
description: "Aikido giờ đọc được VEX attestation của Docker Hardened Images, tự lọc bỏ những CVE đã được xác minh là không khai thác được — để bạn chỉ triage những thứ thật sự đáng lo."
pubDate: 2026-06-19
category: Security
tags: ["docker", "container-security", "supply-chain", "vex", "sbom", "aikido", "devsecops"]
---

> Tin chính rất gọn: từ giờ Aikido có thể quét **Docker Hardened Images (DHI)** và hiểu được phần "chú thích VEX" mà Docker đính kèm. Những lỗ hổng (CVE) Docker đã xác minh là *không khai thác được* sẽ tự động biến mất khỏi hàng đợi, để dev chỉ còn xử lý những thứ thật sự đáng lo.

Bạn nào làm container chắc quen cảnh này: mỗi lần scan image là một rừng CVE đỏ lòm hiện ra, và phần lớn thời gian triage là để chứng minh "cái này không sao đâu". Bài này kể về một thay đổi nhỏ nhưng dễ chịu: Docker và Aikido vừa bắt tay để cắt bớt cái đống nhiễu đó từ gốc.

## Vì sao đội nào cũng "ngộp" trong CVE?

Lượng CVE đang tăng chóng mặt, một phần vì các AI coding agent giờ sinh code và lắp ráp service nhanh hơn con người review rất nhiều — kéo theo hàng trăm thư viện phụ thuộc. Mỗi base image lôi về là thêm một chồng CVE đổ vào hàng đợi của ai đó.

Code càng ship nhanh thì càng phải xuất phát từ một nền tảng đã gọn, đã vá, đã được kiểm. Đó chính là lý do hardened image ngày càng quan trọng.

**DHI giải quyết từ gốc:** image được đóng tối giản, thường là *distroless* (không shell, không package manager, chỉ chứa đúng thứ ứng dụng cần chạy). Bề mặt tấn công nhỏ hẳn lại, và nhiều trường hợp Docker vá còn nhanh hơn cả upstream.

## Nhưng "gọn" thôi chưa đủ — máy quét phải "nhìn" được

Đây là chỗ trớ trêu: chính vì distroless không có shell và package manager, nhiều công cụ scan cũ bị "mù". Chúng quen dò theo package manager, nên khi không thấy gì thì hoặc báo nhầm thành phần không tồn tại, hoặc đỏ rực lên vì những CVE nằm ở đoạn code không bao giờ chạy tới. Kết cục là dev ngồi triage một đống "nhiễu" mà tác giả image đã biết thừa là không sao.

Tích hợp lần này vá đúng cái khe đó. Mỗi DHI image đi kèm một **VEX attestation đã ký số** — hiểu nôm na là tờ "giấy chứng nhận" Docker dán lên image, ghi rõ CVE nào đã xử lý, CVE nào không ảnh hưởng. Aikido đọc tờ giấy này lúc triage và lọc bớt những CVE Docker đã "tha", kèm lý do rõ ràng.

> **VEX** = *Vulnerability Exploitability eXchange*. Cứ hình dung nó như lời ghi chú của người làm bánh: "lỗi này có trong công thức gốc, nhưng món của tôi không dùng nguyên liệu đó nên vô hại."

## Cần chuẩn bị gì trước khi bắt đầu

Ba thứ:

- Một tài khoản **Aikido** đang hoạt động
- Quyền truy cập **Docker Hardened Images**
- Một **Docker Hub Personal Access Token** quyền chỉ-đọc (read-only)

Nếu Docker Hub đã kết nối sẵn với Aikido rồi thì bỏ qua bước nối ở dưới.

## Nối Docker Hub vào Aikido

Trong Aikido vào **Settings → Containers**, bấm **Connect Registry**, chọn **Docker Hub**, rồi điền namespace tổ chức, username và cái Access Token vừa tạo. Xong, Aikido tự dò ra danh sách repository của bạn để quét.

## Quét một DHI image

Sau khi nối xong, mở menu của registry và bấm **Scan repos in registry**. Với DHI thì *không cần cấu hình thêm gì cả* — Aikido tự nhận diện image hardened và tự lấy đúng nguồn dữ liệu ở hậu trường.

Bên trong, quy trình chạy theo 4 bước:

1. **Nhận diện** — Aikido xác định đây là DHI base image qua image reference và metadata của registry.
2. **Lập danh mục** — kéo về bản **SBOM (SPDX 2.3) đã ký** đi kèm image (lấy qua cơ chế OCI 1.1 referrer, hoặc từ thư mục `/opt/docker/sbom/` nếu có). Đọc SBOM đã được kiểm cho ra danh sách thành phần đầy đủ và chính xác — thứ mà việc cố "index" một filesystem distroless không làm nổi.
3. **Đối chiếu** — khớp từng thành phần (theo PURL) với Docker OSV feed và các nguồn advisory upstream.
4. **Áp VEX** — phủ các tuyên bố OpenVEX của Docker lên kết quả, và ẩn đi những phát hiện đã được đánh dấu là đã xử lý.

## Các trạng thái VEX nghĩa là gì

| Trạng thái | Hiểu sao |
| --- | --- |
| **Fixed** | Image này đã vá lỗ hổng đó rồi |
| **Not Affected** | Docker đã xác minh là báo nhầm hoặc không khai thác được trong ngữ cảnh này → Aikido tự ẩn mặc định |
| **Under Investigation** | Docker còn đang đánh giá mức ảnh hưởng |
| **Affected** | Lỗ hổng có thật và chưa có bản vá |

## Bạn nhìn thấy gì trên Aikido

Giao diện cố tình giữ đơn giản, chỉ trả lời đúng một câu hỏi: *image này có dính lỗ hay không.* Khi VEX của Docker nói một CVE không cần xử lý (đã vá, hoặc không ảnh hưởng), Aikido tự lọc nó ra khỏi hàng đợi — bạn không phải triage, không phải gắn nhãn, không phải click gì hết. Những gì còn lại trong hàng đợi mới là thứ thật sự dính tới image của bạn.

Ở hậu trường, Aikido vẫn lưu đầy đủ thông tin OpenVEX (trạng thái, lý do, image digest) để phục vụ audit và compliance — chỉ là không bày ra màn hình, vì thực tế chẳng ai đi triage lại muốn bới đống metadata VEX làm gì.

## Kết quả thực tế trông như thế nào

Trên một workload DHI điển hình, hàng đợi co lại rõ rệt sau khi áp VEX: một lần scan ra vài trăm CVE trên base image thường có thể rút xuống còn vài cái mà image thật sự mang theo.

Ví dụ cụ thể: một CVE trong thư viện parser xuất hiện ở hầu hết base image. Docker đánh dấu nó là `not_affected` trong bản build DHI vì kẻ tấn công không cách nào chạm tới đoạn code lỗi đó. Aikido đọc tuyên bố này, xếp CVE vào mục "VEX báo không ảnh hưởng", và đội bạn sẽ không bao giờ thấy nó khi triage. Phần lý do vẫn được giữ lại, lỡ kiểm toán viên có hỏi thì lôi ra.

Với team theo đuổi **FedRAMP, SOC 2** hay các chuẩn compliance khác, điều này lợi kép: danh sách phát hiện *trung thực*, còn các ngoại lệ thì đều được ký số, truy được về tận tác giả image qua một attestation công khai. Bạn không còn phải đưa cho auditor một bức tường đỏ rực nữa.

## Tóm lại

Cả tích hợp này dựa trên hai thứ DHI cung cấp:

- **SBOM đã ký** giúp Aikido có dữ liệu thành phần đầy đủ mà không cần cố dò filesystem distroless.
- **OpenVEX attestation** mang thẳng phán quyết "có khai thác được không" (kèm lý do) của Docker vào trong máy quét.

Kết quả là một hàng đợi triage phản ánh đúng nguy cơ thực tế trong image của bạn, thay vì một đống xả ra tất tần tật mọi CVE từng dính tới một package upstream nào đó.

---

*Nguồn tham khảo: [Docker Hardened Images enhanced vulnerability scanning with Docker and Aikido — docker.com](https://www.docker.com/blog/docker-hardened-images-enhanced-vulnerability-scanning-with-docker-and-aikido/)*
