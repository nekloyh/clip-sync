# ClipSync Product & Development Roadmap

> Trạng thái: bản định hướng để kiểm chứng và lập kế hoạch, không phải cam kết ngày phát hành.
>
> Định vị đề xuất: **Secure Support Handoff** — phòng trao đổi tạm thời giúp đội hỗ trợ thu thập và gửi text, screenshot, log, file cấu hình và dữ liệu nhạy cảm với khách hàng mà không yêu cầu người nhận tạo tài khoản hoặc cài ứng dụng.
>
> Kế hoạch thực thi kiến trúc, dependency giữa các phase, migration strategy và quality gate nằm tại
> [`ARCHITECTURE_ROADMAP.md`](./ARCHITECTURE_ROADMAP.md). Tài liệu này quyết định **vì sao/cái gì**;
> architecture roadmap quyết định **thực hiện theo thứ tự nào và kiểm chứng ra sao**.

## 1. Tóm tắt chiến lược

ClipSync hiện giải quyết tốt một nhu cầu hẹp: chuyển nhanh text và ảnh giữa các thiết bị qua một URL. Trải nghiệm này có ma sát thấp, nhưng nếu chỉ dừng ở “clipboard đa thiết bị” thì khả năng thu phí thấp và dễ bị thay thế bởi tính năng có sẵn của hệ điều hành, ứng dụng nhắn tin hoặc công cụ miễn phí.

Hướng phát triển đề xuất không phải là làm một clipboard lớn hơn. Sản phẩm nên trở thành một bước có giá trị trong quy trình hỗ trợ kỹ thuật:

1. Nhân viên hỗ trợ tạo một phòng từ ticket.
2. Khách hàng mở link hoặc quét QR, không cần tài khoản.
3. Sản phẩm hướng dẫn khách hàng cung cấp đúng screenshot, log và thông tin môi trường.
4. Dữ liệu nhạy cảm được cảnh báo hoặc che trước khi rời thiết bị.
5. Dữ liệu được chuyển an toàn, có thời hạn và có thể thu hồi.
6. Ticket chỉ lưu metadata cần thiết thay vì giữ dữ liệu nhạy cảm vô thời hạn.

Lợi thế cần bảo vệ là: **nhanh như clipboard, có kiểm soát như một sản phẩm bảo mật, và được thiết kế cho workflow hỗ trợ**.

## 2. Phạm vi hiện tại đã xác nhận

Các năng lực đang có trong codebase:

- Tạo phòng không cần tài khoản; room chỉ được tạo bởi `POST /api/rooms` với locator do server sinh.
- Owner capability tách quyền quản trị khỏi recipient; biết URL hoặc PIN không trao quyền owner.
- Đồng bộ text theo cơ chế last-write-wins.
- Broadcast tín hiệu thay đổi và hiển thị số thiết bị đang kết nối.
- Upload, xem, copy, tải và xóa ảnh.
- PIN 4–6 chữ số; cookie mở khóa được ký và để ở chế độ `httpOnly`.
- Database và storage chỉ được truy cập qua server; bucket ảnh là private.
- Mutation quản trị có owner guard tập trung và optimistic `owner_version` để revoke có hiệu lực.
- Phòng không hoạt động được xếp vào deletion lifecycle có retry; reconciliation dò lệch DB/storage.
- Rate limiter hỗ trợ shared Redis/Upstash, có fail-closed policy cho PIN và memory fallback có quan sát.
- Structured log, error-monitoring port và product analytics dùng allowlist không chứa dữ liệu phòng.
- Health/ops endpoints, cleanup metrics và script kiểm chứng schema hosted Supabase.
- UI phân biệt offline, transient failure và permanent failure cho save/upload.

Các năng lực **chưa có** và không được mô tả như tính năng hiện tại:

