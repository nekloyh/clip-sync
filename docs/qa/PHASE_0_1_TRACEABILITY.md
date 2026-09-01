# Traceability — Phase 0 và Phase 1

> Requirement → implementation → test → evidence.
>
> Cột **Trạng thái** dùng bảng nhãn ở `PHASE_0_1_QA_PLAN.md` §2. Cột này phản ánh
> trạng thái **sau** đợt implementation ngày 2026-08-29; nguyên trạng trước khi
> sửa nằm ở `PHASE_0_1_BASELINE_REPORT.md`.
>
> `GAP-n` trỏ tới finding trong baseline report.

---

## A. Phase 0 — technical enablement

### A.1 Product analytics: event được phát đúng thời điểm

| # | Requirement | Nguồn | Code path | Test / evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| A1.1 | `room_created` khi tạo được row | ANALYTICS.md §2 | `src/app/api/rooms/route.ts:98-99` | `room-authz.test.ts` "mints a room …"; `idempotency.test.ts` "records room_created and room_completed once each" | PASS_AUTOMATED |
| A1.2 | `second_device_joined` khi một người **không phải owner** đọc phòng | ANALYTICS.md §2 | `src/app/api/rooms/[slug]/route.ts:74-80` | `idempotency.test.ts` "is not fooled by a reconnect storm"; `room-authz.test.ts` recipient lane | PASS_AUTOMATED |
| A1.3 | `first_content_transferred` khi save đầu tiên **có nội dung**, hoặc attachment đầu tiên | ANALYTICS.md §2 | `src/app/api/rooms/[slug]/save/route.ts:88-94`; `attachments/route.ts:167` | `idempotency.test.ts` "records first_content_transferred exactly once" | PASS_AUTOMATED |
| A1.4 | `attachment_uploaded` mỗi lần upload, **kể cả thất bại** | ANALYTICS.md §2 | `attachments/route.ts:101-109, 157-163, 198-207` | `idempotency.test.ts` "records every attachment upload" | PASS_AUTOMATED |
| A1.5 | `room_completed` khi **người** chủ động đóng phòng, không phải TTL | ANALYTICS.md §2 | `src/lib/lifecycle.ts:108-110` | `lifecycle.test.ts` "records room_completed for a person, not for the TTL" | PASS_AUTOMATED |
| A1.6 | `room_expired` khi TTL đưa phòng vào hàng đợi | ANALYTICS.md §2 | `src/lib/lifecycle.ts:161-167` | `lifecycle.test.ts` "records room_expired once, even across two runs" | PASS_AUTOMATED |
| A1.7 | `room_deleted` chỉ khi bytes thật sự biến mất | ANALYTICS.md §2 | `src/lib/lifecycle.ts:306-317` | `lifecycle.test.ts` "emits room_deleted once even when the worker runs twice" | PASS_AUTOMATED |
| A1.8 | `cleanup_failed` cho mỗi lần dọn dẹp thất bại | ANALYTICS.md §2 | `src/lib/lifecycle.ts` (per-room); `cron/cleanup/route.ts` (per-run) | `lifecycle.test.ts` "records cleanup_failed for every failed attempt"; `cleanup-route.test.ts` "records the failure in the operational row and in the funnel" | PASS_AUTOMATED — GAP-9 đã sửa |

### A.2 Idempotency và tính đúng của funnel

| # | Requirement | Nguồn | Code path | Test / evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| A2.1 | Once-per-room event idempotent **ở database** | ANALYTICS.md §3 | `004_pilot_readiness.sql` `uq_analytics_once_per_room`; `analytics/index.ts:47-51` | `verify:supabase` "the unique index collapses a repeated once-per-room event into one row" | NOT_VERIFIED (cần hosted project) |
| A2.2 | Cùng quy tắc được mô phỏng trong test | ANALYTICS.md §3 | `analytics/index.ts:64-72` | `idempotency.test.ts` (6 test) | PASS_AUTOMATED |
| A2.3 | Failure event **không** bị dedupe sai | ANALYTICS.md §3 | `catalog.ts:70-76` | `catalog.test.ts` "leaves countable occurrences out of it"; `verify:supabase` "a countable event is not collapsed" | PASS_AUTOMATED + NOT_VERIFIED (hosted) |
| A2.4 | Funnel không đếm phòng bị bỏ rơi thành completed | ANALYTICS.md §2 | `lifecycle.ts:108-110` chỉ ghi `room_completed` khi `actor !== 'system'` | `lifecycle.test.ts` "records room_completed for a person, not for the TTL" | PASS_AUTOMATED |
| A2.5 | Memo trong tiến trình chỉ là tối ưu, không phải cơ chế đúng đắn | ANALYTICS.md §3 | `analytics/index.ts:103-125` | `idempotency.test.ts` "is only an optimisation" | PASS_AUTOMATED |

