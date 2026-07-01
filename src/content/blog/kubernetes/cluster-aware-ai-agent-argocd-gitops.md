---
title: "AI agent chạy bên trong cluster: read-only, local LLM, và GitOps lo phần còn lại"
description: "Phần lớn tooling 'AI cho Kubernetes' hiện nay là SaaS hosted: nó hút dữ liệu cluster của bạn rồi trả lời từ một model ở nơi khác. Bài này đi qua thiết kế ngược lại — một agent chạy ngay trong cluster, đọc state sống qua Kubernetes API, suy luận bằng một local LLM, và quan trọng nhất: read-only by design. Kèm góc nhìn cho môi trường regulated."
pubDate: 2026-06-27T20:00:00+07:00
category: Kubernetes
tags: ["kubernetes", "ai-agents", "gitops", "argo-cd", "rbac", "rag"]
---

> Phần lớn thứ gọi là "AI cho Kubernetes" hôm nay là một SaaS hosted: nó hút pod, event, log của bạn ra ngoài rồi trả về lời khuyên từ một model nằm ở chỗ khác. Model sống ngoài mạng của bạn, dữ liệu rời cluster. Bài này đi qua thiết kế ngược lại — một agent chạy *bên trong* cluster, đọc state sống qua Kubernetes API, suy luận bằng một local LLM, và egress mạng duy nhất là một lần kéo model lúc khởi động. Thứ làm mình dừng lại lâu nhất không phải phần AI, mà là một quyết định RBAC: read-only by design.

