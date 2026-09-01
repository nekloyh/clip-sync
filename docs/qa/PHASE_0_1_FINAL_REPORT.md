# Final report — QA và implementation Phase 0 / Phase 1

> Ngày: 2026-08-29. Nhánh `develop`, baseline `72f13ca`.
>
> Tài liệu liên quan: `PHASE_0_1_QA_PLAN.md` (phương pháp),
> `PHASE_0_1_BASELINE_REPORT.md` (nguyên trạng và findings),
> `PHASE_0_1_TRACEABILITY.md` (ma trận requirement → code → test → evidence).

## 1. Executive summary

**Kết luận: `TECHNICALLY_READY_BUT_WAITING_FOR_PHASE_0_BUSINESS_EVIDENCE`.**

Toàn bộ hạng mục kỹ thuật thuộc Phase 0 technical enablement và Phase 1 đã được
QA và, ở chỗ có gap, đã được hiện thực. Automated gate xanh: **330 test / 22
file**, typecheck, lint và production build đều pass. Không tìm thấy finding
Critical. Năm finding Major và bảy Minor đã được sửa, mỗi cái kèm regression
test.

Điều chặn kết luận `GO_TO_PHASE_2` **không** phải là chất lượng code. Là hai thứ
không tồn tại trong repository:

1. **Phase 0 business exit gate** — phỏng vấn, pilot, thanh toán/LOI. Chưa có dữ
   liệu nào. Artifact thu thập đã được chuẩn bị và để trống.
2. **Production evidence cho Phase 1** — hosted schema verification, shared
   limiter thật, scheduler thật, alert đã nối, drill trên môi trường QA cô lập,
   và sampling telemetry thật.

Cả hai đều là bằng chứng bên ngoài. Không có lượng test nào thay thế được chúng,
và tài liệu này cố ý không gọi chúng là PASS.

Điểm đáng chú ý nhất từ đợt review: **cả năm finding Major đều nằm ở hai vùng
không có người quan sát** — background worker và client-side durability. Đó là
hai chỗ mà lỗi không tạo ra lỗi 500, không xuất hiện trong log, và không ai báo
cáo: một lease không có tác dụng, một reconciler tự nhân bản dữ liệu của chính
nó, một retention policy không chạy nhưng vẫn báo thành công, và một đoạn văn bản
biến mất khi người dùng đóng tab.

## 2. Phase 0 — technical enablement

**Trạng thái: hoàn tất.**

| Hạng mục | Trạng thái | Ghi chú |
| --- | --- | --- |
| Tám event trong catalog được phát đúng thời điểm | PASS_AUTOMATED | Gồm cả `cleanup_failed` ở mức cả lần chạy, trước đây không có |
| Once-per-room idempotent ở database | NOT_VERIFIED | Cơ chế nằm ở partial unique index; chỉ hosted mới chứng minh được |
| Failure event không bị dedupe sai | PASS_AUTOMATED | |
| Funnel không đếm phòng bị bỏ rơi thành completed | PASS_AUTOMATED | `room_completed` chỉ ghi khi `actor !== 'system'` |
| Retention 180 ngày được thực thi | PASS_AUTOMATED (phát hiện lỗi) | Trước đây hỏng trong im lặng — xem GAP-3 |
| Không có dữ liệu bị cấm trong telemetry | PASS_AUTOMATED | Hai lớp: allowlist ứng dụng + bảng không có cột |
| Event dictionary ↔ catalog trong code đồng bộ | PASS_AUTOMATED | |
| Funnel SQL đủ bốn chỉ số bắt buộc | PASS_MANUAL | Bổ sung upload failure rate, completion rate, cleanup lag, cleanup failure |
| Artifact discovery | PASS_MANUAL | Ba file mẫu, không có dữ liệu giả |

## 3. Phase 0 — business exit gate

**Trạng thái: `WAITING_FOR_EXTERNAL_EVIDENCE`.**

| Điều kiện | Ngưỡng | Dữ liệu hiện có |
| --- | --- | --- |
| Đội có ≥20 handoff phù hợp/tháng | ≥10 trong 15 | **không có** |
| Đội đồng ý pilot | ≥5 | **không có** |
| Đội trả ≥100 USD/tháng hoặc LOI | ≥2 | **không có** |

Không có gì trong repository suy ra được ba con số này, và đợt QA này không tạo
ra dữ liệu thay thế. Artifact đã chuẩn bị để thu thập:

