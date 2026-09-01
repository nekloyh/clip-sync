# FREEZE_NOTES — legacy/2026-09-pilot-readiness-wip

> Ngày đóng băng: 2026-09-01
> Lý do: chuẩn hoá repo theo quy trình doanh nghiệp (main = baseline ổn định,
> `dev` = integration, `feature/*` = phát triển). Mọi thay đổi dở dang được gom
> về branch này để không lẫn vào baseline; KHÔNG có commit/branch nào bị xoá.

## Những gì bị đóng băng ở đây

Snapshot toàn bộ working tree chưa commit tại thời điểm 2026-09-01, trên nền
`develop` @ `72f13ca`:

### 1. Feature đang viết dở (chưa hoàn thành, chưa review)

- `src/lib/save-queue.ts` + `src/lib/save-queue.test.ts` — hàng đợi lưu (save
  queue) cho TextEditor, mới viết một phần, chưa được nối hoàn chỉnh vào UI.
- `src/components/room/TextEditor.tsx` — refactor lớn (+140 dòng) đi kèm
  save-queue, phụ thuộc feature trên.

### 2. Hardening dở dang trên lifecycle/reconcile/cron

- `src/lib/lifecycle.ts`, `src/lib/reconcile.ts`, `src/lib/types.ts`
- `src/app/api/cron/cleanup/route.ts`, `src/app/api/cron/reconcile/route.ts`,
  `src/app/api/health/ops/route.ts`, `src/app/api/rooms/[slug]/pin/route.ts`
- Test đi kèm: `lifecycle.test.ts`, `reconcile.test.ts`,
  `src/test/cleanup-route.test.ts`, `src/test/health.test.ts`,
  `src/test/room-authz.test.ts`, `src/test/fake-supabase.ts`
- Trạng thái: chưa chạy qua một vòng verify đầy đủ, chưa có QA report tương ứng.

### 3. Tài liệu mới/chỉnh sửa chưa chốt

- `docs/ARCHITECTURE_ROADMAP.md` (mới), `docs/discovery/*` (mới),
  `docs/qa/*` (mới), cập nhật `docs/ANALYTICS.md`, `docs/OPERATIONS.md`,
  `docs/PRODUCT_ROADMAP.md`, `README.md`, `scripts/verify-supabase.mjs`.
- Lưu ý: bộ docs discovery/QA có giá trị sử dụng lại cao — ứng viên đầu tiên
  để cherry-pick về `dev` qua PR khi cần.

## Cách khôi phục có chọn lọc

```bash
# Xem lại toàn bộ WIP
git diff main...legacy/2026-09-pilot-readiness-wip

# Lấy lại một phần (ví dụ bộ docs discovery) vào feature branch mới
git switch -c feature/restore-discovery-docs develop
git checkout legacy/2026-09-pilot-readiness-wip -- docs/discovery docs/qa
```

## Quy tắc

- Branch này ở trạng thái read-only theo quy ước: không phát triển tiếp trên nó.
- Không xoá branch này; nó là backup duy nhất của phần WIP kể trên.

---

## Kết quả xử lý — Phase A, 2026-09-01

