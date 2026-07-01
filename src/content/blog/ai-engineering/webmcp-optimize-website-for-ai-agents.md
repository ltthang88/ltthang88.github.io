---
title: "WebMCP: để website tự nói chuyện với AI agent, thay vì bắt agent đi mò DOM"
description: "Lâu nay AI agent dùng được website bằng cách bắt chước con người: đọc DOM, đoán nút nào bấm, điền form. WebMCP lật ngược: website tự khai báo các hành động sẵn có dưới dạng tool để agent gọi thẳng. Bài này nói WebMCP là gì, hai cách hiện thực, khác gì MCP server — và một góc bản gốc bỏ ngỏ: expose tool công khai cho agent thật ra là mở thêm một bề mặt API cần phòng thủ."
pubDate: 2026-06-30T10:00:00+07:00
category: AI Engineering
tags: ["webmcp", "mcp", "ai-agents", "web", "security", "browser-automation"]
---

> AI agent đang dần trở thành một lớp "người dùng" mới của web: nó đặt lịch, so sánh sản phẩm, tra tài liệu, điền form thay cho người. Vấn đề là phần lớn agent hôm nay làm việc đó bằng cách giả làm người — đọc DOM, đoán nút nào cần bấm, mô phỏng gõ phím. WebMCP đề xuất cách khác: thay vì bắt agent đảo ngược giao diện của bạn, website tự khai báo các hành động nó hỗ trợ dưới dạng tool để agent gọi trực tiếp. Nghe gọn, nhưng nó kéo theo một câu hỏi vận hành mà bản gốc đi lướt: khi bạn công khai "đây là các việc làm được trên trang", bạn vừa mở thêm một bề mặt API — và bề mặt nào cũng cần phòng thủ.

Mình viết lại và mở rộng bài này từ một bài hướng dẫn rõ ràng của Jakub Andrzejewski trên blog DebugBear. Bản gốc đi qua đủ khái niệm, code và công cụ kiểm thử; ở đây mình dựng lại theo mạch riêng, giữ phần cốt lõi, và thêm góc nhìn mình quan tâm nhất — bảo mật và bối cảnh regulated. Nếu bạn muốn hiểu MCP nói chung trước, mình đã nhắc tới nó trong bài về [tech stack của một AI agent](/blog/ai-engineering/ai-agent-tech-stack-7-lop/).

Một lưu ý ngay từ đầu cho khỏi kỳ vọng sai: WebMCP còn rất sớm. Chrome mới chỉ bắt đầu thêm hỗ trợ (phần lớn nằm trong Canary), và không phải trình duyệt nào cũng có sẵn lớp agent để tiêu thụ các tool này. Đây là thứ đáng theo dõi và thử nghiệm, chưa phải thứ để cược cả production vào lúc này.

---

## Vì sao "agent giả làm người" không bền

Cách phổ biến nhất để agent dùng website bây giờ là browser automation. Quy trình thường là: load trang, parse DOM, nhận diện nút và ô input, mô phỏng click và gõ, chờ trang cập nhật, rồi đi tiếp. Mạnh, linh hoạt, dùng được với gần như mọi trang. Nhưng nó gãy theo ba kiểu rất đặc trưng.

Thứ nhất, **nó gãy mỗi khi UI đổi.** Đổi nhãn nút, dời vị trí form, đổi cách render nội dung động, hay chỉ là một CSS selector hết hiệu lực — con người thích nghi ngay, còn script thì đứng hình. Đây là loại lỗi khó chịu nhất vì nó không báo trước: hôm qua chạy, hôm nay deploy một thay đổi giao diện vô hại, agent gãy.

Thứ hai, nó tốn. Để "nhìn" được trang, agent phải chạy JavaScript render, tải asset, chờ network, rồi phân tích một cây DOM có khi rất lớn. Mỗi tác vụ là một phiên duyệt đầy đủ. Với ứng dụng phức tạp, phần overhead này cộng dồn thành latency và chi phí hạ tầng thật.

Thứ ba, nó mơ hồ. Một trang có "Mua ngay", "Thêm vào giỏ", "Đăng ký nhận tin" cạnh nhau; agent phải suy ra ý định từ giao diện, và đôi khi đoán sai. Mỗi lần đoán sai trên một thao tác có hậu quả — đặt hàng, thanh toán — là một lần bạn không muốn gặp.

---

## WebMCP là gì