- `docs/discovery/INTERVIEW_GUIDE.md` — hỏi theo ticket thật, đo tần suất, loại
  evidence, thời gian, số lượt trao đổi, buyer/user/người duyệt chi, workaround,
  pain về bảo mật, WTP và lời đề nghị pilot cụ thể.
- `docs/discovery/PILOT_SCORECARD.md` — baseline trước pilot, usage lấy từ funnel
  privacy-safe, ma sát, sự cố, kết quả thương mại.
- `docs/discovery/PHASE_0_EVIDENCE_TEMPLATE.md` — bảng roll-up ba điều kiện, ghi
  rõ cái gì được tính là bằng chứng và cái gì không.

## 4. Phase 1

**Trạng thái: automated QA hoàn tất; production evidence chưa có.**

| Nhóm | Trạng thái | Còn thiếu |
| --- | --- | --- |
| Room creation và locator | PASS_AUTOMATED | — |
| Authorization (ma trận đầy đủ, revoke race, IDOR, legacy room) | PASS_AUTOMATED | — |
| PIN và rate limiting | PASS_AUTOMATED | Fault injection trên môi trường production-like |
| Deletion lifecycle | PASS_AUTOMATED | Deletion canary + storage failure drill trên hosted QA |
| Reconciliation | PASS_AUTOMATED | Chạy trên bucket thật |
| Health và operations | PASS_AUTOMATED | Alert chưa được xác nhận đã nối |
| Logging, monitoring, privacy | PASS_AUTOMATED | Sampling telemetry thật |
| Upload/save UX | PASS_AUTOMATED + PASS_MANUAL | Dây nối trong component không có DOM test |
| Migration và degraded mode | PASS_AUTOMATED | Hosted verification |
| Concurrency và idempotency | PASS_AUTOMATED | — |

## 5. Traceability summary

Chi tiết từng dòng ở `PHASE_0_1_TRACEABILITY.md`: **124 requirement** có nhãn,
phân loại theo nhãn *đứng đầu* của mỗi dòng.

| Nhãn | Số requirement |
| --- | ---: |
| PASS_AUTOMATED | 87 |
| PASS_MANUAL | 15 |
| PARTIAL (chấp nhận có chủ đích) | 1 |
| FAIL | **0** |
| NOT_VERIFIED | 3 |
| WAITING_FOR_EXTERNAL_EVIDENCE | 9 |
| NOT_APPLICABLE (Phase 2+) | 9 |

Tám dòng mang **nhãn kép** và được tính theo nhãn đầu tiên — hầu hết là
`PASS_AUTOMATED + NOT_VERIFIED (hosted)`: hành vi được pin bằng test tự động
*và* còn một khẳng định về database thật mà chỉ `verify:supabase` chứng minh
được. Đọc chúng như "đã PASS" là chính xác kiểu nhầm lẫn mà kế hoạch QA này được
viết ra để ngăn, nên chúng được liệt kê lại đầy đủ ở §10.

## 6. Findings đã sửa

### Major

**GAP-1 — Lease của deletion worker không có hiệu lực**
`src/lib/lifecycle.ts` `claimDeletionBatch`

Claim đặt `lifecycle_state = 'deleting'` nhưng không cập nhật
`deletion_requested_at`, và phép kiểm tra staleness chạy trong JavaScript chứ
không nằm trong predicate của `UPDATE`. Vì cron chạy hằng giờ, mọi phòng đều "cũ
hơn 10 phút" ngay tại thời điểm được claim, nên worker thứ hai luôn kết luận
worker thứ nhất đã chết và cướp phòng.

*Sửa:* `deletion_requested_at` trở thành đồng hồ lease — được ghi lại mỗi lần
claim — và claim tách thành hai câu `UPDATE`, mỗi câu mang predicate của mình
trong SQL (`lifecycle_state = 'deletion_pending'`, hoặc `lifecycle_state =
'deleting' AND deletion_requested_at < staleBefore`). Không cần migration. Thứ tự
FIFO giữ nguyên, và một phòng liên tục thất bại nay trôi về cuối hàng đợi thay vì
chặn các phòng phía sau.

*Test:* `lifecycle.test.ts` — "refuses to let a second worker claim a room that is
already leased", "renews the lease when it claims", "hands a room to exactly one
of two workers racing for it", cộng ba test claim cũ vẫn xanh.

---