### A.3 Privacy của telemetry

| # | Requirement | Nguồn | Code path | Test / evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| A3.1 | Không có content, PIN, capability, cookie, authorization header, **slug**, filename, storage path, raw IP, raw UA, exact byte size, MIME subtype | ANALYTICS.md §1 | `catalog.ts:121-193` (allowlist + closed-set validation); `004_…sql` (không có cột để chứa) | `catalog.test.ts` "drops every forbidden field a caller might pass", "has no column that could hold a locator, a filename or an address" | PASS_AUTOMATED |
| A3.2 | `room_ref` dẫn xuất từ **room UUID**, không phải slug | ANALYTICS.md §1 | `pseudonym.ts:48-50` | `catalog.test.ts` "refuses a room ref that is not a hex digest"; đọc code | PASS_AUTOMATED + PASS_MANUAL |
| A3.3 | Retention 180 ngày được thực thi, và một lần prune hỏng phải nhìn thấy được | ANALYTICS.md §4 | `004_…sql` `prune_analytics_events()`; `cron/cleanup/route.ts` `pruneAnalytics()` | `cleanup-route.test.ts` "reports a prune failure instead of swallowing it", "does not let a prune failure fail the run that deletes rooms"; `verify:supabase` "the analytics retention function exists and is callable" | PASS_AUTOMATED (phát hiện lỗi) + NOT_VERIFIED (hàm tồn tại trên hosted) — GAP-3 đã sửa |
| A3.4 | Event dictionary và catalog trong code đồng bộ | ARCHITECTURE_ROADMAP §12 | `docs/ANALYTICS.md` §2 ↔ `catalog.ts:28-53` | `catalog.test.ts` "covers exactly the events that describe a stage" | PASS_AUTOMATED |
| A3.5 | Không có content/locator/token trong telemetry **thật** trên pilot | ARCHITECTURE_ROADMAP Phase 1 | — | Cần sampling trên pilot | WAITING_FOR_EXTERNAL_EVIDENCE |

### A.4 Funnel SQL

| # | Requirement | Nguồn | Code path | Test / evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| A4.1 | created → joined → transferred → completed/expired | Prompt §B.1; PRODUCT_ROADMAP §8 | `ANALYTICS.md` §6 query 1 | Đọc query | PASS_MANUAL |
| A4.2 | Median time-to-first-evidence | PRODUCT_ROADMAP §8 | `ANALYTICS.md` §6 query 2 | Đọc query | PASS_MANUAL |
| A4.3 | Upload failure rate | Prompt §B.1 | `ANALYTICS.md` §6 query 3 | Đọc query | PASS_MANUAL — GAP-10 đã sửa |
| A4.4 | Completion rate | Prompt §B.1 | `ANALYTICS.md` §6 query 4 | Đọc query | PASS_MANUAL — GAP-10 đã sửa |
| A4.5 | Khoảng cách completed → deleted (cleanup lag) | ANALYTICS.md §2 | `ANALYTICS.md` §6 query 5 | Đọc query | PASS_MANUAL — GAP-10 đã sửa |
| A4.6 | Các số trên chạy trên dữ liệu pilot thật | PRODUCT_ROADMAP §5 GĐ1 | — | Cần traffic pilot | WAITING_FOR_EXTERNAL_EVIDENCE |

### A.5 Artifact discovery