- Mã hóa đầu cuối; server hiện vẫn có khả năng đọc nội dung.
- Tài khoản tổ chức, workspace, participant identity, RBAC, SSO hoặc audit log đầy đủ.
- Khôi phục/chia sẻ owner giữa nhiều trình duyệt; owner hiện là capability cục bộ của một browser.
- Thu hồi link, giới hạn lượt xem và thời hạn tùy chỉnh.
- Locator ≥128 bit, locator hash-at-rest và realtime authorization độc lập với locator.
- General file upload, resumable upload hoặc malware scanning.
- Tích hợp Zendesk, Freshdesk, Intercom, Jira Service Management hoặc webhook.
- Data-loss prevention, phát hiện secret/PII hoặc redaction.
- Checklist thu thập dữ liệu và mẫu phòng theo loại sự cố.
- AI assistant, AI diagnosis hoặc AI-generated summaries.
- Billing, subscription, usage metering và customer administration.

## 3. Khách hàng mục tiêu và công việc cần hoàn thành

### 3.1 ICP ban đầu

Ưu tiên theo thứ tự:

1. MSP/công ty IT outsourcing có nhiều khách hàng bên ngoài.
2. Đội hỗ trợ SaaS B2B thường xuyên nhận screenshot, log và cấu hình.
3. Đội triển khai POS, ERP, thiết bị hoặc phần mềm tại hiện trường.
4. Đội security/DevOps cần gửi dữ liệu dùng một lần cho đối tác.

Chưa ưu tiên enterprise lớn ở giai đoạn đầu vì chu kỳ bán hàng, yêu cầu compliance và integration sẽ kéo dài trước khi sản phẩm chứng minh được giá trị cốt lõi.

### 3.2 Job-to-be-done

> Khi cần xử lý một sự cố từ xa, nhân viên hỗ trợ muốn khách hàng gửi đúng dữ liệu chẩn đoán trong vài phút mà không phải cài app, tạo tài khoản hay đưa dữ liệu nhạy cảm vào email/ticket, để giảm thời gian hỏi đi hỏi lại và giảm rủi ro lưu trữ dữ liệu.

### 3.3 Kết quả khách hàng mua

- Giảm thời gian từ lúc yêu cầu đến lúc nhận đủ dữ liệu.
- Giảm số lượt trao đổi qua lại trên một ticket.
- Giảm dữ liệu nhạy cảm tồn tại trong email, chat và help desk.
- Tăng tỷ lệ khách hàng hoàn tất bước thu thập dữ liệu ngay lần đầu.
- Có bằng chứng rằng dữ liệu đã hết hạn hoặc bị xóa.

## 4. Nguyên tắc phát triển

1. **Recipient không cần tài khoản.** Tài khoản dành cho đội tạo và quản lý phòng.
2. **Secure by design.** Không dùng từ “an toàn” hoặc “enterprise-grade” cho tới khi kiến trúc thực sự đáp ứng lời hứa.
3. **Metadata tối thiểu.** Chỉ lưu dữ liệu cần thiết để vận hành, billing và audit.
4. **Tích hợp vào workflow.** Người dùng không nên phải mở thêm một dashboard nếu có thể thao tác ngay trong help desk.
5. **AI không được mặc định đọc dữ liệu nhạy cảm.** Local-first hoặc explicit opt-in; làm rõ dữ liệu nào rời thiết bị.
6. **Mỗi giai đoạn có điều kiện dừng.** Không tiếp tục xây nếu tín hiệu sử dụng hoặc willingness-to-pay không đạt.
7. **Surgical evolution.** Tận dụng room, realtime và attachment flow hiện tại; tránh viết lại toàn bộ khi chưa cần.

## 5. Roadmap theo giai đoạn

Mốc thời gian chỉ là ước lượng cho một đội nhỏ 2–4 người và phải được điều chỉnh sau discovery kỹ thuật.
Trạng thái code và production evidence được theo dõi trong
[`ARCHITECTURE_ROADMAP.md`](./ARCHITECTURE_ROADMAP.md); không coi một phase hoàn tất chỉ vì code đã
merge hoặc đã hết thời gian ước lượng.

### Giai đoạn 0 — Discovery và kiểm chứng willingness-to-pay

