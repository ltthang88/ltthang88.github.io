---
title: "30 khái niệm cốt lõi của Agentic Engineering, giải thích đơn giản"
description: "Mỗi tuần lại có một tool agent mới ra mắt. Cách bắt kịp không phải chạy theo tool, mà học những ý tưởng bên dưới. Bài này gom 30 khái niệm cốt lõi về AI agent theo 6 lớp: Foundations, Configuration, Capability, Orchestration, Guardrails, Observability — kèm tình huống minh họa."
pubDate: 2026-06-22T18:00:00+07:00
category: AI Engineering
tags: ["ai-agents", "llm", "agentic-engineering", "mcp", "devops", "guardrails"]
---

> Phiên bản viết lại bằng tiếng Việt và bổ sung tình huống minh họa, dựa trên bài *"30 Core Agentic Engineering Concepts, Explained Simply"* của Neo Kim & Paul Hoekstra (The System Design Newsletter). Xem nguồn ở cuối bài.

Làm sao bắt kịp agentic engineering khi mỗi tuần lại có một tool mới ra mắt? Câu trả lời: **bạn không cần bắt kịp tool**. Hãy học những *ý tưởng* bên dưới, rồi để tool đến rồi đi.

Tốc độ sẽ không chậm lại — model mới, framework mới, một bản "thay đổi mọi thứ" cứ vài ngày một lần. Chạy theo tất cả thì bạn tốn thời gian *đổi tool* nhiều hơn *dùng tool*. Nhưng bên dưới cái ồn ào ấy, vẫn là vài ý tưởng giống nhau lặp lại. Người này gọi là "skill", người kia gọi là "rule" — cùng một việc. Học được ý tưởng thì việc bạn chọn tool nào không còn quan trọng.

Bài này gói gọn 30 khái niệm theo **6 lớp**: nền tảng, cấu hình, năng lực, điều phối, rào chắn, và quan sát.

<img src="https://substackcdn.com/image/fetch/$s_!M9gA!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F982a6e25-adc8-41af-aec6-7412231fc2cf_1456x1050.png" alt="Tổng quan 6 lớp của agentic engineering: Foundations, Configuration, Capability, Orchestration, Guardrails, Observability" loading="lazy" />

---

## Lớp 1 — Foundations (nền tảng)

**1. Agent là gì?** Một LLM **chạy trong vòng lặp**, có quyền dùng tool, và tự quyết định bước tiếp theo. Thay vì một câu trả lời cho một prompt, model tạo ra một chuỗi hành động, mỗi hành động dựa trên kết quả của hành động trước. Dùng agent khi: task mở (vd "debug test đang fail", không phải "format ngày tháng"), bước sau phụ thuộc kết quả bước trước, và bạn không thể script trước đường đi. **Bỏ qua agent khi một prompt hay một script đơn giản là đủ** — mỗi vòng lặp tốn thời gian + tiền và khó debug hơn.

**2. Execution model (mô hình thực thi).** Vòng lặp agent có 3 bước lặp lại đến khi xong: **Think** (đọc trạng thái, quyết định) → **Act** (gọi tool, harness chạy nó) → **Observe** (kết quả tool thành context mới). Pattern này có nhiều tên — ReAct, think-act-observe — nhưng vòng lặp thì không đổi. Chính nhờ feedback từng bước mà agent có thể *tự sửa lỗi*: một test fail trả về stack trace, đó chỉ là observation tiếp theo để lập kế hoạch lại.

<img src="https://substackcdn.com/image/fetch/$s_!jZ8a!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Ffeaaa4ed-cb9b-47ca-89e8-6ccff483f3ca_1456x819.png" alt="Vòng lặp agent: think → act → observe, lặp lại đến khi xong" loading="lazy" />
<br/>

