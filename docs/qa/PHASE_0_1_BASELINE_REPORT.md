# Baseline report — Phase 0 và Phase 1

> Ngày chạy: 2026-08-29. Nhánh `develop`, HEAD `72f13ca`.
>
> Đây là ảnh chụp **trước khi sửa bất kỳ dòng code nào**. Kết quả sau khi sửa nằm
> ở `PHASE_0_1_FINAL_REPORT.md`; ma trận đầy đủ nằm ở `PHASE_0_1_TRACEABILITY.md`.

## 1. Working tree khi bắt đầu

```
 M README.md
 M docs/PRODUCT_ROADMAP.md
?? docs/ARCHITECTURE_ROADMAP.md
```

Ba thay đổi này là của người dùng và **được giữ nguyên**; không có thay đổi nào
trong đợt QA này chạm vào nội dung có sẵn của chúng ngoài phần được ghi rõ ở
final report.

Không có `AGENTS.md` trong repository (commit `201d03c` đã ngừng theo dõi các
file hướng dẫn agent).

## 2. Kết quả baseline

| Lệnh | Kết quả | Ghi chú |
| --- | --- | --- |
| `npm test` | **PASS** — 21 file, 295 test, 0 fail | 1.49s |
| `npm run typecheck` | **PASS** | `tsc --noEmit`, exit 0 |
| `npm run lint` | **PASS** | "No ESLint warnings or errors" |
| `npm run build` | **PASS** | Next 14.2.35, 15 route, 4 static page |
| `npm run verify:supabase` | **NOT_VERIFIED** | `.env.local` không tồn tại. Script in `SKIP verify-supabase: … Nothing was checked.` và **exit 0**. |

> `verify:supabase` thoát 0 khi thiếu environment. Điều đó làm nó an toàn để đặt
> trong CI và cũng làm nó trở thành cái bẫy dễ đọc nhầm nhất trong repo: **exit 0
> ở đây nghĩa là "không có gì được kiểm tra", không phải "mọi thứ đúng"**. Nó
> được ghi là `NOT_VERIFIED` ở mọi nơi trong tài liệu này.

Phân bố test theo file:

| File | Số test | File | Số test |
| --- | ---: | --- | ---: |
| `src/test/room-authz.test.ts` | 40 | `src/lib/schema-errors.test.ts` | 14 |
| `src/lib/lifecycle.test.ts` | 25 | `src/test/cleanup-route.test.ts` | 12 |
| `src/lib/limiter/limiter.test.ts` | 23 | `src/lib/request-failure.test.ts` | 12 |
| `src/test/health.test.ts` | 18 | `src/lib/reconcile.test.ts` | 11 |
| `src/lib/cookie-budget.test.ts` | 18 | `src/lib/analytics/idempotency.test.ts` | 11 |
| `src/lib/rooms.test.ts` | 17 | `src/lib/images.test.ts` | 9 |
| `src/lib/log.test.ts` | 17 | `src/lib/slug.test.ts` | 8 |
| `src/lib/owner-auth.test.ts` | 16 | `src/lib/room-auth.test.ts` | 8 |
| `src/lib/analytics/catalog.test.ts` | 15 | `src/lib/crypto.test.ts` | 8 |
| `src/test/room-page.test.ts` | 5 | `src/lib/env.test.ts` | 5 |
| `src/lib/supabase/server.test.ts` | 3 | | |

## 3. Đánh giá tổng quan

Phase 1 **không phải** một phase mới bắt đầu. Gần như mọi capability được liệt kê
trong `PRODUCT_ROADMAP.md` §5 Giai đoạn 1 đã có trong code và phần lớn đã có test
ở đúng mức (route handler, không phải helper). Ba nhóm rủi ro còn lại, theo đúng
thứ tự nghiêm trọng:

1. **Background work.** Deletion worker và reconciler là hai đường chạy không có
   người quan sát, và đó cũng là hai chỗ còn defect thật: lease không có hiệu
   lực, finding bị nhân bản mỗi lần chạy, một lần scan hỏng vẫn được ghi là
   thành công, và retention analytics hỏng trong im lặng.
2. **Client-side durability.** Save đã có phân loại lỗi và nút thử lại, nhưng
   đường "đóng tab" và đường "retry sau khi có mạng" đều có thể mất hoặc lùi dữ
   liệu.
3. **Bằng chứng, không phải code.** Không có gì trong repository chứng minh
   scheduler đang chạy, Upstash đã cấu hình, alert đã nối, hay hosted PostgREST
   hành xử như bản local.