**Mục tiêu:** xác nhận vấn đề “secure support handoff” xảy ra đủ thường xuyên và đủ đau để doanh nghiệp trả tiền.

**Thời lượng dự kiến:** 2–4 tuần.

**Công việc:**

- Phỏng vấn 15–20 support lead/MSP dựa trên ticket thật gần nhất, không hỏi ý kiến chung chung.
- Đo số lần/tháng khách hàng phải gửi screenshot, log, cấu hình hoặc PII.
- Ghi lại cách họ đang làm, rủi ro, thời gian xử lý và người có quyền mua.
- Tạo landing page cho hai thông điệp:
  - “Thu thập log và screenshot nhanh hơn”.
  - “Không để dữ liệu nhạy cảm nằm lại trong ticket”.
- Chạy 3–5 pilot concierge bằng sản phẩm hiện tại kết hợp quy trình thủ công.
- Đề nghị thanh toán hoặc ký LOI có mức giá, không chỉ xin phản hồi.

**Deliverables:**

- Problem interview notes và bảng tổng hợp pattern.
- ICP v1, buyer, user và top ba use case.
- Baseline: thời gian lấy đủ dữ liệu, số lượt trao đổi/ticket và số handoff/tháng.
- Pricing hypothesis và danh sách design partners.

**Điều kiện qua giai đoạn:**

- Ít nhất 10/15 đội có từ 20 handoff phù hợp mỗi tháng.
- Ít nhất 5 đội đồng ý pilot.
- Ít nhất 2 đội sẵn sàng trả từ 100 USD/tháng hoặc ký LOI tương đương.

**Nếu không đạt:** giữ ClipSync là tiện ích miễn phí/open-source, tiếp tục tìm vertical khác trước khi đầu tư vào enterprise platform.

### Giai đoạn 1 — Củng cố nền tảng và đo lường sản phẩm hiện tại

**Mục tiêu:** tạo baseline production đủ tin cậy để chạy pilot mà không hứa quá mức về bảo mật.

**Thời lượng dự kiến:** 3–5 tuần.

**Trạng thái review 2026-08-29:** phần lớn capability đã có trong code. Phase chưa hoàn tất cho tới
khi shared limiter, scheduler, alert, cleanup/reconciliation và privacy của telemetry được chứng minh
trên environment pilot. Chi tiết evidence còn thiếu nằm ở Technical Phase 1 của architecture roadmap.

**Phạm vi:**

- Chuyển rate limit sang Redis/Upstash hoặc edge-compatible store.
- Thêm structured logging không chứa room content, PIN, filename nhạy cảm hoặc token.
- Thêm error monitoring và health checks cho API, storage, realtime và cron cleanup.
- Thêm product analytics tôn trọng privacy:
  - Room created.
  - Second device joined.
  - First content transferred.
  - Attachment uploaded.
  - Room completed/expired.
- Kiểm tra cron cleanup và cơ chế xử lý storage object bị orphan.
- Bổ sung upload error recovery và trạng thái offline rõ ràng.
- Tăng entropy của room token; không cho custom slug trở thành đường dẫn bảo mật mặc định.
- Thêm nút đóng/xóa phòng ngay lập tức.
- Tách thông điệp “private server storage” khỏi “end-to-end encrypted”.

**Không làm trong giai đoạn này:** CRDT, app native, AI diagnosis, SSO hoặc full help-desk integration.

**Điều kiện hoàn thành:**

- Đo được funnel từ tạo phòng đến handoff thành công.
- Cleanup được kiểm chứng bằng test và quan sát production.
- Không có content/secret trong log và analytics.
- Pilot có thể vận hành với failure rate đủ thấp để quan sát hành vi thật.

### Giai đoạn 2 — Secure Room MVP

**Mục tiêu:** biến lời hứa “phòng tạm thời an toàn” thành thuộc tính kiến trúc, không chỉ là access control phía server.

**Thời lượng dự kiến:** 6–10 tuần, cần security design review trước khi triển khai.

