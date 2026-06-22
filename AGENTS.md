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
pubDate: 2026-06-22                  # date, bắt buộc (YYYY-MM-DD)
updatedDate: 2026-06-25              # date, tùy chọn
category: Platform                   # BẮT BUỘC, phải là 1 trong các giá trị hợp lệ bên dưới
tags: ["tag-1", "tag-2"]             # mảng string, tùy chọn (mặc định [])
draft: false                         # boolean, tùy chọn (mặc định false). draft:true sẽ bị ẩn
---
```

### Category hợp lệ (chỉ được dùng đúng các giá trị này)
`Kubernetes` · `CI/CD` · `Databases` · `Networking` · `Career` · `Security` · `Observability` · `Platform`

- Đặt file vào thư mục category tương ứng. Quy ước slug thư mục: lowercase, thay `/` và khoảng trắng bằng `-` (vd `CI/CD` → thư mục `ci-cd`).
- Nếu thư mục category chưa tồn tại, cứ tạo mới — route đã hỗ trợ sẵn mọi category.
- **Chọn category theo luận điểm cốt lõi của bài**, không chỉ theo từ khóa kỹ thuật. Ví dụ bài "phỏng vấn dạy gì về Kubernetes" → `Career` (góc nhìn sự nghiệp), không phải `Kubernetes`.

### Tags
- Viết kebab-case, lowercase (vd `platform-engineering`, `service-mesh`).
- Tag tự động trở thành link tới `/tag/<slug>/` và xuất hiện ở `/tags/`. Không cần khai báo tag ở đâu khác.
- Tái sử dụng tag đã có khi phù hợp, để gom bài xuyên category.

---

## 4. Giọng văn & phong cách (rule xuyên suốt)

Đây là phần QUAN TRỌNG NHẤT để giữ blog nhất quán.

1. **Ngôn ngữ: tiếng Việt + giữ nguyên thuật ngữ kỹ thuật tiếng Anh.** Không dịch cứng các thuật ngữ phổ biến (deploy, pipeline, sidecar, uptime, change failure rate, observability...). Viết tự nhiên như một kỹ sư Việt nói chuyện.
2. **Giọng văn:** trực tiếp, gọn, thực tế. Tránh sáo rỗng, tránh marketing. Ưu tiên "show, don't tell".
3. **Mở đầu bằng một callout `>`** tóm tắt ý chính hoặc bối cảnh (xem các bài hiện có). Sau đó vào thẳng vấn đề.
4. **Cấu trúc bằng heading `##` / `###`**, chia mục rõ ràng. Dùng `---` để ngăn các phần lớn.
5. **Mỗi phần nên có ví dụ/tình huống minh họa cụ thể.** Quy ước đang dùng: một block `> **Tình huống minh họa.** ...` với kịch bản thực tế (lệnh, con số, before/after). Đây là chữ ký nội dung của blog — hãy duy trì.
6. **Code block** có chỉ định ngôn ngữ (```bash, ```yaml, ```ts...). Lệnh và config phải chạy được/đúng thực tế.
7. **Bảng** cho so sánh, **danh sách** cho liệt kê.
8. **Độ chính xác kỹ thuật là trên hết.** Nếu là số liệu ước lượng, nói rõ là ước lượng và nêu giả định (xem ghi chú trong bài Istio).

---

## 5. Khi viết lại bài từ nguồn bên ngoài

Các bài gần đây được viết lại/mở rộng từ bài gốc. Quy tắc:

- **Viết lại hoàn toàn bằng tiếng Việt, không sao chép nguyên văn.** Diễn giải, mở rộng, thêm tình huống minh họa của riêng mình.
- **LUÔN ghi nguồn ở cuối bài** dạng: `*Nguồn tham khảo: [Tiêu đề — tác giả/site](url). Bài viết được viết lại bằng tiếng Việt và bổ sung tình huống minh họa.*`
- **Tôn trọng bản quyền hình ảnh.** Không tải ảnh có bản quyền của người khác về rồi đăng như ảnh của blog. Lựa chọn theo thứ tự ưu tiên:
  1. **Tự vẽ SVG riêng** đặt trong `public/images/<topic>/` (cách tốt nhất — blog sở hữu hoàn toàn; xem `public/images/istio/`).
  2. Nhúng trực tiếp từ URL nguồn kèm ghi rõ bản quyền (chỉ khi user đồng ý; rủi ro hotlink gãy).
- Nhúng ảnh trong bài: `![alt text](/images/<topic>/<file>.svg)` (đường dẫn tuyệt đối từ `public/`).

---

## 6. Checklist khi tạo một bài mới

1. Chọn `category` hợp lệ + đặt file vào đúng thư mục `src/content/blog/<category-slug>/`.
2. Tên file kebab-case, mô tả nội dung (sẽ thành URL).
3. Viết frontmatter đầy đủ, đúng schema.
4. Mở đầu bằng callout `>`, chia mục rõ, mỗi phần có tình huống minh họa.
5. Nếu viết lại từ nguồn → ghi nguồn ở cuối; cần ảnh → ưu tiên tự vẽ SVG.
6. Chạy `npm run build`, đảm bảo pass (exit code 0).
7. Không tự ý đổi tên blog, đổi schema, hay thêm dependency trừ khi được yêu cầu.

---

## 7. Quy ước commit (BẮT BUỘC theo đúng pattern)

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
| `post` | Thêm **bài viết mới** | `post(platform): them bai 15 best practice platform engineering` |
| `content` | Sửa/cập nhật bài đã có | `content(kubernetes): cap nhat so lieu benchmark istio` |
| `feat` | Thêm tính năng cho site | `feat(tags): them trang loc bai theo tag` |
| `fix` | Sửa bug | `fix(nav): can chinh lai link tags bi lech` |
| `style` | Đổi CSS/giao diện, không đổi logic | `style(nav): doi mau hover cho tag badge` |
| `docs` | Sửa tài liệu (README, AGENTS.md) | `docs: bo sung quy uoc commit` |
| `chore` | Cấu hình, dependency, CI | `chore: nang astro len 4.16` |

### Quy tắc commit cho AI Agent

- **Chỉ commit khi user yêu cầu rõ ràng.** Không tự ý commit sau khi sửa.
- **Một commit = một thay đổi logic.** Thêm bài mới và sửa tính năng site phải là 2 commit riêng.
- **Stage có chọn lọc** (`git add <file cụ thể>`), tránh `git add .` để không lẫn thay đổi rác.
- **LUÔN chạy `npm run build` pass trước khi commit.**
- Không commit `dist/`, `node_modules/`, `.astro/` (đã có trong `.gitignore`).
- Không `git push` thẳng lên `main` trừ khi user yêu cầu — push lên `main` sẽ trigger deploy production.
- Tiêu đề commit viết tiếng Việt không dấu hoặc tiếng Anh đều được, miễn nhất quán và ngắn gọn.

---

## 8. Lưu ý kỹ thuật

- **Tên blog "ltthang88" chỉ xuất hiện ở logo nav.** Không lặp lại tên ở H1 hero trang chủ (hero hiện là "Ghi chú kỹ thuật").
- **Nav** tự sinh link category từ `categories.ts` + đếm số bài. Link "Tags" nằm cuối hàng nav.
- Đừng sửa `dist/`, `node_modules/`, `.astro/` (đều là output/sinh tự động).
- Pagefind chưa hỗ trợ stemming tiếng Việt — đây là cảnh báo bình thường khi build, không phải lỗi.
