---
title: "Tăng tốc GitHub Actions với Docker layer cache"
description: "Cache Docker build layers giữa các CI run để giảm build time từ 8 phút xuống còn 90 giây — không cần self-hosted runner."
pubDate: 2026-05-20
category: CI/CD
tags: ["github-actions", "docker", "cache", "buildx"]
---

## Vấn đề

GitHub Actions runner là ephemeral — mỗi run là một VM mới. Không có Docker layer cache → mỗi `docker build` phải pull và rebuild từ đầu. Với image Node.js có `node_modules`, build time dễ lên 8-10 phút.

---

## Giải pháp: GitHub Cache + `cache-from`

Docker BuildKit hỗ trợ `--cache-from` và `--cache-to` với nhiều backend. Trên GitHub Actions, dùng **`type=gha`** (GitHub Actions Cache) là đơn giản nhất.

```yaml
# .github/workflows/build.yml
name: Build & Push

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

`mode=max` cache tất cả layers (kể cả intermediate), `mode=min` chỉ cache final image layers.

---

## Tối ưu Dockerfile để cache hiệu quả

Layer cache chỉ có tác dụng nếu Dockerfile được viết đúng thứ tự (ít thay đổi → nhiều thay đổi):

```dockerfile
# Tốt: dependencies trước, source code sau
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./          # layer này chỉ invalid khi package.json đổi
RUN npm ci --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .                       # layer này invalid mỗi commit → không sao
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

---

## Kết quả thực tế

| Run | Cache hit | Time |
|-----|-----------|------|
| First run | 0% | 8m 12s |
| Second run (no code change) | ~90% | 1m 34s |
| Run (only src change) | ~70% | 2m 05s |

---

## Lưu ý

- GitHub Actions Cache có giới hạn **10GB** per repo. Khi full, GitHub tự xóa cache cũ nhất.
- `type=gha` không share giữa các branch — mỗi branch có cache riêng, fallback về `main`.
- Nếu cần share cache cross-repo hoặc cache lớn hơn, chuyển sang `type=registry` (push cache lên GHCR).