Mình viết lại và mở rộng bài này từ một walkthrough rất hay của Maryam Tavakkoli trên CNCF blog, vì nó chạm đúng vào hai thứ mình quan tâm: agent thực sự hiểu hệ thống của bạn, và làm sao cho nó an toàn để chạy ở nơi không được phép gửi dữ liệu ra ngoài. Phần code đầy đủ của tác giả nằm ở [repo trên GitHub](https://github.com/MaryamTavakkoli/local-k8s-ai-agent); dưới đây là mạch và góc nhìn của mình.

---

## LLM và agent: khác biệt thật sự nằm ở đâu

Một Large Language Model trả lời thuần từ dữ liệu nó được train. Nó không hề biết gì về môi trường mà nó đang được deploy vào. Một agent, theo nghĩa dùng ở đây, làm thêm đúng một bước trước khi suy luận: nó *quan sát thế giới thật* rồi nhét quan sát đó vào prompt.

<img src="https://www.cncf.io/wp-content/uploads/2026/06/image-5-1-1800x1124.jpg" alt="So sánh LLM đơn thuần và AI agent: agent quan sát state thật trước khi suy luận" loading="lazy" />

Khác biệt lộ rõ ngay trong output. Hỏi một LLM thường về `CrashLoopBackOff`, bạn nhận một câu trả lời đúng nhưng chung chung — đại loại "thường là container fail health check hoặc thoát bất thường". Hỏi agent, bạn nhận một câu trả lời *neo vào cluster của bạn*: pod `api-7b8d` đã restart 14 lần trong một giờ qua vì `ImagePullBackOff` với `registry.local`, và đây là lệnh `kubectl describe` để xác nhận. Câu đầu đúng nhưng chẳng giúp bạn làm gì với cluster này; câu sau thì làm theo được ngay.

Trong project demo, hai chế độ này được phơi ra qua hai REST endpoint: `POST /ask` là LLM đơn thuần — hợp cho câu hỏi chung kiểu "StatefulSet là gì"; còn `POST /diagnose` mới là agent — đọc state sống rồi suy luận trên đó. Cùng một model, khác nhau ở chỗ nó có nhìn vào thực tế trước khi mở miệng hay không.

---

## Kiến trúc: một nửa runtime, một nửa delivery

Hệ thống chia làm hai phần tách rời, và sự tách rời đó là điểm thiết kế đáng học nhất.

<img src="https://www.cncf.io/wp-content/uploads/2026/06/image-4-1800x1266.png" alt="Kiến trúc Local AI Agent trên Kubernetes: phần runtime và phần CI/CD delivery" loading="lazy" />

Phía runtime, mọi thứ chỉ là workload Kubernetes bình thường, không runtime đặc biệt, không operator, không scheduler tùy biến:

- Một pod **Ollama** serve model Mistral 7B local ở port 11434.
- Một pod **FastAPI** phơi HTTP API của agent và chat UI ở port 8000.
- Một `PersistentVolumeClaim` giữ weight của model để khỏi phải kéo lại mỗi lần.
- Một `ServiceAccount` riêng gắn vào pod FastAPI, mang một `ClusterRole` chỉ cho phép đọc pod, event, log, service, deployment.

Phía delivery là một chuỗi GitOps gọn gàng: một push vào source code kích hoạt GitHub Actions build một image đa kiến trúc (`linux/amd64` + `linux/arm64`) gắn tag bằng 7 ký tự đầu của commit SHA. Argo CD Image Updater (từ [argoproj-labs](https://github.com/argoproj-labs/argocd-image-updater)) poll Docker Hub mỗi 2 phút, phát hiện tag mới khớp regex, rồi commit tag đó ngược lại vào `kustomization.yaml` của repo. Argo CD thấy manifest đổi và reconcile cluster.

Điểm tinh tế là hai nửa này *không biết về nhau*. Argo CD không biết gì về registry. GitHub Actions không biết gì về cluster. Image Updater là cái operator nhỏ bắc cầu giữa chúng, và nó làm việc đó bằng cách ghi vào Git — giữ cho Git luôn là một nguồn chân lý duy nhất. Bài học này vượt ra ngoài chuyện AI: bất kỳ chuỗi CI/CD nào cũng nên có một điểm hợp nhất rõ ràng thay vì để các thành phần gọi thẳng nhau và đẻ ra trạng thái mồ côi.

---

## Vài khái niệm AI bạn thực sự chạm vào

Project này hay ở chỗ nó buộc bạn động tay vào đúng nhúm khái niệm mà một AI engineer dùng hằng ngày, không hơn:

- **LLM** — một model thống kê train trên lượng text khổng lồ. Nó không "biết" sự thật; nó đoán từ tiếp theo có xác suất cao nhất dựa trên tất cả những gì đứng trước. Mistral 7B nghĩa là model 7 tỉ tham số — những con số nó học được trong lúc train.
- **Local LLM** — thay vì gửi text tới một cloud provider, model chạy ngay trong mạng của bạn. Đánh đổi là năng lực: một model 7B local không bằng một model nền khổng lồ chạy trên hạ tầng cloud. Nhưng để thử nghiệm thì quá đủ, và không gì rời mạng của bạn.
- **Ollama** — không phải model, mà là cái server chạy model. Hình dung như một web server cho LLM: nó tải file model, nạp vào memory, phơi một REST API ở port 11434. Không có nó, bạn phải vật lộn với PyTorch, CUDA, tokenizer; có nó, chạy một LLM gọn còn `ollama pull mistral` rồi POST một request.
- **System prompt** — đoạn chỉ dẫn bạn đưa cho model *trước* câu hỏi của người dùng, định hình mọi câu trả lời. Cùng một Mistral, không retrain gì, chỉ cần một system prompt "bạn là trợ lý DevOps chuyên Kubernetes, luôn trả về lệnh kubectl cụ thể và giải thích vì sao" là nó hóa thành một chuyên gia K8s trả lời có cấu trúc. Đây chính là prompt engineering, và gần như mọi sản phẩm AI bạn dùng đều được dựng theo cách đó.
- **RAG** — tên hoa mỹ cho đúng cái `/diagnose` làm: trước khi hỏi model, đi lấy dữ liệu thật rồi bồi nó vào prompt. Một code assistant đọc workspace của bạn; agent này đọc state sống của cluster. Cùng pattern, khác nguồn dữ liệu.

Nếu muốn đào sâu hơn nhóm khái niệm này, mình đã viết riêng một bài về [các khái niệm cốt lõi của agentic engineering](/blog/ai-engineering/agentic-engineering-core-concepts/).

---

## Chế độ Diagnose: chỗ agent thực sự "thành agent"

Đây là nơi cái tên "agent" xứng với nó. Bạn gõ một câu hỏi kèm một namespace, và FastAPI làm một việc mới: gọi Kubernetes API và đọc tất cả pod trong namespace đó (phase, số lần restart, lý do waiting), 10 event gần nhất, và 20 dòng log cuối của bất kỳ pod nào không ở trạng thái Running. Toàn bộ context đó được tiêm vào prompt. Rồi Mistral mới suy luận — nhưng giờ nó suy luận về cluster thật của bạn, không phải kiến thức Kubernetes chung chung.

<img src="https://www.cncf.io/wp-content/uploads/2026/06/image-5.jpg" alt="Chat UI của Local K8s AI Agent ở chế độ diagnose, hiển thị context đã đọc từ cluster" loading="lazy" />

Chi tiết mình thích ở UI: nó cho xem đúng cái context mà agent đã đọc, trong một panel xổ xuống dưới mỗi câu trả lời. Nghe nhỏ nhưng quan trọng — bạn luôn kiểm chứng được agent đang dựa trên cái gì để nói, thay vì tin một câu trả lời từ hộp đen. Với một model 7B vốn vẫn hallucinate được kể cả khi đã có context, khả năng "soi lại nó đọc gì" là phần giúp bạn không bị dẫn đi lạc.

---

## Read-only by design: quyết định quan trọng nhất

Agent chạy với một `ServiceAccount` gắn vào một `ClusterRole` chỉ phơi verb đọc:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: ai-devops-api-reader
rules:
  - apiGroups: [""]
    resources: ["pods", "pods/log", "events", "services", "configmaps", "namespaces"]
    verbs: ["get", "list"]
  - apiGroups: ["apps"]
    resources: ["deployments", "replicasets", "statefulsets", "daemonsets"]
    verbs: ["get", "list"]
```

Đây là quyết định thiết kế đáng giá nhất của cả project, và nó tổng quát ra xa khỏi workload AI. Một agent có thể xóa pod dựa trên suy luận của chính nó là một sự cố production đang chờ xảy ra. **Hallucination nhân với quyền ghi là một tổ hợp tồi.**

Read-only RBAC đảo ngược mô hình tin cậy. Agent *được phép sai*, vì sai không gây hậu quả gì. API server của Kubernetes mới là cái cưỡng chế ranh giới; output của LLM không thể vượt qua nó. Nhờ vậy việc nghịch prompt và đổi model trở nên rẻ — hành vi tệ nhất đã bị chặn trên. Pattern này scale tự nhiên: khởi đầu mọi agent ở read-only, rồi *kiếm* thêm từng năng lực một, mỗi verb một rule RBAC riêng kèm một lần review riêng.

Mình muốn thêm một sắc thái mà bản gốc nói nhẹ: read-only *không* đồng nghĩa với không có rủi ro dữ liệu. Nhìn lại cái `ClusterRole` trên — nó cho `pods/log`. Log là nơi secret hay rò rỉ nhất: connection string in nhầm, token lọt vào stack trace, payload nhạy cảm bị log lúc debug. Một agent đọc được log của mọi pod đang lỗi cũng là một bề mặt đọc secret. Read-only chặn được việc *phá* cluster, nhưng không tự động chặn việc *lộ* dữ liệu. Ở môi trường thật, mình vẫn sẽ giới hạn agent xuống đúng những namespace cần thiết, và soi kỹ ai gọi được endpoint `/diagnose`.

---

## Chuỗi CI/CD, nhìn kỹ hơn

Nửa delivery dùng ba thành phần độc lập, mỗi cái một trách nhiệm. GitHub Actions build và push image, dùng `docker buildx` với QEMU để ra một manifest list phủ cả `linux/amd64` lẫn `linux/arm64` — tag là 7 ký tự commit SHA, một tham chiếu bất biến. Argo CD Image Updater poll registry mỗi 2 phút; cấu hình nằm trong một Custom Resource khai báo Application đích, image cần theo dõi, regex `allowTags`, và chiến lược update:

```yaml
apiVersion: argocd-image-updater.argoproj.io/v1alpha1
kind: ImageUpdater
metadata:
  name: local-k8s-ai-agent
  namespace: argocd
spec:
  writeBackConfig:
    method: git
    gitConfig:
      branch: main
      writeBackTarget: "kustomization:."
  applicationRefs:
    - namePattern: "local-k8s-ai-agent"
      images:
        - alias: api
          imageName: marytvk/local-k8s-ai-agent
          commonUpdateSettings:
            updateStrategy: newest-build
            allowTags: "regexp:^[0-9a-f]{7}$"
```

Khi thấy tag mới khớp, operator ghi lại field `newTag` trong `kustomization.yaml` và commit lên `main`. Argo CD theo dõi repo, render Kustomize, và reconcile cluster với tag image mới. Mọi thay đổi đều đi qua Git, nên `git log` chính là audit trail cho hành vi của agent — prompt, lựa chọn model, RBAC, tất cả đều version được.

---

## Vì sao pattern này đáng giá ở môi trường regulated

Đây là phần mình thấy đắt nhất, và cũng là lý do mình viết lại bài này. Thuộc tính "không gì rời cluster" nghe như một chi tiết kỹ thuật, nhưng với một số bối cảnh nó là điều kiện sống còn.

Làm trong ngành tài chính, mình không thể đẩy state cluster — tên service, log, cấu trúc network, dấu vết sự cố — lên một SaaS AI bên ngoài. Đó vừa là vấn đề data residency, vừa là vấn đề bề mặt rò rỉ: log production của một hệ thanh toán là thứ cuối cùng bạn muốn gửi qua một API của bên thứ ba. Phần lớn tooling "AI cho Kubernetes" thương mại loại mình khỏi cuộc chơi ngay từ giả định kiến trúc của nó. Một agent local, read-only, chạy như workload bình thường thì lại nằm gọn trong vành đai compliance — và đó là khác biệt giữa "có thể dùng" và "không bao giờ qua được khâu duyệt".

> **Tình huống minh họa.** Một local 7B model sẽ không thông minh bằng model nền khổng lồ trên cloud, và với chẩn đoán phức tạp nó hụt hơi thấy rõ. Nhưng đặt lên bàn cân thực tế: một agent kém sắc sảo hơn một chút mà chạy *bên trong* vành đai bảo mật vẫn hữu dụng hơn nhiều một model thiên tài mà phòng compliance cấm cửa. Ở môi trường regulated, câu hỏi không phải "model nào giỏi nhất" mà "model nào mình được phép chạy" — và đó thường là một local model.

Cũng cần thành thật về giới hạn. Đây là điểm khởi đầu để học cái vòng lặp agent, không phải một hệ production. Bản demo chưa có NetworkPolicy khóa egress, chưa bàn ai được gọi `/diagnose`, chưa xử lý chuyện log chứa secret. Giá trị của nó là làm cho toàn bộ vòng tròn — quan sát, suy luận, delivery qua GitOps — hiện ra rõ ràng để bạn hiểu nó vận hành thế nào, rồi tự cứng hóa từng lớp khi mang vào thật.

---

## Chốt lại

Bỏ qua lớp vỏ "AI", thứ đáng mang đi từ bài này là vài nguyên tắc cloud-native quen thuộc được áp đúng chỗ. Agent chỉ là một Deployment, Service và PVC — không phép thuật. RBAC read-only biến một thành phần có thể hallucinate thành một thành phần an toàn để sai. GitOps giữ hành vi của nó auditable qua `git log`. Và việc chạy mọi thứ local mở ra đúng những bối cảnh mà SaaS không với tới được.

Local không phải lúc nào cũng là câu trả lời đúng. Nhưng dựng một lần cái vòng tròn đầy đủ này, bạn sẽ ở vị thế tốt hơn nhiều để quyết định khi nào nên local, khi nào nên cloud — và quan trọng hơn, làm sao cho một agent đủ an toàn để được phép chạm vào cluster thật.

---

*Nguồn tham khảo: [Building a Cluster-Aware AI Agent with Kubernetes, Argo CD, and GitOps — Maryam Tavakkoli, CNCF Blog](https://www.cncf.io/blog/2026/06/25/building-a-cluster-aware-ai-agent-with-kubernetes-argo-cd-and-gitops/). Bài viết được viết lại bằng tiếng Việt theo mạch riêng, bổ sung góc nhìn vận hành cho môi trường regulated và lưu ý về rủi ro log/secret. Code đầy đủ thuộc về tác giả tại [repo gốc](https://github.com/MaryamTavakkoli/local-k8s-ai-agent); các sơ đồ minh họa được dẫn trực tiếp từ bài gốc và thuộc bản quyền của CNCF/tác giả.*
