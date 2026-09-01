# PLAN — ClipSync / Secure Support Evidence

> Ngày lập: 2026-09-01 · Trên nền baseline `main` @ `72f13ca` (tag `v0.2.0`)
> Quy trình branch: xem [CONTRIBUTING.md](./CONTRIBUTING.md)
> Thay thế định hướng cũ trong `docs/PRODUCT_ROADMAP.md` ở những điểm mâu thuẫn.

## 1. Bối cảnh quyết định (market review 09/2026)

Kết quả thẩm định lại thị trường ngày 2026-09-01:

- **Wedge cũ đã bị chiếm:** Birdie (birdie.so) đã có no-account secure link,
  auto-redaction (server-side), TTL retention, SOC 2, BYO storage và 12+
  help-desk integrations. Zendesk có AI PII redaction add-on; Intercom Fin
  Vision đọc screenshot ngay trong chat. Định vị "thu thập evidence tiện lợi"
  không còn khác biệt.
- **Wedge còn mở (chưa ai làm, đã kiểm tra):**
  1. **Client-side redaction trước upload** — mọi đối thủ redact sau khi dữ
     liệu đã rời máy khách; "zero-PII ingestion" là khác biệt kiến trúc thật.
  2. **Evidence integrity** — manifest + checksum + chain-of-custody cho bundle.
  3. **MSP packaging** — ConnectWise/HaloPSA/Atera/NinjaOne chưa bundle secure
     evidence collection; NIS2 (ramp đến 10/2026) và PDPL VN 91/2025 (hiệu lực
     01/2026, phạt tới 5% doanh thu) là tailwind compliance.
- **Gió ngược:** AI support agent đang hút evidence intake vào kênh chat.
  Đối sách: thiết kế API/webhook-first để ClipSync là *công cụ mà AI agent
  gọi* khi cần evidence có kiểm soát, không cạnh tranh kênh chat.

**Định vị chốt:** *Evidence integrity + zero-PII ingestion cho external IT
support (ưu tiên MSP)* — không phải "clipboard online", không phải "easy
screen capture".

## 2. Scope MVP (định nghĩa lại)

### Giữ (core MVP)

- Room không cần account cho recipient; owner capability; PIN; TTL/revoke
  (đã có ở baseline).
- Incident checklist theo template (3 loại: app crash, login, API integration).
- **Redaction preview client-side**: regex + entropy scan cho text/log trước
  upload; highlight + che có xác nhận; local-only. (OCR local cho ảnh: phase
  sau.)
- **Evidence manifest**: hash per file, timestamps, checksum bundle, redacted
  summary.
- Funnel analytics privacy-safe: created → joined → first evidence → completed
  (nền tảng đã có ở baseline).
- Một help-desk webhook duy nhất, chọn theo design partner.

### Cắt (không làm trong MVP — lý do)

| Bị cắt | Lý do |
|---|---|
| Screen recording | Birdie sở hữu; đầu tư ở đây là đối đầu trực diện vô ích |
| AI diagnosis / chat / copilot UI | AI agent các help-desk đã làm; ta là evidence layer |
| SSO, billing phức tạp, workspace đa cấp | Chưa có paid usage |
| CRDT / realtime sync nâng cao | Không phục vụ định vị mới |
| Native app, nhiều integrations | Sau paid recurring usage |
| E2EE room | Giá trị thật nhưng nặng (6–8 tuần); chỉ mở sau paid intent — Phase E |

## 3. Roadmap theo phase

> Ước lượng theo giờ solo-dev thực tế (~15–20 h/tuần). Mỗi phase có timebox;
> hết timebox chưa đạt DoD thì cắt scope, không kéo dài.

### Phase V — Validation sprint (tuần 1–2, song song Phase A, ~20 h, không code)

- 15 interview MSP/B2B support lead với pitch định vị mới; dùng
  `docs/discovery/INTERVIEW_GUIDE.md` (khôi phục từ legacy).