| # | Requirement | Nguồn | Artifact | Trạng thái |
| --- | --- | --- | --- | --- |
| A5.1 | Interview guide dựa trên ticket thật, không hỏi ý kiến chung chung | PRODUCT_ROADMAP §5 GĐ0 | `docs/discovery/INTERVIEW_GUIDE.md` | PASS_MANUAL (template rỗng, không có dữ liệu giả) |
| A5.2 | Pilot scorecard | PRODUCT_ROADMAP §5 GĐ0 | `docs/discovery/PILOT_SCORECARD.md` | PASS_MANUAL |
| A5.3 | Evidence template cho exit gate | PRODUCT_ROADMAP §5 GĐ0 | `docs/discovery/PHASE_0_EVIDENCE_TEMPLATE.md` | PASS_MANUAL |

---

## B. Phase 0 — business exit gate

Không có code path. Không được suy ra từ repository.

| # | Điều kiện | Nguồn | Bằng chứng cần | Trạng thái |
| --- | --- | --- | --- | --- |
| B1 | ≥10/15 đội có ≥20 handoff phù hợp mỗi tháng | PRODUCT_ROADMAP §5 GĐ0 | Bảng tổng hợp phỏng vấn có số đo | WAITING_FOR_EXTERNAL_EVIDENCE |
| B2 | ≥5 đội đồng ý pilot | PRODUCT_ROADMAP §5 GĐ0 | Pilot scorecard đã ký/xác nhận | WAITING_FOR_EXTERNAL_EVIDENCE |
| B3 | ≥2 đội trả từ 100 USD/tháng hoặc LOI tương đương | PRODUCT_ROADMAP §5 GĐ0 | Hóa đơn/LOI | WAITING_FOR_EXTERNAL_EVIDENCE |

---

## C. Phase 1

### C.1 Room creation và locator

| # | Requirement | Code path | Test / evidence | Trạng thái |
| --- | --- | --- | --- | --- |
| C1.1 | Chỉ `POST /api/rooms` tạo room | `app/api/rooms/route.ts:70-113`; `lib/rooms.ts:199-216` | `room-authz.test.ts` "addressing a room that does not exist … creates nothing"; `room-page.test.ts` "is a not-found … and creates no row" | PASS_AUTOMATED |
| C1.2 | Truy cập room không tồn tại không tạo dữ liệu | `app/r/[slug]/page.tsx:54-55` | `room-page.test.ts` (như trên) | PASS_AUTOMATED |
| C1.3 | Client không chọn được custom locator | `app/api/rooms/route.ts:49-66` | `room-authz.test.ts` "treats a caller-supplied slug as join-only" | PASS_AUTOMATED |
| C1.4 | Collision được xử lý an toàn (không trả phòng người khác) | `lib/rooms.ts:210-211`; `app/api/rooms/route.ts:70-75` | `rooms.test.ts` "still reports a taken slug as a collision"; `room-authz.test.ts` "picks another locator when the first one is already taken" | PASS_AUTOMATED — GAP-13 đã bổ sung test route-level |
| C1.5 | Owner capability chỉ mint tại create path | `app/api/rooms/route.ts:72-93`; `authz.ts:47-51` | `room-authz.test.ts` "renews nothing for a contributor, so reading a room never confers ownership" | PASS_AUTOMATED |
| C1.6 | Capability thô không vào DB / response JSON / URL / log | `owner-auth.ts:34-36`; `log.ts:36-68` | `room-authz.test.ts` "never puts the capability in the response body, the URL or the database" | PASS_AUTOMATED |
| C1.7 | Tài liệu mô tả đúng entropy hiện tại (~49 bit) và target ≥128 bit, không overclaim | `lib/slug.ts:20-25`; `README.md` §Mô hình bảo mật; `PRODUCT_ROADMAP` §2 | Đọc: 24 tính từ × 24 danh từ × 31⁸ ≈ 2⁴⁸·⁸ | PASS_MANUAL |

### C.2 Authorization