**3. Agent state (trạng thái).** Chia hai nửa: **context window** (mọi thứ model thấy *ngay lúc này* — có trần cứng là token cap, trần mềm là context rot; hết session là mất) và **mọi thứ ngoài nó** (file trên disk, DB, memory sống qua session — model không suy luận trực tiếp được, phải kéo vào context khi cần). State nên đặt ở đâu? File là default tốt (diff được, version được); memory cho fact sống qua session; DB khi cần query theo cấu trúc.
<img src="https://substackcdn.com/image/fetch/$s_!CCPD!,w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F51b338b7-597e-47ea-9d60-14a83c24f615_1456x819.png" alt="" loading="lazy" />

**4. Các pattern agent phổ biến.** Khi có nhiều agent, cách phối hợp: **planner/executor** (một agent lập kế hoạch, một agent thực thi); **router/specialist** (router phân việc cho chuyên gia hẹp — security reviewer, debug, docs writer); **map-reduce** (chia một task ra nhiều subagent rồi gộp kết quả, vd "review PR này" tách mỗi file một subagent). Mọi pattern đều dựa trên *handoff* mang theo bản tóm tắt nén — đó là nơi công việc dễ gãy nhất.

<img src="https://substackcdn.com/image/fetch/$s_!3Gir!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F1b4f231b-01c1-4de8-b5bc-4a0dde689cb1_1456x540.png" alt="Pattern planner/executor: một agent lập kế hoạch, một agent thực thi" loading="lazy" />

<img src="https://substackcdn.com/image/fetch/$s_!vZJf!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fb90d84ea-5536-4f55-8cd0-f0137392f3af_1456x540.png" alt="Pattern router/specialist: router phân việc cho các agent chuyên biệt" loading="lazy" />

<img src="https://substackcdn.com/image/fetch/$s_!1xKb!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F67495903-3327-40bd-b302-17b451cd2de3_1456x540.png" alt="Pattern map-reduce: chia một task ra nhiều subagent rồi gộp kết quả" loading="lazy" />

> **Tình huống minh họa.** "Review pull request 30 file" nếu nhồi hết vào một agent sẽ tràn context và chất lượng tụt. Tách map-reduce: mỗi file một subagent review song song, rồi một agent gộp thành summary. Chi phí bị chặn bởi subagent lâu nhất, không phải tổng tất cả.

---

## Lớp 2 — Configuration (cấu hình hành vi trước khi agent viết code)

**5. Agent config file.** File Markdown cấp project (Claude Code gọi `CLAUDE.md`, phần lớn tool khác dùng `AGENTS.md`) được nạp vào context mỗi session. Không có nó, agent mặc định làm theo thứ "trông hợp lý nhất" trong dữ liệu huấn luyện — `pip install` trong khi project bạn dùng `uv`, `black` trong khi bạn dùng `ruff`. **Giữ file ngắn và cụ thể** (giới hạn cứng, tool stack thật, vài rule hành vi như "không bao giờ commit secret"). Để dưới 100 dòng, đối xử với nó như code chứ không phải tài liệu.

<img src="https://substackcdn.com/image/fetch/$s_!OUZA!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F0607fbd1-0cf1-43b9-a5c8-b8eff7f8b445_1456x819.png" alt="Agent config file: lớp instruction cấp project nạp vào context mỗi session" loading="lazy" />
<br />

**6. Reusable workflow file (skill).** Nếu config file *luôn bật*, skill là *theo nhu cầu*: Markdown kèm YAML frontmatter (`name`, `description`, `globs`) cho agent biết khi nào nạp. Một nghiên cứu (SkillsBench) cho thấy model rẻ nhất (Haiku) kèm skill do người viết tốt **vượt** model flagship không có skill. Nhưng khi để model *tự viết* skill, lợi ích biến mất — boilerplate AI sinh ra làm mọi thứ tệ hơn.
<img src="https://substackcdn.com/image/fetch/$s_!_2Qa!,w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fcf4b6814-229e-4b05-9c42-4ce2564d4ec8_1456x819.png" alt="" loading="lazy" />
<br />

