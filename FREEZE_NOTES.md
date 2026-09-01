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
git switch -c feature/restore-discovery-docs dev
git checkout legacy/2026-09-pilot-readiness-wip -- docs/discovery docs/qa
```

## Quy tắc

- Branch này ở trạng thái read-only theo quy ước: không phát triển tiếp trên nó.
- Không xoá branch này; nó là backup duy nhất của phần WIP kể trên.
