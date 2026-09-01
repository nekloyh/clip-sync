# QA plan — Product Phase 0 và Technical/Product Phase 1

> **BẢN GHI LỊCH SỬ — 2026-08-29. Không cập nhật theo định vị mới; xem [`README.md`](./README.md).**
>
> Tài liệu này mô tả đợt QA chạy ngày 2026-08-29 trên working tree nay được đóng
> băng ở `legacy/2026-09-pilot-readiness-wip`. Nó được giữ **nguyên văn** vì nó là
> bằng chứng cho các quyết định sau đó — sửa nó theo định vị hiện tại sẽ biến một
> bản ghi thành một bản tuyên bố. Ba lưu ý khi đọc:
>
> 1. **Định vị đã đổi.** Tài liệu viết cho wedge "secure support handoff"; định vị
>    hiện hành là *evidence integrity + zero-PII ingestion cho MSP*
>    ([`PLAN.md`](../../PLAN.md) §1). PLAN.md thắng khi mâu thuẫn.
> 2. **Tham chiếu `PRODUCT_ROADMAP.md` / `ARCHITECTURE_ROADMAP.md`** trỏ tới tài
>    liệu tham khảo lịch sử; `ARCHITECTURE_ROADMAP.md` nằm lại trên branch legacy
>    (phần bất biến kỹ thuật còn giá trị đã được tách ra
>    [`docs/ENGINEERING_INVARIANTS.md`](../ENGINEERING_INVARIANTS.md)).
> 3. **Ngưỡng business gate ở đây đã hết hiệu lực** (10/15 đội, ≥100 USD/tháng).
>    Ngưỡng hiện hành nằm ở [`../discovery/PHASE_V_EVIDENCE.md`](../discovery/PHASE_V_EVIDENCE.md).

> Phạm vi: Product Phase 0 (`PRODUCT_ROADMAP.md` §5 "Giai đoạn 0") và Phase 1
> (`PRODUCT_ROADMAP.md` §5 "Giai đoạn 1" + `ARCHITECTURE_ROADMAP.md` §7 "Phase 0"
> và "Phase 1").
>
> Ngoài phạm vi và **không** được kiểm thử hay hiện thực trong đợt này: Technical
> Phase 2 (Secure Access v2), Phase 3 (E2EE), workspace/participant identity,
> general file upload, AI và help-desk integration.

## 1. Tại sao tài liệu này tồn tại

Phase 1 gần như đã có đủ code. Rủi ro thật của nó không phải là thiếu tính năng
mà là **đánh dấu hoàn tất bằng bằng chứng sai loại**: unit test xanh được đọc
thành "cleanup chạy được trên production", một `verify:supabase` bị skip được đọc
thành "schema đã đúng". Kế hoạch này tồn tại để mỗi kết luận buộc phải kèm loại
bằng chứng tương ứng với lời khẳng định.

## 2. Bảng phân loại kết quả

Mỗi requirement trong `PHASE_0_1_TRACEABILITY.md` mang đúng một nhãn:

| Nhãn | Nghĩa | Loại bằng chứng bắt buộc |
| --- | --- | --- |
| `PASS_AUTOMATED` | Hành vi được pin bởi test tự động đang chạy trong `npm test` | Tên test cụ thể |
| `PASS_MANUAL` | Được kiểm chứng bằng đọc code/chạy lệnh trong đợt review này | File:line, hoặc output lệnh |
| `PARTIAL` | Đúng ở phần lớn đường đi, còn một nhánh chưa được bảo vệ hoặc chưa được đo | Nhánh còn hở |
| `FAIL` | Hành vi hiện tại sai so với requirement | Failure scenario |
| `NOT_VERIFIED` | Chưa chạy được ở môi trường này (thiếu env, thiếu hosted project) | Lý do skip |
| `WAITING_FOR_EXTERNAL_EVIDENCE` | Cần dữ liệu ngoài codebase (phỏng vấn, pilot, thanh toán, production telemetry) | Artifact đã chuẩn bị để thu thập |
| `NOT_APPLICABLE` | Thuộc phase sau | Phase sở hữu |

Ba quy tắc không được vi phạm:

1. **Unit test không bao giờ là production evidence.** Một test chứng minh code
   tự nhất quán với giả định của nó. Nó không chứng minh scheduler đang được gọi,
   Upstash đang được cấu hình, alert đã nối, hay PostgREST bản hosted diễn đạt
   lỗi giống bản local.
2. **Một check bị skip không bao giờ được ghi là PASS.** `verify:supabase` tự
   thoát 0 khi thiếu environment; điều đó làm nó an toàn để đặt trong CI, và
   cũng làm nó trở thành cái bẫy dễ đọc nhầm nhất trong repo này.
3. **Phase 0 business gate không được suy ra từ code.** Không có dòng code nào
   chứng minh 10/15 đội có ≥20 handoff/tháng.

## 3. Tách Phase 0 thành hai nửa

| Nửa | Ai làm được | Trạng thái mục tiêu của đợt này |
| --- | --- | --- |
| **Phase 0 technical enablement** — event catalog, funnel SQL, idempotency, retention, privacy fence, template thu thập dữ liệu | Codebase | Hoàn tất và có test |
| **Phase 0 business exit gate** — 15–20 phỏng vấn, ≥5 pilot, ≥2 cam kết trả tiền/LOI | Con người, ngoài repo | `WAITING_FOR_EXTERNAL_EVIDENCE` |