WebMCP là một spec cho phép website công khai năng lực của mình tới AI agent thông qua Model Context Protocol. Thay vì chỉ có HTML, JavaScript và tương tác trình duyệt, trang web xuất bản các mô tả máy-đọc-được về những hành động agent có thể thực hiện: tìm sản phẩm, đặt lịch hẹn, tra tài liệu, gửi form, truy cập thông tin tài khoản.

Khác biệt cốt lõi nằm ở chỗ ai mô tả cái gì. Browser automation hỏi "tôi phải làm thế nào để hoàn thành việc này trên trang này". WebMCP để trang web trả lời trước một câu khác: "đây là những việc làm được, và đây là cách gọi chúng". Ý định được khai báo tường minh thay vì để agent suy đoán. Đó là một cách tiếp cận declarative — bạn nói *cái gì* có sẵn, không phải *làm sao* để bấm tới nó.

---

## Hai cách hiện thực: declarative và imperative

WebMCP cho hai con đường, và lựa chọn giữa chúng khá rõ ràng tùy việc tool có phụ thuộc trạng thái runtime hay không.

### Declarative API — biến một form HTML thành tool

Điểm mình thấy thú vị nhất là cách declarative: không cần viết JavaScript, bạn expose tool thẳng từ HTML bằng vài thuộc tính. Gắn `toolname` và `tooldescription` vào form, mô tả từng input bằng `toolparamtitle` / `toolparamdescription`, và tùy chọn `toolautosubmit` để agent tự submit sau khi điền:

```html
<form
  id="login-form"
  toolname="login"
  tooldescription="Đăng nhập ứng dụng bằng email và mật khẩu"
  toolautosubmit="true">
  <label for="email">Email</label>
  <input
    type="email"
    id="email"
    name="email"
    required
    toolparamtitle="Email"
    toolparamdescription="Địa chỉ email của người dùng" />
  <button type="submit">Đăng nhập</button>
</form>
```

Cái hay là nó biến intent từ ngầm thành tường minh. Thay vì để agent đoán rằng cụm ô email + mật khẩu này là một luồng đăng nhập, trang web nói thẳng điều đó. Với những workflow đã sống sẵn dưới dạng form — đăng nhập, tìm kiếm, đăng ký — đây là đường ngắn nhất để mở chúng ra cho agent, gần như không phải viết thêm logic.

### Imperative API — khi tool phụ thuộc trạng thái

Khi tool không ánh xạ gọn vào một form, hoặc kết quả phụ thuộc trạng thái runtime, WebMCP có một JavaScript API. Bạn đăng ký tool động qua `navigator.modelContext.registerTool(...)`:

```ts
navigator.modelContext.registerTool({
  name: "search-products",
  description: "Tìm sản phẩm trong catalog",
  parameters: {
    query: {
      type: "string",
    },
  },
  async execute({ query }) {
    return searchProducts(query);
  },
});
```

Khi agent gọi tool, callback `execute` chạy và trả kết quả về. Tool không cần gắn vào form hay phần tử UI nào — hợp với trường hợp tool được sinh theo chương trình, hoặc tham số thay đổi theo ngữ cảnh ứng dụng. Đăng ký xong, tool trở nên khả dụng với các agent tương thích đang hoạt động trong ngữ cảnh trang đó.

---

## Agent "kết nối" thế nào — và vì sao nó khác MCP server

Đây là chỗ dễ rối nếu bạn đã quen MCP server truyền thống. Với một MCP server, client AI kết nối tới một service endpoint đứng độc lập, gọi tool qua kết nối tới server đó. WebMCP làm khác hẳn: tool được chính website đăng ký, và agent khám phá chúng từ tab trình duyệt đang mở.

Trên thực tế nó diễn ra thế này: bạn mở một trang có WebMCP trong trình duyệt hỗ trợ, trang đăng ký tool (declarative hoặc imperative), rồi một agent tích hợp trong trình duyệt — hoặc một công cụ kiểm thử đọc được tool đã đăng ký trên trang — nhận ra các tool đó và gọi tool phù hợp khi bạn yêu cầu làm một việc gì đó.

Nói cách khác, "kết nối" ở đây không phải "trỏ agent tới một URL API". Nó gần với "trang này phơi ra một bộ hành động có cấu trúc trong lúc nó đang mở trên trình duyệt". Đó là một mô hình quyền hạn rất khác, và lát nữa mình sẽ nói vì sao nó vừa tiện vừa đáng để dừng lại suy nghĩ.

