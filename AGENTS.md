# AGENTS.md — Hướng dẫn cho AI Agent

Tài liệu này giúp bất kỳ AI agent nào hiểu project và viết bài đúng chuẩn của blog. Đọc kỹ trước khi tạo/sửa nội dung.

---

## 1. Project là gì

Blog kỹ thuật cá nhân **ltthang88**, build bằng **Astro** (static site), deploy lên **GitHub Pages** tại `https://ltthang88.github.io`.

- Nội dung viết bằng **Markdown** trong `src/content/blog/`.
- Tìm kiếm tĩnh client-side bằng **Pagefind** (chạy ở `postbuild`).
- Code highlight bằng **Shiki** (theme `github-light` / `github-dark`).
- Tự động build + deploy qua **GitHub Actions** mỗi khi push lên nhánh `main`.

### Lệnh thường dùng
```bash
npm run dev      # dev server (long-running — KHÔNG chạy trong agent, để user tự chạy)
npm run build    # build tĩnh + Pagefind index. LUÔN chạy lệnh này để verify sau khi sửa.
```

> **Quy tắc verify:** sau mỗi lần thêm/sửa bài hoặc đụng vào code, LUÔN chạy `npm run build` và đảm bảo exit code 0 trước khi báo hoàn thành.

---

## 2. Cấu trúc thư mục

```
src/
├── content/
│   ├── config.ts            # schema frontmatter (zod) — nguồn chân lý cho metadata bài viết
│   └── blog/<category>/*.md # bài viết, chia theo thư mục category
├── lib/
│   ├── categories.ts        # danh sách category + màu + hàm slug
│   └── tags.ts              # hàm tagToSlug()
├── components/              # Nav, PostCard, Pagination, TagBadge
├── layouts/                 # Base, BlogPost
├── pages/
│   ├── index.astro          # trang chủ (hero + danh sách bài + phân trang)
│   ├── search.astro         # trang tìm kiếm (Pagefind)
│   ├── tags.astro           # tag cloud — liệt kê mọi tag + số bài
│   ├── category/[category]/[...page].astro  # lọc bài theo category (phân trang)
│   └── tag/[tag]/[...page].astro            # lọc bài theo tag (phân trang)
└── styles/global.css
public/images/<topic>/       # ảnh/SVG tự tạo cho bài viết
```

URL bài viết được suy ra từ đường dẫn file: `src/content/blog/platform/foo.md` → `/blog/platform/foo/`.

---

## 3. Frontmatter (BẮT BUỘC đúng schema)

Schema định nghĩa trong `src/content/config.ts`. Build sẽ FAIL nếu sai.

```yaml
---
title: "Tiêu đề bài viết"            # string, bắt buộc
description: "Mô tả ngắn 1-2 câu"    # string, bắt buộc — dùng cho SEO + PostCard
pubDate: 2026-06-22                  # date, bắt buộc (YYYY-MM-DD; có thể kèm giờ — xem ghi chú)
updatedDate: 2026-06-25              # date, tùy chọn
category: Platform                   # BẮT BUỘC, phải là 1 trong các giá trị hợp lệ bên dưới
tags: ["tag-1", "tag-2"]             # mảng string, tùy chọn (mặc định [])
draft: false                         # boolean, tùy chọn (mặc định false). draft:true sẽ bị ẩn
---
```

### Category hợp lệ (chỉ được dùng đúng các giá trị này)
`Kubernetes` · `CI/CD` · `Networking` · `Career` · `Security` · `Observability` · `Platform` · `AI Engineering`

- Đặt file vào thư mục category tương ứng. Quy ước slug thư mục: lowercase, thay `/` và khoảng trắng bằng `-` (vd `CI/CD` → thư mục `ci-cd`).
- Nếu thư mục category chưa tồn tại, cứ tạo mới — route đã hỗ trợ sẵn mọi category.
- **Chọn category theo luận điểm cốt lõi của bài**, không chỉ theo từ khóa kỹ thuật. Ví dụ bài "phỏng vấn dạy gì về Kubernetes" → `Career` (góc nhìn sự nghiệp), không phải `Kubernetes`.

### pubDate và thứ tự bài viết