Không tìm thấy finding **Critical** nào: không có lỗ authorization, không có rò
rỉ dữ liệu nhạy cảm ra log/analytics/response, và không có đường nào để một người
lạ chiếm quyền owner hoặc đọc phòng có PIN.

## 4. Findings

Xếp theo Critical → Major → Minor. Mỗi finding có failure scenario, tác động,
fix nhỏ nhất có hiệu lực, và test cần thêm.

### Critical

Không có.

### Major

---

**GAP-1 — Lease của deletion worker không có hiệu lực; hai worker có thể claim cùng một phòng**

- **File:** `src/lib/lifecycle.ts:183-232` (`claimDeletionBatch`)
- **Failure scenario:** Owner xóa phòng lúc 10:00. Cron chạy lúc 11:00. Worker A
  claim phòng: `UPDATE … SET lifecycle_state = 'deleting'` — nhưng
  `deletion_requested_at` **không được cập nhật**, nên nó vẫn là 10:00. Worker B
  (một invocation chồng lấn, hoặc một lần `curl` thủ công) đọc phòng, thấy
  `lifecycle_state = 'deleting'` và `deletion_requested_at < now - 10 phút`, kết
  luận "worker trước đã chết", và claim lại. Điều kiện lọc staleness nằm trong
  JavaScript chứ không nằm trong predicate của `UPDATE`, nên câu `UPDATE` của B
  khớp và cả hai cùng xử lý một phòng.
- **Tác động:** `ARCHITECTURE_ROADMAP.md` §6 nêu "Worker claim bằng lease/
  visibility timeout" là nguyên tắc bắt buộc, và `OPERATIONS.md` §6 hứa "sau 10
  phút phòng được claim lại". Cả hai đều không đúng với code hiện tại. Hệ quả
  thực tế bị giới hạn vì `processRoomDeletion` idempotent — không mất dữ liệu —
  nhưng công việc storage bị nhân đôi và `deletion_attempts` bị đếm thiếu khi cả
  hai worker cùng thất bại (cả hai đọc `attempts = 0` rồi cùng ghi `1`), tức là
  retry budget lớn hơn con số được tài liệu hóa.
- **Fix nhỏ nhất:** đưa điều kiện staleness vào chính câu `UPDATE`, tách thành
  hai câu (claim `deletion_pending`; reclaim `deleting` đã quá hạn), và **làm mới
  `deletion_requested_at` khi claim** để nó trở thành "thời điểm phòng sẵn sàng
  cho worker" — vẫn giữ được thứ tự FIFO, và biến visibility timeout thành thứ
  thật. Không cần migration mới.
- **Test cần thêm:** một worker thứ hai bị từ chối khi lease còn sống dù request
  đã cũ; lease được làm mới khi claim; worker chết vẫn được phục hồi sau 10 phút.

---

**GAP-2 — Reconciliation ghi lại cùng một finding mỗi lần chạy, và số finding trên `/api/health/ops` bị chặn ở 20**

- **File:** `src/lib/reconcile.ts:128-133`; `src/app/api/health/ops/route.ts:52, 60`
- **Failure scenario:** Một object mồ côi tồn tại. Reconcile chạy hằng ngày và
  chèn một `reconciliation_findings` mới cho nó **mỗi ngày**, không bao giờ đối
  chiếu với finding đang mở. Sau ba tuần, một drift duy nhất trở thành 21 dòng.
  Đồng thời `/api/health/ops` gọi `openFindings(20)` rồi báo cáo
  `openFindings: findings.length`, nên con số bão hòa ở 20.
- **Tác động:** `OPERATIONS.md` §5 định nghĩa alert "Lệch DB/storage:
  `reconciliation.openFindings` tăng đều". Với code hiện tại, chỉ số này tăng đều
  vì **chính reconciler tự nhân bản**, rồi dừng ở 20 và không bao giờ tăng nữa.
  Alert vừa báo động giả vừa mù ở đúng ngưỡng nó cần nhìn thấy.
- **Fix nhỏ nhất:** trước khi chèn, đọc các finding đang mở của đúng những
  `room_ref` trong batch và bỏ những cái trùng `(kind, room_ref, attachment_id)`;
  và đếm finding đang mở bằng một truy vấn `count` riêng thay vì `length` của
  trang đầu tiên.
- **Test cần thêm:** chạy reconcile hai lần trên cùng một drift → đúng một
  finding; ops endpoint báo cáo tổng thật khi có nhiều hơn một trang.

---

**GAP-3 — Retention của analytics hỏng trong im lặng**

