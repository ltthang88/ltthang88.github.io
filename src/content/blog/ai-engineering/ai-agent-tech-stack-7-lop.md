---
title: "Tech stack của một AI agent: 7 lớp, và 6 lớp dưới mới quyết định thành bại"
description: "Foundation model là phần được viết về nhiều nhất, nhưng nó chỉ là một lớp. Một agent production gồm bảy lớp xếp chồng — model, orchestration, memory, retrieval, tools, observability, deployment — và sáu lớp bên dưới mới là thứ quyết định agent có chạy thật hay chỉ chạy trong demo. Bài này đi qua từng lớp kèm góc nhìn cho môi trường regulated."
pubDate: 2026-06-27T22:00:00+07:00
category: AI Engineering
tags: ["ai-agents", "llm", "rag", "observability", "mcp", "agentic-engineering"]
---

> Foundation model là lớp được nói tới nhiều nhất khi người ta bàn về AI agent. Nó cũng là lớp ít quyết định nhất tới chuyện agent có chạy được trong production hay không. Một agent thật là bảy lớp công nghệ xếp chồng, mỗi lớp một việc, mỗi lớp gãy theo một kiểu riêng. Model ở trên cùng hút hết sự chú ý; sáu lớp bên dưới mới là thứ quyết định agent của bạn hữu dụng hay chỉ trông hữu dụng.

Mình viết lại và mở rộng bài này từ một bài tổng quan rất mạch lạc của Shittu Olumide trên Machine Learning Mastery. Bản gốc đi kèm nhiều ví dụ code đầy đủ cho từng lớp; ở đây mình giữ phần khái niệm và đánh đổi, thêm góc nhìn vận hành — đặc biệt cho bối cảnh regulated mà mình làm hằng ngày — còn code chi tiết bạn nên xem thẳng ở nguồn cuối bài. Nếu muốn nền tảng khái niệm trước, mình đã viết riêng [30 khái niệm cốt lõi của agentic engineering](/blog/ai-engineering/agentic-engineering-core-concepts/).

<img src="https://machinelearningmastery.com/wp-content/uploads/2026/06/MLM-Shittu-A-vertical-stack-diagram-showing-all-7-layers-labeled-top-to-bottom.png" alt="Sơ đồ 7 lớp của AI agent stack từ trên xuống: Foundation Model, Orchestration, Memory, Vector Database/RAG, Tools, Observability, Deployment" loading="lazy" />

---

## Lớp 1 — Foundation model: cái lõi suy luận

Đây là nơi suy luận diễn ra, ngôn ngữ được hiểu, và quyết định "làm gì tiếp" được đưa ra. Mọi thứ còn lại trong stack hoặc đang bơm context vào nó, hoặc đang thực thi cái nó sinh ra.

Bức tranh model giữa 2026 (theo bản gốc) đã khác 2025 ở một điểm đáng kể: không còn ranh giới cứng giữa dòng "standard" và dòng "reasoning". Các nhà cung cấp lớn đã gộp reasoning vào một model duy nhất tự quyết định cần nghĩ bao lâu, điều khiển qua một tham số effort. Với phần lớn workflow agent, mức effort mặc định hoặc thấp là lựa chọn đúng — nhanh và rẻ; chỉ dấn effort lên khi task cần lập kế hoạch kỹ hoặc suy luận toán học, lúc đó độ chính xác thu lại bù cho chi phí.

Điều mình muốn nhấn, từ ghế người vận hành: chọn model là quyết định ít ràng buộc nhất trong cả stack. Bạn đổi model bằng một dòng config. Cái khó đổi là sáu lớp dưới. Nên đừng dành 80% thời gian tranh luận GPT hay Claude rồi 20% cho phần còn lại — tỉ lệ đó nên ngược lại. Một ngoại lệ quan trọng cho bối cảnh regulated: nếu dữ liệu không được rời mạng, lựa chọn model bị thu hẹp ngay về nhóm open-weight tự host, và đánh đổi không còn là "model nào giỏi nhất" mà là "model nào mình được phép chạy".

