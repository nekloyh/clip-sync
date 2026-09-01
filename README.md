# ClipSync 🚀

**ClipSync** thu thập bằng chứng chẩn đoán (text, log, ảnh màn hình) từ người dùng bên
ngoài cho đội IT support — qua một phòng tạm thời có link, không cần tài khoản, không cần
cài gì, tự hủy theo TTL và owner thu hồi được bất cứ lúc nào.

Định vị đang xây (`PLAN.md` §1): **evidence integrity + zero-PII ingestion cho MSP**.
Hai wedge đó — che dữ liệu nhạy cảm *trên máy khách trước khi upload*, và manifest có
hash để chứng minh đã nhận gì — **chưa có trong bản hiện tại**; chúng là Phase B và
Phase C. Trạng thái từng bất biến: [`docs/ENGINEERING_INVARIANTS.md`](./docs/ENGINEERING_INVARIANTS.md) §1.

| Tài liệu | Nội dung |
| --- | --- |
| [`PLAN.md`](./PLAN.md) | **Nguồn chân lý hiện hành** — định vị, scope MVP, roadmap theo phase, KPI |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Mô hình branch, quality gate, quy trình release |
| [`CHANGELOG.md`](./CHANGELOG.md) | Thay đổi theo release, kèm ghi chú triển khai |
| [`KICKOFF.md`](./KICKOFF.md) | Cách mở session thực thi từng phase; mandate thay thế di sản |
| [`docs/ENGINEERING_INVARIANTS.md`](./docs/ENGINEERING_INVARIANTS.md) | Ràng buộc kỹ thuật đúng ở mọi phase; nợ kiến trúc đã biết |
| [`docs/OPERATIONS.md`](./docs/OPERATIONS.md) | Runbook, alert, cleanup lifecycle, suy giảm rate limiter |
| [`docs/ANALYTICS.md`](./docs/ANALYTICS.md) | Event dictionary và chính sách privacy của telemetry |
| [`docs/discovery/INTERVIEW_GUIDE.md`](./docs/discovery/INTERVIEW_GUIDE.md) | Kit Phase V — kịch bản phỏng vấn 15 đội |
| [`docs/discovery/PILOT_SCORECARD.md`](./docs/discovery/PILOT_SCORECARD.md) | Kit Phase V — scorecard cho mỗi concierge pilot |
| [`docs/discovery/PHASE_V_EVIDENCE.md`](./docs/discovery/PHASE_V_EVIDENCE.md) | Kit Phase V — bảng roll-up bốn gate G1–G4 và kill rule |
| [`docs/qa/`](./docs/qa/) | Phương pháp QA (mỗi kết luận mang loại bằng chứng của nó) + bản ghi 2026-08-29 |
| [`docs/PRODUCT_ROADMAP.md`](./docs/PRODUCT_ROADMAP.md) | **Tham khảo lịch sử** — định vị 08/2026, đã bị `PLAN.md` thay |

---

## 🔐 Mô hình bảo mật (đọc trước khi deploy)

| Thành phần | Cách hoạt động |
| --- | --- |
| **URL phòng** | Là "mật khẩu" của phòng không đặt PIN. Slug có ~49 bit entropy (`quiet-fox-h7k2mq9d`), không thể dò được. |
| **anon key** | Nằm trong bundle trình duyệt nên coi như công khai. Nó **không có bất kỳ quyền nào trên bảng** — chỉ dùng cho Realtime broadcast/presence. |
| **Mọi truy vấn DB / Storage** | Chạy phía server bằng `service_role` key, bên trong route handler đã kiểm tra quyền. |
| **Quyền chủ phòng** | Người tạo phòng nhận một **owner capability 256-bit**, nằm trong một cookie httpOnly duy nhất `cs_owner` chứa capability của mọi phòng. Database chỉ giữ `sha256` của nó. Biết URL hoặc biết PIN **không** phải là quyền owner. Hạn 30 ngày, tự gia hạn mỗi lần owner mở phòng. |
| **Mutation quản trị** | Xóa phòng, đặt/đổi/gỡ PIN và xóa ảnh chỉ dành cho owner. Cả ba đi qua một cổng duy nhất (`guardRoomManagement`), trả 403 đồng nhất, và ghi kèm điều kiện `owner_version` để thu hồi có hiệu lực tức thì. |
| **Nội dung text** | **Không** phải owner-only: đây là buffer dùng chung, ai vào được phòng cũng ghi đè được. Xem "Giới hạn đã biết". |
| **PIN** | Hash bằng `scrypt` (N=2¹⁵). Mở khóa được cấp bằng **cookie httpOnly có chữ ký HMAC**, không phải `localStorage`. Đổi PIN → mọi cookie cũ mất hiệu lực. |
| **Trang phòng có PIN** | Server trả về màn hình khóa, **nội dung không hề được render ra HTML**. |
| **Ảnh đính kèm** | Bucket **private**; ảnh được stream qua `/api/rooms/[slug]/attachments/[id]` và đi qua đúng lớp kiểm tra PIN. |
| **Realtime** | Chỉ phát tín hiệu "có thay đổi" (không chứa nội dung), client tự gọi API để lấy state. Ai biết slug cũng không đọc được nội dung qua channel. |