| # | Requirement | Code path | Test / evidence | Trạng thái |
| --- | --- | --- | --- | --- |
| C2.1 | Ma trận Owner/Recipient/Anonymous/PIN-unlocked cho read, save, upload, download, delete attachment, set PIN, delete room | `lib/guard.ts`; `lib/authz.ts` | `room-authz.test.ts` (40 test, gồm "refuses every administrative mutation", "the recipient lane is unchanged", "refuses reads, saves and uploads on a PIN-locked room") | PASS_AUTOMATED |
| C2.2 | Revoke race qua `owner_version` | `lifecycle.ts:86-88`; `pin/route.ts:259-271` | `room-authz.test.ts` "scopes the PIN write to the authorized owner version", "rejects a capability revoked by bumping the room owner version" | PASS_AUTOMATED |
| C2.3 | Legacy ownerless room không thể bị claim | `owner-auth.ts:67` | `room-authz.test.ts` "cannot be claimed by a visitor, however well-formed the cookie"; `verify:supabase` "a legacy room cannot be claimed" | PASS_AUTOMATED + NOT_VERIFIED (hosted) |
| C2.4 | Biết PIN ≠ ownership | `guard.ts:85-96` | `room-authz.test.ts` "knowing the PIN is not ownership" | PASS_AUTOMATED |
| C2.5 | Room queued for deletion không đọc/mutate lại được | `rooms.ts:140-144`; `save/route.ts:63`; `pin/route.ts:265`; `lifecycle.ts:88` | `rooms.test.ts` "hides a room the moment its deletion is requested"; `room-authz.test.ts` "refuses a save for a room that was queued for deletion mid-request" | PASS_AUTOMATED — GAP-13 đã bổ sung |
| C2.6 | IDOR attachment giữa hai room bị từ chối | `attachments/[id]/route.ts:49, 152` | `room-authz.test.ts` "will not serve one room an attachment belonging to another" | PASS_AUTOMATED |
| C2.7 | 403 đồng nhất, không tiết lộ lý do | `http.ts:56-60`; `guard.ts:91-93` | `room-authz.test.ts` "says the same thing for every insufficient-permission case" | PASS_AUTOMATED |

### C.3 PIN và rate limiting

| # | Requirement | Code path | Test / evidence | Trạng thái |
| --- | --- | --- | --- | --- |
| C3.1 | PIN hash bằng scrypt (N=2¹⁵) | `crypto.ts:17-46` | `crypto.test.ts` | PASS_AUTOMATED |
| C3.2 | Verify constant-time ở phần phù hợp | `crypto.ts:86, 98-103` | `crypto.test.ts`; đọc code | PASS_AUTOMATED |
| C3.3 | Legacy hash migration an toàn | `crypto.ts:62-64, 90-96`; `pin/route.ts` | `crypto.test.ts`; `room-authz.test.ts` "scopes a legacy PIN upgrade to a room that is still active" | PASS_AUTOMATED — GAP-7 đã sửa |
| C3.4 | Per-client **và** per-room brute-force budget | `pin/route.ts:123-127`; `policies.ts:62-86` | `limiter.test.ts` "caps guesses against one room however many addresses are used" | PASS_AUTOMATED |
| C3.5 | Shared store hoạt động giữa nhiều instance | `limiter/store.ts:115-185` | `limiter.test.ts` "cannot be bypassed by hopping instances mid-attack" | PASS_AUTOMATED |
| C3.6 | Redis lỗi → PIN verify/mutation fail closed | `limiter/index.ts:99-109`; `policies.ts:62-92` | `limiter.test.ts` "refuses PIN verification rather than weakening it silently" | PASS_AUTOMATED |
| C3.7 | Redis lỗi → read/save/upload theo policy `fallback_memory` | `policies.ts:48-60, 93-104` | `limiter.test.ts` "falls back to the per-instance limiter for room reads" | PASS_AUTOMATED |
| C3.8 | Owner deletion không bị cache outage chặn | `policies.ts:106-111` | `limiter.test.ts` "lets an owner delete their room during an outage" | PASS_AUTOMATED |
| C3.9 | Rate-limit key không chứa raw IP hoặc slug | `limiter/index.ts:73`; `pseudonym.ts:53-55` | `limiter.test.ts` "never sends a raw slug, address or token", "logs no key material when it reports the outage" | PASS_AUTOMATED |
| C3.10 | Readiness fail khi distributed limiter được yêu cầu nhưng chưa cấu hình | `health/ready/route.ts:138-141` | `health.test.ts` "fails when the deployment declares a shared limiter mandatory" | PASS_AUTOMATED |
| C3.11 | Fail-closed được kiểm chứng bằng fault injection trên môi trường production-like | ARCHITECTURE_ROADMAP Phase 1 | — | WAITING_FOR_EXTERNAL_EVIDENCE |
| C3.12 | Khi không có proxy header, `clientIdentity` gộp mọi người vào một bucket | `limiter/index.ts:166-170` | Đã ghi vào `OPERATIONS.md` §4 | PASS_MANUAL (giới hạn đã biết — GAP-11) |