- Trang chủ và các trang category/tag sắp xếp bài theo `pubDate` **giảm dần** (mới nhất trước).
- `pubDate` dùng `z.coerce.date()` nên nhận cả **ISO datetime kèm giờ + timezone**.
- **Khi đăng nhiều bài trong CÙNG một ngày, BẮT BUỘC ghi kèm giờ** để thứ tự rõ ràng, nếu không các bài cùng ngày sẽ "bằng nhau" và xếp tùy ý. Dùng giờ VN:
  ```yaml
  pubDate: 2026-06-22T14:30:00+07:00
  ```
- Bài đăng sau → giờ muộn hơn → hiển thị trước.

### Tags
- Viết kebab-case, lowercase (vd `platform-engineering`, `service-mesh`).
- Tag tự động trở thành link tới `/tag/<slug>/` và xuất hiện ở `/tags/`. Không cần khai báo tag ở đâu khác.
- Tái sử dụng tag đã có khi phù hợp, để gom bài xuyên category.

---

## 4. Giọng văn & phong cách (rule xuyên suốt — phần QUAN TRỌNG NHẤT)

**Đích đến giọng văn:** viết như một **Senior DevOps / Software Engineer** đang chia sẻ kinh nghiệm thực chiến cho đồng nghiệp — có quan điểm, cụ thể, có cơ sở. Chuẩn tham chiếu là các engineering blog tốt (Railway, GitHub, Stripe): mọi luận điểm hoặc truy được về nguồn, hoặc neo vào trải nghiệm thật; không "chém gió", không marketing. **Mục tiêu KHÔNG phải một bài dịch trơn tru, mà là bài viết của một kỹ sư Việt về chủ đề đó** — kể cả khi xuất phát từ nguồn nước ngoài.

### Nguyên tắc nền