---

## WebMCP và MCP server: giống tên, khác bài toán

Cả hai đều dựa trên Model Context Protocol và đều cho agent truy cập năng lực có cấu trúc, nên dễ nhầm. Nhưng chúng giải hai bài toán khác nhau.

MCP server là một service độc lập phơi tool, resource và prompt cho client AI. Nó nối vào knowledge base nội bộ, database, file system, hệ support — và đóng vai lớp tích hợp giữa model và hệ thống bên ngoài. Agent kết nối thẳng tới server đó để gọi tool.

WebMCP mang ý tưởng tương tự áp vào website công khai: thay vì dựng một server riêng, chính trang web khai báo hành động để agent khám phá ngay trong tab. Một cách ví von của bản gốc mà mình thấy đắt: **WebMCP giống SEO cho AI agent, còn MCP server giống API cho ứng dụng AI.** Một bên giúp trang dễ được agent "hiểu và dùng" khi người dùng đang ở đó; một bên là cổng tích hợp backend mà agent chủ động nối vào.

| | MCP server | WebMCP |
|---|---|---|
| Tool sống ở đâu | Service backend độc lập | Chính trang web, trong tab đang mở |
| Agent truy cập kiểu gì | Kết nối tới endpoint | Khám phá từ tab trình duyệt |
| Hợp cho | Vận hành nghiệp vụ, có xác thực | Tương tác website công khai |
| Ví von | API cho ứng dụng AI | SEO cho AI agent |

Và dĩ nhiên dùng cả hai được. Một công ty có thể chạy MCP server cho các thao tác nghiệp vụ đã xác thực, và WebMCP cho tương tác công khai trên website. Chúng bổ sung nhau chứ không loại trừ.

---

## Kiểm thử và validate: nhìn thấy tool trước khi tin nó chạy

Thêm WebMCP vào trang mới là một nửa việc; nửa còn lại là chắc chắn tool thật sự được khám phá và dùng được. Vòng làm việc hợp lý: mở trang trong môi trường Chrome hỗ trợ WebMCP, đăng ký tool, dùng công cụ kiểm thử để xem tool nào đang được đăng ký, rồi gọi thử thủ công với tham số mẫu để xác nhận hành vi.

Có vài điểm tựa cụ thể đang dần xuất hiện:

- **Chrome DevTools** (bản Canary) đã có một mục WebMCP trong tab Application: liệt kê tool trang cung cấp, tham số chúng nhận, và cho chạy thử ngay tại đó.
- **Lighthouse** thêm các audit kiểm tra tool có được expose và khám phá đúng không — kiểm tra việc phát hiện tool, validate schema, chất lượng metadata, khả năng tiếp cận của phần khai báo.
- **PageSpeed Insights** gần đây bổ sung nhóm audit "Agentic Browsing" để đánh giá mức độ một trang thân thiện với agent, kèm các kiểm tra riêng cho WebMCP.

Một điểm cần phân biệt cho rõ, và bản gốc nói đúng: Lighthouse giúp xác nhận tool *có mặt và được expose đúng cách*, nhưng đó không phải là kiểm thử trọn vẹn trải nghiệm agent end-to-end. Tool hiện ra trong audit không đồng nghĩa agent sẽ gọi đúng nó vào đúng lúc với đúng tham số. Đừng nhầm "tool discoverable" với "workflow chạy đúng".

---

## Góc mình quan tâm nhất: expose tool công khai là mở thêm bề mặt tấn công

Đây là phần bản gốc gần như bỏ ngỏ, và cũng là phần khiến mình vừa hào hứng vừa dè dặt.

Khi bạn khai báo một WebMCP tool, bạn không chỉ "giúp agent đỡ phải đoán". Bạn đang công bố một danh sách máy-đọc-được các hành động làm được trên trang, kèm schema tham số sạch sẽ. Với một agent thiện chí, đó là món quà. Với một script lạm dụng, đó cũng là một tấm bản đồ: thay vì phải reverse-engineer giao diện để biết endpoint nào nhận gì, giờ trang tự liệt kê sẵn. Tính mơ hồ vốn là ma sát cho automation hợp lệ — gỡ ma sát đó thì cũng gỡ luôn cho phía không hợp lệ.

