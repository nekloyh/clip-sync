# Event dictionary

Bản hợp đồng của product analytics trong ClipSync. Định nghĩa thi hành nằm ở
`src/lib/analytics/catalog.ts`; file này giải thích *tại sao* mỗi field tồn tại
và field nào bị cấm. Hai file phải được sửa cùng nhau.

Nguyên tắc chi phối toàn bộ tài liệu này: **ClipSync đo được funnel mà không thu
thập dữ liệu của khách hàng.** Sản phẩm được bán cho đội hỗ trợ để nhận
screenshot, log và cấu hình nhạy cảm. Một dòng analytics chứa filename hoặc room
slug sẽ phá vỡ đúng lời hứa mà sản phẩm dựa vào để tồn tại.

## 1. Dữ liệu được phép và bị cấm

### Được ghi

| Field | Ý nghĩa | Vì sao an toàn |
| --- | --- | --- |
| `event_name` | Tên event, lấy từ tập đóng trong catalog | Do server chọn, không phải input |
| `event_version` | Version schema của event | Số nguyên do code quyết định |
| `room_ref` | `HMAC-SHA256(CLIPSYNC_AUTH_SECRET, room UUID)`, cắt còn 128 bit | Bút danh có khóa. Join được với chính funnel, không ánh xạ ngược ra slug |
| `actor` | `owner` \| `recipient` \| `system` | Một *lớp*, không bao giờ là capability |
| `size_bucket` | `lt_64kb` \| `lt_256kb` \| `lt_1mb` \| `lt_5mb` \| `gte_5mb` | Nhóm, không phải số byte chính xác |
| `mime_category` | `image` \| `text` \| `other` | Chỉ top-level type, bỏ subtype |
| `outcome` | `success` \| `failure` | Tập đóng |
| `error_code` | Stable code từ `src/lib/errors.ts` | Không bao giờ là thông điệp của provider |
| `occurred_at` | Timestamp do database sinh | Không phải input |

### Bị cấm tuyệt đối

Room content hoặc ciphertext · PIN hoặc PIN hash · owner/access capability hoặc
token · cookie · `authorization` header · **room slug hoặc bất kỳ URL locator
nào** · filename · storage path · raw IP · raw user-agent · URL fragment hoặc
decryption key · số byte chính xác · MIME subtype.

Hàng rào có hai lớp:

1. `buildEventRow()` chiếu event lên allowlist và **loại bỏ mọi field khác**, kể
   cả khi caller truyền vào. Giá trị cũng được kiểm tra theo tập đóng, vì một key
   được cho phép nhưng giá trị tự do mới là đường ngắn nhất để room content lọt
   vào bảng.
2. Bảng `analytics_events` **không có cột** để chứa những thứ trên. Kể cả khi
   tầng ứng dụng bị bỏ qua, không có chỗ nào để ghi một slug.

Cả hai lớp được pin bằng test trong `src/lib/analytics/catalog.test.ts`.

### Vì sao slug là mục nguy hiểm nhất

Slug trông giống identifier nên rất dễ bị coi là an toàn để log. Nhưng với phòng
không đặt PIN, **URL chính là mật khẩu**. Một slug trong bảng analytics là một
mật khẩu trong bảng analytics, và nó tồn tại lâu hơn cả căn phòng.

`room_ref` được dẫn xuất từ **room UUID chứ không phải slug**. UUID không bao giờ
rời server, nên người chỉ biết URL không thể tự tính ra ref rồi đi tra cứu — điều
họ sẽ làm được ngay nếu ref dẫn xuất từ slug.

Xoay `CLIPSYNC_AUTH_SECRET` sẽ cắt đứt ref cũ khỏi ref mới. Đây là mất mát có
giới hạn và có chủ đích: cùng lần xoay đó đã vô hiệu mọi cookie, nên vận hành
viên vốn đã phải chấp nhận một điểm gãy ở đó.

## 2. Danh mục event

`v1` cho tất cả. Đổi *ý nghĩa* của một field — không phải thêm field mới — thì
phải tăng `EVENT_VERSION`, để query loại được các dòng ghi theo nghĩa cũ thay vì
âm thầm tính trung bình hai định nghĩa.

| Event | Khi nào | Actor | Field kèm theo | Idempotent |
| --- | --- | --- | --- | --- |
| `room_created` | `POST /api/rooms` tạo được row | `owner` | — | mỗi phòng một lần |
| `second_device_joined` | Một người **không phải owner** đọc phòng thành công | `recipient` | — | mỗi phòng một lần |
| `first_content_transferred` | Save đầu tiên có nội dung, hoặc attachment đầu tiên | `owner`/`recipient` | — | mỗi phòng một lần |
| `attachment_uploaded` | Mỗi lần upload, kể cả thất bại | `owner`/`recipient` | `size_bucket`, `mime_category`, `outcome`, `error_code` | không — đếm được |
| `room_completed` | Owner chủ động đóng phòng | `owner` | — | mỗi phòng một lần |
| `room_deleted` | Worker đã xóa xong dữ liệu thật | `system` | — | không — nhưng chỉ ghi khi thật sự xóa được row |
| `room_expired` | TTL 7 ngày đưa phòng vào hàng đợi | `system` | — | mỗi phòng một lần |
| `cleanup_failed` | Một lần dọn dẹp thất bại | `system` | `outcome: failure`, `error_code` | không — đếm được |

