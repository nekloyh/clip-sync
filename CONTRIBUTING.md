# CONTRIBUTING — Quy trình branch & release

> Áp dụng từ 2026-09-01. Mọi thay đổi vào repo này phải đi theo mô hình dưới đây.

## Mô hình branch

```text
main ──────●───────────────●──────────►  (chỉ release ổn định, tag semver)
            \             ▲
             \    release PR
              \           │
develop ───────●──●──●──●─┴───────────►  (integration, luôn xanh CI)
                ▲  ▲  ▲
        PR + review (feature/*)
```

| Branch | Nguồn | Đích merge | Quy tắc |
|---|---|---|---|
| `main` | — | — | Chỉ nhận merge từ `develop` (release) hoặc `hotfix/*`. Luôn ở trạng thái chạy được, đã verify. Mỗi release có tag `vX.Y.Z`. Không commit trực tiếp, không force-push. |
| `develop` | `main` | `main` | Branch integration. Chỉ nhận merge từ `feature/*` qua PR. CI phải xanh trước khi merge. |
| `feature/<mô-tả>` | `develop` | `develop` | Một feature/fix một branch. Merge về `develop` qua PR + review + CI xanh. Xoá sau khi merge. |
| `hotfix/<mô-tả>` | `main` | `main` + `develop` | Chỉ cho lỗi khẩn trên production. Sau khi merge vào `main` phải back-merge vào `develop`. |
| `legacy/*` | — | — | Archive đóng băng (xem `FREEZE_NOTES.md` trên từng branch). Read-only, không phát triển tiếp, không xoá. |

## Quality gate (bắt buộc trước khi merge PR)

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

CI (`.github/workflows/ci.yml`) chạy đúng bốn bước trên cho mọi PR vào `develop`/`main`.

## Release

1. Mở PR `develop` → `main`, tiêu đề `release: vX.Y.Z`.
2. CI xanh + checklist release (changelog, migration notes nếu có).
3. Merge, tag `vX.Y.Z` trên `main`, push tag.

## Commit message

Theo conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`), như lịch sử hiện tại của repo.

## Solo-dev note

Khi chỉ có một người phát triển: PR vẫn bắt buộc (để CI gate + tự review diff), approval count = 0. Khi có collaborator, nâng lên 1 approval.
