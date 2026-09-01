# ClipSync Architecture & Refactoring Roadmap

> Cập nhật: 2026-08-29.
>
> Tài liệu này mô tả **cách** kiến trúc và codebase tiến hóa để thực hiện
> [`PRODUCT_ROADMAP.md`](./PRODUCT_ROADMAP.md). Product roadmap quyết định vấn đề cần giải quyết,
> điều kiện kinh doanh và thứ tự capability; tài liệu này quyết định dependency kỹ thuật, boundary,
> migration strategy và quality gate. Hai tài liệu phải được review cùng nhau khi đổi phase.

## 1. Kết luận sau khi review lại

ClipSync nên tiếp tục là **modular monolith**, triển khai thành web/BFF và background worker từ cùng
một codebase. Chưa có bằng chứng vận hành hoặc ranh giới ownership đủ mạnh để biện minh cho
microservices. Mục tiêu refactor không phải là chia nhỏ deployment, mà là thiết lập các boundary để
room, identity, evidence, workflow, audit và integration có thể thay đổi độc lập.

Roadmap sản phẩm hiện tại đúng về hướng đi, nhưng cần ba điều chỉnh kỹ thuật:

1. **Tách Secure Room thành hai phase.** Access/lifecycle foundation và E2EE có risk profile khác
   nhau. Gộp owner, expiry, one-time access, audit, key management và encrypted upload vào một mốc
   6–10 tuần tạo ra một release quá lớn để review bảo mật hoặc rollback an toàn.
2. **Không rewrite big-bang.** Room v1 tiếp tục phục vụ pilot trong khi module boundary và schema v2
   được thêm theo `expand → migrate → contract`. Room plaintext cũ không được âm thầm “migrate”
   thành E2EE ở server; chúng hết hạn theo TTL, còn room E2EE mới bắt đầu ở protocol version mới.
3. **Phân tách plane theo logic trước, deployment sau.** Control plane, encrypted data plane và AI
   plane phải có data contract và quyền truy cập riêng, nhưng trong giai đoạn đầu vẫn có thể cùng
   repository và cùng nhà cung cấp hạ tầng.

### 1.1 Baseline đã xác nhận trong code

Các capability sau đã có và có test trong repository:

- Room chỉ được tạo bởi `POST /api/rooms`; locator do server sinh.
- Owner capability tách quyền quản trị khỏi quyền recipient; capability thô không lưu trong DB.
- Mutation quản trị đi qua owner guard và dùng `owner_version` để chống race với revoke.
- Deletion lifecycle có queue trong Postgres, retry, trạng thái thất bại và reconciliation report.
- Rate limiter có shared-store adapter, policy fail-closed cho PIN và memory fallback có quan sát.
- Structured log và analytics dùng allowlist, không chứa content, locator, PIN, filename hoặc token.
- Health/ops endpoints, cleanup metrics và hosted-Supabase schema verification đã có.
- UI đã phân biệt offline/transient/permanent failure cho save và upload.

Những capability trên là nền tảng pilot tốt hơn bản MVP ban đầu, nhưng **chưa đồng nghĩa phase nền
tảng đã hoàn tất trong production**. Repository không chứng minh được scheduler thật đang chạy,
Upstash đã được cấu hình, alert đã được nối, hoặc cleanup đã chịu được failure thực tế trên hosted
environment. Các mục đó là deployment evidence, không phải unit-test evidence.

### 1.2 Gap kiến trúc còn lại

- Route handler vẫn chứa authorization, orchestration và truy cập Supabase trực tiếp.
- `service_role` vẫn là đường truy cập DB chính; chưa có tenant scope vì chưa có workspace.
- Room state, realtime, upload, retry và UI orchestration vẫn tập trung nhiều trong `TextEditor`.
- Text, filename và attachment hiện là plaintext; server vẫn đọc được toàn bộ dữ liệu.
- Upload đi xuyên qua server và buffer file; chưa có resumable/direct encrypted upload.
- Owner là capability gắn với một browser; chưa có participant identity, access grant hay account.
- Realtime topic dựa trên locator và chưa phải một authorization boundary độc lập.
- Chưa có policy snapshot, configurable expiry, view/download limit hoặc atomic one-time redemption.
- Chưa có workspace, workflow/checklist, immutable evidence manifest, integration outbox hoặc billing.