---

## Lớp 2 — Orchestration: hệ thần kinh điều phối

Nếu model là bộ não thì orchestration framework là hệ thần kinh. Nó lo control flow: quyết định bước tiếp theo, khi nào gọi tool, xử lý kết quả ra sao, và giữ cho cả vòng suy luận mạch lạc qua nhiều bước.

Pattern mà phần lớn framework hiện thực là **ReAct** (Reasoning and Acting): agent sinh một suy nghĩ, chọn một hành động, thực thi qua tool, quan sát kết quả, rồi nghĩ tiếp — lặp đến khi ra câu trả lời cuối.

<img src="https://machinelearningmastery.com/wp-content/uploads/2026/06/MLM-Shittu-A-cyclical-loop-diagram-of-the-ReAct-loop.png" alt="Sơ đồ vòng lặp ReAct: think → act → observe lặp lại" loading="lazy" />

Nghe đơn giản, nhưng đây chính là chỗ phần lớn sự cố production xảy ra: agent gọi nhầm tool, kẹt trong vòng lặp, hoặc không nhận ra khi nào đã đủ thông tin để dừng. Về lựa chọn framework, bản gốc tóm gọn theo nhu cầu: một agent đơn chạy task thì LangGraph/LangChain; một đội nhiều agent chuyên biệt phối hợp thì CrewAI hoặc AutoGen; môi trường enterprise trên nền Microsoft thì Semantic Kernel; workflow nặng retrieval thì LlamaIndex.

Một agent tối giản trên LangGraph gọn tới mức này — `create_react_agent` ráp sẵn LLM, tool và vòng ReAct:

```python
from langchain_openai import ChatOpenAI
from langchain_community.tools import DuckDuckGoSearchRun
from langgraph.prebuilt import create_react_agent

llm = ChatOpenAI(model="gpt-5.5", temperature=0)
agent = create_react_agent(llm, [DuckDuckGoSearchRun()])
```

Cái bẫy là sự gọn gàng đó che mất phần khó: vòng lặp tự quyết. Lời khuyên thực tế của mình — luôn đặt trần số vòng lặp (`max_iterations`) ngay từ đầu. Một agent kẹt loop không chỉ phiền, nó đốt token theo cấp số nhân cho tới khi bạn nhận hóa đơn.

---

## Lớp 3 — Memory: vì sao agent hay quên

Mặc định của mọi LLM là stateless. Mỗi lần gọi đều bắt đầu lại từ đầu, không biết gì về cái đã xảy ra trừ khi bạn nhét context vào tận tay. Với câu hỏi một-phát thì ổn; với agent cần theo dõi hội thoại, nhớ sở thích người dùng, hay tiếp tục việc của hôm qua thì đây là vấn đề nền tảng.

Bản gốc dẫn một con số đáng chú ý từ nghiên cứu của Atlan: phần lớn pilot generative AI trong doanh nghiệp năm 2025 không tạo ra ROI đo được, và thủ phạm thường là "context chưa sẵn sàng" chứ không phải model kém. Mình đọc con số này với một chút dè dặt — đây là khảo sát của bên có lợi ích thương mại — nhưng *chiều* của nó thì khớp với những gì mình thấy: agent thất bại ở lớp memory thường xuyên hơn ở lớp model.

Có bốn loại memory, mỗi loại một việc:

- **Working memory** — chính là context window đang hoạt động: hội thoại hiện tại, tài liệu vừa đưa vào, kết quả tool gần đây. Nhanh, không cần hạ tầng, nhưng hết session là mất.
- **Episodic memory** — nhật ký các lần tương tác trước (timestamp, task, hành động, kết quả). Đây là thứ cho phép trả lời "thứ Ba tuần trước ta làm gì".
- **Semantic memory** — kiến thức factual lưu ngoài model, nơi RAG bơm dữ liệu vào.
- **Procedural memory** — quy trình và pattern dùng tool, sống trong system prompt hoặc một file chỉ dẫn được version-control.

