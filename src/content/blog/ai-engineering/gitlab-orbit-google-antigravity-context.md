---
title: "Coding agent thiếu gì nhất? Context — và cách GitLab Orbit cắm vào Google Antigravity"
description: "Một coding agent thấy được file đang mở và cái terminal, nhưng không hiểu hệ thống rộng hơn: service nào phụ thuộc đoạn code đang sửa, ai từng review thay đổi tương tự, lỗ hổng nào đã bị gắn cờ ở nơi khác. GitLab Orbit dựng một knowledge graph của vòng đời phần mềm rồi đưa nó vào agent qua MCP. Bài này nói về cái vấn đề thật bên dưới, và một góc nhìn tỉnh táo về các con số benchmark."
pubDate: 2026-06-27T16:00:00+07:00
category: AI Engineering
tags: ["ai-agents", "mcp", "context-engineering", "gitlab", "devsecops", "llm"]
---

> Một coding agent ngày nay viết code khá tốt, nhưng nó làm việc gần như mù về hệ thống quanh đoạn code đó. Nó thấy file đang mở và gọi được terminal. Cái nó không thấy: service nào import module bạn sắp refactor, có merge request nào đang mở động vào đúng mấy file đó, ai từng review thay đổi tương tự, lỗ hổng nào đã bị gắn cờ ở chỗ khác. Toàn bộ context đó nằm trong DevSecOps platform, không nằm trong cây thư mục.