## 2. Nguyên tắc kiến trúc bắt buộc

1. **Modular monolith trước microservices.** Boundary trong code và data contract phải tồn tại trước
   khi cân nhắc tách process/service.
2. **Thin transport.** Route handler chỉ parse/validate request, xác thực actor, gọi use case và map
   response. Route không tự viết query nghiệp vụ.
3. **Deny by construction.** Use case nhận `RoomScope`/`WorkspaceScope`; repository không cung cấp
   API “query mọi tenant” cho request path.
4. **Ciphertext-only là invariant.** Sau khi vào E2EE protocol, server, DB dump, object storage,
   log, analytics và error monitor không đủ để đọc evidence.
5. **Metadata tối thiểu và phân loại trước khi lưu.** Metadata nhạy cảm như filename, checklist value
   hoặc ticket context phải được mã hóa hoặc chứng minh là cần thiết theo data classification.
6. **Background work phải idempotent và quan sát được.** Cleanup, webhook, email, export và billing
   event đều có retry budget, idempotency key, queue depth và dead-letter/operator path.
7. **Migration tiến hóa.** Chỉ dùng forward migration; triển khai theo `expand → migrate → contract`,
   có compatibility window và rollback plan ở cấp ứng dụng.
8. **Security claim là testable contract.** Authorization, replay, IDOR, tenant isolation, key loss,
   expiry và retention phải có automated test hoặc production control chứng minh được.
9. **Provider là adapter.** Supabase, Redis, email, help desk, billing và AI provider không được trở
   thành domain model.
10. **Không tự thiết kế crypto bằng intuition.** Cipher suite, nonce strategy, key derivation, key
    envelope và recovery phải được ADR hóa, dùng primitive/library đã được review và qua security
    review độc lập.

## 3. Kiến trúc đích

```text
Agent browser / Recipient browser / Help-desk extension
                         │
                         │ session hoặc scoped capability
                         ▼
┌───────────────────────────────────────────────────────────────┐
│ Next.js Web + BFF                                             │
│ HTTP adapters · request validation · auth context · DTO       │
└──────────────────────────────┬────────────────────────────────┘
                               ▼
┌───────────────────────────────────────────────────────────────┐
│ Modular application core                                     │
│                                                               │
│ Identity/Workspace │ Room/Access/Policy │ Evidence Transfer   │
│ Workflow/Checklist │ Audit/Analytics     │ Integration/Billing │
└───────────────────┬───────────────────────┬────────────────────┘
                    │                       │
             Control plane          Encrypted data plane
                    │                       │
        Postgres metadata/RLS     Private object storage
        identity, policy, audit   ciphertext, encrypted manifest
                    │                       │
                    └────────────┬──────────┘
                                 ▼
                     Worker / Queue / Outbox
              cleanup · webhook · email · export · reconcile

Browser-local DLP/OCR ── policy + explicit consent ──► AI Gateway
                                                   redacted/minimal input
```

Đây là **ranh giới logic**, không phải yêu cầu có từng đó service. Trong giai đoạn pilot, `web` và
cron worker có thể tiếp tục chạy trên Vercel; deletion queue trong Postgres hiện tại là đủ. Message
broker chỉ được thêm khi webhook/email/export cần delivery semantics hoặc deletion backlog vượt khả
năng cron bounded-batch.

## 4. Module và dependency direction

Cấu trúc đích gợi ý, không yêu cầu đổi toàn bộ cây thư mục trong một PR:

```text
src/
  app/                         # page và HTTP adapter, không chứa query nghiệp vụ
  modules/
    identity/
    workspaces/
    rooms/
    access/
    evidence/
    workflow/
    audit/
    integrations/
    billing/
  platform/
    db/
    storage/
    realtime/
    queue/
    telemetry/
    crypto/
  workers/
```

Mỗi module chỉ thêm các lớp thực sự cần thiết:

- `domain`: entity, policy, state transition và invariant thuần.
- `application`: command/query/use case và port cần từ hạ tầng.
- `infrastructure`: Supabase/Redis/provider adapter.
- `contracts`: request/response/event schema được version hóa.

Dependency chỉ đi từ transport → application → domain/port → infrastructure adapter. Domain không
import Next.js, Supabase, Redis hoặc SDK provider. Không cần tạo interface cho utility thuần hoặc
component không có khả năng thay implementation.