**GAP-2 — Reconciliation tự nhân bản, và chỉ số alert bão hòa ở 20**
`src/lib/reconcile.ts`, `src/app/api/health/ops/route.ts`

Mỗi lần chạy chèn một finding mới cho cùng một drift, nên một object mồ côi trở
thành một dòng mỗi đêm. Đồng thời ops endpoint báo cáo độ dài trang (tối đa 20)
như tổng số finding đang mở. Alert "openFindings tăng đều" trong `OPERATIONS.md`
vì vậy vừa báo động giả vừa mù từ ngưỡng 20 trở lên.

*Sửa:* trước khi chèn, đối chiếu với các finding chưa `resolved_at` của đúng những
`room_ref` trong batch và bỏ trùng theo `(kind, room_ref, attachment_id)`; thêm
`countOpenFindings()` đếm bằng một truy vấn riêng và dùng nó cho cả ops endpoint
lẫn `ops_runs.pending_work` của job reconcile. Một lỗi đọc khi kiểm tra trùng dẫn
tới **không ghi gì**, chứ không dẫn tới ghi trùng.

*Test:* `reconcile.test.ts` — "does not record the same finding twice across
runs", "records a finding again once the old one has been resolved", "records
nothing rather than duplicating when it cannot read what is open", "counts every
open finding, not just the page an operator is shown"; `health.test.ts` —
"reports the true number of open findings, not the page size".

---

**GAP-3 — Retention của analytics hỏng trong im lặng**
`src/app/api/cron/cleanup/route.ts`

`pruneAnalytics()` gọi `supabase.rpc()` trong `try/catch`. PostgREST **trả về**
lỗi thay vì ném, nên `catch` không bao giờ chạy: một hàm bị thiếu, bị đổi tên hay
bị thu quyền tạo ra một lần chạy báo cáo thành công và một chính sách retention
không được áp dụng.

*Sửa:* kiểm tra `error` trả về và ghi `cleanup.analytics_prune_failed`. Vẫn
best-effort — housekeeping telemetry không được làm hỏng job xóa dữ liệu người
dùng. Thêm alert vào `OPERATIONS.md` §5, một query kiểm chứng độc lập vào
`ANALYTICS.md`, và một check hosted vào `verify:supabase`.

*Test:* `cleanup-route.test.ts` — "reports a prune failure instead of swallowing
it", "does not let a prune failure fail the run that deletes rooms".

---

**GAP-4 — Pending save không được flush khi đóng tab**
`src/components/room/TextEditor.tsx`

Việc flush nằm trong cleanup của một `useEffect`. React chỉ chạy cleanup khi
component unmount; đóng tab, tải lại trang hay đi tới origin khác không unmount
gì. Trường hợp duy nhất mà đoạn code đó được viết ra để bảo vệ — dán một đoạn log
rồi đóng tab — chính là trường hợp nó không xử lý, và tới 500ms gõ phím biến mất
không một lời.

*Sửa:* thêm listener `pagehide` (đường đáng tin cậy trên cả desktop và iOS
Safari) gọi cùng một hàm flush; giữ đường unmount cho điều hướng trong ứng dụng.
Việc dựng request được tách sang `flushPendingSave()` trong `src/lib/save-queue.ts`
để kiểm thử được mà không cần DOM.

*Test:* `save-queue.test.ts` — "sends what the debounce was still holding, with
keepalive", "sends an empty document, which is a real edit", "sends nothing when
there is nothing pending", "does not throw when the browser refuses the request
outright".

---

**GAP-5 — Retry save có thể ghi đè một chỉnh sửa mới hơn**
`src/components/room/TextEditor.tsx`, `src/lib/save-queue.ts`

Save được bắn ra ngay khi được tạo, không tuần tự hóa. Hai request chồng lấn có
thể đến sai thứ tự, và với last-write-wins trên toàn document thì cái đến sau
thắng. Retry làm điều đó thành thường xuyên: nó gửi văn bản **đã thất bại**, thứ
theo định nghĩa là cũ hơn văn bản người dùng đã gõ từ lúc đó. Bộ đếm
`saveSeq`/`appliedSeq` chỉ chặn việc *áp dụng* response cũ vào UI — nó không ngăn
một request body cũ ghi đè trong database.

*Sửa:* hai thay đổi, cả hai đều cần thiết. `createSaveQueue` đảm bảo tối đa một
request đang bay và gộp mọi văn bản đến sau vào một ô duy nhất, nên request kế
tiếp luôn mang bản mới nhất. Và retry gửi `latestContentRef` thay vì bản đã thất
bại — với một document last-write-wins, gửi bản mới nhất luôn đúng và không bao
giờ lùi.