**Điều chỉnh thực thi:** phạm vi này được chia thành Technical Phase 2 — Architecture boundary &
Secure Access v2 và Technical Phase 3 — E2EE Secure Room. Access/lifecycle phải ổn định trước khi
gắn crypto vào luồng hiện tại; ước lượng 6–10 tuần phải được lập lại sau threat-model prototype, không
được dùng như cam kết cố định cho toàn bộ hai phase.

**Phạm vi bắt buộc:**

- Mã hóa nội dung và attachment phía client.
- Server chỉ lưu ciphertext; khóa giải mã không được gửi cho server.
- Tách locator và decryption key, ví dụ key nằm ở URL fragment.
- Token phòng có entropy cao và có khả năng rotate/revoke.
- Tùy chọn thời hạn: 15 phút, 1 giờ, 1 ngày, 7 ngày hoặc thời gian tùy chỉnh trong giới hạn policy.
- Giới hạn lượt xem/tải và chế độ xóa sau lần truy cập đầu tiên.
- Owner session hoặc tài khoản tối thiểu để đóng, gia hạn và thu hồi phòng.
- Password mạnh hoặc email OTP; không dựa duy nhất vào PIN ngắn.
- Audit metadata: tạo, truy cập, upload, download, revoke, expire; không ghi nội dung.
- Threat model, abuse cases và quy trình xử lý key loss.
- Security review độc lập trước public launch.

**Quyết định cần ADR:**

- Mã hóa từng message/file hay mã hóa theo room key.
- Cách chia sẻ key khi có nhiều recipient.
- Cách rotate key khi revoke một participant.
- Trade-off giữa E2EE và malware scanning/server-side AI.
- Cách khôi phục khi owner mất key; mặc định nên chấp nhận không thể khôi phục thay vì tạo backdoor.

**Điều kiện hoàn thành:**

- Server/database dump không đủ để đọc room content.
- Link bị revoke hoặc hết hạn không thể lấy ciphertext mới.
- Có security test cho authorization, brute force, replay, IDOR và attachment access.
- UI diễn đạt chính xác giới hạn của E2EE, expiry và one-time view.

### Giai đoạn 3 — Guided Support Handoff MVP

**Mục tiêu:** giải quyết một workflow support trọn vẹn thay vì chỉ chuyển dữ liệu.

**Thời lượng dự kiến:** 6–8 tuần.

**Phạm vi:**

- Workspace và tài khoản cho support agent; recipient vẫn anonymous.
- Tạo room theo template:
  - App crash.
  - Login issue.
  - Payment issue.
  - API/integration issue.
  - Device/POS issue.
- Checklist và trường có cấu trúc: OS, browser, app version, timestamp, steps to reproduce.
- Hỗ trợ PDF, TXT, LOG, JSON, HAR, ZIP và file cấu hình theo allowlist.
- Upload file lớn theo chunk/resumable protocol.
- QR code và short code có thời hạn.
- Trạng thái workflow: waiting, customer joined, evidence received, agent reviewed, completed, expired.
- Comment/message hai chiều tối giản; chưa xây full chat platform.
- Export/download bundle có manifest và checksum.
- Webhook/API tối thiểu để liên kết room với ticket ID.
- Email notification có kiểm soát, không chứa dữ liệu phòng.

**North-star metric:** số secure handoff hoàn tất trên mỗi đội mỗi tuần.

**Chỉ số hỗ trợ:**

- Thời gian từ room creation đến first upload.
- Tỷ lệ recipient hoàn tất mà không cần hướng dẫn thêm.
- Số lượt trao đổi giảm trên mỗi ticket.
- Tỷ lệ handoff được agent đánh dấu “đủ dữ liệu”.
- Weekly active paid teams và logo retention.

**Điều kiện hoàn thành:**

- Ít nhất 70% recipient hoàn tất flow mà không cần tạo tài khoản.
- Median time-to-first-evidence dưới 5 phút cho use case đã chọn.
- Design partners sử dụng ít nhất 3 handoff/agent/tuần.
- Có khách hàng trả phí sau pilot.

