# KICKOFF — Prompt & cấu hình session để thực thi PLAN.md

> Cặp tài liệu: [PLAN.md](./PLAN.md) (làm gì, thứ tự nào) · [CONTRIBUTING.md](./CONTRIBUTING.md)
> (quy trình branch). File này trả lời: **mở session Claude Code như thế nào, model/effort
> nào, paste prompt gì** để bắt đầu và duy trì guồng làm việc.

## 1. Chọn model & effort theo loại việc

| Loại việc | Model (`/model`) | Effort | Lý do |
|---|---|---|---|
| Phase A/B/C/D — code, refactor, test, tích hợp | **Claude Opus 5** (`claude-opus-5`) | `xhigh` (mặc định Claude Code) | Sweet spot coding/agentic; $5/$25 per MTok |
| Thiết kế security-critical: threat model redaction engine (Phase B), thiết kế E2EE (Phase E), security review trước release | **Claude Fable 5** (`claude-fable-5`) hoặc Opus 5 | `xhigh`–`max` | Đúng chỗ đáng trả thêm tiền ($10/$50); dùng cho *thiết kế + review*, không cần cho code thường |
| Việc routine: docs, config, fix nhỏ, viết interview kit Phase V | **Claude Sonnet 5** (`claude-sonnet-5`) | `high` | Rẻ hơn ~2.5× ($2/$10), đủ chất lượng cho việc đã rõ scope |
| Review PR trước merge | model đang dùng | — | Chạy `/code-review` trên branch trước khi mở PR |

Quy tắc chung: **một feature branch = một session**, bắt đầu từ `develop` mới pull,
kết thúc bằng PR + CI xanh. Không để session "tiện tay" làm lan sang feature khác.

## 1b. Mandate: quyền đập bỏ di sản