*Test:* `save-queue.test.ts` — 8 test về thứ tự và gộp, gồm "never lets a second
request start while the first is in flight", "keeps only the newest text of
everything offered while busy", "never lets an older text land after a newer
one", "releases the queue so the next save is not wedged behind it".

### Minor

| Gap | File | Sửa | Test |
| --- | --- | --- | --- |
| GAP-6 — reconcile báo "success" sau khi không quét được gì | `reconcile.ts` | Ném lỗi khi listing gốc hoặc truy vấn attachment hỏng, để run được ghi là failure. Lỗi listing **theo từng phòng** vẫn tiếp tục bỏ qua — đó là hành vi đúng | `reconcile.test.ts` "fails the run when it could not scan at all" |
| GAP-7 — nâng cấp hash PIN legacy ghi vào phòng đang bị xóa | `pin/route.ts` | Thêm `.eq('lifecycle_state','active')` | `room-authz.test.ts` "scopes a legacy PIN upgrade to a room that is still active" |
| GAP-8 — object mồ côi sống sót qua chính lần xóa phòng | `lifecycle.ts` | Worker quét thư mục `<room_id>/` và xóa hợp của (path từ row) ∪ (object trong thư mục), phân trang tới khi hết | `lifecycle.test.ts` "removes an object no row points at any more", "keeps the room when it cannot even list what the room holds" |
| GAP-9 — một lần chạy cleanup đổ vỡ không có trong event catalog | `cron/cleanup/route.ts` | Phát `cleanup_failed` không kèm `room_ref` trong nhánh catch | `cleanup-route.test.ts` "records the failure in the operational row and in the funnel", "says nothing about the provider that broke" |
| GAP-10 — funnel SQL thiếu chỉ số | `ANALYTICS.md` §6 | Thêm upload failure rate (tách theo lý do), completion rate theo cohort tuần tạo phòng, cleanup lag, cleanup failure, và một query kiểm chứng retention | Đọc query |
| GAP-11 — `clientIdentity` gộp mọi người vào một bucket khi thiếu proxy header | `OPERATIONS.md` §4 | Ghi thành yêu cầu triển khai. **Cố ý không đổi code**: lùi về identity ngẫu nhiên là đổi một vấn đề vận hành lấy một lỗ brute-force | — |
| GAP-12 — chưa có artifact Phase 0 | `docs/discovery/` | Ba file mẫu | — |
| GAP-13 — thiếu test cho đường concurrency đã có code | `room-authz.test.ts` | Ba hành vi đúng-nhưng-không-được-pin nay đã có test | Xem §8 |

## 7. Findings chưa sửa

| # | Finding | Vì sao chưa sửa |
| --- | --- | --- |
| 1 | **Giới hạn 20 attachment không nguyên tử.** `attachments/route.ts` đếm rồi chèn, nên hai upload đồng thời có thể đưa phòng lên 21 ảnh | Không có tác động bảo mật, privacy hay retention: vượt đúng một đơn vị, và mọi ảnh vẫn bị xóa cùng phòng. Sửa đúng cần một ràng buộc ở database hoặc một reservation, tức là một migration cho một vấn đề thẩm mỹ. Đã ghi vào traceability là PARTIAL có chủ đích |
| 2 | **Upload có thể chèn row vào phòng vừa được xếp hàng xóa** (giữa guard và insert) | Cửa sổ đòi hỏi request upload phải bay xuyên qua toàn bộ khoảng thời gian từ trước lúc yêu cầu xóa tới lúc worker liệt kê attachment — ít nhất một chu kỳ cron, so với timeout upload 60 giây. Quan trọng hơn: GAP-8 đã làm hậu quả của nó biến mất, vì worker nay xóa cả thư mục |
| 3 | **`x-forwarded-for` bị tin ở hop đầu tiên** | Đúng trên Vercel và sau một proxy được cấu hình chuẩn. Sửa "đúng" cần biết topology của deployment, thứ chỉ người vận hành biết. Đã là yêu cầu triển khai trong runbook |
| 4 | **Modulo bias khi sinh slug** (`bytes[i] % 31`) | Mất khoảng 0,013 bit trên tổng ~48,8 bit. Không đáng một thay đổi ở đường sinh locator khi Technical Phase 2 sẽ thay toàn bộ locator bằng bản ≥128 bit |
| 5 | **Readiness không probe ba bảng của migration 004** | Thêm ba truy vấn vào mỗi lần poll để phát hiện một tình huống mà `verify:supabase` đã bao phủ. Quan trọng hơn: cho readiness fail vì analytics hỏng sẽ khiến orchestrator rút một instance vẫn phục vụ người dùng tốt |
| 6 | **Dây nối `pagehide` và lựa chọn văn bản khi retry không có automated test** | Repo không có DOM test environment, và thêm jsdom + testing-library cho hai dòng nối dây là một thay đổi lớn hơn chính bản sửa. Phần có bất biến thật đã được tách ra và test đầy đủ |