GitLab vừa công bố tích hợp [GitLab Orbit](https://about.gitlab.com/blog/gitlab-orbit-and-google-antigravity) vào Google Antigravity — cài thẳng từ MCP Store của Antigravity, cho agent truy cập có cấu trúc vào project, pipeline, merge request, vulnerability và source code trên cả một GitLab instance. Tin thì gọn, nhưng nó chạm vào một câu hỏi đáng nói hơn bản thân thông báo sản phẩm: **vấn đề thật của coding agent không còn là sinh code, mà là context bạn nạp cho nó.** Bài này nói về cái vấn đề đó, Orbit giải nó thế nào, và vài chỗ mình thấy cần tỉnh táo.

---

## Cái agent không nhìn thấy

Hãy cụ thể về "thiếu context" nghĩa là gì. Một agent gắn vào IDE đọc được file, chạy được lệnh, grep được codebase. Trong phạm vi một repo, nó xoay xở ổn. Nhưng phần mềm thật không sống trong một repo. Nó sống trong một mạng lưới quan hệ: project này dùng library kia, merge request nọ đang sửa đúng file bạn định đụng, một class được mười service import, một vulnerability vừa được gắn cờ ở một project anh em.

Mạng lưới đó là tài sản, và nó không nằm trên disk — nó nằm trong GitLab (hoặc GitHub, Jira, hệ CI của bạn). Từ trước tới nay, cách đưa nó tới agent là viết script tự chế kéo dữ liệu qua API, hoặc tệ hơn, copy-paste qua lại giữa tab trình duyệt và khung chat. Cách nào cũng mong manh và lỗi thời ngay khi state đổi.

Đây không phải vấn đề riêng của agent. Bất kỳ ai từng on-call một service lạ lúc 2h sáng đều biết cảm giác này: code thì đọc được, nhưng "ai sở hữu cái này, rollback ở đâu, thay đổi này còn đập vào đâu nữa" lại nằm rải rác khắp nơi. Agent kế thừa đúng điểm mù của con người, chỉ ở tốc độ cao hơn.

---

## Orbit làm gì: một knowledge graph của vòng đời, hỏi được qua MCP

Ý tưởng của Orbit không mới về mặt khái niệm, nhưng đáng chú ý ở cách đóng gói. Nó index cả một GitLab instance và dựng một knowledge graph các quan hệ giữa group, project, user, work item, merge request, pipeline, vulnerability và source code. Rồi nó để lộ graph đó qua hai [MCP tool](https://docs.gitlab.com/orbit/remote/access/mcp/): `query_graph` chạy truy vấn có cấu trúc, và `get_graph_schema` trả về các loại node, thuộc tính và quan hệ có sẵn.

Điểm hay nằm ở chỗ: agent tự soạn truy vấn bằng JSON DSL của Orbit và nhận lại kết quả có kiểu (typed), thay vì người dùng phải nhảy giữa các tab rồi dán context vào. Nói cách khác, agent không "đọc mò" — nó hỏi một câu có cấu trúc và nhận một câu trả lời có cấu trúc. Những câu nó trả lời được nghe rất quen với bất kỳ ai làm DevOps:

- Project nào phụ thuộc module này, và thay đổi này có làm gãy chúng không?
- Project này còn vulnerability nào chưa xử lý?
- Dựa trên lịch sử review và quyền sở hữu file, ai nên review merge request này?
- Trong group này, project nào gây fail pipeline nhiều nhất?

MCP ở đây chỉ là lớp ống nối chuẩn hóa — [Model Context Protocol](https://modelcontextprotocol.io/) cho agent nối tới tool ngoài theo một cách thống nhất. Cái thực sự tạo giá trị là graph phía sau, và việc nó được reindex trong vài phút sau mỗi thay đổi, nên câu trả lời phản ánh hệ thống *hôm nay* chứ không phải cái wiki onboarding đã cũ từ đời nào.

---

## Ba tình huống dùng thật

GitLab nêu ba luồng, và cả ba đều là những việc mình từng phải làm thủ công, tốn thời gian.

**Phân tích blast radius.** Trước khi refactor một auth library dùng chung, kỹ sư hỏi agent: cái gì phụ thuộc module này? Merge request mở nào đang động vào mấy file đó? Ai sở hữu chúng? Agent truy vấn graph và trả cả ba trong một câu trả lời — danh sách nơi import, mọi MR đang dang dở chạm vào đó, và chủ sở hữu. Bạn thấy refactor sẽ va vào việc đang mở nào, và cần kéo ai vào, *trước khi* sửa một dòng.

<img src="https://res.cloudinary.com/about-gitlab-com/image/upload/v1782388863/gtlc39awbobl0ugplmkj.png" alt="Sơ đồ phân tích blast radius: module dùng chung, các nơi import, merge request đang mở và chủ sở hữu" loading="lazy" />

Đây đúng là kiểu việc mà sai một cái là trả giá đắt. Refactor một thư viện auth dùng chung mà không biết mười service đang import nó là công thức kinh điển cho một đêm trắng. Có một câu trả lời gọn về blast radius trước khi gõ phím đáng giá hơn nhiều so với việc giỏi sinh code.

**Onboarding và khám phá codebase.** Một dev quay lại một service lạ hỏi về dependency, các file entry-point, và những MR mở tuần này. Agent chạy truy vấn rồi dựng một "Walkthrough Artifact" — một bản đồ quét nhanh được, giữ lại được, thay vì một câu trả lời chat trôi đi mất. Vì Orbit reindex trong vài phút, bản đồ phản ánh service *như nó đang là*, không phải cái wiki cũ mà onboarding thường phải dựa vào.

<img src="https://res.cloudinary.com/about-gitlab-com/image/upload/v1782388863/hiy6gvv4bpxgrowoj5xo.png" alt="GitLab Orbit cho onboarding: bản đồ service với dependency, entry-point và merge request gần đây" loading="lazy" />

**Vẽ sơ đồ dependency.** Một tech lead truy vấn cấu trúc service-dependency của group rồi để agent render thành sơ đồ kiến trúc. Node và cạnh lấy từ graph sống, không phải từ một sơ đồ đã lỗi thời. Muốn hẹp hơn — ví dụ chỉ các service đang có security finding mở — thì truy vấn lại và render lại. Mỗi truy vấn được lọc theo đúng quyền của người hỏi, nên sơ đồ an toàn để chia sẻ nguyên trạng.

<img src="https://res.cloudinary.com/about-gitlab-com/image/upload/v1782388863/z5aymr3myuiavp2vbvui.png" alt="GitLab Orbit cho dependency mapping: sơ đồ kiến trúc service sinh từ knowledge graph sống" loading="lazy" />

Cái chi tiết "mỗi truy vấn được lọc theo quyền của người hỏi" nghe nhỏ nhưng lại là phần quan trọng nhất với mình — sẽ nói kỹ ở dưới.

---

## Về mấy con số benchmark: đọc với một chút muối

GitLab dẫn kết quả từ "early internal tests": agent có Orbit phản hồi nhanh hơn tới 11 lần, dùng ít hơn tới 4.5 lần token, và ít hallucination hơn tới 45 lần. Những con số này nghe ấn tượng, và về định tính thì hướng đi rất hợp lý — cho agent context có cấu trúc thay vì để nó đoán thì dĩ nhiên nhanh hơn, rẻ token hơn, bớt bịa hơn.

Nhưng đây là test nội bộ của chính nhà cung cấp, trên workload họ tự chọn, và cụm "tới X lần" (up to) luôn là con số tốt nhất chứ không phải con số điển hình. Mình không nghi ngờ chiều của kết quả; mình chỉ không coi "11 lần" là điều bạn nên kỳ vọng cho codebase của mình. Cách đọc lành mạnh: context tốt cải thiện rõ rệt cả ba chiều — tốc độ, chi phí token, độ chính xác — còn mức cải thiện cụ thể thì phải tự đo trên hệ của bạn. Một con số chính xác từ nguồn có lợi ích thương mại nên được đối xử như giả thuyết cần kiểm chứng, không phải kết luận.

---

## Cài đặt và phần nền chung

Về vận hành, tích hợp này nhẹ một cách dễ chịu: mở MCP Store trong settings của Antigravity, vào tab customization, tìm mục MCP, bấm "Add MCP", thêm GitLab Orbit, xác thực với GitLab qua prompt trên màn hình. Cài xong là tool của Orbit tự có sẵn cho agent — không file config, không setup terminal. Đây chính là điểm mạnh của việc chuẩn hóa qua MCP: cắm vào là chạy.

Một điểm kiến trúc đáng ghi nhận: Orbit là cùng một engine cung cấp context cho Duo Agent Platform của GitLab. Nghĩa là agent chạy trong Antigravity dựa trên cùng một knowledge graph có governance như agent chạy trong GitLab — không phải dựng và bảo trì một pipeline context riêng. Với đội platform quản instance lớn, "một graph, nhiều bề mặt agent" là một quyết định đúng: thứ tệ nhất là mỗi tool AI lại có một bản hiểu khác nhau về cùng một hệ thống.

Vài giới hạn thực tế cần biết: Orbit index code từ default branch cho Ruby, Java, Kotlin, Python, TypeScript, JavaScript, Rust và C#. Truy vấn qua MCP tiêu tốn GitLab Credits, riêng `get_graph_schema` thì miễn phí. Tính năng yêu cầu tier Premium hoặc Ultimate trên GitLab.com.

---

## Chỗ mình dừng lại lâu nhất: quyền truy cập

Phần làm mình chú ý nhất không phải tốc độ hay sơ đồ đẹp, mà là dòng "mỗi truy vấn được lọc theo đúng quyền của người dùng". Khi bạn cho một agent khả năng truy vấn *cả một instance* — project, vulnerability, source code, ai review cái gì — bạn vừa tạo ra một bề mặt truy cập dữ liệu mới, và nó kế thừa mọi câu hỏi khó về phân quyền mà ngành đã vật lộn từ lâu.

Làm trong ngành tài chính, đây là chỗ mình sẽ soi kỹ nhất trước khi bật. Một agent trả lời "project nào còn vulnerability chưa xử lý" về bản chất là một công cụ truy vấn security posture, và nó phải tôn trọng đúng ranh giới phân quyền như con người. Việc graph lọc kết quả theo quyền của người hỏi là điều kiện cần — nhưng mình vẫn muốn tự kiểm: agent assume danh tính nào, credential sống ở đâu, truy vấn có để lại audit trail không, và một prompt khéo léo có dụ được agent tổng hợp ra thứ mà người dùng đáng lẽ không được thấy không. Đây không phải lý do để tránh; đây là việc due diligence bình thường khi thêm một đường dữ liệu mới vào vành đai compliance.

Một sắc thái nữa: graph chỉ hữu ích khi dữ liệu nguồn sạch. Nếu ownership trong GitLab của bạn vốn đã mơ hồ, CODEOWNERS không ai cập nhật, project bỏ hoang không gắn tag — thì agent sẽ trả lời tự tin dựa trên một bản đồ sai. Orbit không sửa được kỷ luật dữ liệu; nó khuếch đại bất kỳ kỷ luật nào bạn đang có. Đó vừa là cơ hội, vừa là lời cảnh báo.

---

## Bức tranh lớn hơn

Bỏ qua phần thông báo sản phẩm, xu hướng bên dưới mới là điều đáng theo dõi. Năng lực sinh code của model đã đủ tốt cho phần lớn việc thường ngày; thứ tách một agent hữu ích khỏi một agent gây phiền không còn là nó viết code giỏi cỡ nào, mà là nó *hiểu hệ thống của bạn* tới đâu. Đó là lý do "context engineering" — chọn, cấu trúc và nạp đúng context — đang dần trở thành phần việc thật của agentic engineering, và là chủ đề mình đã chạm tới khi nói về [các khái niệm cốt lõi của agentic engineering](/blog/ai-engineering/agentic-engineering-core-concepts/).

GitLab Orbit, Antigravity MCP Store, và cả làn sóng "context layer" đang nổi đều là cùng một đặt cược: agent chỉ tốt ngang với context bạn cho nó, và knowledge graph về vòng đời phần mềm là một nguồn context giàu mà phần lớn đội đang để mặc agent đoán. Đặt cược đó nghe đúng. Phần còn lại — con số cụ thể, mô hình phân quyền, độ sạch dữ liệu — là thứ mỗi đội phải tự kiểm trước khi tin.

---

*Nguồn tham khảo: [Google Antigravity agents get full context with GitLab Orbit — Regnard Raquedan, GitLab Blog](https://about.gitlab.com/blog/gitlab-orbit-and-google-antigravity). Bài viết được viết lại bằng tiếng Việt theo góc nhìn vận hành và có bổ sung phần đánh giá tỉnh táo về benchmark cùng khía cạnh phân quyền; đây là thông báo sản phẩm của GitLab nên các con số hiệu năng là tuyên bố của nhà cung cấp. Các sơ đồ minh họa được dẫn trực tiếp từ bài gốc và thuộc bản quyền của GitLab.*
