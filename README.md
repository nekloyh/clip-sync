# ClipSync 🚀

**ClipSync** là ứng dụng chia sẻ clipboard / ghi chú tạm thời và ảnh chụp màn hình đa thiết bị không cần đăng nhập. Mở cùng URL trên 2 máy (laptop, PC, điện thoại) để tự động đồng bộ văn bản & ảnh realtime.

---

## 🛠️ Hướng dẫn Setup Supabase từ số 0

### Bước 1: Tạo dự án trên Supabase
1. Truy cập [Supabase Dashboard](https://supabase.com/dashboard) và tạo 1 **New Project**.
2. Đặt tên project (ví dụ: `clipsync-db`) và chọn mật khẩu Postgres bí mật.

### Bước 2: Chạy Migration Database (SQL Schema)
1. Vào mục **SQL Editor** ở thanh menu bên trái trong Supabase Dashboard.
2. Mở file [`supabase/migrations/001_initial_schema.sql`](./supabase/migrations/001_initial_schema.sql).
3. Copy toàn bộ nội dung SQL và dán vào SQL Editor, sau đó nhấn **Run**.
4. Kiểm tra trong **Table Editor**: Bạn sẽ thấy 2 bảng `rooms` và `attachments`.

### Bước 3: Tạo Storage Bucket cho Ảnh
1. Vào mục **Storage** -> **Buckets** -> nhấn **New bucket**.
2. Đặt tên bucket: `clipsync-attachments`.
3. Bật tùy chọn **Public bucket** (để render thumbnail ảnh nhanh qua public URL).
4. Nhấn **Save**.

*(Tùy chọn Policy cho Bucket)*: Nếu RLS Storage được bật, hãy thêm Policy `Allow public upload and read` cho bucket `clipsync-attachments`.

### Bước 4: Kiểm tra Supabase Realtime
1. Vào **Database** -> **Publications** -> chọn `supabase_realtime`.
2. Đảm bảo 2 bảng `rooms` và `attachments` đã được bật công tắc **Realtime**.

### Bước 5: Cấu hình File Môi trường `.env.local`
1. Tạo file `.env.local` ở thư mục gốc của project (ngang hàng với `.env.example`).
2. Lấy thông tin API trong Supabase:
   - Vào **Project Settings** -> **API**.
   - Copy `Project URL` -> gán cho `NEXT_PUBLIC_SUPABASE_URL`.
   - Copy `anon` `public` key -> gán cho `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - Copy `service_role` `secret` key -> gán cho `SUPABASE_SERVICE_ROLE_KEY`.

Ví dụ nội dung `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```

---

## 🚀 Chạy ứng dụng ở máy cục bộ (Local Development)

```bash
# Cài đặt dependencies
npm install

# Chạy server phát triển Next.js
npm run dev
```

Truy cập: `http://localhost:3000`

---

## 📦 Deploy lên Vercel
1. Push code lên GitHub / GitLab.
2. Tạo New Project trên Vercel và import repository.
3. Cấu hình các biến môi trường (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) trong Vercel Environment Variables.
4. Deploy! 🎉