## 8. Automated verification

| Gate | Baseline | Sau implementation |
| --- | --- | --- |
| `npm test` | 295 test / 21 file | **330 test / 22 file**, 0 fail |
| `npm run typecheck` | pass | **pass** |
| `npm run lint` | pass | **pass** |
| `npm run build` | pass | **pass** (15 route) |
| `npm run verify:supabase` | SKIP | **SKIP — NOT_VERIFIED** |
| `git diff --check` | — | **clean** |
| Doc link check | — | **clean** (mọi link tương đối trong `docs/` và `README.md` phân giải được) |
| Lệnh trong tài liệu | — | **clean** (mọi `npm run …` được nhắc tới đều tồn tại trong `package.json`) |

35 test mới, phân bố:

| File | Trước | Sau | Thêm |
| --- | ---: | ---: | ---: |
| `src/test/room-authz.test.ts` | 40 | 46 | +6 |
| `src/lib/lifecycle.test.ts` | 25 | 30 | +5 |
| `src/test/health.test.ts` | 18 | 20 | +2 |
| `src/test/cleanup-route.test.ts` | 12 | 17 | +5 |
| `src/lib/reconcile.test.ts` | 11 | 16 | +5 |
| `src/lib/save-queue.test.ts` | — | 12 | +12 |

Test nhắm thẳng vào concurrency/idempotency (mục 10 của phạm vi QA):

| Kịch bản | Test |
| --- | --- |
| Hai create request collision | "picks another locator when the first one is already taken", "gives up rather than looping forever when every locator collides" |
| Owner revoke giữa guard và mutation | "scopes the PIN write to the authorized owner version" |
| Delete giữa guard và save | "refuses a save for a room that was queued for deletion mid-request" |
| Hai worker claim cùng room | "refuses to let a second worker claim a room that is already leased", "hands a room to exactly one of two workers racing for it" |
| Hai once-per-room event đồng thời | "records room_expired once even if two cron runs claim the same room" (+ hosted check) |
| Upload object OK nhưng DB insert hỏng | "removes the stored object when the attachment row cannot be written" |
| Retry không tạo state trùng | "running it twice" (3 test), "does not record the same finding twice across runs" |

## 9. Hosted / production evidence đã chạy

**Không có.**

Không có hosted QA environment nào được cấu hình trên máy này, nên không có drill
nào được chạy. Không có thao tác nào chạm tới production, không có cấu hình
production nào bị thay đổi, và không có deploy nào được thực hiện.

## 10. Check bị skip hoặc NOT_VERIFIED

| Check | Trạng thái | Lý do |
| --- | --- | --- |
| `npm run verify:supabase` | **NOT_VERIFIED** | `.env.local` không tồn tại. Script in `SKIP … Nothing was checked.` và **exit 0** — exit 0 ở đây nghĩa là không có gì được kiểm tra, không phải mọi thứ đúng |
| Partial unique index dedupe once-per-room event | NOT_VERIFIED | Cơ chế nằm ở database; unit test chỉ chứng minh sink trong bộ nhớ |
| Hàm `prune_analytics_events` tồn tại và gọi được | NOT_VERIFIED | Check hosted mới thêm, chưa chạy được |
| Hosted PostgREST diễn đạt lỗi thiếu cột như bản local | NOT_VERIFIED | Cùng lý do |
| Ba bảng của migration 004 tồn tại | NOT_VERIFIED | Cùng lý do |
| Xóa phòng không kéo theo funnel history | NOT_VERIFIED | Cùng lý do |
| Deletion canary, storage-failure drill, limiter outage drill | NOT_VERIFIED | Cần hosted QA cô lập; **không** chạy trên production |
| Sampling telemetry thật | NOT_VERIFIED | Cần traffic pilot |
| Alert đã nối theo `OPERATIONS.md` §5 | NOT_VERIFIED | Ngoài repository |
| p50/p95 latency, error rate, upload failure rate thực tế | NOT_VERIFIED | Cần traffic pilot |