### C.4 Deletion lifecycle

| # | Requirement | Code path | Test / evidence | Trạng thái |
| --- | --- | --- | --- | --- |
| C4.1 | `active → deletion_pending → deleting` | `lifecycle.ts:71-232`; `types.ts:45-50` | `lifecycle.test.ts` "queues the room and makes it unreadable immediately", "claims a pending room and marks it in progress" | PASS_AUTOMATED |
| C4.2 | Room mất khả năng đọc ngay khi deletion được chấp nhận | `rooms.ts:140-144` | `rooms.test.ts` "hides a room the moment its deletion is requested" | PASS_AUTOMATED |
| C4.3 | DELETE trả 202, không tuyên bố bytes đã biến mất | `rooms/[slug]/route.ts:145-148` | `room-authz.test.ts` "deletes an attachment and the room" | PASS_AUTOMATED |
| C4.4 | Thứ tự object → attachment row → room row | `lifecycle.ts:264-299` | `lifecycle.test.ts` "destroys objects, then rows, then the room" | PASS_AUTOMATED |
| C4.5 | Storage failure giữ metadata để retry | `lifecycle.ts:280-283` | `lifecycle.test.ts` "keeps every database row when storage refuses" | PASS_AUTOMATED |
| C4.6 | Retry không bị đốt hết trong một cron invocation | `cron/cleanup/route.ts:81, 94-95` | `lifecycle.test.ts` "skips a room the caller has already attempted this run" | PASS_AUTOMATED |
| C4.7 | Retry budget và `deletion_failed` | `lifecycle.ts:45, 321-333` | `lifecycle.test.ts` "parks the room after the retry budget runs out" | PASS_AUTOMATED |
| C4.8 | Stale `deleting` claim được phục hồi, và một claim còn sống **không** bị worker khác cướp | `lifecycle.ts` `claimDeletionBatch` | `lifecycle.test.ts` "reclaims a room whose worker died", "refuses to let a second worker claim a room that is already leased", "renews the lease when it claims" | PASS_AUTOMATED — GAP-1 đã sửa |
| C4.9 | Manual deletion và TTL dùng chung implementation | `lifecycle.ts:254-359` cho cả hai đường | `cleanup-route.test.ts` "a full run"; `room-authz.test.ts` DELETE | PASS_AUTOMATED |
| C4.10 | Chạy worker nhiều lần vẫn idempotent | `lifecycle.ts:236-317` | `lifecycle.test.ts` §idempotency (4 test); `cleanup-route.test.ts` "running it twice" | PASS_AUTOMATED |
| C4.11 | Analytics phân biệt completed / expired / actually deleted | `catalog.ts:45-52`; `lifecycle.ts:108, 161, 316` | `lifecycle.test.ts`, `cleanup-route.test.ts` "does not double-count the funnel across runs" | PASS_AUTOMATED |
| C4.12 | Mọi object dưới thư mục của phòng bị xóa, kể cả object không còn row trỏ tới | `lifecycle.ts` `processRoomDeletion` | `lifecycle.test.ts` "removes an object no row points at any more" | PASS_AUTOMATED — GAP-8 đã sửa |
| C4.13 | Deletion canary + storage failure drill trên hosted QA | ARCHITECTURE_ROADMAP Phase 1 | — | WAITING_FOR_EXTERNAL_EVIDENCE |

### C.5 Reconciliation