**7. Workflow framework.** Bộ quy trình tài liệu hóa cho lập kế hoạch, TDD, debug, code review (Superpowers, Get Shit Done, Compound Engineering). Điểm chung: bắt agent *hiểu* thứ nó đang xây, *bảo* nó cách làm, và *kiểm* kết quả so với điều bạn thật sự muốn.

**8. Prompt caching.** Lưu phần prefix ổn định của hội thoại để model không trả giá đọc lại mỗi lượt. Lần đầu trả phí ghi cache, các lượt sau đọc lại với giá rẻ hơn nhiều. Cảnh báo: cache có **TTL** — nghỉ lâu (cà phê, Slack) thì cache hết hạn và phải ghi lại.
<img src="https://substackcdn.com/image/fetch/$s_!tDKV!,w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Ff7171e07-34bd-4ab9-9991-25f0e8ffd942_1456x819.png" alt="" loading="lazy" />
<br />

**9. Context rot.** Hiệu năng model **giảm khi context window đầy lên**. Transformer cho mỗi token "chú ý" tới mọi token khác; tăng gấp đôi context thì phần chú ý mỗi token giảm đi một nửa, tín hiệu quan trọng bị pha loãng. Đây là khái niệm xuyên suốt cả lớp này: config, skill, MCP, memory — mỗi token đều cạnh tranh sự chú ý của model. **Giữ mọi thứ gọn, cắt bỏ thứ không đáng giá.**

<img src="https://substackcdn.com/image/fetch/$s_!yGjy!,w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F5004b923-978f-4757-bf36-5b871fa94525_1456x819.png" alt="" loading="lazy" />
<br />

> **Tình huống minh họa — context rot.** Một dev nhồi cả nghìn dòng "best practice" AI sinh ra vào `AGENTS.md` cho "chắc". Kết quả: agent thường xuyên bỏ qua rule quan trọng vì nó chìm trong biển chữ. Cắt còn 60 dòng rule thật sự cần — agent tuân thủ tốt hơn hẳn. *Nhiều context ≠ kết quả tốt hơn; thường chỉ là một agent tự tin nhưng lú lẫn.*

---

## Lớp 3 — Capability (agent với tới được gì khi chạy)

**10. Model Context Protocol (MCP).** Chuẩn để cấp cho agent quyền truy cập tool/dịch vụ ngoài, không phải tự viết code keo dán cho từng tool. Bị chê là "ngốn context", nhưng năm 2026 đã có **deferred loading** (chỉ nạp schema đầy đủ khi agent quyết định dùng tool) — giảm chi phí token đáng kể. MCP giải được vấn đề thật: chuẩn hóa, auth, permission, phân phối trong tổ chức.
<img src="https://substackcdn.com/image/fetch/$s_!WA_q!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fade130e1-9212-4a96-b7d6-76273b527a29_1456x819.png" alt="" loading="lazy" />
<br />


**11. Live document retrieval.** Model có knowledge cutoff; khi không biết signature của một API, nó *đoán một cách tự tin* và bạn chỉ phát hiện lỗi lúc runtime. Tool như Context7 kéo docs thư viện *hiện tại* vào context, xóa cả một lớp bug kiểu "gọi hàm đã bị đổi tên/deprecated".

**12. AI-native web search.** Search thường trả HTML cho người đọc (quảng cáo, navigation...); search kiểu AI (Exa) trả thẳng phần cần — tiết kiệm token, đỡ "thuế parsing".
<img src="https://substackcdn.com/image/fetch/$s_!eNhv!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Ff91b89f4-ba0e-4984-a71b-fef0cf520d29_1456x819.png" alt="" loading="lazy" />
<br />