### Giai đoạn 4 — AI Safety Assistant

**Mục tiêu:** dùng AI để giảm lỗi con người và giảm dữ liệu thừa trước khi dùng AI để “chẩn đoán sự cố”.

**Thời lượng dự kiến:** 4–8 tuần, có thể chạy song song một phần với giai đoạn 3 sau khi data policy được chốt.

**P0 — AI/local intelligence nên làm sớm:**

- Secret detection cho API key, access token, private key, connection string và password pattern.
- PII detection cho email, số điện thoại, định danh, thẻ thanh toán và địa chỉ.
- Redaction preview trước upload; người dùng chủ động xác nhận phần bị che.
- Screenshot privacy guard: OCR cục bộ, highlight vùng có khả năng chứa PII/secret.
- File classifier để cảnh báo sai loại file hoặc file chứa dữ liệu ngoài checklist.

P0 nên ưu tiên regex, entropy detection, deterministic rules, OCR local và model nhỏ chạy trên thiết bị. Không cần gửi nội dung đến LLM để đạt phần lớn giá trị ban đầu.

**P1 — AI giúp thu thập đúng dữ liệu:**

- Tạo checklist động dựa trên loại lỗi, sản phẩm và thông tin ticket đã được cho phép.
- Kiểm tra completeness: “đã có screenshot nhưng thiếu timestamp/app version”.
- Hướng dẫn khách hàng lấy log theo OS/browser bằng ngôn ngữ tự nhiên.
- Phát hiện ảnh mờ, crop thiếu vùng lỗi hoặc log không đúng khoảng thời gian.
- Dịch hướng dẫn và câu trả lời giữa agent/recipient nhưng giữ nguyên code, identifier và error message.

**P2 — AI hỗ trợ agent:**

- Tóm tắt evidence thành timeline và facts; liên kết mỗi nhận định về nguồn cụ thể.
- Chuẩn hóa log, gom duplicate stack trace và nhóm lỗi theo signature.
- Đề xuất câu hỏi tiếp theo dựa trên dữ liệu còn thiếu.
- So sánh evidence với knowledge base/runbook của chính khách hàng.
- Sinh draft ticket note đã redacted để đưa về Zendesk/Freshdesk.
- Gợi ý mức độ ưu tiên và routing, nhưng không tự động đóng hoặc hạ mức độ nghiêm trọng.

**P3 — Ý tưởng AI sau product–market fit:**

- AI incident copilot theo dõi room realtime và điều phối checklist.
- Multimodal diagnosis từ screenshot + log + môi trường thiết bị.
- Tự động dựng reproduction package đã loại secret.
- Phân tích xu hướng lỗi trên metadata/signature đã ẩn danh.
- Phát hiện nhiều ticket có cùng root-cause và đề xuất incident chung.
- Sinh runbook từ các case đã giải quyết, phải có người duyệt trước khi publish.
- Voice-guided collection cho nhân viên hiện trường hoặc khách hàng ít kỹ thuật.

**Guardrails bắt buộc cho AI:**

- AI mặc định tắt với room nhạy cảm cho đến khi admin bật policy.
- Hiển thị rõ model/provider, vùng xử lý và retention trước khi gửi dữ liệu.
- Không dùng dữ liệu khách hàng để train nếu chưa có đồng ý riêng, rõ ràng.
- Cho phép chọn local model, customer-managed provider hoặc zero-retention endpoint.
- Redact trước, infer sau; chỉ gửi phần tối thiểu cần thiết.
- Prompt và output không được đưa decryption key hoặc raw secret vào telemetry.
- Kết quả chẩn đoán phải phân biệt facts, inference và missing evidence.
- Human-in-the-loop cho hành động ảnh hưởng ticket, security hoặc khách hàng.
- Chống prompt injection trong log/file và phân tách untrusted evidence khỏi system instruction.
- Có AI audit metadata: ai yêu cầu, model nào, policy nào và nguồn nào được dùng.