| # | Requirement | Code path | Test / evidence | Trạng thái |
| --- | --- | --- | --- | --- |
| C5.1 | Phát hiện `db_without_object` | `reconcile.ts:87-126` | `reconcile.test.ts` "detects the direction the old sweep was blind to" | PASS_AUTOMATED |
| C5.2 | Phát hiện `object_without_db` | `reconcile.ts:66-85` | `reconcile.test.ts` "detects a folder whose room is gone" | PASS_AUTOMATED |
| C5.3 | Không tự động xóa finding | `reconcile.ts:23-33` | `reconcile.test.ts` "leaves the object in place" | PASS_AUTOMATED |
| C5.4 | Không ghi storage path hoặc dữ liệu nhạy cảm | `reconcile.ts:118-124`; `004_…sql` | `reconcile.test.ts` "records the attachment id and not the storage path" | PASS_AUTOMATED |
| C5.5 | Bounded scan + `hasMore` | `reconcile.ts:54-59, 148` | `reconcile.test.ts` "reports hasMore rather than trying to walk the whole bucket" | PASS_AUTOMATED |
| C5.6 | Pending count và ops visibility phản ánh **tổng** finding còn mở | `health/ops/route.ts`; `reconcile.ts` `countOpenFindings` | `health.test.ts` "reports the true number of open findings, not the page size" | PASS_AUTOMATED — GAP-2 đã sửa |
| C5.7 | Một drift không sinh finding mới mỗi lần chạy | `reconcile.ts` (lọc theo finding đang mở) | `reconcile.test.ts` "does not record the same finding twice across runs" | PASS_AUTOMATED — GAP-2 đã sửa |
| C5.8 | Không làm cleanup job mất execution budget | `vercel.json`; hai route tách rời | Đọc `vercel.json`, `OPERATIONS.md` §2 | PASS_MANUAL |
| C5.9 | Một lần scan thất bại không được báo cáo là run thành công | `reconcile.ts` (ném lỗi khi listing gốc hỏng) | `reconcile.test.ts` "fails the run when it could not scan at all" | PASS_AUTOMATED — GAP-6 đã sửa |

### C.6 Health và operations

| # | Requirement | Code path | Test / evidence | Trạng thái |
| --- | --- | --- | --- | --- |
| C6.1 | Liveness không gọi dependency | `health/live/route.ts` | `health.test.ts` "is ok, and reaches no dependency to say so" | PASS_AUTOMATED |
| C6.2 | Readiness kiểm tra config, DB schema, storage, limiter | `health/ready/route.ts:32-141` | `health.test.ts` (10 test) | PASS_AUTOMATED |
| C6.3 | Health response không leak provider details | `health/ready/route.ts:26-28, 86-92` | `health.test.ts` "says nothing a stranger could use" | PASS_AUTOMATED |
| C6.4 | Ops endpoint yêu cầu cron secret, 401 cho mọi trường hợp không hợp lệ | `health/ops/route.ts:39-45`; `cron-auth.ts` | `health.test.ts` "answers 401, not 503, when no secret is configured" | PASS_AUTOMATED |
| C6.5 | Cleanup/reconcile ghi run start/end | `ops.ts:55-90`; cả hai cron route | `cleanup-route.test.ts` "stamps a start before the work and a completion after it" | PASS_AUTOMATED |
| C6.6 | Metric: last completion, pending deletion, failed deletion, reconciliation findings, duration, hasMore | `ops.ts:92-145`; `health/ops/route.ts:48-68` | `health.test.ts`, `cleanup-route.test.ts` "reports a backlog when work is left over" | PASS_AUTOMATED |
| C6.7 | Runbook có alert threshold và remediation | `docs/OPERATIONS.md` §5, §6 | Đọc | PASS_MANUAL |
| C6.8 | Alert đã thực sự được nối vào monitor | ARCHITECTURE_ROADMAP Phase 1 | — | WAITING_FOR_EXTERNAL_EVIDENCE |
| C6.9 | Migration 004 tạo đủ ba bảng vận hành | `scripts/verify-supabase.mjs:278-281` | `verify:supabase` | NOT_VERIFIED (cần hosted project) |

### C.7 Logging, monitoring và privacy

