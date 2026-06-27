---
title: "SBOM cho container: sinh ở build-time hay quét sau, và vì sao điều đó quyết định tất cả"
description: "Sinh một SBOM thì dễ, sinh một SBOM dùng được mới khó. Quyết định ảnh hưởng lớn nhất tới chất lượng là sinh nó lúc nào: hook vào build system để nắm trọn cây dependency đã resolve, hay quét ngược một artifact đã đóng gói. Bài này đi qua khác biệt đó, năm tiêu chí của một SBOM hành động được, và một góc ít người nói: chính tool sinh SBOM cũng là attack surface."
pubDate: 2026-06-27T23:00:00+07:00
category: Security
tags: ["sbom", "supply-chain", "container-security", "ci-cd", "devsecops"]
---

> Sinh một SBOM thì dễ. Sinh một SBOM *dùng được* mới khó. Định dạng file đã chuẩn hóa, nhưng chất lượng nội dung thì dao động dữ dội tùy vào cách và thời điểm bạn sinh ra nó. Theo báo cáo supply-chain 2026 của Omdia mà Docker dẫn, phần lớn tổ chức thấy việc sinh SBOM khó — và nguyên nhân lớn là tool sprawl: mỗi loại artifact một scanner, output không nhất quán giữa các pipeline, kỹ sư tốn thời gian đối chiếu kết quả thay vì hành động trên chúng.

SBOM giờ là thứ chịu tải: security team dựa vào nó để phản ứng với một CVE mới, compliance team dùng nó để qua audit, và quyết định procurement cũng nhìn vào nó. Mà khi bước sinh SBOM mang tính chịu tải như vậy, thì mọi khiếm khuyết ở đó đều chảy xuống dưới. Nếu SBOM pipeline của bạn bỏ sót transitive dependency, ghi version khai báo thay vì version thực sự cài, hoặc không được buộc bằng chữ ký vào đúng artifact nó mô tả — thì mọi quyết định downstream xây trên dữ liệu đó đều thừa hưởng lỗ hổng. Bài này mình viết lại từ một bài hướng dẫn của Docker, theo mạch riêng và thêm góc nhìn cho bối cảnh regulated.

---

## Quyết định lớn nhất: build-time hay post-build

Thời điểm sinh SBOM là yếu tố ảnh hưởng nhiều nhất tới chất lượng của nó. Có hai cách, và chúng cho kết quả khác nhau một cách thực chất.

<img src="https://www.docker.com/app/uploads/2026/06/docker_Build-time-vs.-post-build-SBOM-generation-1640x861.jpg" alt="So sánh sinh SBOM lúc build-time với quét post-build" loading="lazy" />

**Build-time** hook thẳng vào build system. Bộ sinh có quyền truy cập cây dependency đã resolve, các file package manager, và toàn bộ build context. Nó biết chính xác cái gì đã đi vào artifact, vì nó có mặt ngay lúc artifact được lắp ráp. Build system container có hỗ trợ attestation native có thể sinh một SBOM dạng SPDX ngay trong lúc build image, đính nó như một attestation theo chuẩn in-toto, rồi push cả image lẫn SBOM lên registry trong một thao tác. Lợi thế ở đây mang tính cấu trúc: nó bắt được trạng thái đã resolve của mọi dependency, kể cả transitive — thứ mà scanner chạy sau dễ bỏ sót.

**Post-build** thì quét một artifact đã hoàn chỉnh và suy ngược nội dung của nó, dựa trên metadata package manager, chữ ký file, và pattern đã biết. Cách này chạy được trên mọi image OCI bất kể nó được build ra sao — và đó là điểm mạnh duy nhất nhưng quan trọng của nó. Đánh đổi là độ phủ: binary link tĩnh, dependency vendored, và OS package cài ở các stage build trung gian thường bị bỏ sót, vì phát hiện ở đây là heuristic chứ không dẫn ra từ build graph thật.

Quy tắc gọn: có quyền vào build system thì sinh ở build-time. Post-build dành cho image bên thứ ba bạn dùng nhưng không build, hoặc artifact cũ không tích hợp được build system. Đây không phải hai lựa chọn ngang hàng — một cái biết sự thật, một cái đoán sự thật rất giỏi.

---

## Năm tiêu chí của một SBOM hành động được

Một SBOM validate qua schema không có nghĩa nó hữu dụng. Năm tiêu chí tách một SBOM hành động được khỏi một file chỉ để "tick ô".

<img src="https://www.docker.com/app/uploads/2026/06/docker_What-Makes-an-SBOM-Useful-1640x861.jpg" alt="Năm tiêu chí của một SBOM hữu dụng: completeness, accuracy, freshness, verifiability, format compliance" loading="lazy" />