### 4.1 Bounded context

| Context | Sở hữu | Không sở hữu |
| --- | --- | --- |
| Identity & Workspace | account, membership, role, session, tenant scope | room ciphertext |
| Room & Access | lifecycle, locator, capability/access grant, policy snapshot, expiry | object bytes |
| Evidence Transfer | upload session, object state, encrypted manifest/checksum | billing plan |
| Workflow | template, checklist, handoff state, review outcome | raw decrypted evidence |
| Audit & Analytics | append-only metadata, privacy-safe funnel | content, key, locator |
| Integration | ticket link, webhook delivery, provider mapping | domain source of truth |
| Billing | entitlement, usage ledger, quota decision | room lifecycle implementation |
| AI Gateway | consent, processing policy, provider request/audit | implicit access to room key |

## 5. Data model định hướng

Tên bảng dưới đây là vocabulary để thiết kế, chưa phải cam kết migration. Mỗi phase phải chốt schema
bằng ADR và use case đã được pilot xác nhận.

### Control plane

- `workspaces`, `accounts`, `memberships`
- `rooms`: tenant/owner, protocol version, state, expiry, policy snapshot, optimistic version
- `room_access_grants`: capability hash, role, expiry, view/download budget, revoked timestamp
- `room_policies`: policy version; room giữ snapshot hoặc version bất biến
- `audit_events`: append-only, actor class, action, outcome, timestamp; không content/locator/key
- `workflow_templates`, `handoffs`, `checklist_items`
- `integration_links`, `webhook_deliveries`
- `usage_ledger`, `idempotency_keys`, `outbox_events`

### Encrypted data plane

- `evidence_items`: opaque object key, ciphertext size/checksum, state, expiry
- `upload_sessions`: chunk/multipart state, quota reservation, idempotency
- `encrypted_manifests`: encrypted filename, MIME chi tiết và structured evidence metadata
- `key_envelopes`: chỉ wrapped key/ciphertext; server không có khóa giải mã

Locator dài hạn nên là secret ngẫu nhiên tối thiểu 128 bit và DB chỉ giữ hash để lookup. Short code
dễ đọc chỉ là rendezvous code có TTL ngắn và rate limit riêng, không phải credential chính.

## 6. Quy tắc API, realtime và background work

### API

- Command dùng endpoint thể hiện intent: create, grant, revoke, complete, request-upload, commit.
- Mutation retry được phải nhận `Idempotency-Key` hoặc command id do server cấp.
- State transition quan trọng dùng optimistic version hoặc transaction/RPC atomic; không dùng
  read-then-write rời rạc làm correctness mechanism.
- API response không trả storage path, provider error, key material hoặc tenant-internal identifier
  nếu client không cần.
- Contract có version khi thay đổi semantics, đặc biệt với ciphertext envelope và audit event.

### Realtime

- Realtime chỉ là notification transport; authoritative state vẫn lấy từ API.
- Topic/subscription phải được cấp từ scoped access grant, không dùng locator làm authorization
  boundary duy nhất.
- Event không mang plaintext, key, filename hoặc ticket context.
- Reconnect luôn chạy reconciliation/query lại state; event có thể trùng hoặc mất.

### Background work

- Postgres deletion queue hiện tại tiếp tục dùng cho pilot.
- Khi có integration, thêm transactional outbox để room state và event delivery không bị split-brain.
- Worker claim bằng lease/visibility timeout; mọi handler idempotent.
- Retry có backoff, giới hạn và dead-letter/operator action; không retry nóng trong cùng một run.
- Queue depth, oldest-age, attempts và last-success là metric bắt buộc.

## 7. Roadmap kỹ thuật theo phase

Không chuyển phase chỉ vì hết thời gian ước lượng. Mỗi phase có entry gate và exit gate. Discovery,
security review và production evidence có thể kéo dài lịch mà không được “đánh dấu xong” bằng cách
giảm gate.

