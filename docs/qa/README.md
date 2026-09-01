# QA — phương pháp hiện hành và bản ghi lịch sử

Thư mục này chứa hai thứ khác loại nhau, và trộn chúng là cách nhanh nhất để đọc
một bản ghi cũ như một lời khẳng định về hiện tại.

| Loại | File | Trạng thái |
| --- | --- | --- |
| **Phương pháp hiện hành** | phần §1–§3 của chính file này | Áp dụng cho mọi đợt QA từ nay |
| **Bản ghi lịch sử 2026-08-29** | `PHASE_0_1_QA_PLAN.md`, `PHASE_0_1_BASELINE_REPORT.md`, `PHASE_0_1_FINAL_REPORT.md`, `PHASE_0_1_TRACEABILITY.md` | Đóng băng, giữ nguyên văn |

Bốn file lịch sử mô tả đợt QA chạy trên working tree nay nằm ở
`legacy/2026-09-pilot-readiness-wip`, dưới định vị "secure support handoff". Định
vị hiện hành là *evidence integrity + zero-PII ingestion cho MSP*
([`../../PLAN.md`](../../PLAN.md) §1). Chúng **không** được cập nhật theo định vị
mới: giá trị của chúng nằm ở chỗ chúng ghi lại điều đã quan sát được vào một ngày
cụ thể, và một bản ghi bị sửa lại theo kết luận về sau thì không còn là bằng
chứng. Mỗi file mang một banner nói rõ điều này.

Findings `GAP-1` … `GAP-13` trong `PHASE_0_1_BASELINE_REPORT.md` §4 là nguồn gốc
của phần lớn diff `src/` trên branch legacy, và vì thế là provenance của
`feature/pilot-hardening`. Quyết định lấy hay bỏ từng GAP được ghi trong PR đó.

## 1. Quy tắc bất biến: mỗi kết luận mang loại bằng chứng của nó

Đây là phần đáng giữ nhất của đợt 2026-08-29 và nó độc lập với định vị. Rủi ro
nó chống lại: **đánh dấu hoàn tất bằng bằng chứng sai loại** — một unit test xanh
được đọc thành "cleanup chạy được trên production", một check bị skip được đọc
thành "schema đã đúng".

Mỗi requirement được QA mang đúng một nhãn:

| Nhãn | Nghĩa | Loại bằng chứng bắt buộc |
| --- | --- | --- |
| `PASS_AUTOMATED` | Hành vi được pin bởi test tự động đang chạy trong `npm test` | Tên test cụ thể |
| `PASS_MANUAL` | Được kiểm chứng bằng đọc code/chạy lệnh trong đợt review này | `file:line`, hoặc output lệnh |
| `PARTIAL` | Đúng ở phần lớn đường đi, còn một nhánh chưa được bảo vệ hoặc chưa đo | Nhánh còn hở |
| `FAIL` | Hành vi hiện tại sai so với requirement | Failure scenario |
| `NOT_VERIFIED` | Chưa chạy được ở môi trường này (thiếu env, thiếu hosted project) | Lý do skip |
| `WAITING_FOR_EXTERNAL_EVIDENCE` | Cần dữ liệu ngoài codebase (phỏng vấn, pilot, thanh toán, production telemetry) | Artifact đã chuẩn bị để thu thập |
| `NOT_APPLICABLE` | Thuộc phase sau | Phase sở hữu |

Ba quy tắc không được vi phạm:

1. **Unit test không bao giờ là production evidence.** Một test chứng minh code
   tự nhất quán với giả định của nó. Nó không chứng minh scheduler đang được gọi,
   Upstash đang được cấu hình, alert đã nối, hay PostgREST bản hosted diễn đạt
   lỗi giống bản local.
2. **Một check bị skip không bao giờ được ghi là PASS.** `npm run verify:supabase`
   tự thoát 0 khi thiếu environment; điều đó làm nó an toàn để đặt trong CI, và
   cũng làm nó trở thành cái bẫy dễ đọc nhầm nhất trong repo này. Exit 0 ở đó
   nghĩa là "không có gì được kiểm tra".
3. **Business gate không được suy ra từ code.** Không có dòng code nào chứng minh
   một đội có ≥20 handoff/tháng. Ngưỡng và cách đếm nằm ở
   [`../discovery/PHASE_V_EVIDENCE.md`](../discovery/PHASE_V_EVIDENCE.md).

## 2. Các lớp kiểm thử và cái mỗi lớp không trả lời được

| Lớp | Lệnh | Trả lời được | **Không** trả lời được |
| --- | --- | --- | --- |
| Automated | `npm test` | Logic, authorization ở mức route handler, privacy fence, idempotency, lifecycle | Bất cứ điều gì về môi trường thật |
| Static | `npm run typecheck`, `lint`, `build` | Kiểu, lint rule, cấu hình route segment của Next | Hành vi runtime |
| Hosted schema | `npm run verify:supabase` | Cột/index/function tồn tại trên project thật; partial unique index có dedupe thật không | Chỉ khi có `.env.local`; thiếu env là `NOT_VERIFIED`, không phải PASS |
| Production/pilot | — | Scheduler chạy thật, limiter chia sẻ thật, alert đã nối, telemetry thật sạch, p50/p95 | Không lớp nào ở trên thay được |

Quality gate bắt buộc trước khi merge (`../../CONTRIBUTING.md`):

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

## 3. Luật bất biến về log và telemetry

Ràng buộc cứng của repo, độc lập với phase (`PLAN.md` §5): **không log
content/PIN/filename/slug nhạy cảm.** Hai lớp bảo vệ và các test pin chúng:

| Lớp | Ở đâu | Test giữ nó |
| --- | --- | --- |
| Allowlist ứng dụng | `src/lib/log.ts`, `src/lib/analytics/catalog.ts` | `src/lib/log.test.ts`, `src/lib/analytics/catalog.test.ts` |
| Không có cột để chứa | `supabase/migrations/004_pilot_readiness.sql` | `catalog.test.ts` "has no column that could hold a locator, a filename or an address" |
| Authorization ở mức route | `src/lib/guard.ts` và các route handler | `src/test/room-authz.test.ts` |

Các test này là **đối kháng**: chúng chủ động truyền slug, PIN, cookie, filename
và content vào logger/analytics rồi chứng minh chúng bị loại. Mọi PR chạm vào
logging, analytics hoặc authorization phải giữ chúng xanh; xoá hoặc nới một
trong số chúng là một quyết định phải được nêu tường minh trong PR description.