1. **Completeness** — kê đủ mọi component, qua mọi layer và mọi loại package: OS package từ base image, dependency ứng dụng từ mọi package manager, và cả tooling thêm vào lúc build. Đây là chỗ multi-stage và base image tối giản tạo ra lỗ hổng thật. Một Dockerfile có frontend Node, một component C/C++ biên dịch thành binary tĩnh, và stage cuối distroless là ba bài toán khác nhau: Node có cây transitive sâu, binary tĩnh thường không mang manifest nào trên đĩa, còn distroless thì không có package manager. Chỉ build-time, với quyền vào cây dependency đã resolve của từng stage, mới cho bức tranh đầy đủ.
2. **Accuracy** — ghi version đã resolve, không phải dải khai báo. Manifest có thể khai `^4.17.0` nhưng lock file resolve ra `4.17.21`. SBOM phải phản ánh cái thực sự cài, không phải cái được yêu cầu.
3. **Freshness** — SBOM là ảnh chụp tại một thời điểm, buộc vào một build cụ thể. Mỗi lần rebuild artifact thì phải sinh lại. SBOM cũ tạo ra cảm giác an toàn giả.
4. **Verifiability** — người dùng phải xác nhận được nó do build system sinh ra và chưa bị sửa. Chữ ký và attestation buộc SBOM vào đúng digest của artifact, kèm provenance ghi lại nơi và cách artifact được build.
5. **Format compliance** — định dạng chuẩn như SPDX và CycloneDX định nghĩa các field bắt buộc. Một SBOM validate qua schema thì tương tác được với mọi scanner, policy engine, compliance workflow; một SBOM lệch schema có thể chạy với tool hiện tại nhưng gãy ngay khi bạn đổi tool.

Một điểm đáng lưu ý: có những base image đã ship sẵn SBOM đạt cả năm tiêu chí, kèm SLSA Build Level 3 provenance — sinh ở build-time trên nền hardened, ký mã hóa, đính kèm theo digest, và tự sinh lại mỗi lần rebuild. Với những image đó, câu hỏi "sinh SBOM thế nào" đã được trả lời cho lớp nền tảng nhất, và công sức của bạn dồn về việc sinh SBOM cho lớp ứng dụng bạn đặt lên trên. Mình đã viết kỹ hơn về hướng base image hardened trong bài về [Docker Hardened Images và VEX scanning](/blog/security/docker-hardened-images-aikido-vex-scanning/).

---

## Chính tool sinh SBOM cũng là attack surface

Đây là phần mình thấy đắt nhất và hay bị bỏ qua. Tool bạn dùng để sinh SBOM chạy với quyền cao trong môi trường build: nó đọc source code, cây dependency, và artifact của bạn. Một bộ sinh bị compromise không chỉ tạo ra output tồi — nó có đủ quyền để exfiltrate hoặc sửa đúng những thứ nó quét.

Và đây không phải lo xa lý thuyết. Version tag trên GitHub Actions và container image đều mutable. Một tool bạn pin ở `v2.1` hôm nay có thể âm thầm trở thành thứ khác ngày mai nếu một tài khoản maintainer bị chiếm hoặc một tag bị force-push. Cửa sổ phơi nhiễm thường tính bằng giờ, nhưng pipeline tự động có thể kéo về phiên bản độc trong vài phút. Cách xử lý là đối xử với tool sinh SBOM bằng đúng sự nghiêm khắc dành cho mọi build dependency khác:

- Pin vào tham chiếu bất biến (commit SHA, không phải version tag).
- Verify checksum trước khi chạy.
- Chạy việc sinh trong CI, không phải trên máy dev, để output tái lập được và audit được.
- Theo dõi advisory bảo mật của chính các tool sinh.

Đây chỉ là một mặt của bài toán supply-chain rộng hơn: mọi tool trong pipeline đều là một dependency cần soi kỹ như code ứng dụng. Mình thấy đội nào cũng nhớ scan dependency của app, nhưng quên rằng cái scanner đang chạy với quyền đọc toàn bộ build cũng là một dependency — và là một dependency có đặc quyền.

---

## Ghép việc sinh SBOM vào CI/CD

Sinh thủ công thì ổn cho một lần audit. Còn production cần nó tự động, tái lập, và nối vào phần còn lại của delivery pipeline. Pattern khá nhất quán:

- **Sinh ngay sau khi build.** Thêm bước sinh SBOM ngay sau khi image được tạo. Với container, flag attestation của BuildKit là cách đáng tin nhất; với dependency ứng dụng, plugin theo ngôn ngữ (CycloneDX cho Maven/Gradle, npm/yarn cho Node) cho output chất lượng cao nhất vì chúng truy cập cây dependency đã resolve.
- **Chỉ sinh từ stage cuối** với build multi-stage. Stage trung gian hay cài build tool và test framework không hề ship trong image production; sinh từ chúng làm SBOM phình lên với component không deploy, đẻ ra nhiễu trong vulnerability scan.
- **Chọn định dạng attestation theo nhu cầu.** SPDX là output native của BuildKit và mạnh hơn khi license compliance là ưu tiên; CycloneDX hỗ trợ tương quan vulnerability tốt hơn, hợp workflow thiên về bảo mật. Tool tiêu thụ của bạn ưa cái nào thì theo cái đó; nếu cả hai đều được, mặc định SPDX cho container vì không cần tool gì ngoài bộ sinh sẵn của BuildKit.
- **Đính vào artifact, không lưu rời.** Với container, đính SBOM như một OCI attestation trong registry thay vì lưu thành file riêng. Như vậy SBOM luôn khám phá được, có version, buộc vào đúng digest — và khi image được promote từ dev qua staging tới production, SBOM đi theo nó qua mọi registry, thay vì một luồng copy-and-sync riêng mà kiểu gì cũng trôi lệch.
- **Validate trước khi publish.** Thêm một bước giữa sinh và push: chạy qua schema validator, kiểm tra số component có hợp lý với artifact không, và xác nhận SBOM tham chiếu đúng digest. Một build ra 12 component cho một image bạn biết chứa 200+ package thì phải fail pipeline, không được ship trong im lặng.
- **Scan và enforce liên tục.** SBOM lúc build bắt được cái đã ship; scan liên tục cho biết cái gì *đã trở nên* dễ tổn thương từ lúc đó. CVE mới rơi mỗi ngày, một SBOM sạch lúc build có thể có lỗ hổng nghiêm trọng sau vài tuần. Khi mọi image đều có SBOM đính kèm, bạn gate được deploy: không SBOM hợp lệ thì không ship, có package dính lỗ trên ngưỡng severity thì không deploy.