| Phase kỹ thuật | Kết quả chính | Trạng thái 2026-08-29 | Dependency để bắt đầu |
| --- | --- | --- | --- |
| 0. Validation | ICP, pilot và willingness-to-pay được chứng minh | Đang diễn ra, ngoài codebase | Không |
| 1. Pilot foundation | Production evidence cho nền tảng hiện tại | Code phần lớn đã có | Chạy song song Phase 0 |
| 2. Boundary & Secure Access | Module/schema/access v2 ổn định | Chưa bắt đầu | Phase 0 và 1 đạt gate |
| 3. E2EE Secure Room | Server chỉ giữ ciphertext | Chưa bắt đầu | Phase 2 + security design |
| 4. Guided Handoff | Một workflow support hoàn chỉnh | Chưa bắt đầu | Phase 3 + design partner |
| 5. AI Safety | Local-first/redacted AI có eval | Chưa bắt đầu | Phase 3 + data/consent ADR |
| 6. Integration & Billing | Một integration tạo doanh thu | Chưa bắt đầu | Phase 4 + paid usage |
| 7. Enterprise | Controls theo deal lặp lại | Chưa bắt đầu | PMF ban đầu |

### Phase 0 — Product validation và baseline

**Ánh xạ:** Product Phase 0.

**Trạng thái:** đang diễn ra; không thể kết luận từ repository.

**Mục tiêu:** chứng minh ICP, frequency và willingness-to-pay trước khi đầu tư vào platform.

**Công việc kỹ thuật cho phép:** instrumentation privacy-safe, reliability fix, threat-model spike và
prototype có timebox. Không xây workspace, billing, SSO hoặc integration tổng quát.

**Exit gate:** đạt điều kiện phỏng vấn/pilot/LOI trong product roadmap; có baseline funnel và failure
rate đủ tin cậy. Nếu không đạt, dừng platform roadmap và giữ sản phẩm ở utility scope.

### Phase 1 — Pilot foundation và production evidence

**Ánh xạ:** Product Phase 1.

**Trạng thái:** phần lớn capability đã có trong code; production gate chưa được xác nhận.

**Đã có:** owner capability, admin guard, server-generated locator, distributed limiter adapter,
privacy-safe telemetry, health/ops endpoints, resumable deletion lifecycle, reconciliation report và
upload/save recovery UI.

**Còn phải làm:**

- Deploy migration 003/004 và chạy `verify:supabase` trên environment pilot.
- Bật shared limiter bắt buộc ở production và kiểm tra fail-closed bằng fault injection.
- Nối uptime/log alert theo `OPERATIONS.md`; chứng minh cron và reconcile chạy đúng lịch.
- Chạy deletion canary và storage-failure drill; đo cleanup lag/backlog.
- Đo p50/p95 latency, error rate, upload failure và funnel trên traffic pilot.
- Bổ sung CSP/security-header review và kiểm tra không có URL/content trong telemetry thực tế.
- Ghi ADR-001 cho module boundary và ADR-002 cho access/owner model trước phase kế tiếp.

**Exit gate:** điều kiện Product Phase 1 đạt trong production; không có secret/content trong sampled
telemetry; cleanup/reconcile/limiter có alert và drill evidence; pilot failure rate được định lượng.

### Phase 2 — Architecture boundary và Secure Access v2

**Ánh xạ:** cầu nối Product Phase 1 → 2.

**Entry gate:** Phase 0 chứng minh tiếp tục đầu tư; Phase 1 có production evidence.

**Mục tiêu:** tạo seam đủ ổn định để E2EE không bị cài trực tiếp vào route và component hiện tại.

**Phạm vi:**

- Tạo module `rooms`, `access`, `evidence` và platform ports; di chuyển theo vertical slice.
- Route mới không gọi Supabase trực tiếp; thêm architecture test/import rule chống tái coupling.
- Tạo schema v2 theo expand migration; sinh DB types thay cho type thủ công.
- Tách locator khỏi access grant; nâng locator lên ≥128 bit và hash-at-rest.
- Thêm versioned room policy, configurable expiry, revoke và room state machine.
- Thêm scoped recipient grant; view/download limit và one-time redemption phải atomic.
- Cấp realtime subscription theo grant; locator không còn là realtime authorization duy nhất.
- Giữ owner capability v1 qua compatibility adapter; chưa bắt buộc account/workspace.
- Tách `TextEditor` thành room session, realtime, document và evidence-upload hooks.

**Không làm:** E2EE production, general file types, billing hoặc help-desk integration.

**Exit gate:** room v1 vẫn hoạt động; room v2 access tests bao phủ IDOR, replay, revoke race, expiry và
one-time concurrency; request path mới không có unscoped admin query; rollback về v1 không mất data.

### Phase 3 — E2EE Secure Room

