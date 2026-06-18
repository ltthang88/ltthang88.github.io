---
title: "PostgreSQL Index Types: chọn đúng index cho đúng query"
description: "B-Tree, Hash, GIN, GiST, BRIN — mỗi loại phù hợp với workload khác nhau. Chọn sai index không chỉ không giúp mà còn làm chậm write."
pubDate: 2026-05-10
category: Databases
tags: ["postgresql", "index", "performance", "query-optimization"]
---

## Tổng quan

PostgreSQL có 6 loại index. Hầu hết developer chỉ biết B-Tree, nhưng với đúng workload, GIN hay BRIN có thể vượt trội hoàn toàn.

---

## B-Tree (mặc định)

Phù hợp với **hầu hết mọi thứ**: equality, range, ORDER BY, LIKE prefix.

```sql
CREATE INDEX idx_users_email ON users(email);
-- Dùng được cho:
-- WHERE email = 'x@y.com'
-- WHERE email LIKE 'admin%'
-- ORDER BY email
```

**Không phù hợp**: full-text search, array contains, LIKE '%suffix'.

---

## Hash

Chỉ dùng cho **equality**. Nhỏ hơn và lookup nhanh hơn B-Tree cho equality, nhưng không hỗ trợ range hay sort.

```sql
CREATE INDEX idx_sessions_token ON sessions USING hash(token);
-- WHERE token = 'abc123'  ✓
-- WHERE token > 'abc'     ✗ (không dùng được)
```

Thực tế ít dùng vì B-Tree đủ nhanh và linh hoạt hơn.

---

## GIN (Generalized Inverted Index)

Tuyệt vời cho **array, jsonb, full-text search** — bất kỳ trường hợp nào một giá trị chứa nhiều "element".

```sql
-- Full-text search
CREATE INDEX idx_posts_fts ON posts USING gin(to_tsvector('english', body));

-- JSONB field containment
CREATE INDEX idx_events_data ON events USING gin(data);
-- WHERE data @> '{"status": "active"}'

-- Array contains
CREATE INDEX idx_articles_tags ON articles USING gin(tags);
-- WHERE tags @> ARRAY['kubernetes']
```

GIN index build chậm và tốn space, nhưng read rất nhanh.

---

## GiST (Generalized Search Tree)

Dùng cho **geometric data, range types, nearest-neighbor**.

```sql
-- PostGIS spatial query
CREATE INDEX idx_locations_geom ON locations USING gist(geom);
-- WHERE ST_DWithin(geom, ST_MakePoint(106.66, 10.77)::geography, 1000)

-- Range overlap
CREATE INDEX idx_bookings_period ON bookings USING gist(period);
-- WHERE period && '[2026-06-01, 2026-06-30)'::daterange
```

---

## BRIN (Block Range Index)

Cực nhỏ (vài KB so với GB của B-Tree) — phù hợp cho **bảng rất lớn với dữ liệu có thứ tự tự nhiên** như timeseries, log table.

```sql
CREATE INDEX idx_logs_created_at ON logs USING brin(created_at);
```

BRIN hoạt động bằng cách lưu min/max của mỗi block range. Hiệu quả chỉ khi data được insert theo thứ tự (append-only). Nếu data random, BRIN gần như vô dụng.

---

## Bảng so sánh nhanh

| Type | Equality | Range | Full-text | Array | Size |
|------|----------|-------|-----------|-------|------|
| B-Tree | ✓✓ | ✓✓ | ✗ | ✗ | Medium |
| Hash | ✓✓✓ | ✗ | ✗ | ✗ | Small |
| GIN | ✓ | ✗ | ✓✓✓ | ✓✓✓ | Large |
| GiST | ✓ | ✓ | ✓ | ✓ | Medium |
| BRIN | ✗ | ✓* | ✗ | ✗ | Tiny |

*BRIN chỉ hiệu quả với naturally-ordered data

---

## Kiểm tra index có được dùng không

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM logs WHERE created_at > NOW() - INTERVAL '1 hour';
```

Tìm `Index Scan` hoặc `Bitmap Index Scan` trong output. Nếu thấy `Seq Scan` dù có index, planner đánh giá seq scan rẻ hơn (thường do table nhỏ hoặc selectivity thấp).