1. **Ngôn ngữ: tiếng Việt + giữ nguyên thuật ngữ kỹ thuật tiếng Anh.** Không dịch cứng các thuật ngữ phổ biến (deploy, pipeline, sidecar, uptime, change failure rate, observability...). Viết tự nhiên như một kỹ sư Việt nói chuyện.
2. **Chính tả tiếng Việt: dùng kiểu đặt dấu thanh TRUYỀN THỐNG (kiểu cũ).** Đặt dấu thanh trên nguyên âm đầu của nguyên âm đôi/ba mở. Viết đúng: **hóa, thỏa, khỏe, hòa, lòa, túy, thúy, quý** — KHÔNG dùng kiểu mới (hoá, thoả, khoẻ, hoà, loà, tuý, thuý, quí). Áp dụng cho toàn bộ nội dung bài viết và metadata (title, description).
3. **Giọng văn:** trực tiếp, gọn, thực tế. Tránh sáo rỗng, tránh marketing. Ưu tiên "show, don't tell".
4. **Mở đầu bằng một callout `>`** tóm tắt ý chính hoặc bối cảnh (xem các bài hiện có). Sau đó vào thẳng vấn đề.
5. **Cấu trúc bằng heading `##` / `###`**, chia mục rõ ràng. Dùng `---` để ngăn các phần lớn. **Heading phải khớp với nội dung mục** — đừng để tiêu đề nói về AWS mà thân bài nói chung chung về Kubernetes.
6. **Code block** có chỉ định ngôn ngữ (```bash, ```yaml, ```ts...). Lệnh và config phải chạy được/đúng thực tế.
7. **Bảng** cho so sánh, **danh sách** cho liệt kê.
8. **Độ chính xác kỹ thuật là trên hết.** Nếu là số liệu ước lượng, nói rõ là ước lượng và nêu giả định (xem ghi chú trong bài Istio).

### Nguyên tắc chống "văn máy móc" (bắt buộc tuân thủ)

Đây là phần khiến bài đọc như **của một người thật**, không phải bản dịch AI. Vi phạm các điểm này là nguyên nhân số một làm bài nghe "máy móc".

9. **Đa dạng nhịp câu.** Thủ pháp "chuỗi câu cụt song song" (anaphora — vd *"X không tạo giá trị. Y không tạo giá trị. Z không tạo giá trị."*) rất mạnh nhưng chỉ khi dùng **một, tối đa hai lần mỗi bài**. Nếu mọi đoạn đều là một dãy câu ngắn song song rồi chốt, bài thành công thức. Xen kẽ câu dài có mệnh đề phụ với câu ngắn; để nhịp lên xuống tự nhiên như người nói.
10. **Bold tiết kiệm.** Tối đa ~3-4 câu in đậm cho cả bài, dành cho luận điểm xương sống. Khi mọi câu chốt đều bold thì không câu nào còn nổi bật — đây là dấu hiệu văn content-marketing dễ nhận ra nhất.
11. **Không gloss song ngữ trong ngoặc.** Tránh kiểu *"đòn bẩy (leverage)"*, *"ràng buộc (constraint)"*, *"chuẩn hóa (normalized)"*. Chọn **một** cách gọi (thuật ngữ Anh giữ nguyên, hoặc từ Việt) rồi đi luôn. Nếu cần giải thích, viết thành câu — đừng dán nhãn song ngữ trong ngoặc; đó là dấu vết dịch term-by-term.
12. **Số liệu phải có cơ sở.** Không bịa độ chính xác giả tạo (vd *"40% thời gian bảo trì"*, *"giảm 3 lần"*) khi không có nguồn hay phép tính. Hoặc neo vào giả định nói rõ (*"giả sử mỗi project 2 tuần × 10 project → ~20 tuần-người"*), hoặc chuyển sang định tính (*"nhiều tháng năng lực kỹ thuật"*). Con số chính xác mà không có cơ sở làm giảm uy tín nhanh nhất.
13. **Có giọng và trải nghiệm cá nhân.** Đây là thứ khác biệt hóa lớn nhất, và là lý do blog này tồn tại. Tác giả vận hành hệ thống thật ở quy mô lớn (multi-cluster Kubernetes, môi trường production trong ngành tài chính có quy định). **Ưu tiên thay tình huống giả định bằng mẩu trải nghiệm thật, đã ẩn danh** — kiểu *"ở một hệ multi-cluster mình từng vận hành, riêng việc thống nhất cách log giữa các namespace đã..."*. Một mẩu thật giá trị hơn mười ví dụ "Công ty có 3 đội..." chung chung.
14. **Tránh tuyệt đối hóa — thừa nhận ngoại lệ.** Luận điểm mạnh nhưng đúng mọi lúc thì hiếm. Một bài đáng tin nêu rõ khi nào luận điểm KHÔNG đúng. Đặc biệt với chủ đề platform/cloud: ngành tài chính có quy định (compliance, data residency) thường **không thể** đẩy hết lên PaaS công cộng, và self-hosting ở đó là chủ đích chứ không phải "dysfunction". Thừa nhận sắc thái này làm bài đúng hơn và tăng uy tín, thay vì lặp lại quan điểm phổ quát của nguồn gốc.
15. **Tránh cliché và calque.** Bỏ các cụm sáo: "đổi cuộc chơi", "game-changer", "bùng nổ", "thần thánh hóa". Bỏ calque dịch sát nghe gượng: "tải nhận thức" (cognitive load → "đỡ phải nhớ nhiều thứ"), "code keo dán" (glue code → "code chắp nối"). Nếu một cụm nghe như slide marketing, viết lại.

### Tình huống minh họa — chữ ký của blog, nhưng dùng có chủ đích

Block `> **Tình huống minh họa.** ...` (kịch bản thật, có lệnh/con số/before-after) **vẫn là chữ ký nội dung** và nên xuất hiện trong hầu hết bài. Nhưng:

- **Đừng nhồi vào MỌI section theo đúng một khuôn.** Khi mỗi mục đều là *luận điểm → 3 câu song song → câu bold → callout minh họa*, cấu trúc trở nên đoán trước được và máy móc. Dùng **2-4 lần mỗi bài**, ở những chỗ ví dụ thật sự làm sáng tỏ luận điểm.
- **Đa dạng hình thức minh họa.** Không phải lúc nào cũng là block callout: có thể là một đoạn văn xuôi kể lại sự cố thật, một code block before/after, một bảng so sánh, hoặc một mẩu lệnh ngắn. Cho 1-2 minh họa đến từ trải nghiệm cá nhân.
- **Ưu tiên cụ thể hơn là khuôn mẫu.** Một minh họa đắt giá ở đúng chỗ tốt hơn năm callout giả định rải đều cho "đủ mỗi mục một cái".

---

## 5. Dấu hiệu văn máy móc — self-check trước khi báo hoàn thành

Trước khi kết thúc, đọc lại bài **như một biên tập viên**. Nếu dính bất kỳ dấu hiệu nào, sửa:

- [ ] **Nhịp đơn điệu:** quá nhiều đoạn là dãy câu cụt song song. → Viết lại vài đoạn thành câu liền mạch.
- [ ] **Bold tràn lan:** đếm số câu in đậm; nếu > 4 → cắt bớt, chỉ giữ luận điểm cốt lõi.
- [ ] **Ngoặc song ngữ:** còn `"... (english term)"` để gloss? → Bỏ.
- [ ] **Số liệu trôi nổi:** có % hoặc "giảm N lần" nào không nguồn, không giả định? → Neo hoặc đổi định tính.
- [ ] **Khuôn lặp:** mọi section cùng một cấu trúc + đều có callout minh họa? → Phá khuôn ở 2-3 mục.
- [ ] **Cliché / calque:** có cụm nào nghe như marketing hoặc dịch sát? → Viết lại.
- [ ] **Thiếu dấu vết người thật:** cả bài không có một trải nghiệm/ý kiến cá nhân nào? → Thêm ít nhất một mẩu thật.
- [ ] **Tuyệt đối hóa:** luận điểm phát biểu như chân lý phổ quát, không nêu ngoại lệ? → Thêm sắc thái (đặc biệt ngành regulated).

---

## 6. Khi viết lại bài từ nguồn bên ngoài

Các bài gần đây được viết lại/mở rộng từ bài gốc. Quy tắc:

- **Viết lại hoàn toàn bằng tiếng Việt, không sao chép nguyên văn.** Diễn giải, mở rộng, thêm tình huống minh họa của riêng mình.
- **Dựng lại outline của riêng mình — đừng bám cấu trúc và nhịp của bản gốc.** Bản gốc tiếng Anh thường có cadence riêng (câu cụt staccato, mỗi đoạn một ý). Nếu dịch theo trình tự đoạn-từng-đoạn, bài sẽ thừa hưởng đúng cái nhịp máy móc đó. Đọc nguồn → hiểu luận điểm → gập sách → viết lại theo mạch của mình, bổ sung góc nhìn và trải nghiệm cá nhân.
- **Thêm giá trị mà nguồn không có:** trải nghiệm vận hành thật, sắc thái cho bối cảnh Việt Nam / ngành tài chính, ví dụ cụ thể hơn. Bài viết lại tốt là bài mà người đọc bản gốc vẫn thu được điều mới.
- **LUÔN ghi nguồn ở cuối bài** dạng: `*Nguồn tham khảo: [Tiêu đề — tác giả/site](url). Bài viết được viết lại bằng tiếng Việt và bổ sung tình huống minh họa.*`
- **Hình ảnh — được phép dùng ảnh từ bài gốc.** Khi viết lại từ một nguồn, bạn có thể tái sử dụng hình minh họa của bài gốc. Chọn theo thứ tự ưu tiên:
  1. **Tự vẽ SVG riêng** đặt trong `public/images/<topic>/` — tốt nhất cho lâu dài (blog sở hữu hoàn toàn, không gãy, khớp theme; xem `public/images/istio/`, `public/images/paas/`).
  2. **Nhúng trực tiếp ảnh từ bài gốc (hotlink)** bằng URL gốc của nguồn. Đây là cách nhanh và được chấp nhận; LUÔN kèm ghi rõ bản quyền ở cuối bài (vd *"Các sơ đồ được dẫn trực tiếp từ bài gốc và thuộc bản quyền của <nguồn>."*). Lưu ý rủi ro: nguồn có thể đổi/xóa URL hoặc chặn hotlink → ảnh hỏng.
  3. **Tải ảnh về** `public/images/<topic>/` chỉ khi nguồn cho phép tái sử dụng (giấy phép mở/được cấp phép) — đừng tự ý rehost ảnh có bản quyền chặt.
- **Cách nhúng:**
  - Ảnh nội bộ (SVG/ảnh tự tạo): `![alt text](/images/<topic>/<file>.svg)` (đường dẫn tuyệt đối từ `public/`).
  - Ảnh hotlink từ nguồn: dùng thẻ HTML `<img src="<url>" alt="..." loading="lazy" />` (an toàn với URL chứa ký tự đặc biệt; vẫn dùng được lightbox click-to-zoom). Đặt ảnh ngay dưới đoạn/section liên quan.

---

## 7. Checklist khi tạo một bài mới

1. Chọn `category` hợp lệ + đặt file vào đúng thư mục `src/content/blog/<category-slug>/`.
2. Tên file kebab-case, mô tả nội dung (sẽ thành URL).
3. Viết frontmatter đầy đủ, đúng schema.
4. Mở đầu bằng callout `>`, chia mục rõ, minh họa dùng có chủ đích (xem Section 4).
5. Áp các nguyên tắc chống văn máy móc + chạy qua self-check ở Section 5.
6. Nếu viết lại từ nguồn → dựng outline riêng, thêm trải nghiệm, ghi nguồn ở cuối; cần ảnh → tự vẽ SVG (ưu tiên lâu dài) HOẶC hotlink ảnh bài gốc kèm ghi rõ bản quyền (xem Section 5).
7. Chạy `npm run build`, đảm bảo pass (exit code 0).
8. Không tự ý đổi tên blog, đổi schema, hay thêm dependency trừ khi được yêu cầu.

---

## 8. Quy ước commit (BẮT BUỘC theo đúng pattern)

Mọi commit dùng [Conventional Commits](https://www.conventionalcommits.org/), tinh chỉnh cho blog. Định dạng:

```
<type>(<scope>): <mô tả ngắn, viết thường, không dấu chấm cuối>
```

- **Mô tả ≤ 70 ký tự**, ở thì hiện tại, mệnh lệnh (vd "add", "fix", "update" — không "added"/"adding").
- **`scope`** tùy chọn: với bài viết dùng **category slug** (`platform`, `career`, `ci-cd`...); với code dùng tên vùng (`nav`, `tags`, `search`, `styles`...).
- Phần thân (body) tùy chọn, cách tiêu đề 1 dòng trống, giải thích "tại sao" nếu cần.

### Các `type` hợp lệ

| type | Dùng khi | Ví dụ |
|---|---|---|
| `post` | Thêm **bài viết mới** | `post(platform): add 15 platform engineering best practices` |
| `content` | Sửa/cập nhật bài đã có | `content(kubernetes): update istio benchmark numbers` |
| `feat` | Thêm tính năng cho site | `feat(tags): add tag filter pages and tag cloud` |
| `fix` | Sửa bug | `fix(nav): correct misaligned tags link` |
| `style` | Đổi CSS/giao diện, không đổi logic | `style(nav): adjust tag badge hover color` |
| `docs` | Sửa tài liệu (README, AGENTS.md) | `docs: add commit conventions` |
| `chore` | Cấu hình, dependency, CI | `chore: bump astro to 4.16` |

### Quy tắc commit cho AI Agent

- **Chỉ commit khi user yêu cầu rõ ràng.** Không tự ý commit sau khi sửa.
- **Một commit = một thay đổi logic.** Thêm bài mới và sửa tính năng site phải là 2 commit riêng.
- **Stage có chọn lọc** (`git add <file cụ thể>`), tránh `git add .` để không lẫn thay đổi rác.
- **LUÔN chạy `npm run build` pass trước khi commit.**
- Không commit `dist/`, `node_modules/`, `.astro/` (đã có trong `.gitignore`).
- Không `git push` thẳng lên `main` trừ khi user yêu cầu — push lên `main` sẽ trigger deploy production.
- **Tiêu đề commit viết bằng tiếng Anh** (mệnh lệnh, thì hiện tại, viết thường, ≤70 ký tự).

---

## 9. Lưu ý kỹ thuật

- **Tên blog "ltthang88" chỉ xuất hiện ở logo nav.** Không lặp lại tên ở H1 hero trang chủ (hero hiện là "Ghi chú kỹ thuật").
- **Nav** tự sinh link category từ `categories.ts` + đếm số bài. Link "Tags" nằm cuối hàng nav.
- Đừng sửa `dist/`, `node_modules/`, `.astro/` (đều là output/sinh tự động).
- Pagefind chưa hỗ trợ stemming tiếng Việt — đây là cảnh báo bình thường khi build, không phải lỗi.