---

## 🛠️ Hướng dẫn Setup Supabase từ số 0

### Bước 1: Tạo dự án trên Supabase

1. Truy cập [Supabase Dashboard](https://supabase.com/dashboard) và tạo 1 **New Project**.
2. Đặt tên project (ví dụ: `clipsync-db`) và chọn mật khẩu Postgres bí mật.

### Bước 2: Chạy Migration Database (SQL Schema)

Vào **SQL Editor**, chạy **lần lượt** 4 file (đúng thứ tự):

1. [`supabase/migrations/001_initial_schema.sql`](./supabase/migrations/001_initial_schema.sql) — tạo bảng, index, trigger.
2. [`supabase/migrations/002_lockdown.sql`](./supabase/migrations/002_lockdown.sql) — **bắt buộc**. Thu hồi toàn bộ quyền của `anon`/`authenticated`, gỡ 2 bảng khỏi publication realtime, và đặt bucket về private.
3. [`supabase/migrations/003_room_owner.sql`](./supabase/migrations/003_room_owner.sql) — **bắt buộc**. Thêm `owner_secret_hash` và `owner_version` cho bảng `rooms`.
4. [`supabase/migrations/004_pilot_readiness.sql`](./supabase/migrations/004_pilot_readiness.sql) — **bắt buộc**. Thêm vòng đời xóa phòng (`lifecycle_state`), bảng `analytics_events`, `ops_runs` và `reconciliation_findings`.

> **Nếu quên chạy 003 hoặc 004**, app **không sập**. Nó tự lùi về tập cột cũ:
> thiếu 003 thì mọi phòng bị coi là không có chủ (đọc / sửa text / gửi ảnh / nhập PIN vẫn chạy,
> nhưng **không quản trị được phòng nào và không tạo được phòng mới**); thiếu 004 thì mọi phòng
> đọc ra là `active` và **không xếp hàng xóa được**. Cả hai hướng lùi đều là hướng an toàn —
> mất quyền quản trị chứ không phát quyền cho người lạ, và trả về phòng thật chứ không 404 hàng loạt.
>
> Trạng thái này hiện rõ ở `GET /api/health/ready` (`503` + `{"database":"degraded"}`) và ở log
> server. Chạy migration xong, instance đang chạy tự phục hồi trong vòng 60 giây — hoặc ngay lập
> tức nếu bạn gọi `/api/health/ready`.

> ⚠️ Nếu bỏ qua bước 2, bất kỳ ai có anon key (tức là bất kỳ ai mở DevTools) đều có thể `select *` hoặc `delete` toàn bộ bảng `rooms`.

Kiểm tra trong **Table Editor**: bạn sẽ thấy 2 bảng `rooms` và `attachments`.

### Bước 3: Tạo Storage Bucket cho Ảnh

1. Vào **Storage** → **Buckets** → **New bucket**.
2. Đặt tên bucket: `clipsync-attachments`.
3. **KHÔNG** bật "Public bucket" — để private.
4. Không cần thêm policy nào: chỉ `service_role` truy cập bucket này, và nó bỏ qua RLS.

### Bước 4: Realtime

Không cần bật Realtime cho bảng nào. App chỉ dùng **Broadcast** và **Presence** (không phụ thuộc bảng). Migration 002 sẽ tự gỡ 2 bảng khỏi publication `supabase_realtime` nếu chúng đã được thêm trước đó.

### Bước 5: Cấu hình `.env.local`

Tạo file `.env.local` ở thư mục gốc (xem [`.env.example`](./.env.example)):

```env
# Bắt buộc — Project Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...

# Bắt buộc — khóa ký cookie mở phòng VÀ cookie owner. Tối thiểu 32 ký tự.
CLIPSYNC_AUTH_SECRET=

# Bắt buộc nếu muốn phòng tự hủy sau 7 ngày
CRON_SECRET=
```

Sinh secret ngẫu nhiên: `openssl rand -base64 48`

App sẽ **báo lỗi ngay** nếu thiếu biến bắt buộc, thay vì chạy tiếp với giá trị placeholder.

> ⚠️ **`CLIPSYNC_AUTH_SECRET` không còn là tùy chọn, và không được đặt bằng service-role key.**
> Trước đây nó mặc định lấy `SUPABASE_SERVICE_ROLE_KEY`. Khi khóa này chỉ ký cookie mở PIN thì
> hậu quả xấu nhất là người dùng phải nhập lại PIN. Giờ nó còn ký **owner capability** — thứ
> duy nhất chứng minh ai tạo phòng, và không có tài khoản nào để khôi phục. Nếu hai secret là
> một, thì lần rotate khóa Supabase kế tiếp (việc nên làm định kỳ, và **bắt buộc** sau mỗi nghi
> ngờ rò rỉ) sẽ xóa sạch quyền owner của **toàn bộ** phòng đang tồn tại, cùng lúc, không phục hồi được.

---

## 🧹 Xóa phòng: TTL 7 ngày và nút xóa của owner

Phòng không được truy cập trong 7 ngày sẽ bị xóa — **kể cả file ảnh trong Storage**. Owner cũng
xóa được ngay lập tức. **Hai đường đi qua đúng một đoạn code**; trước đây là hai bản cài đặt
riêng, sai theo hai kiểu khác nhau.

Xóa là một **job có thể chạy lại**, không phải một request:

```
active ──(owner bấm xóa | TTL 7 ngày)──► deletion_pending ──cron──► deleting ──► xong
                                                ▲                        │
                                                └──── storage lỗi ───────┘
                                                   attempts + 1, tối đa 5
```

- Phòng **ngừng đọc được ngay** khi rời `active`: mọi read path trả 404 tức thì. `DELETE
  /api/rooms/[slug]` vì vậy trả **202** chứ không phải 200 — metadata đã khuất, bytes biến mất
  ngay sau đó. Nói 200 là khẳng định dữ liệu đã hết ở thời điểm nó rõ ràng chưa hết.
- Worker xóa theo thứ tự **object → attachment rows → room row**, và **không đi tiếp khi storage
  từ chối**. Row là bản ghi duy nhất cho biết object nào thuộc phòng nào; xóa row trước là biến
  mọi lỗi storage thành orphan không ai quy được về đâu và không gì retry được.
- Chạy lại luôn an toàn: object đã mất được coi như đã xóa, row đã xóa thì không khớp gì.

Endpoint **phải được gọi theo lịch**, nếu không sẽ không có gì bị xóa cả.

- **Trên Vercel**: [`vercel.json`](./vercel.json) khai báo `/api/cron/cleanup` mỗi giờ và
  `/api/cron/reconcile` mỗi ngày. Chỉ cần đặt `CRON_SECRET` — Vercel tự gửi header
  `Authorization: Bearer $CRON_SECRET`.
- **Nơi khác**: gọi từ cron của bạn:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/cleanup
curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/reconcile
```

Mỗi lần chạy xếp hàng tối đa 200 phòng hết hạn, xóa tối đa 25 phòng, dừng sau 45 giây, và trả
`hasMore` + `remainingWork` nếu còn tồn đọng. Giới hạn là có chủ đích: một lần chạy cố làm hết
backlog sẽ bị runtime giết giữa chừng.

`/api/cron/reconcile` dò lệch hai chiều giữa database và storage và **chỉ báo cáo** — nó không
xóa gì. Chi tiết ở [`docs/OPERATIONS.md`](./docs/OPERATIONS.md).

---

## 🚀 Chạy ứng dụng ở máy cục bộ

```bash
npm install
npm run dev
```

Truy cập: `http://localhost:3000`

### Các lệnh khác

```bash
npm test             # chạy unit test (vitest)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run build        # build production
npm run verify:supabase  # kiểm chứng schema với database thật (tự skip nếu thiếu env)
```

---

## 📦 Deploy lên Vercel

1. Push code lên GitHub / GitLab.
2. Tạo New Project trên Vercel và import repository.
3. Thêm Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CLIPSYNC_AUTH_SECRET` (bắt buộc, xem cảnh báo ở Bước 5) và `CRON_SECRET`.
4. Chạy migration **trước** khi deploy, rồi kiểm tra `GET /api/health` trả `200`.
5. Deploy! 🎉

---

## 👑 Chủ phòng và người đóng góp

Từ phiên bản này, phòng có **một chủ sở hữu**: người bấm "Tạo phòng mới".

| | Owner | Recipient (cộng tác viên) |
| --- | --- | --- |
| Đọc nội dung, xem ảnh | ✅ | ✅ |
| Sửa và lưu văn bản | ✅ | ✅ **kể cả ghi đè / xóa trắng nội dung cũ** |
| Tải ảnh lên | ✅ | ✅ |
| Nhập PIN để mở khóa | ✅ | ✅ |
| Đặt / đổi / gỡ PIN | ✅ | ❌ 403 |
| Xóa ảnh | ✅ | ❌ 403 |
| Xóa phòng | ✅ | ❌ 403 |

Vài điểm cần biết:

- **Quyền owner nằm ở trình duyệt, không ở tài khoản.** Nó là một cookie `httpOnly` chứa capability của từng phòng. Mở cùng URL ở máy khác, trình duyệt khác, hoặc cửa sổ ẩn danh → bạn là recipient. Người tạo phòng được báo điều này ngay trên màn hình phòng, ở lần load đầu tiên sau khi tạo.
- **Xóa cookie hoặc đổi máy là mất quyền owner vĩnh viễn.** Không có cách khôi phục, và đó là chủ ý: một backdoor khôi phục cũng là một backdoor chiếm phòng. Phòng vẫn tự hết hạn sau 7 ngày.
- **`POST /api/rooms` là nơi duy nhất tạo phòng.** Truy cập `/r/<slug>` không tồn tại trả 404 chứ không tạo phòng nữa, và không thể tạo phòng bằng slug tự đặt — locator luôn do server sinh ngẫu nhiên.
- **Phòng cũ (tạo trước bản này) không có owner.** Không ai có thể nhận quyền owner cho chúng. Chúng vẫn đọc/sửa/upload bình thường và tự hết hạn theo TTL; các thao tác quản trị trả 403.
- **Quyền owner tự gia hạn khi còn dùng.** Cookie có hạn 30 ngày, nhưng mỗi lần owner mở phòng
  (API `GET /api/rooms/[slug]`, tức mỗi lần load hoặc re-sync) hạn được đẩy lùi lại 30 ngày. Nhờ
  vậy một phòng còn được dùng không thể sống lâu hơn cái cookie điều khiển nó.
- **Thu hồi quyền owner** của một phòng: `update rooms set owner_version = owner_version + 1 where slug = '...'`.
  Có hiệu lực ngay: mọi mutation quản trị đều ghi kèm điều kiện `owner_version`, nên một request
  đang bay dở cũng không lách qua được.
- **Mọi capability nằm chung một cookie `cs_owner`, giữ được khoảng 30 phòng gần nhất.**
  Trước đây mỗi phòng một cookie riêng, và trình duyệt chỉ cho ~180 cookie/domain — vượt ngưỡng
  là trình duyệt tự dọn theo luật của nó, tức là **âm thầm** thu hồi quyền owner. Gộp lại thì
  giới hạn chuyển thành kích thước một cookie (~4KB), thứ mà server tự cắt được: khi đầy, phòng
  cũ nhất bị đẩy ra trước, phòng vừa dùng luôn được giữ. Mỗi entry được ký độc lập, nên một
  entry hỏng chỉ mất đúng phòng đó chứ không mất cả jar. Cookie `cs_owner_<slug>` kiểu cũ vẫn
  được đọc và tự động gộp vào jar ở lần tạo phòng kế tiếp.

## 🩺 Health check và quan sát vận hành

| Endpoint | Auth | Trả lời |
| --- | --- | --- |
| `GET /api/health/live` | không | Process còn chạy không? Không chạm dependency nào |
| `GET /api/health/ready` | không | Config, database, storage, rate limiter |
| `GET /api/health` | không | Bí danh của `ready`, giữ cho monitor cũ |
| `GET /api/health/ops` | `Bearer $CRON_SECRET` | Cron chạy lần cuối lúc nào, hàng đợi xóa còn bao nhiêu |

Trỏ uptime monitor vào `/api/health/ready` — nếu không, một lần deploy quên migration sẽ chạy ở
chế độ suy giảm mà không ai biết.

**Liveness cố tình không gọi database.** Một liveness probe có chạm dependency sẽ báo "chết"
trong lúc database sự cố, và orchestrator sẽ restart mọi instance đang khỏe — biến sự cố
dependency thành cơn bão restart chồng lên nó.

Không endpoint nào trả về project URL, tên bucket, tên bảng, tên cột hay thông điệp lỗi của
provider. Readiness thường được để mở và là thứ đầu tiên bị curl.

`/api/health/ops` là chỗ trả lời câu hỏi mà log trả lời rất tệ: **"cron còn chạy không?"** Một
job ngừng được gọi thì không phát ra gì cả, nên sự im lặng của nó trông y hệt một tuần vắng
khách. So `jobs[cleanup].secondsSinceCompletion` với ngưỡng của bạn là ra.

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/health/ops | jq
```

Alert tối thiểu, cleanup lifecycle và chính sách suy giảm của rate limiter:
[`docs/OPERATIONS.md`](./docs/OPERATIONS.md). Event dictionary và chính sách privacy của
telemetry: [`docs/ANALYTICS.md`](./docs/ANALYTICS.md).

Kiểm chứng schema với database thật (script tự bỏ qua nếu thiếu biến môi trường):

```bash
npm run verify:supabase
```

**Chạy được thẳng trên project hosted, kể cả production.** Mọi check hoặc là chỉ đọc, hoặc chỉ
thao tác trên vài dòng rác do chính script tạo ra rồi tự xóa; không đụng tới dữ liệu có sẵn.

Ngoài phần degraded-mode bên dưới, script còn kiểm chứng migration 004 trên database thật: các cột
vòng đời xóa, ba bảng mới, và — quan trọng nhất — **partial unique index có thực sự gộp một
once-per-room event lặp lại thành một dòng hay không**. Đó là cơ chế idempotency thật của funnel;
unit test chỉ chứng minh được sink trong bộ nhớ, không chứng minh gì về database này.

Nhóm check quan trọng nhất là phần **degraded-mode detection**: nó gọi đúng hàm mà app đang dùng
(`src/lib/schema-errors.mjs`, import trực tiếp chứ không chép lại) và đối chiếu với **thông điệp
lỗi thật của chính server đó**. Đây là cách duy nhất để biết chắc PostgREST bản hosted không diễn
đạt lỗi khác bản local, vì mã lỗi phụ thuộc cả vào trạng thái schema cache:

| Tình huống | Mã lỗi quan sát được |
| --- | --- |
| `SELECT` cột không tồn tại | `42703` (Postgres) |
| `INSERT`/`UPDATE`, cache chưa từng biết cột | `PGRST204` (PostgREST) |
| `INSERT`/`UPDATE`, cache còn nhớ cột vừa bị drop | `42703` |
| Vi phạm CHECK trên `owner_version` | `23514` — **không** được coi là thiếu migration |
| Vi phạm NOT NULL trên `owner_version` | `23502` — **không** được coi là thiếu migration |

Hai dòng cuối là cái bẫy: thông điệp của chúng có chứa chữ `owner_version`, nên một luật chỉ dò
tên cột sẽ hiểu nhầm một lỗi ràng buộc bình thường thành "thiếu migration" và đẩy cả deployment
đang khỏe mạnh vào degraded mode, hạ quyền toàn bộ owner cùng lúc.

> Không cần `notify pgrst, 'reload schema'` sau khi chạy migration: Supabase đã cài sẵn event
> trigger `pgrst_ddl_watch`, đã kiểm chứng là PostgREST nhận cột mới ngay. Có một khoảng rất ngắn
> (dưới một giây) mà đường ghi còn dùng cache cũ và `POST /api/rooms` trả 500; đường đọc vẫn chạy
> bình thường suốt khoảng đó và hệ thống tự khỏi, không cần restart.

## ⚠️ Giới hạn đã biết

- **Đồng bộ text là last-write-wins trên toàn bộ document.** Hai người gõ cùng lúc thì bên lưu sau ghi đè bên kia. Đây là đánh đổi có chủ ý cho một công cụ kiểu clipboard; nếu cần soạn thảo cộng tác thật sự thì phải chuyển sang CRDT (Yjs).
- **Rate limit cần Redis/Upstash ở production.** Đặt `UPSTASH_REDIS_REST_URL` và
  `UPSTASH_REDIS_REST_TOKEN`; không có chúng, limiter lùi về bộ đếm trong tiến trình và giới hạn
  thực tế bị nhân với số instance đang chạy — một con số không ai điều khiển, tăng đúng lúc lưu
  lượng tăng, và kẻ tấn công tự làm nó tăng được. Với PIN 4 chữ số thì đó không phải giới hạn.
  Đặt `CLIPSYNC_REQUIRE_DISTRIBUTED_LIMITER=1` để readiness *fail* khi thiếu store.
  Khi Redis chết: verify/đổi PIN **từ chối** (503), phần còn lại lùi về bộ đếm nội bộ và ghi log
  `degraded`. Xem [`docs/OPERATIONS.md`](./docs/OPERATIONS.md).
- **Phòng không đặt PIN thì URL chính là mật khẩu.** Ai có link là vào được — với quyền của recipient, không phải owner.
- **Owner capability gắn với một trình duyệt.** Không có đăng nhập, nên không thể quản lý cùng một phòng từ hai máy, và không có cách lấy lại quyền nếu mất cookie.
- **Text là buffer dùng chung, không phải kho bằng chứng bất biến.** Last-write-wins, không lịch
  sử, không undo: bất kỳ ai vào được phòng đều có thể ghi đè hoặc xóa trắng nội dung, kể cả nội
  dung người khác vừa dán. Chỉ **ảnh** mới là owner-only khi xóa. Nếu bạn cần dữ liệu không bị
  người nhận phá, đừng dựa vào phòng không đặt PIN.
- **Recipient có thể chiếm hết 20 slot ảnh** của phòng, chặn người khác gửi thêm. Không có hạn
  ngạch riêng cho từng người vì không có danh tính từng người.
- **Trang 404 của phòng được render phía client.** `/r/<mã không tồn tại>` trả đúng status
  `404`, nhưng phần thân HTML do trình duyệt dựng sau khi hydrate — đây là cách Next 14 xử lý
  `notFound()` gọi từ route động. Người dùng thật thấy đúng nội dung; `curl` thì thấy body rỗng.
  Vì lý do tương tự, `not-found.tsx` **phải** nằm ở `src/app/`, không đặt lồng trong `r/[slug]/`
  được (Next sẽ bỏ qua). App cũng không còn `app/loading.tsx`: nó tạo một Suspense boundary khiến
  Next flush status `200` trước khi `notFound()` kịp chạy, biến mọi phòng không tồn tại thành 200.

- **403 (có phòng, không đủ quyền) khác 404 (không có phòng).** Về lý thuyết đây là kênh dò sự
  tồn tại của phòng. Thực tế không đáng lo: slug có ~49 bit entropy, dò ở tốc độ 10⁴ req/s vẫn
  cần cỡ 10⁹ năm. Chủ ý **không** thêm rate limit cho `GET`/`DELETE /api/rooms/[slug]` — nó không
  mua thêm được chút an toàn nào, nhưng lại đủ sức làm hỏng các phòng dùng chung IP qua NAT.