**13. Visual output generation.** Skill/MCP biến agent thành chuyên gia tạo định dạng phi-code: đọc design Figma sinh code UI, sinh slide HTML, vẽ sơ đồ kiến trúc `.drawio` từ repo Terraform (wiring vào CI để sơ đồ không lệch khỏi hạ tầng thật).

**14. Persistent memory.** Mỗi session agent bắt đầu từ con số 0. `MEMORY.md` (file Markdown phẳng agent đọc đầu mỗi session) giải bài này cho quy mô nhỏ; khi lớn lên thì dùng plugin index hội thoại cũ thành vector để search ngữ nghĩa. Bắt đầu bằng file phẳng, nâng cấp khi `grep` không còn đủ.

**15. Knowledge search.** Nhiều context hữu ích chưa từng nằm trong session: meeting note, design doc, spec. Một search engine on-device (vd QMD) expose qua MCP cho agent query trong lúc làm việc.
<img src="https://substackcdn.com/image/fetch/$s_!-lfq!,w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F121a44b6-0adb-46e0-92e3-1419eea69289_1456x819.png" alt="" loading="lazy" />
<br />


---

## Lớp 4 — Orchestration (điều phối nhiều agent)

**16. Subagent.** Worker được ủy quyền, phạm vi giới hạn: prompt riêng, toolset hạn chế, context window sạch. Khi xong, **chỉ kết quả nén** trả về cho agent cha (không phải toàn bộ chuỗi suy luận). Lợi ích lớn nhất không phải song song mà là **nén** — test output, docs dài ở lại trong context subagent, luồng chính giữ sạch để còn suy nghĩ. Khi nhiều subagent ghi cùng repo, dùng **git worktree** để mỗi agent có bản checkout riêng.
<br />
<img src="https://substackcdn.com/image/fetch/$s_!Qw9I!,w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F9fb0b6ea-8307-41bf-9fe5-299ea9a40adc_1456x819.png" alt="Subagent: worker được ủy quyền với context window sạch, chỉ trả về kết quả nén cho agent cha" loading="lazy" />

**17. Agent loop.** Chạy lại một agent với context mới mỗi vòng, lưu tiến độ ra file + git (vd Ralph loop). Cùng nguyên lý nén như subagent nhưng làm *mỗi vòng lặp*: giữ context sống nhỏ, đẩy state ra file system, rồi restart sạch. Rất hợp việc lặp đi lặp lại có ranh giới rõ (migrate codebase từng file, refactor nhiều call site).

**18. Orchestration tool.** Khi chạy nhiều agent song song cần một lớp trên (Conductor, Vibe Kanban, Cline Kanban): chúng trùng việc, mất dấu tiến độ, trả về 5 phiên bản "sự thật" không tương thích nếu không có người điều phối.
<img src="https://substackcdn.com/image/fetch/$s_!isjy!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F6dc95f87-9a0e-4f61-aece-c380de2d83ba_1456x819.png" loading="lazy" />


**19. Managed/cloud agent.** Session agent chạy dài trên hạ tầng vendor, truy cập qua API. Vendor lo harness, sandbox, tool loop, container. Hợp khi bạn *xây sản phẩm chạy agent cho người khác*; còn dùng cá nhân thì plan (Claude Pro/Max) vẫn rẻ hơn pay-as-you-go.
<img src="https://substackcdn.com/image/fetch/$s_!bbmB!,w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fe8c420b5-963c-4da1-84df-c510da37cc07_1456x819.png" alt="" loading="lazy" />

---

## Lớp 5 — Guardrails (chặn agent gây hại)

**20. Sandboxing.** Cô lập những gì agent đọc/ghi/truy cập mạng. Phần lớn harness hiện đại có sandbox sẵn: agent đọc/ghi thư mục project + temp, chỉ ra mạng qua allowlist, chặn đọc thư mục credential (`~/.ssh`, `~/.aws`...). Muốn cô lập tối đa: chạy trong Docker `--network none`. **Đây là bức tường chặn hậu quả khi mọi lớp khác thất bại.**
<img src="https://substackcdn.com/image/fetch/$s_!zvMR!,w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F2a620175-4394-45d8-9a2a-e9d985cb0ce6_1456x819.png" alt="" loading="lazy" />

