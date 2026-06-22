# ltthang88 — Blog kỹ thuật

Blog cá nhân về Kubernetes, CI/CD, Platform Engineering, Security, Observability và hành trình Career trong ngành tech. Build bằng [Astro](https://astro.build/), deploy lên GitHub Pages tại **https://ltthang88.github.io**.

## Tech stack

- **[Astro](https://astro.build/)** — static site generator
- **[Pagefind](https://pagefind.app/)** — tìm kiếm tĩnh client-side (chạy ở bước `postbuild`)
- **[Shiki](https://shiki.style/)** — syntax highlighting (theme `github-light` / `github-dark`)
- **GitHub Actions** — tự động build & deploy khi push lên `main`

## Bắt đầu

```bash
npm install      # cài dependency
npm run dev      # chạy dev server tại http://localhost:4321
npm run build    # build tĩnh vào dist/ + tạo Pagefind index
npm run preview  # xem thử bản build
```

## Viết bài mới

1. Tạo file Markdown trong `src/content/blog/<category>/<ten-bai>.md`.
2. Khai báo frontmatter đúng schema (xem `src/content/config.ts`):

   ```yaml
   ---
   title: "Tiêu đề bài viết"
   description: "Mô tả ngắn 1-2 câu (dùng cho SEO và thẻ bài)"
   pubDate: 2026-06-22
   category: Platform        # 1 trong 8 category hợp lệ
   tags: ["tag-1", "tag-2"]
   ---
   ```

3. Category hợp lệ: `Kubernetes`, `CI/CD`, `Databases`, `Networking`, `Career`, `Security`, `Observability`, `Platform`.
4. Chạy `npm run build` để kiểm tra trước khi commit.

Tên file biến thành URL: `src/content/blog/platform/foo.md` → `/blog/platform/foo/`.

## Cấu trúc

```
src/
├── content/blog/<category>/   # bài viết Markdown
├── content/config.ts          # schema frontmatter
├── lib/                        # categories.ts, tags.ts
├── components/                 # Nav, PostCard, Pagination, TagBadge
├── layouts/                    # Base, BlogPost
├── pages/                      # index, search, tags, category/, tag/
└── styles/global.css
public/images/<topic>/          # ảnh/SVG cho bài viết
```

## Dành cho AI Agent

Quy ước nội dung, phong cách viết, và chuẩn commit nằm trong [`AGENTS.md`](./AGENTS.md). Đọc file đó trước khi tạo/sửa nội dung.

## Deploy

Push lên `main` → GitHub Actions tự build và deploy (xem `.github/workflows/deploy.yml`). Không cần thao tác thủ công.