**Điều kiện hoàn thành:**

- Đo được tỷ lệ secret/PII được phát hiện và false-positive rate trên bộ test đã gán nhãn.
- Không có raw sensitive content trong AI telemetry.
- AI summary có citation về evidence và được agent chấp nhận/chỉnh sửa đo được.
- AI giúp giảm thời gian review nhưng không làm tăng tỷ lệ yêu cầu khách hàng gửi lại dữ liệu.

### Giai đoạn 5 — Help-desk Integration và thương mại hóa

**Mục tiêu:** đưa ClipSync vào nơi support agent đang làm việc và tạo vòng lặp doanh thu lặp lại.

**Thời lượng dự kiến:** 8–12 tuần cho integration đầu tiên và billing cơ bản.

**Phạm vi:**

- Chọn đúng một integration đầu tiên dựa trên design partners, không làm đồng thời mọi nền tảng.
- Tạo room ngay từ ticket và tự gắn ticket/customer context được phép.
- Hiển thị trạng thái handoff trong agent sidebar.
- Đẩy sanitized summary và audit metadata về ticket.
- Không đẩy raw secret hoặc attachment nhạy cảm vào ticket.
- Workspace admin, member invitation và RBAC cơ bản.
- Subscription, usage metering, quota, invoice và trial.
- Retention policy theo workspace.
- Template/policy dùng chung theo đội.
- Customer branding và custom domain cho gói MSP.

**Pricing hypothesis để kiểm chứng:**

| Gói | Giá thử nghiệm | Phạm vi ban đầu |
| --- | ---: | --- |
| Free | 0 USD | Cá nhân, quota nhỏ, expiry ngắn |
| Team | 49 USD/tháng | Đội nhỏ, template và lịch sử metadata |
| Growth | 199 USD/tháng | Integration, policy, nhiều agent |
| MSP | 499 USD/tháng | Multi-client, branding, quota lớn |
| Enterprise | Báo giá | SSO, SCIM, residency, SLA, BYOK/self-host |

Không khóa giá trước khi có dữ liệu usage và willingness-to-pay. Ưu tiên pricing theo workspace/value thay vì chỉ tính theo storage, vì storage khuyến khích giữ dữ liệu lâu—ngược với lời hứa sản phẩm.

**Điều kiện hoàn thành:**

- Paid conversion và retention được đo theo cohort.
- Ít nhất 10 đội trả phí dùng hàng tuần.
- Integration làm giảm thao tác thay vì chỉ tạo thêm một dashboard.
- Có unit economics sơ bộ cho storage, bandwidth, AI inference và support.

### Giai đoạn 6 — Enterprise readiness và mở rộng

**Mục tiêu:** đáp ứng yêu cầu mua hàng, quản trị và triển khai của tổ chức lớn sau khi đã có PMF ban đầu.

**Không bắt đầu chỉ vì một prospect yêu cầu; cần pattern lặp lại từ nhiều khách hàng.**

**Phạm vi tiềm năng:**

- SAML/OIDC SSO, SCIM, domain verification và granular RBAC.
- Policy về loại file, expiry tối đa, domain recipient, IP và địa lý.
- Data residency và tenant isolation nâng cao.
- BYOK/customer-managed keys và key rotation.
- Self-hosted hoặc private cloud deployment nếu economics phù hợp.
- SIEM export, audit API và security event webhook.
- DLP/CASB integration.
- Legal hold chỉ áp dụng metadata; phải xác định rõ xung đột với ephemeral content.
- SOC 2 readiness, penetration test định kỳ, incident response và vendor management.
- SLA, support escalation và status page.
- Public API/SDK và embedded secure dropzone.

**Điều kiện hoàn thành:**

- Enterprise feature được gắn với deal hoặc expansion có giá trị xác nhận.
- Security/compliance evidence đủ cho procurement của ICP đã chọn.
- Gross margin vẫn phù hợp sau bandwidth, AI và support cost.

## 6. Kiến trúc sản phẩm mục tiêu