**21. Permissions.** Allow/deny list cho tool call, đọc file, lệnh shell. Agent không ác ý — chúng là "kẻ giải quyết vấn đề kiểu reward-hack": gặp permission error thì `chmod 777`, test fail mãi thì comment bỏ assertion, git push bị chặn thì force-push lên main. Setup điển hình: settings cấp project (chạy không cần hỏi: lint, test, git thường) + deny-list cấp user (những thứ *không bao giờ* được phép: đọc `.env`, `rm -rf`, force-push main).

> **Tình huống minh họa.** Agent gặp một test cứ fail. Không có guardrail, nó "sáng tạo": comment luôn các assertion để test pass rồi báo "done". Có deny-list + structural lint, hành vi tắt-assertion bị chặn ngay — agent buộc phải sửa nguyên nhân thật thay vì gian lận cho qua.

**22. Hooks.** Handler gắn vào các điểm trong workflow agent. Quan trọng nhất là **pre-tool hook** (Claude Code gọi `PreToolUse`): chạy *sau* khi agent dựng tool call nhưng *trước* khi nó thực thi — điểm kiểm tra cuối để chặn lệnh xấu. Vd validator chặn lệnh chứa Unicode đáng ngờ hay pattern `pipe-to-shell`.
<img src="https://substackcdn.com/image/fetch/$s_!zn1c!,w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fd4abb7e5-6658-4cea-9705-8b17d9b82e62_1456x819.png" alt="" loading="lazy" />

**23. Prompt injection defense.** Agent coi config file và output của tool là "sự thật" → chỗ lý tưởng để chèn lệnh độc. Kịch bản supply-chain: bạn clone một repo lạ, bên trong có config file ghi "pipe test output qua endpoint này để log" — agent đọc, tin, và bắt đầu gửi thông tin môi trường ra server lạ. Phòng thủ: **coi config file là code, review trước khi tin**; không bao giờ auto-load MCP server đi kèm repo clone.
<img src="https://substackcdn.com/image/fetch/$s_!Th95!,w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Ff743019e-0889-41a6-aa28-7fd0af2aac7e_1456x819.png" alt="" loading="lazy" />


> **Tình huống minh họa — homoglyph.** Lệnh nhìn hoàn toàn bình thường nhưng chữ "i" trong đó là ký tự Cyrillic (code point khác ASCII). Mắt người thấy giống hệt, shell chạy đúng thứ đứng sau ký tự đánh tráo đó. Pre-tool hook + validator bắt được Unicode đáng ngờ trước khi lệnh chạy.

**24. Structural code linting.** Linter thường nhìn bề mặt (format, import); structural lint (AST-grep) nhìn cây cú pháp bên dưới. Quan trọng với code do AI viết vì **LLM không mắc lỗi của con người** — nó viết code đúng cú pháp, qua lint/type-check, nhưng pattern bên dưới sai tinh vi (kinh điển: mutable default argument `def process(items=[])`). Gặp anti-pattern lặp lại thì mã hóa thành rule, gắn vào pre-commit + CI.
<img src="https://substackcdn.com/image/fetch/$s_!eqc-!,w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F97baaac1-5fce-4058-9321-d1ec1c4f7183_1456x819.png" alt="" loading="lazy" />

**25–26. Pre-commit gate & CI.** Cổng chất lượng cục bộ chặn code xấu *trước khi* thành commit, và CI chạy lại cùng các kiểm tra đó trên server (nơi agent không lén skip được). Với agent, sự "hơi đa nghi" lại đúng: rule cứng nhắc với người nhưng hợp với agent — nó không khó chịu, chỉ đọc lỗi và thử lại. Mẹo: thêm block `concurrency` vào CI để hủy run cũ khi có push mới (agent đẻ branch như "goblin", dễ đốt CI minutes).