- **File:** `src/app/api/cron/cleanup/route.ts:168-181`
- **Failure scenario:** `pruneAnalytics()` gọi `supabase.rpc(...)` trong một khối
  `try/catch`. PostgREST **trả về** `{ error }` thay vì ném, nên `catch` không
  bao giờ chạy. Nếu hàm `prune_analytics_events` không tồn tại (migration 004
  chạy dở), bị đổi tên, hoặc bị từ chối quyền, mọi lần chạy vẫn báo cáo thành
  công và không có dòng log nào.
- **Tác động:** `ANALYTICS.md` §4 tuyên bố retention 180 ngày được thực thi. Đây
  là một cam kết privacy với người mua; hỏng trong im lặng nghĩa là dữ liệu funnel
  tích lũy vô thời hạn mà không ai biết.
- **Fix nhỏ nhất:** kiểm tra `error` trả về và ghi `cleanup.analytics_prune_failed`.
- **Test cần thêm:** một `rpc` trả lỗi phải sinh ra log warn và **không** làm
  hỏng lần chạy cleanup.

---

**GAP-4 — Pending save không được flush khi người dùng đóng tab**

- **File:** `src/components/room/TextEditor.tsx:275-294`
- **Failure scenario:** Việc flush nằm trong hàm cleanup của một `useEffect`.
  React chỉ chạy cleanup khi component **unmount** — tức là khi điều hướng trong
  ứng dụng. Đóng tab, tải lại trang, hoặc đi tới một origin khác **không** unmount
  gì cả. Người dùng dán một đoạn log rồi đóng tab trong vòng 500ms (cửa sổ
  debounce) sẽ mất đoạn vừa dán, không có cảnh báo.