**Ánh xạ:** Product Phase 2.

**Entry gate:** Phase 2 hoàn tất; ADR/threat model được duyệt.

**Mục tiêu:** biến ciphertext-only thành thuộc tính kiến trúc có thể kiểm chứng.

**Phạm vi:**

- Chốt ADR về key hierarchy, sharing, rotation, nonce, recovery/key loss và protocol versioning.
- Mã hóa text và attachment trong browser bằng primitive/library đã được review.
- Locator nằm ở path; decryption material nằm ở fragment hoặc wrapped key envelope, không vào request.
- Mã hóa filename và sensitive manifest; server chỉ giữ metadata vận hành tối thiểu.
- Direct/chunked ciphertext upload qua scoped upload session; server không buffer plaintext.
- Tách limit “revoke future access” khỏi lời hứa không thể thu hồi plaintext đã tải xuống.
- Thêm crypto test vectors, cross-browser tests, tamper/replay tests và key-loss UX.
- Security review độc lập trước public launch.

**Migration:** room plaintext v1 không được server chuyển thành “E2EE giả”. Chỉ room protocol v2 mới
là E2EE; room v1 tiếp tục với wording cũ và tự hết hạn. Không dual-write plaintext cho room v2.

**Exit gate:** DB dump + storage dump + log không đủ đọc content; key không xuất hiện trong HTTP,
telemetry hoặc server memory contract; authorization/replay/IDOR test đạt; review độc lập không còn
finding Critical/Major chưa xử lý.

### Phase 4 — Guided Support Handoff

**Ánh xạ:** Product Phase 3.

**Entry gate:** Secure Room đạt security gate và design partner xác nhận use case.

**Mục tiêu:** hoàn thành một workflow support, không biến ClipSync thành chat/file-drive tổng quát.

**Phạm vi:**

- Account/workspace cho agent, membership và RBAC cơ bản; recipient vẫn anonymous.
- Template/checklist cho đúng một vertical/use case đầu tiên.
- Evidence items cho allowlisted file type; resumable encrypted upload và quota reservation.
- Handoff state machine: waiting → joined → evidence received → reviewed → completed/expired.
- Encrypted manifest/checksum và export bundle; export không đưa key vào server telemetry.
- Short code TTL ngắn, QR, controlled notification và metadata-only webhook/API.
- Tenant isolation test; control-plane request dùng tenant-scoped repository/RLS hoặc scoped SQL API.
- Transactional outbox trước khi webhook/email trở thành đường production quan trọng.

**Exit gate:** đạt completion/time-to-first-evidence/usage gate trong product roadmap; cross-tenant test
đạt; upload resume và webhook retry được kiểm chứng; một design partner trả tiền sau pilot.

### Phase 5 — AI Safety Assistant

**Ánh xạ:** Product Phase 4.

**Entry gate:** data classification, consent model và E2EE/AI trade-off có ADR; có labeled evaluation set.

**Thứ tự bắt buộc:**

1. Deterministic/local secret detection, entropy rule, local OCR và redaction preview.
2. Local completeness/file-quality checks.
3. AI Gateway cho input tối thiểu đã redacted, chỉ khi policy và người dùng cho phép.
4. Cited summary/next-question cho agent; human approval trước mọi write-back.

AI Gateway sở hữu consent, model/provider/region/retention policy và audit metadata. Nó không tự có
quyền lấy room key. Untrusted evidence luôn được tách khỏi system instruction và tool authority.

**Exit gate:** đo precision/recall/false-positive trên dataset đã gán nhãn; raw content không có trong
AI telemetry; output có citation và acceptance/edit rate; AI giảm review time mà không tăng re-request.

### Phase 6 — Integration và thương mại hóa

**Ánh xạ:** Product Phase 5.

**Entry gate:** chọn đúng một help desk từ usage của paid design partners.

**Phạm vi:** integration adapter, OAuth credential isolation, outbox/webhook delivery, sanitized
ticket summary, workspace admin, entitlement, quota, usage ledger và billing. Integration không trở
thành source of truth của room/workflow và không nhận raw evidence mặc định.

**Exit gate:** integration giảm thao tác đo được; paid conversion/retention theo cohort; delivery có
idempotency/dead-letter; cost per handoff và gross-margin input được đo.

### Phase 7 — Enterprise readiness