Một sắc thái cho môi trường regulated mà bản gốc không nhấn: khi memory trở nên bền (lưu vào Postgres, Redis), nó tức khắc thành dữ liệu phải quản lý vòng đời. Hội thoại người dùng, hành động agent từng làm — tất cả giờ là bản ghi cần retention policy, cần audit trail, có khi cần quyền được xóa. "Agent nhớ mọi thứ" nghe hay cho UX, nhưng với compliance thì "nhớ mọi thứ vô thời hạn" là một khoản nợ.

---

## Lớp 4 — Vector database và RAG: dạy model về dữ liệu của bạn

Foundation model biết rất nhiều, nhưng không biết tài liệu của bạn. Nó không được train trên knowledge base nội bộ, lịch sử support, hay bất cứ thứ gì xảy ra sau mốc cắt training. RAG (Retrieval-Augmented Generation) là cách sửa điều đó.

Ý tưởng thẳng thắn: thay vì nhét cả knowledge base vào context window, bạn chuyển tài liệu thành embedding, lưu trong vector database, và lúc truy vấn chỉ lấy về đúng những đoạn liên quan nhất. Agent nhận một context window đầy đúng thông tin cần, thay vì tất cả những gì bạn từng viết.

<img src="https://machinelearningmastery.com/wp-content/uploads/2026/06/MLM-Shittu-A-horizontal-three-step-flow-diagram-showing-the-RAG-pipeline-1-scaled.png" alt="Sơ đồ RAG ba bước: Documents → Embeddings Model → Vector Database" loading="lazy" />

Về lựa chọn vector DB, bản gốc phân theo nhu cầu rất hợp lý: Pinecone khi muốn fully managed, đẩy vector lên và quên hạ tầng đi; Weaviate khi cần hybrid search (vector + keyword BM25 + lọc metadata trong một query); Chroma cho prototype và workload nhỏ-vừa chạy local; và pgvector khi đội đã chạy PostgreSQL sẵn — đây là đường ngắn nhất ra production RAG với ma sát thấp nhất.

Mình thiên về pgvector hơn người ta tưởng, và lý do rất vận hành: thêm một datastore mới vào hệ regulated nghĩa là thêm một thứ phải backup, vá lỗi, kiểm soát truy cập, và giải trình với auditor. Nếu Postgres của bạn đã đi qua hết các khâu đó rồi, dựng RAG ngay trên nó tiết kiệm hàng tháng phê duyệt so với mang về một database chuyên dụng mới. "Tốt nhất về kỹ thuật" và "ít tốn công vận hành nhất" hiếm khi là cùng một lựa chọn.

---

## Lớp 5 — Tools: nơi agent thực sự hành động

Một agent không có tool chỉ là cái máy đoán chữ rất đắt tiền. Tool là thứ cho agent tác động lên thế giới thay vì chỉ nói về nó. Về kỹ thuật, một tool là một hàm mà model có thể chọn gọi: bạn mô tả hàm làm gì bằng ngôn ngữ tự nhiên, định nghĩa tham số bằng schema, và model quyết định khi nào gọi. Model không chạy hàm — code của bạn chạy; model chỉ quyết định khi nào và với tham số gì.

Nhóm tool quan trọng nhất trong agent production: web search (thông tin mới), code execution (tính toán, xử lý dữ liệu), file I/O, API call, và browser use (cho giao diện web không có API). Một bước tiến đáng nắm là [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) — một cách chuẩn hóa để model nói chuyện với tool và nguồn dữ liệu ngoài, thay vì mỗi đội tự viết code tích hợp cho mỗi tool. Mình đã viết kỹ hơn về MCP trong bối cảnh thực tế ở bài về [GitLab Orbit và Antigravity](/blog/ai-engineering/gitlab-orbit-google-antigravity-context/).

Điều quan trọng nhất khi thiết kế tool, và bản gốc nói rất đúng, là **schema**. Model quyết định có dùng tool hay không dựa trên mô tả, và quyết định truyền tham số gì dựa trên schema. Mô tả mơ hồ đẻ ra gọi tool sai; schema có kiểu rõ ràng, mô tả tham số sạch sẽ đẻ ra gọi tool đáng tin. Một mẹo nhỏ mà giá trị: tool luôn trả về string kể cả khi lỗi — ném exception ra từ trong tool có thể làm sập cả vòng lặp agent.