## 11. External evidence cần bạn cung cấp

Theo thứ tự ưu tiên.

**Để đóng Phase 1:**

1. Một **hosted QA Supabase project cô lập** (không phải production) với
   `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `CLIPSYNC_AUTH_SECRET` — để chạy `npm run verify:supabase`. Đây là hạng mục
   mở khóa nhiều `NOT_VERIFIED` nhất trong một lệnh.
2. Xác nhận **migration 003 và 004 đã chạy** trên environment pilot.
3. **Upstash (hoặc REST-compatible) đã cấu hình** và
   `CLIPSYNC_REQUIRE_DISTRIBUTED_LIMITER=1` trên production; cộng một cửa sổ để
   chạy limiter outage drill trên QA.
4. Xác nhận **scheduler đang gọi** `/api/cron/cleanup` và `/api/cron/reconcile`
   — bằng chứng đơn giản nhất là output của
   `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/health/ops`
   cho thấy `jobs[cleanup].secondsSinceCompletion` hợp lý.
5. **Alert đã nối** theo `OPERATIONS.md` §5, gồm hai alert mới ở đợt này
   (`cleanup.analytics_prune_failed`, `jobs[reconcile].last_outcome = 'failure'`).
6. Một **cửa sổ chạy drill** trên QA: deletion canary, storage failure/retry,
   reconciliation trên bucket thật.
7. **Mẫu log/analytics thật** từ pilot để audit privacy trên dữ liệu thật chứ
   không phải trên test.

**Để đóng Phase 0:**

8. Kết quả **15–20 phỏng vấn** theo `docs/discovery/INTERVIEW_GUIDE.md`.
9. **3–5 pilot** đã chạy, mỗi cái một `PILOT_SCORECARD.md`.
10. **Bằng chứng thanh toán hoặc LOI** của ít nhất 2 đội, ở mức từ 100 USD/tháng.

## 12. Go/No-Go cho Phase 2

**Khuyến nghị: `TECHNICALLY_READY_BUT_WAITING_FOR_PHASE_0_BUSINESS_EVIDENCE`.**

Đối chiếu với chín điều kiện của `GO_TO_PHASE_2`:

| Điều kiện | Trạng thái |
| --- | --- |
| Phase 0 business exit gate có bằng chứng thật | ❌ chưa có dữ liệu |
| Phase 1 automated QA pass | ✅ 330/330 |
| Hosted QA schema verification pass | ❌ NOT_VERIFIED |
| Shared limiter production-like verification pass | ❌ NOT_VERIFIED |
| Cleanup/reconciliation drill pass | ❌ NOT_VERIFIED |
| Privacy audit pass | ⚠️ pass trên test đối kháng; chưa có sampling thật |
| Health/ops monitoring và alert được xác nhận | ❌ NOT_VERIFIED |
| Không còn Critical/Major chưa xử lý | ✅ |
| Không có check bắt buộc bị gọi PASS khi đã skip | ✅ |

**Không bắt đầu Phase 2.** Không phải vì code chưa sẵn sàng, mà vì Phase 2 —
Secure Access v2 và module boundary — là khoản đầu tư mà Phase 0 tồn tại để
quyết định có nên bỏ ra hay không. Bắt đầu nó trước khi có bằng chứng
willingness-to-pay là bỏ qua đúng cái cổng mà roadmap đã dựng lên, và
`PRODUCT_ROADMAP.md` §5 nói rõ hành động khi không đạt là **giữ ClipSync ở phạm
vi utility** chứ không phải hạ ngưỡng.

Việc nên làm tiếp, theo đúng thứ tự đó:

1. Cấp một hosted QA project và chạy `npm run verify:supabase` — rẻ nhất, đóng
   được nhiều `NOT_VERIFIED` nhất.
2. Chạy discovery. Đây là đường găng, và nó không phụ thuộc vào bất kỳ dòng code
   nào trong đợt này.
3. Nối alert và chạy drill trên QA khi có pilot đầu tiên.
4. Viết ADR-001 (module boundary) và ADR-002 (access/owner model) — được phép làm
   song song vì đó là thiết kế, không phải hiện thực.