- **Tác động:** Đây là đúng thao tác mà sản phẩm được thiết kế cho: dán rồi rời
  đi. Comment trong code khẳng định đường này đã được xử lý ("`keepalive` là thứ
  cho phép request sống lâu hơn trang"), nên nó cũng là một lỗi mà người đọc code
  sẽ không đi tìm.
- **Fix nhỏ nhất:** thêm listener `pagehide` (đường đáng tin cậy duy nhất trên cả
  desktop và iOS Safari) gọi cùng một hàm flush, và giữ nguyên đường unmount.
- **Test cần thêm:** phát `pagehide` khi có nội dung đang chờ → đúng một request
  `keepalive` được gửi với nội dung đó.

---

**GAP-5 — Retry save có thể ghi đè một chỉnh sửa mới hơn**

- **File:** `src/components/room/TextEditor.tsx:174-243, 341-355`
- **Failure scenario:** Save văn bản A thất bại; `failedContentRef` giữ A. Người
  dùng gõ tiếp thành B, `scheduleSave(B)` đặt hẹn 500ms. Ngay lúc đó sự kiện
  `online` kích hoạt `retrySave()`, gửi **A**. 500ms sau, B được gửi. Hai request
  bay đồng thời và server ghi theo thứ tự đến; nếu A đến sau, A ghi đè B. Bộ đếm
  `saveSeqRef`/`appliedSeqRef` chỉ chặn việc *áp dụng* response cũ vào UI — nó
  không ngăn một *request body* cũ ghi đè trong database. Cùng cửa sổ đó tồn tại
  ngay cả khi không có retry: `performSave` không tuần tự hóa, nên hai save chồng
  lấn luôn có thể đến sai thứ tự.
- **Tác động:** mất dữ liệu người dùng vừa gõ, âm thầm. Đây là requirement được
  nêu tường minh cho Phase 1.
- **Fix nhỏ nhất:** tuần tự hóa save — chỉ một request bay tại một thời điểm, văn
  bản mới nhất được gộp vào hàng đợi một-phần-tử; và cho retry gửi **văn bản mới
  nhất** thay vì văn bản đã thất bại (nội dung là last-write-wins trên toàn
  document, nên gửi bản mới nhất luôn đúng và không bao giờ lùi).
- **Test cần thêm:** hai save chồng lấn → gửi theo đúng thứ tự, không bao giờ
  song song; retry sau khi đã gõ thêm → gửi văn bản mới, không gửi văn bản cũ.

---

### Minor

---

**GAP-6 — Reconcile báo cáo "success" sau khi không quét được gì**

- **File:** `src/lib/reconcile.ts:57-59, 90-94`
- **Failure scenario:** `storage.list('')` và `from('attachments').select(...)`
  đều bỏ qua trường `error`. Khi Storage gặp sự cố, `folders` là `null`,
  `roomIds` rỗng, và job ghi `ops_runs.last_outcome = 'success'` với 0 finding —
  không phân biệt được với "mọi thứ đều sạch".
- **Tác động:** che mất sự cố ở đúng lúc có nhiều thứ để tìm nhất.
- **Fix nhỏ nhất:** ném lỗi khi listing gốc hoặc truy vấn attachment thất bại, để
  route ghi `outcome: 'failure'`. Lỗi listing **theo từng phòng** vẫn phải tiếp
  tục bỏ qua như hiện tại — đó là hành vi đúng, vì "không list được" không phải
  bằng chứng "object không tồn tại".
- **Test cần thêm:** listing gốc hỏng → `reconcile` ném, run được ghi là failure.

---

**GAP-7 — Nâng cấp hash PIN legacy ghi vào phòng đang bị xóa**

- **File:** `src/app/api/rooms/[slug]/pin/route.ts:166-177`
- **Failure scenario:** `UPDATE rooms SET pin_hash = … WHERE id = …` không kèm
  `lifecycle_state = 'active'`, khác với mọi mutation khác trong codebase. Một
  phòng được xếp hàng xóa giữa `getRoom` và câu update này vẫn bị ghi.
- **Tác động:** rất nhỏ (phòng sẽ bị xóa ngay sau đó), nhưng nó là ngoại lệ duy
  nhất của một quy tắc mà phần còn lại của codebase áp dụng nhất quán, và ngoại
  lệ chính là thứ được sao chép khi có endpoint thứ tư.
- **Fix nhỏ nhất:** thêm `.eq('lifecycle_state', 'active')`.
- **Test cần thêm:** không cần test riêng; được bao bởi assertion filter hiện có
  nếu mở rộng.

---

**GAP-8 — Worker chỉ xóa object có row trỏ tới, nên object mồ côi của phòng sống sót qua chính lần xóa phòng đó**

- **File:** `src/lib/lifecycle.ts:271-284`; `src/app/api/rooms/[slug]/attachments/route.ts:118-141`
- **Failure scenario:** Upload ghi object **trước**, ghi row **sau**. Nếu row
  không ghi được, handler cố xóa object bù lại (`route.ts:134`) — và nếu lần xóa
  bù đó cũng thất bại, object nằm lại dưới `<room_id>/` mà không có row nào trỏ
  tới. Khi phòng bị xóa, worker chỉ xóa những path đọc từ bảng `attachments`, nên
  object đó **sống sót qua việc xóa phòng**, vĩnh viễn. Cùng cơ chế áp dụng cho
  một upload chen vào giữa lúc worker đã đọc danh sách attachment và lúc nó xóa
  row phòng (cửa sổ rất hẹp).
- **Tác động:** dữ liệu khách hàng tồn tại sau khi phòng đã "bị xóa", trong một
  sản phẩm mà lời hứa chính là dữ liệu biến mất. Reconciler phát hiện được nhưng
  **không** tự xóa, theo đúng thiết kế.
- **Fix nhỏ nhất:** worker liệt kê thư mục `<room_id>/` trong storage và xóa hợp
  của (path từ row) ∪ (object trong thư mục). Việc này chỉ đúng hơn chứ không rủi
  ro hơn: mọi thứ dưới tiền tố `<room_id>/` theo định nghĩa đều thuộc phòng đó.
- **Test cần thêm:** một object không có row nằm trong thư mục của phòng vẫn bị
  xóa khi phòng bị xóa.

---

**GAP-9 — Một lần chạy cleanup thất bại toàn cục không xuất hiện trong event catalog**

- **File:** `src/app/api/cron/cleanup/route.ts:150-165` so với `src/lib/analytics/catalog.ts:52`
- **Failure scenario:** `cleanup_failed` được định nghĩa là "một lần dọn dẹp thất
  bại" và chỉ được phát từ `processRoomDeletion` (thất bại theo từng phòng). Khi
  cả lần chạy đổ vỡ — ví dụ `queueExpiredRooms` ném vì thiếu migration — không có
  event nào được ghi; chỉ có `ops_runs` và log.
- **Tác động:** funnel không đếm được dạng thất bại nghiêm trọng nhất của
  cleanup.
- **Fix nhỏ nhất:** phát `cleanup_failed` (actor `system`, không có `room_ref`)
  trong nhánh catch của route.
- **Test cần thêm:** một lần chạy đổ vỡ ghi đúng một `cleanup_failed`.

---

**GAP-10 — Funnel SQL thiếu hai chỉ số bắt buộc**

- **File:** `docs/ANALYTICS.md` §6
- **Thiếu:** upload failure rate và completion rate. Cả hai đều nằm trong điều
  kiện hoàn thành của Phase 1 ("Đo được funnel từ tạo phòng đến handoff thành
  công") và trong metrics của `PRODUCT_ROADMAP.md` §8.
- **Fix nhỏ nhất:** bổ sung hai query, cộng một query đo khoảng cách
  `room_completed → room_deleted` (chính là backlog của cleanup, thứ mà
  `ANALYTICS.md` §2 nói milestone này sinh ra để đo).

---

**GAP-11 — `clientIdentity` gộp mọi người vào một bucket khi không có proxy header**

- **File:** `src/lib/limiter/index.ts:166-170`
- **Failure scenario:** Không có `x-forwarded-for` và `x-real-ip` (self-host sau
  một proxy không cấu hình các header đó), mọi request chia sẻ identity
  `'unknown'`. Với `pin_verify` (10 lần / 10 phút / client), toàn bộ người dùng
  của deployment chia nhau 10 lần thử PIN mỗi 10 phút.
- **Tác động:** availability, không phải bảo mật — hướng lệch là *chặt hơn*.
  Trên Vercel không xảy ra vì `x-forwarded-for` luôn có.
- **Fix nhỏ nhất:** ghi vào runbook như một điều kiện triển khai bắt buộc, không
  đổi code. Đổi code (ví dụ lùi về một identity ngẫu nhiên) sẽ biến một giới hạn
  quá chặt thành *không có* giới hạn, tức là đổi một vấn đề vận hành lấy một lỗ
  brute-force.

---

**GAP-12 — Chưa có artifact thu thập bằng chứng Phase 0**

- **Thiếu:** `docs/discovery/INTERVIEW_GUIDE.md`, `PILOT_SCORECARD.md`,
  `PHASE_0_EVIDENCE_TEMPLATE.md`.
- **Tác động:** Phase 0 business gate không thể được thu thập một cách nhất quán,
  và không có nơi nào để đặt bằng chứng khi nó xuất hiện.

---

**GAP-13 — Thiếu test cho các đường concurrency đã có code**

Các hành vi dưới đây **đã được hiện thực đúng** nhưng không có test nào pin lại,
nên một refactor có thể phá chúng trong im lặng:

| Hành vi | Code đã có tại |
| --- | --- |
| `POST /api/rooms` thử locator khác khi va chạm | `app/api/rooms/route.ts:70-75` |
| Object đã lưu bị dọn khi ghi row attachment thất bại | `attachments/route.ts:132-141` |
| Save bị từ chối khi phòng đã được xếp hàng xóa giữa guard và write | `save/route.ts:63, 76-82` |

---

## 5. Những gì baseline **không** chứng minh được

Ghi rõ để không bị đọc thành PASS:

| Hạng mục | Vì sao chưa có bằng chứng |
| --- | --- |
| Schema hosted khớp với code | `verify:supabase` bị SKIP — thiếu `.env.local` |
| Partial unique index thật sự dedupe | Chỉ hosted mới chứng minh được; unit test chỉ chứng minh sink trong bộ nhớ |
| Hosted PostgREST diễn đạt lỗi giống bản local | Cùng lý do |
| Scheduler đang gọi hai cron endpoint | Không quan sát được từ repository |
| Upstash đã cấu hình và fail-closed hoạt động thật | Cần fault injection trên môi trường production-like |
| Alert đã nối theo `OPERATIONS.md` §5 | Ngoài repository |
| Không có content/locator/token trong telemetry thật | Cần sampling trên pilot |
| p50/p95 latency, error rate, upload failure rate | Cần traffic pilot |
| Phase 0 business gate (phỏng vấn, pilot, LOI) | Ngoài repository, theo định nghĩa |

## 6. Kế hoạch implementation rút ra từ baseline

Theo thứ tự bắt buộc của Giai đoạn E:

1. **Critical security/privacy/correctness** — không có.
2. **Major production-readiness** — GAP-1, GAP-2, GAP-3, GAP-4, GAP-5.
3. **Missing automated QA có giá trị** — GAP-13, cộng regression test cho mọi fix
   ở trên.
4. **Documentation/runbook drift** — GAP-10, GAP-11, GAP-12, và cập nhật
   `OPERATIONS.md` cho hành vi lease mới.
5. **Minor còn lại ảnh hưởng trực tiếp exit gate** — GAP-6, GAP-7, GAP-8, GAP-9.

Không hạng mục nào trong danh sách trên chạm vào Phase 2 trở đi: không
modularization diện rộng, không đổi locator, không thêm access grant, không thêm
dependency, và không thay message broker cho hàng đợi Postgres.