- 3–5 concierge pilot bằng app hiện tại (baseline đủ chạy).
- Hỏi thẳng paid intent ở mức 50–150 USD/team/tháng.
- **Exit:** ≥5 pilot, ≥2 paid intent/LOI, 1 workflow ≥20 lần/tháng/team.
- **Kill:** <5/15 đội có pain lặp lại → dừng feature build, quay lại
  portfolio-finish mode (release case study rồi freeze).

### Phase A — Quy trình + khôi phục WIP có chọn lọc (tuần 1–2, ~25 h)

| Feature branch | Nội dung | DoD |
|---|---|---|
| `feature/restore-discovery-docs` | Cherry-pick `docs/discovery`, `docs/qa` từ `legacy/2026-09-pilot-readiness-wip` | Docs trên `develop`, link từ README |
| `feature/pilot-hardening` | Review + cherry-pick phần lifecycle/reconcile/cron WIP từ legacy (bỏ phần chưa chín) | Typecheck/lint/test/build xanh; test mới pass; không còn diff "mồ côi" |
| `feature/save-queue` | Đánh giá save-queue WIP: hoàn thiện hoặc bỏ hẳn (quyết định trong 4 h đầu) | Hoặc merge với test đầy đủ, hoặc ghi "rejected" vào FREEZE_NOTES |
| (đã xong ở bootstrap) | CI workflow, CONTRIBUTING, PLAN | CI xanh trên `dev` |

Ưu tiên: cao — mở đường cho mọi phase sau. 

### Phase B — Wedge 1: Client-side redaction (tuần 3–5, ~35 h)

| Feature branch | Nội dung | DoD |
|---|---|---|
| `feature/redaction-engine` | Regex + entropy detector cho token/email/phone/key trong text & log, chạy hoàn toàn client | Eval set ≥100 mẫu (VI/EN), FP/FN được đo và ghi lại; 0 network call |
| `feature/redaction-preview-ui` | Preview highlight trước upload; người dùng xác nhận/che/override | Upload bị chặn cho tới khi preview được xác nhận; error/empty state đủ |
| `feature/redaction-eval-set` | Bộ dữ liệu golden FP/FN + test hồi quy | CI chạy eval; ngưỡng FP/FN ghi trong docs |

DoD phase: trong demo pilot, không secret nào trong eval set lọt lên server.
Ưu tiên: cao nhất về ROI — đây là khác biệt kiến trúc duy nhất đối thủ chưa có.

### Phase C — Wedge 2: Evidence integrity (tuần 5–7, ~30 h)

| Feature branch | Nội dung | DoD |
|---|---|---|
| `feature/evidence-manifest` | Manifest per room: file hash, timestamps, uploader role, checksum bundle | Manifest export JSON ký checksum; verify script |
| `feature/incident-checklists` | 3 checklist template + completeness detection | Recipient hoàn thành không cần trợ giúp ≥70% (đo qua funnel) |
| `feature/evidence-bundle-export` | Export bundle (files + manifest + redacted summary) | Bundle verify được bằng CLI một lệnh |

### Phase D — MSP integration + pilot chính thức (tuần 7–10, ~30 h)

| Feature branch | Nội dung | DoD |
|---|---|---|
| `feature/helpdesk-webhook` | Signed webhook + ticket reference cho **một** platform theo design partner | Design partner nhận event trong hệ thống thật |
| `feature/pilot-ops` | Pilot runbook, quota guard, alert cleanup/reconcile | Health check + alert chạy trong pilot thật |

**Gate cuối Phase D:** ≥5 pilot hoàn thành, ≥2 paid intent xác nhận lại, median
time-to-first-evidence <5 phút. Đạt → Phase E; không đạt → đóng case study.

### Phase E — E2EE room (6–8 tuần, CHỈ sau paid intent)

Giữ nguyên thiết kế trong `docs/PRODUCT_ROADMAP.md` (WebCrypto, per-file AEAD,
key trong URL fragment, independent security review trước khi quảng cáo E2EE).

## 4. CI/CD & branch protection

- **CI** (`.github/workflows/ci.yml`, đã có): typecheck → lint → test → build
  cho mọi push/PR vào `main`/`dev`.
- **CD:** Vercel preview cho PR; production deploy từ `main` (lưu ý Hobby plan
  chỉ cho non-commercial — pilot thương mại phải nâng plan hoặc chuyển hạ tầng,
  quyết định ở Phase D).