**Ánh xạ:** Product Phase 6.

**Entry gate:** PMF ban đầu và nhiều deal lặp lại cùng một yêu cầu.

**Phạm vi theo evidence:** SSO/SCIM, granular RBAC, tenant policy, audit/SIEM, residency, BYOK,
self-host/private cloud, SLA và compliance program. Không thêm vì một prospect đơn lẻ.

**Exit gate:** tenant isolation và key-management review độc lập; compliance evidence phục vụ được
procurement thực; economics vẫn đạt sau residency, bandwidth, AI và support cost.

## 8. ADR bắt buộc

| ADR | Quyết định | Phải chốt trước |
| --- | --- | --- |
| ADR-001 | Module boundary và dependency direction | Phase 2 implementation |
| ADR-002 | Owner/session/access grant và quyền recipient | Secure Access v2 |
| ADR-003 | Locator, short code, capability hash và realtime authorization | Secure Access v2 |
| ADR-004 | E2EE protocol, key hierarchy, sharing, rotation, recovery | Phase 3 implementation |
| ADR-005 | Metadata classification, retention và audit fields | Schema v2/E2EE |
| ADR-006 | Direct/resumable upload, quota reservation, integrity | General evidence upload |
| ADR-007 | Tenant isolation: RLS, scoped repository và service-role boundary | Workspace launch |
| ADR-008 | AI consent, provider, region, retention và prompt-injection boundary | AI Gateway |

Mỗi ADR phải có context, decision, alternatives, security/privacy impact, migration, rollback và cách
kiểm chứng. ADR không phải nơi chép lại implementation detail có thể thay đổi tự do.

## 9. Architecture fitness functions

Các rule cần được tự động hóa dần, không chỉ ghi trong tài liệu:

- Không module domain nào import `next/*`, Supabase SDK hoặc provider SDK.
- Route thuộc room v2 không gọi `createAdminClient()` trực tiếp.
- Mọi tenant query có scope và có cross-tenant negative test.
- Mọi event/log chỉ đi qua allowlisted contract; test chủ động truyền content/key/locator để chứng minh
  chúng bị loại.
- Ciphertext protocol có test vector cố định, tamper detection và backward-compatibility test.
- Mutation retry được có idempotency/concurrency test.
- Worker job có retry/dead-letter/queue-age test và metric.
- Migration có forward-compatibility test với app version trước và sau.
- CI chạy unit, integration/security tests, typecheck, lint và production build.

## 10. Trigger để cân nhắc tách service

Chỉ tách khỏi modular monolith khi có ít nhất một trigger đo được:

- Worker workload làm ảnh hưởng latency/availability của web dù đã tách deployment.
- Evidence bandwidth hoặc CPU cần scaling policy khác biệt rõ ràng.
- Integration/AI cần network boundary hoặc compliance boundary riêng.
- Một team độc lập cần ownership và release cadence riêng.
- Data residency buộc control/data plane chạy ở vùng khác nhau.

“Code lớn”, “nhiều module” hoặc “chuẩn bị enterprise” không tự nó là trigger.

## 11. Những việc không làm trong refactor nền tảng

- Không đổi sang microservices, Kubernetes hoặc event sourcing toàn hệ thống.
- Không xây CRDT/full collaborative editor.
- Không tạo abstraction cho mọi function hoặc copy domain type qua nhiều package.
- Không chuyển provider chỉ để “vendor-neutral” nếu port hiện tại đã đủ.
- Không giữ plaintext fallback trong room E2EE.
- Không cho AI/server scan raw evidence mặc định rồi vẫn gọi sản phẩm là E2EE.
- Không xây nhiều integration hoặc enterprise feature trước gate kinh doanh.

## 12. Cách duy trì tài liệu

- Product scope/gate đổi: cập nhật `PRODUCT_ROADMAP.md` trước, sau đó cập nhật mapping tại đây.
- Boundary, data ownership, security model hoặc migration strategy đổi: tạo/cập nhật ADR rồi sửa file
  này.
- Runbook, alert, cron hoặc incident response đổi: cập nhật `OPERATIONS.md`.
- Event/field/retention analytics đổi: cập nhật đồng thời `ANALYTICS.md` và catalog trong code.
- Mỗi phase review phải ghi rõ: evidence đã có, assumption còn lại, decision cần ADR và exit gate chưa đạt.
