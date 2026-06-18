---
title: "Kubernetes Resource Limits Explained: requests vs limits"
description: "Hiểu rõ sự khác biệt giữa resource requests và limits trong Kubernetes, tại sao misconfiguration gây OOMKill và cách tránh throttling không cần thiết."
pubDate: 2026-06-01
category: Kubernetes
tags: ["resources", "OOMKill", "QoS", "scheduling"]
---

## TL;DR

- **Request**: lượng tài nguyên mà scheduler dùng để *chọn node*
- **Limit**: ngưỡng tối đa pod được phép dùng — vượt CPU → throttle, vượt RAM → OOMKill

---

## Tại sao cần quan tâm?

Misconfigure resource là nguyên nhân phổ biến nhất gây **production incident** trong Kubernetes:

1. Pod không có request → scheduler đặt sai node → resource noisy neighbor
2. Memory limit quá thấp → OOMKill liên tục → restart loop
3. CPU limit quá thấp → CFS throttling → latency tăng đột biến (dù CPU node vẫn còn nhiều)

---

## Cơ chế hoạt động

### CPU: từ request đến CFS shares

Kubernetes map CPU request thành **CFS (Completely Fair Scheduler) shares**. Nếu node có nhiều contention, pod với request cao hơn được cấp nhiều CPU time hơn.

CPU **limit** hoạt động qua CFS quota. Nếu bạn set `limits.cpu: 500m`, kernel cấp 50ms trong mỗi 100ms window. Pod dùng hết quota → bị throttle (sleep) dù CPU node vẫn idle.

```yaml
resources:
  requests:
    cpu: "250m"
  limits:
    cpu: "500m"   # cẩn thận: throttle xảy ra ở đây
```

### Memory: RSS và OOMKill

Memory limit tương ứng trực tiếp với cgroup `memory.limit_in_bytes`. Vượt ngưỡng → kernel OOM killer chọn process để kill, thường là process của container.

```yaml
resources:
  requests:
    memory: "256Mi"
  limits:
    memory: "512Mi"
```

---

## QoS Classes

| QoS Class | Điều kiện | Ưu tiên khi evict |
|-----------|-----------|-------------------|
| Guaranteed | request == limit (cả CPU và RAM) | Thấp nhất |
| Burstable | request < limit | Trung bình |
| BestEffort | Không có request/limit | Cao nhất (bị kill trước) |

Production workload quan trọng nên là **Guaranteed** để tránh bị evict khi node pressure.

---

## Công thức thực tế

```bash
# Xem current usage để base requests
kubectl top pods -n production --sort-by=memory

# Xem throttle history
kubectl describe pod <pod> | grep -A5 "Limits\|Requests"
```

Rule of thumb:
- `requests.cpu` = P50 CPU usage của app
- `limits.cpu` = 2-4x requests (hoặc bỏ limit nếu app không có CPU spike)
- `requests.memory` = P99 memory usage + 20% buffer
- `limits.memory` = requests.memory (để đạt Guaranteed QoS)

---

## Kết luận

Đừng copy-paste resource config từ StackOverflow. Profile app thực tế bằng `kubectl top` hoặc Prometheus rồi mới set. Và **cực kỳ cẩn thận** với CPU limits — nhiều trường hợp bỏ CPU limit hoàn toàn lại tốt hơn.
