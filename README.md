# ClipSync 🚀

**ClipSync** là ứng dụng chia sẻ clipboard / ghi chú tạm thời và ảnh chụp màn hình đa thiết bị không cần đăng nhập. Mở cùng URL trên 2 máy (laptop, PC, điện thoại) để tự động đồng bộ văn bản & ảnh realtime.

---

## 🔐 Mô hình bảo mật (đọc trước khi deploy)

| Thành phần | Cách hoạt động |
| --- | --- |
| **URL phòng** | Là "mật khẩu" của phòng không đặt PIN. Slug có ~49 bit entropy (`quiet-fox-h7k2mq9d`), không thể dò được. |
| **anon key** | Nằm trong bundle trình duyệt nên coi như công khai. Nó **không có bất kỳ quyền nào trên bảng** — chỉ dùng cho Realtime broadcast/presence. |
| **Mọi truy vấn DB / Storage** | Chạy phía server bằng `service_role` key, bên trong route handler đã kiểm tra quyền. |
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

Vào **SQL Editor**, chạy **lần lượt** 2 file (đúng thứ tự):

1. [`supabase/migrations/001_initial_schema.sql`](./supabase/migrations/001_initial_schema.sql) — tạo bảng, index, trigger.
2. [`supabase/migrations/002_lockdown.sql`](./supabase/migrations/002_lockdown.sql) — **bắt buộc**. Thu hồi toàn bộ quyền của `anon`/`authenticated`, gỡ 2 bảng khỏi publication realtime, và đặt bucket về private.

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

# Tùy chọn — khóa ký cookie mở phòng (mặc định dùng service_role key)
CLIPSYNC_AUTH_SECRET=

# Bắt buộc nếu muốn phòng tự hủy sau 7 ngày
CRON_SECRET=
```

Sinh secret ngẫu nhiên: `openssl rand -base64 48`

App sẽ **báo lỗi ngay** nếu thiếu biến bắt buộc, thay vì chạy tiếp với giá trị placeholder.

---

## 🧹 Tự động dọn phòng hết hạn (TTL 7 ngày)

Phòng không được truy cập trong 7 ngày sẽ bị xóa — **kể cả file ảnh trong Storage**. Việc này do endpoint `GET /api/cron/cleanup` thực hiện, và nó **phải được gọi theo lịch**, nếu không sẽ không có gì bị xóa cả.

- **Trên Vercel**: [`vercel.json`](./vercel.json) đã khai báo cron chạy 03:00 hằng ngày. Chỉ cần đặt biến `CRON_SECRET` — Vercel tự gửi header `Authorization: Bearer $CRON_SECRET`.
- **Nơi khác**: gọi thủ công từ cron của bạn:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/cleanup
```

Endpoint xử lý tối đa 200 phòng mỗi lần và trả về `hasMore: true` nếu còn tồn đọng.

---

## 🚀 Chạy ứng dụng ở máy cục bộ

```bash
npm install
npm run dev
```

Truy cập: `http://localhost:3000`

### Các lệnh khác

```bash
npm test          # chạy unit test (vitest)
npm run typecheck # tsc --noEmit
npm run lint      # eslint
npm run build     # build production
```

---

## 📦 Deploy lên Vercel

1. Push code lên GitHub / GitLab.
2. Tạo New Project trên Vercel và import repository.
3. Thêm Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` (và `CLIPSYNC_AUTH_SECRET` nếu muốn).
4. Deploy! 🎉

---

## ⚠️ Giới hạn đã biết

- **Đồng bộ text là last-write-wins trên toàn bộ document.** Hai người gõ cùng lúc thì bên lưu sau ghi đè bên kia. Đây là đánh đổi có chủ ý cho một công cụ kiểu clipboard; nếu cần soạn thảo cộng tác thật sự thì phải chuyển sang CRDT (Yjs).
- **Rate limit lưu trong bộ nhớ tiến trình.** Trên serverless, giới hạn thực tế nhân với số instance đang chạy. Đủ chặn brute-force PIN và spam tạo phòng ở quy mô nhỏ; nếu lưu lượng lớn nên chuyển sang Redis/Upstash.
- **Phòng không đặt PIN thì URL chính là mật khẩu.** Ai có link là vào được.