- **Branch protection (chờ phê duyệt để apply):**
  - `main`: require PR, require status check `verify`, block force-push,
    block deletion.
  - `develop`: require status check `verify`, block force-push.
  - Approval count 0 (solo) — nâng 1 khi có collaborator.

```bash
# Apply sau khi được phê duyệt:
gh api -X PUT repos/nekloyh/clip-sync/branches/main/protection \
  -F required_status_checks[strict]=true \
  -F "required_status_checks[contexts][]=verify" \
  -F enforce_admins=false \
  -F required_pull_request_reviews[required_approving_review_count]=0 \
  -F restrictions= -F allow_force_pushes=false -F allow_deletions=false
gh api -X PUT repos/nekloyh/clip-sync/branches/develop/protection \
  -F required_status_checks[strict]=true \
  -F "required_status_checks[contexts][]=verify" \
  -F enforce_admins=false -F restrictions= \
  -F allow_force_pushes=false -F allow_deletions=false
```

## 5. Chiến lược test tối thiểu

1. **Unit + integration (đã có 295 test, giữ xanh):** vitest + fake-supabase.
2. **Happy-path e2e (thêm ở Phase A/B):** Playwright cho luồng
   create room → join → checklist → redaction preview → upload → expire.
   Một luồng duy nhất, chạy trong CI.
3. **Redaction golden set (Phase B):** eval FP/FN chạy như test hồi quy.
4. **Luật bất biến:** không log content/PIN/filename nhạy cảm — đã có test
   room-authz/log; mọi PR chạm logging phải giữ các test này.

## 6. KPI sau ra mắt (pilot)

| Nhóm | KPI | Ngưỡng |
|---|---|---|
| Activation | Recipient hoàn thành checklist không cần trợ giúp | ≥70% |
| Speed | Median time-to-first-evidence | <5 phút |
| Outcome | Số vòng hỏi-lại per ticket giảm | ≥1 vòng so với baseline pilot |
| Demand | Pilot active / paid intent | ≥5 / ≥2 |
| Retention | Team dùng ≥20 handoff/tháng | ≥1 team |
| Safety | Sự cố PII/secret trong log hoặc lọt redaction | 0 |

## 7. Top rủi ro & giảm thiểu

| # | Rủi ro | Giảm thiểu |
|---|---|---|
| 1 | Birdie mở rộng sang file/log evidence | Không đấu về capture; giữ khác biệt kiến trúc (client-side redaction, integrity manifest) và kênh MSP |
| 2 | AI support agent hút evidence intake vào chat | API/webhook-first; định vị thành evidence tool cho agent gọi; theo dõi tích hợp trong Phase D |
| 3 | Không có pilot demand (Phase V fail) | Kill rule ngày 14: dừng build, đóng case study, không sunk-cost |
| 4 | Supabase Free giới hạn (1 GB storage, pause) | TTL/quota chặt đã có; ngưỡng chuyển paid tier ghi trong OPERATIONS; không hứa SLA ở pilot |
| 5 | Solo capacity / scope creep | Timebox mỗi phase; mọi feature ngoài PLAN phải thay thế một mục hiện có, không cộng thêm |

## 8. Nhật ký quyết định chuẩn hoá repo (2026-09-01)

- WIP uncommitted (29 file) đóng băng tại `legacy/2026-09-pilot-readiness-wip`
  (+ `FREEZE_NOTES.md`), đã push.
- Baseline `main` = `72f13ca` (develop cũ): typecheck + 295 test + lint +
  build đều xanh, verify ngày 2026-09-01. Tag `v0.2.0`.
- `develop` giữ vai trò branch integration (quyết định của owner 2026-09-01,
  thay cho phương án tạo branch `dev` mới); mô hình branch trong
  CONTRIBUTING.md. Branch `dev` tạm thời trong quá trình chuẩn hoá đã được xoá
  (không chứa commit riêng nào).
- Kickoff prompt + khuyến nghị model/effort cho từng phase: xem
  [KICKOFF.md](./KICKOFF.md).