Phase A của [`PLAN.md`](https://github.com/nekloyh/clip-sync/blob/develop/PLAN.md)
§3 đã duyệt toàn bộ WIP đóng băng ở trên dưới định vị mới (*evidence integrity +
zero-PII ingestion cho MSP*). Ghi lại ở đây để branch này tự nói được số phận
của từng phần, thay vì phải đi đọc ba PR.

Branch vẫn read-only. Lần sửa này chỉ chạm đúng file `FREEZE_NOTES.md`, theo
đúng ngoại lệ duy nhất trong CONTRIBUTING.md và KICKOFF.md §1b.

### Đã lấy về `develop`

| Phần | Đi qua | Ghi chú |
| --- | --- | --- |
| `docs/discovery/*` | PR #3 | Viết lại theo định vị mới, không lấy nguyên trạng. `PHASE_0_EVIDENCE_TEMPLATE.md` đổi tên thành `PHASE_V_EVIDENCE.md` với ngưỡng gate mới |
| `docs/qa/*` | PR #3 | Giữ **nguyên văn** như bản ghi lịch sử, thêm banner. Phần phương pháp còn giá trị tách ra `docs/qa/README.md` |
| lifecycle / reconcile / cron / pin + test | PR #4 | GAP-1, 2, 3, 6, 7, 8, 9, 13. Có refactor thêm, xem PR |
| `docs/ANALYTICS.md`, `docs/OPERATIONS.md`, `scripts/verify-supabase.mjs` | PR #4 | GAP-10, GAP-11 và check retention function |
| `src/lib/save-queue.ts` (một nửa) | PR #5 | Chỉ phần hàng đợi một chỗ — xem mục "rejected" dưới đây |

### Rejected

**`flushPendingSave` + listener `pagehide` (GAP-4) — rejected.**

*Lý do.* Nó sửa một lỗi có thật: React chỉ chạy cleanup khi component unmount,
mà đóng tab thì không unmount gì cả, nên người dán một đoạn log rồi đóng tab
trong cửa sổ debounce 500ms mất đoạn đó, không một lời cảnh báo. Nhưng cách nó
sửa là **thêm một đường đẩy nội dung chưa được duyệt lên server**, đúng vào lúc
người dùng đã rời đi và không xác nhận được gì. Phase B (`PLAN.md` §3) tồn tại
để làm cho việc nội dung chưa che chạm tới server là **không thể**. Mở rộng bề
mặt ingestion chưa duyệt ngay trước khi đảo ngược nó là làm ngược hướng, và
Phase B sẽ phải xoá đi.

Trong thế giới sau Phase B, cách sửa đúng cho GAP-4 là **giữ bản nháp chưa xác
nhận ở local**, không phải upload nó. Đó là một quyết định thiết kế thuộc về
đường save đã có cổng redaction, không phải thứ nên đoán trước bây giờ.

*Hệ quả cần biết:* **GAP-4 chưa được sửa.** Lỗi mất dữ liệu vẫn còn trên
`develop`. Đường unmount được giữ nguyên như cũ, và comment ngay phía trên nó
trong `TextEditor.tsx` gọi tên lỗi và trỏ sang Phase B. Không có gì giả vờ rằng
nó đã được xử lý.

**Phần còn lại của refactor `TextEditor.tsx` (+140 dòng) — không lấy nguyên
trạng.** Chỉ lấy phần cần cho hàng đợi: `latestContentRef`, `sendSave` đã bỏ bộ
đếm seq, và retry gửi văn bản mới nhất. Phần còn lại gắn với `flushNow`/
`pagehide` nên đi cùng quyết định rejected ở trên.

**`docs/ARCHITECTURE_ROADMAP.md` — để lại trên branch này.**

*Lý do.* Nó lập kế hoạch cho một sản phẩm đã quyết định không xây: E2EE trước,
rồi workspace, billing, AI gateway. Thứ tự phase của nó mâu thuẫn trực diện với
`PLAN.md` §3 — nó xếp redaction ở **Phase 5, sau E2EE**, trong khi `PLAN.md` đặt
client-side redaction làm **Phase B, wedge số một**. Khôi phục nó là dựng lại
nguồn chân lý thứ hai trong repo.

Không vứt bỏ: khoảng 100 dòng còn giá trị (nguyên tắc code, quy tắc background
work, fitness function, nợ kiến trúc) đã được tách sang
`docs/ENGINEERING_INVARIANTS.md` trên `develop`. Phần đầu vào cho ADR E2EE
(§3, §8 ADR-004…006) vẫn nằm ở đây và **chỉ được lấy khi Phase E thực sự bắt
đầu** — lấy sớm là dựng lại đúng vấn đề vừa nói.

### Vẫn còn nguyên ở đây, chưa ai đụng tới

- `docs/ARCHITECTURE_ROADMAP.md` (nguyên văn).
- `flushPendingSave`, các test của nó, và bản `TextEditor.tsx` đầy đủ.

Branch này vẫn là backup duy nhất của những phần đó. Không xoá.