Thiết kế thực thi được review tại [`ARCHITECTURE_ROADMAP.md`](./ARCHITECTURE_ROADMAP.md). Ba plane
dưới đây là boundary logic và data-access boundary; chúng chưa phải ba microservice. Trong giai đoạn
pilot, kiến trúc triển khai vẫn là modular monolith với web/BFF và bounded background worker.

Luồng khái niệm:

```text
Agent/help desk
    │ tạo room + policy + checklist
    ▼
ClipSync control plane
    │ metadata, identity, billing, audit, integration
    │ không giữ plaintext/decryption key
    ▼
Encrypted room/data plane ◄──── Recipient browser
    │ ciphertext                  OCR/redaction/local checks
    ▼
Temporary object storage
```

Ranh giới cần giữ:

- **Control plane:** workspace, identity, room policy, metadata, billing, integration.
- **Data plane:** ciphertext, upload/download và lifecycle tự hủy.
- **AI plane:** chỉ nhận dữ liệu theo policy/consent; ưu tiên local inference hoặc nội dung đã redacted.

Mọi thay đổi lớn về key management, E2EE, AI access và retention phải có ADR và threat model trước khi code.

## 7. Backlog ưu tiên tổng hợp

### Now

- Discovery và paid pilot.
- Kiểm chứng shared limiter, cron, cleanup/reconciliation và alert trên production-like environment.
- Đo funnel/failure-rate thực tế và kiểm tra telemetry không chứa content/locator/token.
- Threat model sơ bộ và ADR cho module boundary, owner/access, locator và metadata.
- Chốt production exit gate của Giai đoạn 1; không đánh dấu hoàn tất chỉ dựa trên unit test.

### Next

- Modularize room/access/evidence theo vertical slice; route mới không query Supabase trực tiếp.
- Secure Access v2: locator ≥128 bit, access grant, revoke, configurable expiry và one-time atomic.
- E2EE protocol và encrypted direct/resumable upload sau security review.
- General files và guided checklist.
- Local secret/PII detection và redaction preview.

### Later

- Một help-desk integration có design partner.
- Webhook/ticket linking qua transactional outbox.
- AI completeness check và cited summary.
- Billing, RBAC, team policy.
- MSP branding và multi-client workspace.

### Not now

- Full collaborative editor/CRDT.
- Native desktop/mobile apps.
- Clipboard history dài hạn.
- Public/community rooms.
- General-purpose chat.
- Tự động chẩn đoán và sửa hệ thống khách hàng.
- Train foundation model riêng.
- Nhiều help-desk integration cùng lúc.
- Blockchain hoặc cơ chế token hóa không phục vụ use case.

## 8. Metrics và mục tiêu kinh doanh

### Funnel sản phẩm

1. Room created.
2. Recipient joined.
3. First evidence uploaded.
4. Required checklist completed.
5. Agent reviewed.
6. Room completed/expired.

### Metrics chính

- Secure handoffs completed/team/week.
- Median time-to-first-evidence.
- Median time-to-complete.
- Recipient completion rate.
- Evidence accepted without re-request rate.
- Weekly active paid teams.
- 30/90-day logo retention.
- Expansion revenue và handoff volume growth.
- Cost per completed handoff.
- Security incidents, failed access và cleanup failures.

### Mục tiêu doanh thu tham khảo

Để đạt khoảng 1 triệu USD ARR, một tổ hợp giả định có thể là:

- 200 khách hàng Growth × 199 USD × 12 = 477.600 USD.
- 100 khách hàng MSP × 499 USD × 12 = 598.800 USD.
- Tổng = 1.076.400 USD ARR.

Đây là mô hình mục tiêu, không phải forecast. Cần thay bằng dữ liệu conversion, churn, expansion và sales cycle thực tế.

## 9. Rủi ro lớn và cách giảm thiểu