---

## Checklist verify output

Trước khi dựa vào SBOM cho compliance hay quản lý lỗ hổng, kiểm nhanh sáu thứ: số component có hợp lý so với Dockerfile, lock file và base image không (một app Node khai 200 dependency phải ra nhiều hơn thế nhiều khi tính cả transitive); SBOM ghi version cụ thể `4.17.21` chứ không phải dải `^4.17.0`; transitive dependency có xuất hiện chứ không chỉ top-level (khai 30 trực tiếp mà SBOM chỉ có 32 entry thì độ phủ transitive gần như thiếu); OS package của base image có nằm cạnh dependency ứng dụng không; attestation tham chiếu đúng digest (một SBOM không buộc digest thì không tin được là mô tả đúng artifact của nó); và chạy qua schema validator chính thức.

---

## Vì sao điều này gấp lên ở môi trường regulated

Bài gốc nhắc tới một loạt khung pháp lý đang biến SBOM từ "nên có" thành "phải có": ở Mỹ, Executive Order 14028 đặt yêu cầu SBOM cho phần mềm bán cho cơ quan liên bang; EU Cyber Resilience Act mở rộng yêu cầu SBOM ra mọi sản phẩm có yếu tố số bán tại EU; và khi workload AI rơi vào tầm các quy định mới như EU AI Act, kê khai component ở mức chi tiết đang thành cách thực tế để chứng minh "bên trong hệ thống có gì". Mình đọc các mốc cụ thể với lưu ý rằng quy định còn đang chuyển động, nhưng hướng thì rõ: dù chưa bắt buộc về luật ở mọi nơi, SBOM đang thành điều kiện tiên quyết khi mua bán phần mềm.

Làm trong ngành tài chính, mình thấy chuyện này tới sớm hơn nhiều người nghĩ — không phải vì luật, mà vì khâu procurement và bộ phận risk nội bộ đã hỏi "cho xem SBOM" như một phần của due diligence với mọi thành phần đưa vào production. Đây cũng là lý do mình thiên hẳn về build-time và về base image ship sẵn SBOM ký kèm: khi auditor hỏi "thành phần này từ đâu ra, ai dựng, đã sửa giữa chừng chưa", một attestation buộc vào digest với provenance trả lời được câu đó trong vài giây, còn một file SBOM lỏng lẻo thì không. Khác biệt giữa "có SBOM" và "có SBOM tin được" chính là khác biệt giữa qua audit và trượt.

---

## Chốt lại

Thời điểm tốt nhất để thêm sinh SBOM vào pipeline là lần tới bạn động vào cấu hình CI. Bắt đầu từ image production có traffic cao nhất: bật build-time generation, đính SBOM như attestation, validate output theo checklist trên, rồi mở rộng ra phần còn lại của portfolio. Với base layer, dùng image ship sẵn SBOM + provenance ký kèm để bỏ luôn gánh sinh ở lớp nền; với lớp ứng dụng bạn đặt lên trên, sinh build-time rồi scan liên tục.

Thông điệp mình muốn để lại: SBOM không phải một file để nộp cho qua chuyện. Nó là dữ liệu chịu tải cho mọi quyết định bảo mật và compliance phía sau — nên chất lượng ở khâu sinh, và độ tin của khâu verify, mới là thứ quyết định nó đáng giá hay chỉ là một ô đã tick.

---

*Nguồn tham khảo: [How to Generate an SBOM for Container Workflows — Aditya Tripathi, Docker Blog](https://www.docker.com/blog/sbom-generation-for-container-workflows/). Bài viết được viết lại bằng tiếng Việt theo mạch riêng và bổ sung góc nhìn cho bối cảnh regulated; các số liệu và mốc pháp lý là trích dẫn của bài gốc, nên đối chiếu tại nguồn. Đây là nội dung gắn với sản phẩm của Docker (Hardened Images, Scout) — đã được diễn giải trung lập, tách khỏi phần marketing. Các sơ đồ minh họa được dẫn trực tiếp từ bài gốc và thuộc bản quyền của Docker.*