Việc nửa sau chưa có dữ liệu **không** chặn nửa đầu, và không chặn Phase 1.

## 4. Các lớp kiểm thử

### 4.1 Tự động (`npm test`)

Chạy trên mọi thay đổi. Bao phủ:

- Authorization matrix ở **mức route handler**, không phải mức helper — một
  handler quên gọi guard vẫn phải fail (`src/test/room-authz.test.ts`).
- Deletion lifecycle: chuyển trạng thái, thứ tự xóa, retry budget, idempotency
  khi chạy lại (`src/lib/lifecycle.test.ts`, `src/test/cleanup-route.test.ts`).
- Reconciliation hai chiều và tính report-only (`src/lib/reconcile.test.ts`).
- Rate limiter: chia sẻ ngân sách giữa nhiều instance, fail-closed cho PIN, nội
  dung key (`src/lib/limiter/limiter.test.ts`).
- Privacy fence **đối kháng**: test chủ động truyền slug, PIN, cookie, filename,
  content vào logger và analytics rồi chứng minh chúng bị loại
  (`src/lib/log.test.ts`, `src/lib/analytics/catalog.test.ts`).
- Degraded-mode classifier: phân biệt thiếu migration với vi phạm ràng buộc
  (`src/lib/schema-errors.test.ts`).

### 4.2 Static gate

`npm run typecheck`, `npm run lint`, `npm run build`. Build được tính là gate vì
nó là nơi duy nhất phát hiện lỗi cấu hình route segment của Next.

### 4.3 Hosted schema verification (`npm run verify:supabase`)

Chạy trên một Supabase project thật. Đây là lớp duy nhất trả lời được:

- Cột trong migration có đúng tên code đang select không.
- **Partial unique index có thật sự gộp một once-per-room event lặp lại thành
  một dòng không** — cơ chế idempotency thật của funnel nằm ở database, không ở
  ứng dụng.
- Hosted PostgREST diễn đạt lỗi thiếu cột giống hay khác bản local, và một vi
  phạm CHECK/NOT NULL có bị đọc nhầm thành "thiếu migration" không.
- Xóa phòng có kéo theo funnel history không (phải là **không**).

Script chỉ đọc, hoặc thao tác trên vài dòng rác do chính nó tạo rồi tự xóa.
Không có drill phá hoại nào được chạy trên production.

### 4.4 Production/pilot evidence (ngoài repo)

Không có lớp nào ở trên thay thế được:

- Scheduler thật đang gọi `/api/cron/cleanup` và `/api/cron/reconcile`.
- Upstash được cấu hình và `CLIPSYNC_REQUIRE_DISTRIBUTED_LIMITER=1`.
- Alert đã nối theo `OPERATIONS.md` §5.
- Deletion canary và storage-failure drill trên **isolated QA environment**.
- Sampling telemetry thật để chứng minh không có content/locator/token.
- p50/p95 latency, error rate, upload failure rate trên traffic pilot.

## 5. Môi trường

| Môi trường | Được phép làm gì |
| --- | --- |
| Local | Toàn bộ unit test, static gate, failure injection, dữ liệu test |
| Hosted QA (isolated) | `verify:supabase`, readiness, limiter outage drill, deletion canary, storage failure drill, reconciliation, privacy sampling |
| Production | Chỉ đọc: readiness, `/api/health/ops`. **Không** drill phá hoại, **không** thay đổi cấu hình |

## 6. Thứ tự thực thi của đợt này

1. **Giai đoạn A** — baseline read-only: chạy 5 lệnh, ghi nhận nguyên trạng, lập
   traceability. Không sửa code.
2. **Giai đoạn B/C** — QA Phase 0 và Phase 1 theo ma trận.
3. **Giai đoạn D** — gap report, xếp Critical → Major → Minor.
4. **Giai đoạn E** — implement theo thứ tự ưu tiên, mỗi fix kèm regression test.
5. **Giai đoạn F** — chạy lại toàn bộ gate, viết `PHASE_0_1_FINAL_REPORT.md`.

## 7. Điều kiện kết luận

`GO_TO_PHASE_2` chỉ được viết khi **tất cả** đạt:

- Phase 0 business exit gate có bằng chứng thật.
- Phase 1 automated QA pass.
- Hosted QA schema verification pass.
- Shared limiter được kiểm chứng ở môi trường production-like.
- Cleanup/reconciliation drill pass.
- Privacy audit trên telemetry thật pass.
- Health/ops monitoring và alert được xác nhận đã nối.
- Không còn finding Critical/Major chưa xử lý.

Nếu kỹ thuật đạt nhưng thiếu interview/pilot/LOI, kết luận bắt buộc là
`TECHNICALLY_READY_BUT_WAITING_FOR_PHASE_0_BUSINESS_EVIDENCE`.

## 8. Tài liệu liên quan

- `PHASE_0_1_TRACEABILITY.md` — requirement → code → test → evidence.
- `PHASE_0_1_BASELINE_REPORT.md` — nguyên trạng trước khi sửa.
- `PHASE_0_1_FINAL_REPORT.md` — kết quả sau khi sửa.
- `../discovery/` — artifact thu thập bằng chứng Phase 0 business gate.