| Rủi ro | Tác động | Giảm thiểu |
| --- | --- | --- |
| Người dùng thích nhưng không trả tiền | Xây nhầm consumer utility | Paid pilot/LOI trước khi mở rộng platform |
| E2EE làm khó AI và malware scanning | Mâu thuẫn lời hứa sản phẩm | Local-first, explicit opt-in, customer-managed processing |
| Link bị forward hoặc chụp lại | E2EE không giải quyết identity | OTP, recipient binding, one-time access, revoke |
| AI làm lộ secret/PII | Mất niềm tin và compliance risk | Redact trước inference, zero-retention, no-training, audit |
| AI hallucination dẫn đến xử lý sai | Tăng thời gian và rủi ro vận hành | Citation, confidence, missing evidence, human approval |
| Chi phí bandwidth/file lớn | Giảm gross margin | Quota, lifecycle ngắn, resumable upload, pricing theo value |
| Quá nhiều integration | Roadmap phân mảnh | Chọn một nền tảng theo design partners |
| Enterprise yêu cầu feature riêng lẻ | Thành dịch vụ custom | Chỉ productize pattern lặp lại và gắn với doanh thu |
| Abuse/phishing/malware | Domain reputation và chi phí | Abuse detection, safe preview, file policy, report flow |

## 10. Kế hoạch 90 ngày đề xuất

Kế hoạch này là rolling plan từ baseline code ngày 2026-08-29. Mọi hạng mục sau gate discovery đều
có điều kiện; không tiếp tục vì đã bước sang mốc ngày tiếp theo.

### Ngày 1–30

- Hoàn tất 15–20 cuộc phỏng vấn và chọn một ICP.
- Chạy 3 pilot concierge.
- Thu ít nhất hai cam kết trả phí/LOI.
- Deploy/kiểm chứng migration 003–004, shared limiter, cron, reconcile, health và alert trên pilot.
- Chạy deletion/storage failure drill; đo cleanup lag, upload/save failure và funnel privacy-safe.
- Viết ADR cho module boundary, access model, locator/realtime và metadata classification.

### Ngày 31–60

- Chỉ bắt đầu nếu discovery và production gate đạt.
- Tách vertical slice room/access/evidence khỏi route và `TextEditor` mà không đổi hành vi room v1.
- Expand schema v2; prototype locator ≥128 bit, access grant, revoke/expiry và atomic one-time access.
- Chốt threat model và test vector cho E2EE; prototype ciphertext envelope/direct upload có timebox.
- Discovery checklist cho đúng một use case; chưa xây workflow tổng quát.

### Ngày 61–90

- Chỉ chạy E2EE pilot giới hạn nếu Secure Access v2 và security gate đạt; không dual-write plaintext.
- Kiểm chứng DB/storage dump không đọc được room v2 và key không vào request/telemetry.
- Thử local deterministic secret/PII detection; chưa gửi raw evidence tới LLM.
- Đo time-to-first-evidence, recipient completion và evidence accepted trên design partner.
- Chốt pricing pilot, quota và quyết định tiếp tục/thu hẹp/đổi ICP dựa trên usage và payment.
- Không bắt đầu help-desk integration trước khi design partner xác nhận đúng một nền tảng ưu tiên.

## 11. Các câu hỏi còn mở

- ICP nào có tần suất handoff cao nhất và chu kỳ mua ngắn nhất?
- Buyer là support lead, security, IT hay founder?
- Giá trị chính là tốc độ xử lý hay giảm rủi ro dữ liệu?
- Khách hàng có chấp nhận mất khả năng recovery để đổi lấy E2EE thực sự không?
- Help desk nào xuất hiện nhiều nhất trong design partners?
- Loại dữ liệu/file nào chiếm phần lớn use case?
- AI có cần xem raw evidence hay local/redacted inference đã đủ?
- Customer yêu cầu SaaS, BYOK hay self-host ở mức giá nào?
- Cần lưu audit metadata bao lâu mà không phá vỡ lời hứa ephemeral?

Các câu hỏi này phải được trả lời bằng phỏng vấn, hành vi sử dụng và giao dịch thanh toán; không nên được quyết định chỉ bằng brainstorming nội bộ.