Repo này mang theo di sản của định vị cũ ("clipboard đa thiết bị" → "secure support
handoff" phiên bản 08/2026). Nghiên cứu thị trường 09/2026 (PLAN.md §1) đã thay định vị
bằng **evidence integrity + zero-PII ingestion cho MSP**. Vì vậy mọi session thực thi:

- **Được quyền** xoá, viết lại hoặc thay thế code/docs/kiến trúc cũ khi chúng phục vụ
  định vị cũ hoặc có giải pháp tốt hơn ở hiện tại — kể cả nội dung trong
  `docs/PRODUCT_ROADMAP.md`, `docs/ARCHITECTURE_ROADMAP.md` và WIP đóng băng.
  Các tài liệu đó là **tham khảo lịch sử, không phải ràng buộc**; PLAN.md thắng khi
  mâu thuẫn, và chính PLAN.md cũng được thách thức nếu có bằng chứng mới hơn.
- **Phải giữ** bốn rào an toàn (không thương lượng): (1) mọi thay đổi qua feature
  branch + PR + CI xanh; (2) branch `legacy/*` là backup — không xoá, không sửa (trừ
  FREEZE_NOTES.md); (3) các bất biến bảo mật: không log content/PIN/filename nhạy cảm,
  server-only DB/storage access, owner-capability semantics; (4) đập cái gì phải ghi
  lý do trong PR description để truy vết được quyết định.
- Tiêu chí phân xử khi phân vân: *"cái này có phục vụ wedge zero-PII ingestion /
  evidence integrity / MSP không?"* — không phục vụ thì là ứng viên để cắt, bất kể
  đã tốn bao nhiêu công. Sunk cost không phải lý do giữ.

## 2. Prompt kickoff chính — Phase A (paste nguyên khối vào session mới)

> Model: Opus 5 · Effort: xhigh · Thư mục: `~/Projects/clip-sync`

```text
Đọc PLAN.md (đặc biệt §1 — định vị mới từ market research 09/2026), KICKOFF.md §1b
(mandate đập bỏ di sản) và CONTRIBUTING.md của repo này trước khi làm bất cứ việc gì.
Đọc thêm FREEZE_NOTES.md trên branch legacy/2026-09-pilot-readiness-wip.

Nguyên tắc nền: định vị hiện hành là "evidence integrity + zero-PII ingestion cho MSP".
Mọi code/docs/kiến trúc cũ trong repo chỉ là di sản của các định vị trước — bạn được
quyền xoá hoặc viết lại chúng nếu không phục vụ định vị mới hoặc bạn có giải pháp tốt
hơn, miễn tuân thủ 4 rào an toàn trong KICKOFF.md §1b. Đừng bảo tồn thứ gì chỉ vì nó
đã được viết công phu.

Nhiệm vụ: thực thi Phase A của PLAN.md §3 theo đúng quy trình CONTRIBUTING.md.

0. Xác nhận baseline: git switch develop && git pull, rồi chạy
   npm run typecheck && npm run lint && npm test && npm run build.
   Tất cả phải xanh trước khi bắt đầu; nếu đỏ, dừng và báo tôi.

1. feature/restore-discovery-docs: lấy docs/discovery, docs/qa từ branch legacy về,
   nhưng CẬP NHẬT theo định vị mới trước khi merge (interview guide, scorecard phải
   phản ánh wedge zero-PII/integrity/MSP, không phải wedge cũ). docs/ARCHITECTURE_ROADMAP.md
   chỉ khôi phục nếu còn giá trị sau khi đối chiếu PLAN.md — nếu lỗi thời, để nó nằm
   lại trên legacy và ghi rõ trong PR. Mở PR vào develop.

2. feature/pilot-hardening: review diff lifecycle/reconcile/cron/pin trên legacy
   (git diff main...legacy/2026-09-pilot-readiness-wip -- src/) như một reviewer khó
   tính, dưới lăng kính định vị mới: chỉ lấy những thay đổi đã chín VÀ phục vụ
   pilot/wedge mới; phần còn lại bỏ, ghi lý do trong PR. Được refactor mạnh tay thay vì
   cherry-pick nguyên trạng nếu cách đó cho kết quả sạch hơn. Quality gate 4 bước xanh.

3. feature/save-queue: timebox 4 giờ. Đánh giá save-queue.ts + TextEditor refactor trên
   legacy theo cùng lăng kính — lưu ý: text sync là tính năng của định vị clipboard cũ;
   nếu nó không còn quan trọng cho evidence workflow thì mạnh dạn reject, ghi
   "rejected + lý do" vào FREEZE_NOTES.md (commit lên branch legacy) và chuyển thời
   gian dư cho Phase B.

Ràng buộc cứng (4 rào an toàn — không thương lượng):
- Không commit trực tiếp lên develop hoặc main; mọi thứ qua feature branch + PR.
- Không phát triển tiếp trên branch legacy/* (chỉ được sửa FREEZE_NOTES.md của nó).
- Không log content/PIN/filename nhạy cảm — giữ các test bất biến trong
  src/test/room-authz và log test; giữ server-only DB/storage và owner-capability
  semantics.
- Mỗi PR chạy /code-review trước khi merge; CI xanh mới merge; mọi quyết định "đập"
  phải có lý do trong PR description.

Kết thúc: báo cáo PR nào đã mở/merge, trạng thái CI, những di sản đã đập bỏ + lý do,
quyết định save-queue, và việc còn treo cho session sau.
```

## 3. Prompt cho các phase sau (mỗi phase một session mới)

### Phase B — Redaction engine (wedge số 1)

> Session 1 (thiết kế): Fable 5 hoặc Opus 5, effort max. Session 2+ (implement): Opus 5, xhigh.

```text
Đọc PLAN.md §1–§3 (Phase B), KICKOFF.md §1b và CONTRIBUTING.md. Nhiệm vụ: [thiết kế
threat model + detector spec | implement feature/redaction-engine | implement
feature/redaction-preview-ui | xây feature/redaction-eval-set] theo DoD trong PLAN.md
§3 Phase B. Thiết kế từ nguyên lý và bối cảnh hiện tại — không bị ràng buộc bởi flow/
kiến trúc cũ của repo; nếu upload flow hiện tại cản trở zero-PII ingestion, đề xuất
và thực hiện thay thế nó (kèm lý do trong PR).
Ràng buộc: engine chạy 100% client-side, 0 network call cho nội dung; eval set ≥100 mẫu
VI/EN; FP/FN đo được và chạy trong CI như regression test. Làm trên feature branch từ
develop, PR + CI xanh.
```

### Phase C — Evidence manifest

```text
Đọc PLAN.md §3 Phase C. Implement [feature/evidence-manifest | feature/incident-checklists
| feature/evidence-bundle-export] theo DoD tương ứng. Manifest phải verify được bằng một
lệnh CLI; checklist đo completeness qua funnel analytics sẵn có. Feature branch từ
develop, PR + CI xanh.
```

### Phase D — MSP webhook + pilot

```text
Đọc PLAN.md §3 Phase D và docs/OPERATIONS.md. Implement feature/helpdesk-webhook cho
platform [điền theo design partner] với signed payload + ticket reference, và
feature/pilot-ops (quota guard, alert cleanup/reconcile). DoD: design partner nhận được
event trong hệ thống thật. Nhắc tôi về hạ tầng deploy (Vercel Hobby không dùng được cho
pilot thương mại) trước khi go-live.
```

### Phase V — Interview kit (song song, Sonnet 5 / high là đủ)

```text
Đọc PLAN.md §1 (định vị mới) và docs/discovery/INTERVIEW_GUIDE.md. Cập nhật interview
guide + pilot scorecard theo định vị "evidence integrity + zero-PII ingestion cho MSP":
thêm câu hỏi về NIS2/PDPL evidence obligations, câu hỏi phân biệt với Birdie/help-desk
DLP, và bảng theo dõi commitment (artifact → cài thử → pilot → paid intent). Xuất một
one-pager pitch VI + EN. Chỉ sửa docs, feature branch + PR như thường lệ.
```

## 4. Nhịp làm việc đề xuất

1. **Tuần 1–2:** Phase A (3 session) + Phase V kit (1 session) → bắt đầu đặt lịch interview.
2. **Cuối mỗi phase:** mở PR release `develop` → `main` khi đạt DoD phase, tag minor version.
3. **Mỗi tuần:** cập nhật dashboard ROI (mục 27 của PORTFOLIO_ROI_ROADMAP_2026.md) — một
   tuần không có user evidence hoặc technical evidence phải ghi rõ vì sao.
4. **Ngày 14:** áp kill rule Phase V (PLAN.md §3) — quyết định build tiếp hay đóng case study.