| # | Requirement | Code path | Test / evidence | Trạng thái |
| --- | --- | --- | --- | --- |
| C7.1 | Logger dùng allowlist, không denylist | `log.ts:36-140` | `log.test.ts` "drops every forbidden field, whatever it is called" | PASS_AUTOMATED |
| C7.2 | Error monitor không nhận raw exception/body/header | `monitoring.ts:21-30, 78-88`; `log.ts:200-211` | `log.test.ts` "keeps the provider code and discards everything else" | PASS_AUTOMATED |
| C7.3 | Request ID được validate | `log.ts:185-189` | `log.test.ts` "refuses an inbound id that could forge a log line" | PASS_AUTOMATED |
| C7.4 | Không log content, locator, PIN, hash, cookie, token, filename, storage path, raw IP, raw UA | `log.ts:36-118` | `log.test.ts` "never carries a room slug, even under an allowlisted name", "leaks no forbidden value through any other field" | PASS_AUTOMATED |
| C7.5 | Provider message/details/hint không được forward ra response | `http.ts:30-50`; `errors.ts:56-62` | `cleanup-route.test.ts` "leaks nothing through the response a scheduler will log"; `health.test.ts` | PASS_AUTOMATED |
| C7.6 | Analytics failure không làm hỏng user request | `analytics/index.ts:136-151` | `idempotency.test.ts` "never lets a telemetry failure break the request it describes" | PASS_AUTOMATED |
| C7.7 | Adversarial test: truyền field nhạy cảm và chứng minh bị loại | `log.test.ts`, `catalog.test.ts` | 2 test file, 8 test đối kháng | PASS_AUTOMATED |
| C7.8 | Sampling telemetry production để xác nhận | ARCHITECTURE_ROADMAP Phase 1 | — | WAITING_FOR_EXTERNAL_EVIDENCE |

### C.8 Upload/save UX

| # | Requirement | Code path | Test / evidence | Trạng thái |
| --- | --- | --- | --- | --- |
| C8.1 | Phân biệt offline / transient / permanent / authorization failure | `request-failure.ts`; `StatusRail.tsx:93-139`; `AttachmentGrid.tsx:246-290` | `request-failure.test.ts` (12 test) | PASS_AUTOMATED |
| C8.2 | Save retry không ghi đè edit mới hơn | `src/lib/save-queue.ts` `createSaveQueue`; `TextEditor.tsx` (`performSave` xếp hàng, `retrySave` gửi `latestContentRef`) | `save-queue.test.ts` "never lets a second request start while the first is in flight", "keeps only the newest text of everything offered while busy", "never lets an older text land after a newer one" | PASS_AUTOMATED (cơ chế xếp hàng) + PASS_MANUAL (dây nối trong component — repo không có DOM test environment) — GAP-5 đã sửa |
| C8.3 | Pending save được flush khi page unload | `src/lib/save-queue.ts` `flushPendingSave`; `TextEditor.tsx` (listener `pagehide` + unmount) | `save-queue.test.ts` "sends what the debounce was still holding, with keepalive", "sends an empty document, which is a real edit", "sends nothing when there is nothing pending" | PASS_AUTOMATED (request được dựng) + PASS_MANUAL (đăng ký listener) — GAP-4 đã sửa |
| C8.4 | Upload retry không tạo duplicate ngoài ý muốn | `TextEditor.tsx:384-457` (`existingId` thay chỗ, không thêm tile mới) | Đọc code + `AttachmentGrid.tsx:152-170` | PASS_MANUAL |
| C8.5 | Attachment limit race được đánh giá | `attachments/route.ts:43-61` (đếm rồi chèn — không nguyên tử) | Ghi nhận: hai upload đồng thời có thể vượt cap 20 một đơn vị. Không có tác động bảo mật/retention; đã ghi vào final report | PARTIAL (chấp nhận có chủ đích) |
| C8.6 | UI không hiện owner action cho recipient, server vẫn enforce độc lập | `EditorHeader.tsx:85-116`; `guard.ts:85-96` | `room-authz.test.ts` "is reported to the client as a capability, never as a token" + toàn bộ ma trận 403 | PASS_AUTOMATED |

### C.9 Migration và degraded mode