### Vì sao `room_completed` khác `room_deleted`

`room_completed` nghĩa là **có người quyết định** cuộc handoff đã xong.
`room_deleted` nghĩa là **bytes đã biến mất**. Khoảng cách giữa hai mốc này chính
là thứ milestone này sinh ra để đo được: nếu nó giãn ra, cleanup đang tồn đọng.

Phòng bị TTL thu hồi ghi `room_expired`, **không** ghi `room_completed`. Gộp
chúng lại sẽ tính mọi phòng bị bỏ rơi thành một thành công.

### Vì sao `attachment_uploaded` ghi cả thất bại

"Người dùng liên tục gửi PDF" và "người dùng liên tục đụng trần 5MB" là phát hiện
sản phẩm mà pilot cần, và chúng vô hình nếu chỉ ghi thành công.

## 3. Idempotency

Năm event `once-per-room` được ghi bằng `on conflict do nothing` dựa trên unique
index `uq_analytics_once_per_room (room_ref, event_name)`.

Cơ chế nằm ở **database**, không phải ứng dụng, vì ba nguyên nhân thực tế gây
trùng đều là race:

- Client reconnect. Điện thoại thức dậy đọc lại phòng nhiều lần một giờ.
- Request bị retry.
- Hai serverless instance xử lý đồng thời hai request của cùng một phòng.

Một guard kiểu đọc-rồi-ghi trong ứng dụng sẽ thua cả ba. `trackOnce()` có thêm
một memo trong tiến trình, nhưng đó **chỉ là tối ưu chi phí** — nó tiết kiệm
round trip, không đảm bảo gì, và mất sạch sau restart.

Ba event còn lại cố ý **không** dedupe: một phòng có năm ảnh thì có năm lần
upload, và cleanup hỏng ba lần thì đã hỏng ba lần. Dedupe chúng sẽ giấu mất một
phòng đang kẹt trong vòng retry.

## 4. Lưu trữ và retention

- Bảng: `public.analytics_events` (migration `004_pilot_readiness.sql`).
- **Không có foreign key tới `rooms`.** Đây là tính năng, không phải thiếu sót:
  funnel mà bị cascade xóa theo phòng thì vĩnh viễn không trả lời được "bao nhiêu
  phòng đạt tới `first_content_transferred`", bởi vì phòng thành công chính là
  phòng bị xóa.
- **Retention 180 ngày**, thực thi bởi `prune_analytics_events()` được
  `/api/cron/cleanup` gọi mỗi lần chạy. Đặt trong chính job đó thay vì một lịch
  riêng, vì lịch riêng là thứ không ai nhớ tạo.
- RLS bật, không policy, không grant cho `anon`/`authenticated` — cùng tư thế với
  mọi bảng khác (xem `002_lockdown.sql`).

## 5. Đổi sink

`track()` ghi qua interface `AnalyticsSink`. Mặc định là Postgres cùng project.

Không có SaaS nào được gắn sẵn, và lý do không phải là chủ nghĩa tối giản: nhiều
người mua tiềm năng sẽ từ chối một deployment gửi bất kỳ phần nào của dữ liệu này
cho bên thứ ba. Ngoài ra, SDK analytics thương mại mặc định tự động thu thập URL
và request body — tức là chính chỗ room slug đang nằm.

Muốn thêm vendor: implement `AnalyticsSink`, gọi `setAnalyticsSink()`. Adapter
chỉ nhận được đúng các field trong allowlist, nên nó không thể chuyển tiếp thứ nó
không bao giờ nhìn thấy.

## 6. Query mẫu cho funnel

```sql
-- Funnel theo tuần. Không có join nào chạm tới bảng rooms — và không cần.
select
  date_trunc('week', occurred_at) as week,
  count(*) filter (where event_name = 'room_created')              as created,
  count(*) filter (where event_name = 'second_device_joined')      as joined,
  count(*) filter (where event_name = 'first_content_transferred') as transferred,
  count(*) filter (where event_name = 'room_completed')            as completed,
  count(*) filter (where event_name = 'room_expired')              as expired
from analytics_events
where event_version = 1
group by 1
order by 1 desc;
```

```sql
-- Thời gian từ lúc tạo phòng đến lúc có dữ liệu đầu tiên.
select percentile_cont(0.5) within group (order by extract(epoch from gap)) as median_seconds
from (
  select
    max(occurred_at) filter (where event_name = 'first_content_transferred')
      - max(occurred_at) filter (where event_name = 'room_created') as gap
  from analytics_events
  where event_name in ('room_created', 'first_content_transferred')
  group by room_ref
) t
where gap is not null;
```