Đây cũng là lớp mình lo nhất về bảo mật. Một tool gọi API hay chạy code là một quyền hành thật được trao cho thứ có thể hallucinate. Nguyên tắc mình mang từ thế giới Kubernetes sang — bắt đầu read-only, rồi *kiếm* thêm từng quyền một — áp gần như nguyên vẹn ở đây, và mình đã viết về nó qua ví dụ một [agent read-only chạy trong cluster](/blog/kubernetes/cluster-aware-ai-agent-argocd-gitops/).

---

## Lớp 6 — Observability: vì sao LLM "fail trong im lặng"

Đây là sự thật production ít được nói đủ: **LLM thất bại trong im lặng.** Một câu trả lời hallucinate vẫn trả về HTTP 200. Công cụ monitoring hạ tầng truyền thống thấy một request thành công. Bạn không thấy gì bất thường. Trong khi đó agent đã tự tin trả lời sai suốt ba ngày.

Monitoring cổ điển sinh ra cho một thế giới mà "đúng" là nhị phân: hàm trả về đúng kiểu, API trả 200, query xong dưới 100ms. Độ đúng của LLM lại mang tính ngữ nghĩa — câu trả lời có thể hợp lệ về cấu trúc, trôi chảy về ngữ pháp, và sai hoàn toàn về nội dung. Cái đó đòi một lớp observability khác hẳn, theo bản gốc gồm ba thứ: **tracing** (theo từng bước thực thi — gọi LLM, gọi tool, truy vấn retrieval, mỗi bước mất bao lâu), **evaluation** (chấm output theo faithfulness, relevance, tỉ lệ hallucination), và **monitoring** (theo dõi drift hành vi theo thời gian khi model và prompt thay đổi).

Câu "hallucinate vẫn trả HTTP 200" là thứ đập trúng bất kỳ ai từng on-call. Mình đã quen cảm giác mọi dashboard xanh mướt trong khi hệ thống đang làm sai — và với agent thì lớp xanh mướt đó còn dày hơn, vì output *trông* đúng. Nếu phải chọn lớp nào để đầu tư sớm nhất sau khi agent rời prototype, mình chọn observability trước cả memory. Bạn không sửa được thứ bạn không thấy. Với hệ regulated, mình thiên về phương án observability self-host được, để trace — vốn chứa nguyên văn input/output, tức có thể chứa dữ liệu nhạy cảm — không bị đẩy sang một SaaS bên thứ ba.

---

## Lớp 7 — Deployment: khoảng cách giữa demo và production

Bạn có thể có một agent hoàn hảo lúc dev rồi biến nó thành cơn đau bảo trì lúc production. Lớp hạ tầng là nơi khoảng cách đó sống.

Tối thiểu, agent nên được đóng gói bằng Docker: hành vi nhất quán giữa các môi trường, quản dependency gọn, và đường ra cloud sạch sẽ. Về tầng serving, bản gốc chia hai lựa chọn rõ ràng: một API đồng bộ (Flask/FastAPI) khi agent xong trong vài giây và bạn giữ được kết nối HTTP mở; còn khi agent gọi nhiều tool, retrieval dài, hay xử lý tài liệu mất 30–60 giây thì một async queue (Celery, SQS, Pub/Sub) là lựa chọn đúng — client nộp job, nhận ngay một task ID, rồi poll lấy kết quả. Về chi phí, ba thực hành tạo khác biệt lớn nhất: cache câu trả lời cho query lặp lại, gom batch các task không gấp, và đặt trần số vòng lặp để chặn loop chạy hoang.

Ba cloud lớn giờ đều có hạ tầng agent managed riêng. Với mình, lựa chọn lớp deployment ở hệ regulated bị chi phối bởi đúng ba chữ: compliance, data residency, audit. Một dịch vụ managed đẹp tới đâu mà không cho dữ liệu nằm trong nước hoặc không xuất được audit trail thì cũng không qua được khâu duyệt — và đó là ràng buộc quyết định, không phải tính năng cho vui.