| # | Requirement | Code path | Test / evidence | Trạng thái |
| --- | --- | --- | --- | --- |
| C9.1 | Migration forward-only và rerunnable | `001`–`004` dùng `if not exists` / `exception when duplicate_object` | Đọc bốn file | PASS_MANUAL |
| C9.2 | App version cũ không sập khi migration mới đã chạy | Mọi cột thêm vào đều nullable hoặc có default | Đọc `004_…sql` §mở đầu | PASS_MANUAL |
| C9.3 | App version mới degrade an toàn khi migration chưa chạy | `rooms.ts:94-187` | `rooms.test.ts` "treats a row from a database without migration 004 as active", "records the degradation so the health check can report it" | PASS_AUTOMATED |
| C9.4 | Thiếu owner column **không** trao ownership | `rooms.ts:117-128` (`owner_secret_hash ?? null`); `owner-auth.ts:67` | `rooms.test.ts`; `owner-auth.test.ts` "never treats a room without an owner as owned" | PASS_AUTOMATED |
| C9.5 | Thiếu lifecycle column được readiness phát hiện | `health/ready/route.ts:76-103` | `health.test.ts` "probes the columns both migrations add, not just the table" | PASS_AUTOMATED |
| C9.6 | Schema error classifier không nhầm constraint violation thành thiếu migration | `schema-errors.mjs:83-99` | `schema-errors.test.ts` (14 test); `verify:supabase` "an owner_version constraint violation is NOT mistaken…" | PASS_AUTOMATED + NOT_VERIFIED (hosted) |
| C9.7 | Hosted Supabase verification kiểm tra behavior thật | `scripts/verify-supabase.mjs` | `npm run verify:supabase` | NOT_VERIFIED (thiếu env ở máy này) |

### C.10 Concurrency và idempotency

| # | Requirement | Code path | Test / evidence | Trạng thái |
| --- | --- | --- | --- | --- |
| C10.1 | Hai create request collision | `app/api/rooms/route.ts:70-75` | `room-authz.test.ts` "picks another locator when the first one is already taken" | PASS_AUTOMATED — GAP-13 |
| C10.2 | Owner revoke xảy ra giữa guard và mutation | `lifecycle.ts:87`; `pin/route.ts:264` | `room-authz.test.ts` "scopes the PIN write to the authorized owner version" | PASS_AUTOMATED |
| C10.3 | Delete xảy ra giữa guard và save/upload | `save/route.ts:63, 76-82`; `pin/route.ts:265` | `room-authz.test.ts` "refuses a save for a room that was queued for deletion mid-request" | PASS_AUTOMATED — GAP-13 |
| C10.4 | Hai worker claim cùng room | `lifecycle.ts` `claimDeletionBatch` (lease trong predicate của UPDATE) | `lifecycle.test.ts` "refuses to let a second worker claim a room that is already leased" | PASS_AUTOMATED — GAP-1 |
| C10.5 | Hai once-per-room analytics event đồng thời | `004_…sql` unique index; `analytics/index.ts:47-51` | `idempotency.test.ts` "records room_expired once even if two cron runs claim the same room"; `verify:supabase` | PASS_AUTOMATED + NOT_VERIFIED (hosted) |
| C10.6 | Upload object thành công nhưng DB insert thất bại | `attachments/route.ts:132-141` | `room-authz.test.ts` "removes the stored object when the attachment row cannot be written" | PASS_AUTOMATED — GAP-13 |
| C10.7 | Retry request không tạo duplicate state | `attachments/[id]/route.ts:163-164`; `lifecycle.ts:300-317`; `analytics` unique index | `lifecycle.test.ts` §idempotency; `cleanup-route.test.ts` "running it twice" | PASS_AUTOMATED |

---

## D. Ngoài phạm vi (không kiểm thử, không hiện thực)

| Hạng mục | Phase sở hữu | Trạng thái |
| --- | --- | --- |
| Locator ≥128 bit, hash-at-rest, tách locator khỏi access grant | Technical Phase 2 | NOT_APPLICABLE |
| Configurable expiry, view/download limit, one-time redemption | Technical Phase 2 | NOT_APPLICABLE |
| Realtime authorization độc lập với locator | Technical Phase 2 | NOT_APPLICABLE |
| E2EE, ciphertext-only, key envelope | Technical Phase 3 | NOT_APPLICABLE |
| Workspace, account, participant identity, RBAC | Technical Phase 4 | NOT_APPLICABLE |
| General file upload, resumable upload, malware scanning | Technical Phase 4 | NOT_APPLICABLE |
| AI secret/PII detection, redaction, AI Gateway | Technical Phase 5 | NOT_APPLICABLE |
| Help-desk integration, webhook outbox, billing | Technical Phase 6 | NOT_APPLICABLE |
| Modularization theo vertical slice (`src/modules/…`) | Technical Phase 2 | NOT_APPLICABLE |
