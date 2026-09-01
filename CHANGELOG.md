# Changelog

Theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/) và
[semver](https://semver.org/lang/vi/). Mỗi release là một PR `develop` → `main`
theo [CONTRIBUTING.md](./CONTRIBUTING.md).

Bắt đầu ghi từ `v0.3.0`. Các release trước chỉ có tag, không có mục ở đây; lịch
sử của chúng nằm trong `git log`.

---

## [1.0.0] — 2026-09-01 — **FROZEN**

Phase P của [PLAN.md](./PLAN.md) §3: đưa ClipSync lên chạy thật, rồi **đóng băng**.

`1.0.0` không đánh dấu một bộ feature mới — feature đã đủ từ `0.3.0`. Nó đánh dấu
thời điểm phần mềm **thật sự chạy được trên hạ tầng thật**, việc mà `0.3.0` chưa
từng làm được: lần deploy production của nó fail, và không ai biết vì cả ba nguyên
nhân đều im lặng theo cách riêng.

Sau bản này repo ở trạng thái **FROZEN** — dùng cá nhân, chỉ sửa khi hỏng thực tế
hoặc có lỗi security. Điều kiện mở lại: xem banner [PLAN.md](./PLAN.md).

### Không cần migration cho ai đã chạy đủ 001–004

Không có file migration mới. Nhưng nếu project Supabase của bạn mới chạy tới `002`
— đúng tình trạng của deployment này trước bản release — thì **phải chạy `003` và
`004` trước khi deploy**. Cả hai đều additive và idempotent.

### Đã sửa

| | Sửa gì | Vì sao nó nghiêm trọng |
| --- | --- | --- |
| **Funnel** | `SupabaseAnalyticsSink` hỏi PostgREST `on conflict (room_ref, event_name) do nothing`, nhưng `uq_analytics_once_per_room` là **partial index**. Postgres không suy được conflict target từ partial index trừ khi câu lệnh lặp lại `where` predicate — điều supabase-js không diễn đạt được | Mọi write once-per-room fail `42P10`, và `track()` **cố tình** nuốt lỗi sink vào log để telemetry không làm hỏng request người dùng. Kết quả: **cả 5 stage của funnel ghi 0 row** trong khi deployment trông hoàn toàn khỏe mạnh. Nay insert thuần và coi `23505` là "stage đã ghi rồi" — chỉ cho once-per-room; duplicate trên event đếm được vẫn phải nổi lên |
| **Cron** | `vercel.json` khai báo cleanup mỗi giờ. Vercel Hobby chỉ cho cron theo ngày | Không phải cảnh báo — nó làm **fail cả deployment production**, trong khi preview vẫn xanh vì Vercel chỉ đăng ký cron cho production. Đây là lý do `v0.3.0` không bao giờ lên được production |
| **verify-supabase** | Script tái tạo đúng cái upsert hỏng ở trên, nên báo một database khỏe mạnh là hỏng. Và nó probe `prune_analytics_events` với cửa sổ 10.000 năm, đẩy `now() - make_interval(...)` về trước 4713 BC → `timestamp out of range` | Một script verify báo sai là tệ hơn không có script: nó dạy người ta bỏ qua kết quả của chính nó |

### Đã thêm

- Test đầu tiên cho `SupabaseAnalyticsSink`. Trước đó suite chỉ chạy
  `MemoryAnalyticsSink` — một bản reimplement luật dedup bằng JavaScript — nên
  **346 test xanh chưa từng chạm tới câu lệnh SQL thật**. Mock mới có `upsert`
  ném lỗi, để ai viết lại theo lối cũ sẽ đỏ ngay thay vì đỏ trong im lặng.
- `verify:supabase` thêm một check ghim rằng bản ghi lặp trả về đúng `23505` —
  mã lỗi mà sink giờ phụ thuộc vào.

### Ghi chú triển khai 1.0.0

- **Env bắt buộc, đủ 5:** `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `CLIPSYNC_AUTH_SECRET`, `CRON_SECRET`. Thiếu bất kỳ cái nào thì
  `GET /api/health` trả `503` và nói rõ subsystem nào hỏng — dùng nó thay cho đoán.
- **Env vars chỉ có hiệu lực ở deployment mới.** Thêm biến trên Vercel xong phải
  redeploy; deployment đang chạy giữ nguyên bộ biến nạp lúc nó được tạo.
- **Rate limiter:** `rateLimiter: not_configured` là **cảnh báo, không phải lỗi** —
  hợp lệ cho deployment một người. Chỉ set
  `CLIPSYNC_REQUIRE_DISTRIBUTED_LIMITER=1` khi đã thật sự có Upstash, nếu không
  `/api/health/ready` sẽ fail vĩnh viễn.
- **Cron chỉ chạy trên production.** Trên preview, phòng đã bấm xóa nằm ở
  `deletion_pending` cho tới khi gọi `/api/cron/cleanup` bằng tay.

---

## [0.3.0] — 2026-09-01

Phase A của [PLAN.md](./PLAN.md) §3: chuẩn hoá quy trình, khôi phục có chọn lọc
phần WIP đóng băng ở `legacy/2026-09-pilot-readiness-wip`, và viết lại bộ
discovery theo định vị mới — *evidence integrity + zero-PII ingestion cho MSP*.

Chủ đề chung của phần code: **mọi thứ được sửa ở đây đều là một thất bại tự báo
cáo là thành công.** Cleanup và reconcile là hai đường chạy không có người quan
sát, và cả năm finding Major của đợt QA 2026-08-29 nằm ở đó.

### Không cần migration

Không có thay đổi schema. `supabase/migrations/001…004` giữ nguyên. Xem
[Ghi chú triển khai](#ghi-chú-triển-khai-030) — có thay đổi **hành vi vận hành**
cần biết trước khi deploy, dù không phải chạy migration nào.

### Đã sửa

| | Sửa gì | Vì sao nó nghiêm trọng |
| --- | --- | --- |
| **GAP-1** | Lease của deletion worker không có hiệu lực. `deletion_requested_at` không được ghi lại khi claim, và phép kiểm tra staleness chạy trong JavaScript thay vì trong predicate của `UPDATE` | Cron chạy hằng giờ, nên một phòng xếp hàng lúc 10:00 và được nhìn thấy lúc 11:00 đã "quá hạn" ngay khi worker đầu tiên claim — worker thứ hai cướp phòng khỏi nó |
| **GAP-8** | Worker chỉ xóa object có attachment row trỏ tới. Nay quét cả thư mục `<room_id>/`, và quét **tới khi listing trả về rỗng** chứ không tới khi lệnh remove không báo lỗi | Upload ghi object trước, row sau. Nếu ghi row hỏng và lần xóa bù cũng hỏng, object đó **sống sót qua chính lần xóa phòng của nó**, vĩnh viễn. Storage còn báo xóa-một-phần bằng danh sách trả về chứ không bằng `error`, nên "remove không lỗi" không đồng nghĩa "thư mục đã rỗng" |
| **GAP-2** | Reconcile ghi lại cùng một drift mỗi đêm; `/api/health/ops` báo độ dài trang hiển thị (20) làm tổng số finding | Alert "findings tăng đều" vừa kêu vì reconciler tự nhân bản, vừa bão hòa ở 20 rồi mù hẳn |
| **GAP-3** | `pruneAnalytics` chỉ bọc `try/catch`. PostgREST **trả về** lỗi chứ không ném | Migration 004 chạy dở → mọi lần chạy báo thành công một chính sách retention 180 ngày chưa bao giờ được áp dụng. Đây là cam kết privacy với người mua |
| **GAP-6** | Reconcile báo `success` sau khi không quét được gì | "Không tìm thấy vấn đề" và "không nhìn được vào đâu" phải phân biệt được |
| **GAP-7** | Nâng cấp hash PIN legacy không giới hạn `lifecycle_state = 'active'` | Write duy nhất trong codebase không nói nó được phép chạm vào phòng nào |
| **GAP-9** | `cleanup_failed` chỉ phát theo từng phòng | Một lần chạy đổ vỡ trước khi chạm tới phòng nào để lại funnel nói rằng không có gì sai |
| **GAP-5** | Save được bắn ra ngay khi sinh ra, không tuần tự hoá | Server giữ write đến sau cùng, nên hai request chồng lấn có thể đến sai thứ tự và một văn bản **cũ hơn** âm thầm ghi đè văn bản mới hơn. Bộ đếm cũ chỉ chặn *response* cũ cập nhật UI, không chặn *body* cũ thắng trong database |
| — | Retry phát lại văn bản của người khác. Khi browser này nhận nội dung mới từ server, không có gì tháo ngòi retry — mà retry gửi "văn bản mới nhất nó biết", nay là của người kia | Handler `online` tự kích hoạt mà không ai chạm vào gì, đăng lại một bản đã bị ghi đè: lại là văn bản cũ đè lên văn bản mới, đến từ hướng khác |

Ba lỗi cuối trong danh sách trên do `/code-review` phát hiện **sau khi**
cherry-pick, và hai trong số đó do chính lần cherry-pick tạo ra — chi tiết trong
PR [#4](https://github.com/nekloyh/clip-sync/pull/4) và
[#5](https://github.com/nekloyh/clip-sync/pull/5).

### Đã thêm

- `docs/ENGINEERING_INVARIANTS.md` — ràng buộc kỹ thuật đúng ở mọi phase, kèm
  cột trạng thái trung thực cho từng bất biến (P1 zero-PII và P2 manifest ghi rõ
  **CHƯA ĐẠT**).
- `docs/discovery/` — kit Phase V viết lại theo định vị mới: câu hỏi phân biệt
  client-side vs server-side redaction, nghĩa vụ NIS2/PDPL, bậc thang cam kết
  sáu bậc, ngưỡng giá 50–150 USD/team/tháng.
- `docs/qa/README.md` — phương pháp QA hiện hành: mỗi kết luận mang loại bằng
  chứng của nó; một check bị skip không bao giờ là PASS.
- `src/lib/save-queue.ts`, `src/lib/unsent-edit.ts` — hàng đợi một chỗ và bất
  biến "resend mang văn bản mới nhất, và chỉ tồn tại khi browser này còn nợ".
- `src/test/reconcile-route.test.ts` — test mà GAP-6 yêu cầu và chưa từng có.
- Kiểm tra `prune_analytics_events` tồn tại và gọi được trong
  `npm run verify:supabase`.
- Query funnel còn thiếu trong `docs/ANALYTICS.md` §6: upload failure rate tách
  theo `error_code`, completion rate theo cohort tuần tạo phòng, và khoảng cách
  `room_completed → room_deleted`.

### Đã đổi

- `README.md` không còn mô tả sản phẩm là ứng dụng clipboard đa thiết bị. Có
  bảng chỉ mục tài liệu, và nói thẳng hai wedge **chưa có** trong bản này.
- `docs/PRODUCT_ROADMAP.md` được đánh dấu **tham khảo lịch sử**; ngưỡng và thứ
  tự phase trong đó không còn hiệu lực.
- `version` trong `package.json`: `0.1.0` → `0.3.0`. Nó đã lệch khỏi tag từ
  `v0.2.0`; release này đồng bộ lại.

### Không lấy về, có chủ đích

| Thứ bị bỏ | Lý do |
| --- | --- |
| `docs/ARCHITECTURE_ROADMAP.md` | Lập kế hoạch cho một sản phẩm đã quyết định không xây (E2EE trước, rồi workspace/billing/AI gateway). Thứ tự phase mâu thuẫn trực diện với `PLAN.md` §3 — nó xếp redaction ở Phase 5 sau E2EE, `PLAN.md` đặt redaction client-side làm Phase B. Nằm lại trên legacy; ~100 dòng còn giá trị đã tách sang `docs/ENGINEERING_INVARIANTS.md` |
| `flushPendingSave` + listener `pagehide` (**GAP-4**) | Sửa một lỗi có thật, nhưng bằng cách đẩy nội dung **chưa được duyệt** lên server đúng lúc người dùng đã rời đi và không xác nhận được gì — ngược với bất biến P1 mà Phase B đang xây. **GAP-4 vẫn chưa được sửa**; cách sửa đúng là giữ bản nháp ở local, và đó là quyết định thiết kế của Phase B |

Lý do đầy đủ: `FREEZE_NOTES.md` trên `legacy/2026-09-pilot-readiness-wip`.

### Đã biết, chưa sửa

- **GAP-4**: dán một đoạn log rồi đóng tab trong cửa sổ debounce 500 ms vẫn mất
  đoạn đó, không cảnh báo. Đường unmount giữ nguyên như trước; comment ngay trên
  nó trong `TextEditor.tsx` gọi tên lỗi và trỏ sang Phase B.
- Chưa có e2e happy-path (`PLAN.md` §5). Repo không có DOM test environment.
- Check **Vercel** đỏ trên mọi PR, và đã đỏ trên `develop` trước Phase A.
  `npm run build` xanh cả local lẫn CI, nên đây là vấn đề cấu hình môi trường.
  Check bắt buộc duy nhất là `verify`.

### Quality gate

`typecheck` · `lint` · **346 test / 24 file** (từ 295/21) · `build` — tất cả xanh.

### Ghi chú triển khai (0.3.0)

Không phải chạy migration, nhưng bốn thay đổi hành vi cần biết:

1. **`prune_analytics_events` phải tồn tại và gọi được.** Trước đây lỗi ở đây im
   lặng; nay nó ghi log `cleanup.analytics_prune_failed`. Nếu migration 004 chạy
   dở trên môi trường của bạn, alert này sẽ kêu — đó là nó làm đúng việc. Kiểm
   tra bằng `npm run verify:supabase`.
2. **`deletion_requested_at` nay vừa là thứ tự hàng đợi vừa là đồng hồ lease**,
   và bị ghi lại mỗi lần claim. Mốc thời gian yêu cầu xóa ban đầu **không** được
   giữ lại, nên tuổi của một dòng cụ thể không còn là chỉ số theo dõi được. Dùng
   `deletionQueue.pending`.
3. **`reconciliation.openFindings` nay là số đếm thật**, không còn bão hòa ở 20.
   Ngưỡng alert đặt theo hành vi cũ cần xem lại — con số này có thể nhảy lên khi
   deploy, và đó là giá trị đúng lần đầu tiên chứ không phải sự cố mới.
4. **Ba log event mới để nối alert** (`docs/OPERATIONS.md` §5):
   `cleanup.analytics_prune_failed`, `reconcile.count_failed`,
   `room.deletion_release_failed`.

Worker cleanup nay gọi `storage.list()` trên thư mục từng phòng. `service_role`
đã có quyền này; không cần đổi policy.

[0.3.0]: https://github.com/nekloyh/clip-sync/compare/v0.2.0...v0.3.0