---

## Ghép lại: chọn gì ở mỗi lớp tùy giai đoạn

Lựa chọn đúng ở mỗi lớp phụ thuộc bạn đang ở đâu trong vòng đời. Một bảng tham chiếu gọn, chắt từ bản gốc:

| Lớp | Prototype | Production startup | Enterprise / regulated |
|---|---|---|---|
| Foundation model | Một model mạnh, tool-calling tốt | Thêm model dự phòng | Bản managed/compliance hoặc open-weight tự host |
| Orchestration | LangGraph (dựng nhanh) | LangGraph hoặc CrewAI | Semantic Kernel hoặc LangGraph (governance) |
| Memory | In-context | Episodic (Postgres) + Semantic (RAG) | Managed kèm audit trail |
| Vector DB | Chroma (local) | Weaviate hoặc Pinecone | Weaviate hoặc pgvector (tự host được) |
| Tools | DuckDuckGo + hàm `@tool` | Bộ tool đầy đủ qua MCP | MCP, duyệt nội bộ, kiểm soát truy cập |
| Observability | Langfuse free tier | Langfuse self-host / Phoenix | Self-host / module LLM của hệ sẵn có |
| Deployment | Local / Docker | Docker + Kubernetes + async queue | Nền managed có governance, auditable |

Điểm mình muốn chốt: cột bên phải không phải "phiên bản xịn hơn" của cột bên trái. Nó là một bài toán khác, nơi ràng buộc compliance định hình lựa chọn trước cả hiệu năng. Nhiều quyết định trông như over-engineering ở startup lại là điều kiện tối thiểu ở ngân hàng, và ngược lại — bê nguyên bộ máy enterprise vào một prototype hai người là tự bóp chết tốc độ.

---

## Chốt lại

Foundation model là phần được viết về. Sáu lớp còn lại là phần quyết định thứ bạn dựng có chạy thật hay không. Agent gãy ở lớp orchestration khi vòng ReAct kẹt; gãy ở lớp memory khi nó quên context cần nhớ; gãy ở lớp retrieval khi lấy nhầm đoạn và model bịa ra một câu nghe-như-có-căn-cứ; gãy ở lớp tools khi schema mơ hồ; gãy ở lớp observability khi bạn không có cách nào biết mấy chuyện trên đang xảy ra; và gãy ở lớp deployment khi hạ tầng không kham nổi latency hay chi phí của traffic thật.

Bản gốc dẫn ước tính của Gartner rằng một phần lớn dự án agentic AI có nguy cơ bị hủy tới 2027 vì giá trị mơ hồ, chi phí leo thang và governance yếu. Con số cụ thể thì nên đọc như dự báo của một hãng phân tích, không phải định mệnh — nhưng nguyên nhân họ chỉ ra rất khớp thực tế: phần lớn thất bại không truy về việc chọn sai model, mà về một stack được ghép từng lớp một mà không có bức tranh rõ về việc các lớp nối với nhau thế nào. Hiểu cả stack không có nghĩa bạn phải tự xây hết. Nó nghĩa là bạn biết mình đang đánh đổi gì ở mỗi quyết định — và đó là khác biệt giữa một agent chạy trong demo và một agent ship được.

---

*Nguồn tham khảo: [The AI Agent Tech Stack Explained — Shittu Olumide, Machine Learning Mastery](https://machinelearningmastery.com/the-ai-agent-tech-stack-explained). Bài viết được viết lại bằng tiếng Việt theo mạch riêng, lược phần code chi tiết và bổ sung góc nhìn vận hành cho môi trường regulated; các số liệu phân tích là trích dẫn của bên thứ ba trong bài gốc và nên được đối chiếu tại nguồn. Các sơ đồ minh họa được dẫn trực tiếp từ bài gốc và thuộc bản quyền của Machine Learning Mastery / tác giả.*