Điều này không có nghĩa WebMCP kém an toàn hơn. Nó có nghĩa **một WebMCP tool phải được phòng thủ như một endpoint API thật, vì về bản chất nó là vậy.** Authentication, authorization, rate limiting, chống lạm dụng, validate đầu vào phía server — tất cả những thứ bạn vốn áp cho API vẫn phải áp y nguyên ở đây. Cái thay đổi chỉ là độ dễ khám phá, và độ dễ khám phá nghiêng về cả hai phía.

> **Tình huống minh họa.** Hình dung một form "đăng nhập" được gắn `toolname="login"` với `toolautosubmit="true"`. Tiện cho agent thật: nó điền email, mật khẩu, submit, xong. Nhưng nếu phía server không có rate limit và lockout đàng hoàng, bạn vừa biến luồng đăng nhập thành một bề mặt credential-stuffing được mô tả sẵn schema — auto-submit chỉ làm vòng lặp thử mật khẩu mượt hơn. Bài học không phải "đừng expose login", mà là phòng thủ phải nằm ở server; gắn thuộc tính WebMCP lên một form chưa được bảo vệ chỉ làm lộ rõ điểm yếu vốn có.

Với môi trường mình làm — tài chính, có quy định — còn một lớp nữa: phần lớn thao tác có giá trị đều cần xác thực và để lại audit trail, và chúng không thể được kích hoạt một cách mơ hồ bởi "thứ gì đó đang chạy trong tab". WebMCP ở bối cảnh này hợp nhất với các hành động công khai, ít rủi ro: tra cứu sản phẩm, tìm tài liệu, xem thông tin không nhạy cảm. Các thao tác đổi trạng thái — chuyển tiền, đổi hạn mức — vẫn phải đi qua đúng cổng xác thực và ghi log như mọi khi, dù có agent hay không. Đây không phải lý do để tránh WebMCP, mà là ranh giới để dùng nó đúng chỗ.

---

## Hybrid mới là thực tế, không phải thay thế

Dễ đọc các bài giới thiệu WebMCP theo kiểu "declarative sẽ khai tử browser automation". Mình không nghĩ vậy, và bản gốc cũng cẩn thận không nói thế.

So sánh hai mô hình thì WebMCP thắng ở những điểm quan trọng: đọc định nghĩa tool thay vì đọc DOM, gọi tool thay vì mô phỏng click, bề mặt ổn định thay vì nhạy với thay đổi UI, overhead thấp thay vì phải render đầy đủ, hành động tường minh thay vì mơ hồ. Nhưng điều kiện tiên quyết là trang *phải* có WebMCP và trình duyệt *phải* hỗ trợ — mà hôm nay cả hai đều chưa phổ biến.

Nên cấu hình hợp lý trong thực tế là hybrid: dùng WebMCP khi có, rớt về browser automation khi không. Agent vẫn cần biết cách "nhìn" một trang bất kỳ, vì phần lớn web sẽ chưa khai báo tool trong thời gian dài nữa. WebMCP nâng độ tin cậy cho những workflow phổ biến trên các trang chịu khó khai báo; nó không xóa nhu cầu về một phương án dự phòng tổng quát.

---

## Chốt lại

Web sinh ra cho con người, rồi dần mở cho search engine, mobile, API, hệ thống tự động. Agent là lớp tiếp theo, và thay vì bắt chúng diễn giải giao diện vốn dành cho mắt người, WebMCP cho website một cách nói thẳng năng lực của mình bằng ngôn ngữ máy hiểu được.

Nếu phải tóm trong một câu: WebMCP làm cho tương tác agent đáng tin hơn, nhẹ hơn, ít mơ hồ hơn và bền hơn trước thay đổi UI — với cái giá là bạn phải đối xử với mỗi tool như một endpoint công khai cần phòng thủ tử tế. Công nghệ còn sớm, hỗ trợ còn lác đác, nên giai đoạn này là để thử nghiệm và học, không phải để cược production. Nhưng hướng đi thì rõ: khi agent thành một phần lớn hơn trong cách người dùng chạm vào web, những trang chịu khó khai báo năng lực có cấu trúc sẽ dễ được dùng đúng hơn những trang bắt agent đi mò.

---

*Nguồn tham khảo: [WebMCP: Optimize Your Website for AI Agents — Jakub Andrzejewski, DebugBear](https://www.debugbear.com/blog/webmcp). Bài viết được viết lại bằng tiếng Việt theo mạch riêng, bổ sung góc nhìn về bảo mật và bối cảnh regulated; các ví dụ code được dẫn từ bài gốc và viết lại phần mô tả sang tiếng Việt.*