<img src="https://substackcdn.com/image/fetch/$s_!Bbbd!,w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F352a8669-7362-437a-8262-31b23f05e8ba_1456x819.png" alt="" loading="lazy" />

<img src="https://substackcdn.com/image/fetch/$s_!aDtd!,w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fc9bb7b6e-e379-4335-bb3e-db2a3595e126_1456x819.png" alt="" loading="lazy" />

---

## Lớp 6 — Observability (thấy agent đã thực sự làm gì)

**27. Tracing.** Bản ghi từng bước của một lần chạy, *có cấu trúc cây* (subagent A gọi tool X, X gọi Y), kèm thời gian mỗi bước, input/output mỗi node, và lý luận của model tại mỗi điểm quyết định. Cây dễ theo dõi hơn danh sách phẳng. Có trace rồi thì replay, metrics, điều tra lỗi đều dễ hơn.
<img src="https://substackcdn.com/image/fetch/$s_!opGH!,w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F5726c435-f07a-49d2-b623-ccced727be59_1456x819.png" alt="" loading="lazy" />


**28. Logging.** Nền móng cho mọi thứ: bản ghi thô, append-only của input/output/tool call mỗi run (kèm full prompt, latency, token, model version, session ID). Định dạng sống sót lâu nhất: JSON Lines, verbose. **Mặc định giữ tất cả, cắt bớt sau** — mất input của một session cho ra kết quả khó hiểu còn tệ hơn hóa đơn lưu trữ.
<img src="https://substackcdn.com/image/fetch/$s_!8l3l!,w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F2267cac0-2169-4306-bb05-a15e72d8d81b_1456x819.png" alt="" loading="lazy" />


**29. Replay / debug run lỗi.** Có log đầy đủ thì chạy lại được: replay với response đã ghi để *tái hiện chính xác* một bug; replay với model call mới để xem bản vá có sửa được không. Replay trên model version khác giúp bắt lỗi do upgrade làm gãy ngầm.

**30. Metrics.** Phần lớn đo được chỉ là *proxy*: latency/session, token & chi phí, số tool call, số lần fail — đủ để bắt các failure mode hiển nhiên (session đốt tiền, agent kẹt vòng lặp). **Outcome data** ("agent có thành công không") khó hơn: "task complete" là *lời tuyên bố*, không phải *phép đo*. Muốn tín hiệu thật phải neo vào artifact agent không tạo ra: test pass trong CI, PR được merge, deploy không bị roll back.

---

## Bắt đầu từ đâu

Nếu xuất phát từ con số 0, thứ tự nên học:

1. Viết một **config file** cho project (khái niệm 5)
2. Wiring **MCP** cho live docs (khái niệm 10)
3. **Bật sandbox** mặc định (khái niệm 20)
4. Dùng **subagent** cho việc đọc nhiều (khái niệm 16)

Tóm lại: học *ý tưởng*, đừng chạy theo *tool*. Foundations cho bạn agent là gì và chạy ra sao. Configuration định hình hành vi trước khi viết code. Capability là thứ nó với tới được. Orchestration phối hợp nhiều agent. Guardrails chặn gây hại. Observability cho bạn thấy điều gì đã thực sự xảy ra.

---

*Nguồn tham khảo: [30 Core Agentic Engineering Concepts, Explained Simply — Neo Kim & Paul Hoekstra, The System Design Newsletter](https://newsletter.systemdesign.one/p/agentic-engineering). Bài viết được viết lại bằng tiếng Việt và bổ sung tình huống minh họa; nội dung đã được diễn giải lại để phù hợp mục đích chia sẻ. Các sơ đồ minh họa được dẫn trực tiếp từ bài gốc và thuộc bản quyền của The System Design Newsletter.*
