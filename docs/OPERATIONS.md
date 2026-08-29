# Vận hành ClipSync

Tài liệu cho người deploy và trực hệ thống trong giai đoạn pilot. Phần sản phẩm
và setup nằm ở `README.md`; phần telemetry nằm ở `docs/ANALYTICS.md`.

## 1. Health endpoints

| Endpoint | Auth | Trả lời câu hỏi | Trỏ gì vào đây |
| --- | --- | --- | --- |
| `GET /api/health/live` | không | Process còn chạy không? | Liveness probe của orchestrator |
| `GET /api/health/ready` | không | Instance làm việc được không? | Uptime monitor, deploy gate |
| `GET /api/health` | không | (bí danh của `ready`) | Monitor cũ — vẫn hoạt động |
| `GET /api/health/ops` | `Bearer $CRON_SECRET` | Cron còn chạy không, tồn đọng bao nhiêu? | Dashboard nội bộ, alert |

**Liveness không chạm dependency nào.** Một liveness probe có gọi database sẽ báo
"chết" trong lúc database sự cố, và orchestrator sẽ restart toàn bộ instance đang
khỏe — biến một sự cố dependency thành một cơn bão restart chồng lên nó.

**Readiness kiểm tra bốn thứ:**

| Check | `ok` khi | Ý nghĩa khi hỏng |
| --- | --- | --- |
| `config` | Có `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CLIPSYNC_AUTH_SECRET` ≥ 32 ký tự **và khác** service-role key | Deployment sai cấu hình |
| `database` | Select được `owner_secret_hash`, `owner_version`, `lifecycle_state` | Thiếu migration 003 hoặc 004 |
| `storage` | List được bucket `clipsync-attachments` | Sai tên bucket, sai credential, Storage sự cố |
| `rateLimiter` | Có shared store, **hoặc** `not_configured` khi không bắt buộc | Xem mục 4 |

Không endpoint nào trả về project URL, tên bucket, tên bảng, tên cột hay thông
điệp lỗi của provider. Readiness thường được để mở và là thứ đầu tiên bị curl.

`/api/health/ops` trả 401 cho **mọi** trường hợp không hợp lệ, kể cả khi chưa cấu
hình `CRON_SECRET`: nói "chưa cấu hình" là báo cho người lạ biết endpoint này
đang không được bảo vệ và đáng thử lại sau lần deploy tới.

## 2. Cron jobs

`vercel.json` khai báo hai lịch:

| Job | Lịch | Việc |
| --- | --- | --- |
| `/api/cron/cleanup` | mỗi giờ | Đánh dấu phòng hết TTL, rút hàng đợi xóa, prune analytics |
| `/api/cron/reconcile` | hằng ngày | Dò lệch DB ↔ storage, **chỉ báo cáo** |

Cả hai yêu cầu `Authorization: Bearer $CRON_SECRET`. Không có secret thì cleanup
trả 503 và **không phòng nào được dọn** — đó là tình huống phải alert.

Cleanup chạy hằng giờ chứ không hằng ngày, vì mỗi lần chạy bị giới hạn batch
(25 phòng) và giới hạn thời gian (45 giây). Chạy thường xuyên hơn với batch nhỏ
sẽ tốt hơn một lần chạy lớn bị runtime giết giữa chừng.

Tách reconcile khỏi cleanup là có chủ đích: cleanup là đường phải chạy đúng hạn
mỗi đêm, còn reconcile phải duyệt storage nên chậm và khó đoán. Gộp lại — như
orphan sweep cũ — nghĩa là một lần list bucket chậm sẽ ăn hết ngân sách của job
thật sự xóa dữ liệu người dùng.

## 3. Vòng đời xóa phòng

```
active ──(owner bấm xóa | TTL 7 ngày)──► deletion_pending
                                              │
                                              ▼ cron claim
                                          deleting
                                              │
                     ┌────────────────────────┴──────────────────┐
                     ▼ thành công                                ▼ storage lỗi
                  (row biến mất)                          deletion_pending
                                                        attempts + 1, error_code
                                                                  │
                                                       sau 5 lần: deletion_failed
```

**Phòng ngừng đọc được ngay khi rời `active`.** Owner bấm xóa thì mọi read path
trả 404 tức thì; "đã xóa" mà vẫn phục vụ nội dung tới khi cron chạy thì không
phải là đã xóa. `DELETE /api/rooms/[slug]` vì vậy trả **202**, không phải 200:
metadata đã khuất, bytes sẽ biến mất ngay sau đó.

**Thứ tự bên trong worker: object → attachment rows → room row.** Bản cũ làm
ngược lại và đó là thứ tự không thể khôi phục — row là bản ghi duy nhất cho biết
object nào thuộc phòng nào, nên mất row là biến mọi ảnh còn lại thành orphan
không ai quy được về đâu và không gì retry được.

Mọi bước đều lặp lại được: object đã mất coi như đã xóa (Supabase Storage không
báo lỗi cho key không tồn tại, và không được phép báo lỗi — "lần trước thành công
rồi crash" là lý do phổ biến nhất khiến có retry).

**Một phòng chỉ được thử một lần mỗi lần chạy.** Thất bại đưa phòng về
`deletion_pending`, tức là claim được ngay; không loại trừ thì vòng lặp sẽ đốt
sạch 5 lượt retry trong vài giây vào một sự cố storage vẫn còn nguyên ở đó.

Xóa thủ công và hết hạn dùng **chung một đoạn code**. Trước đây là hai đường,
sai theo hai kiểu khác nhau.

## 4. Rate limiting

Chính sách được đặt tên tập trung ở `src/lib/limiter/policies.ts`.

| Policy | Giới hạn | Khi shared store chết |
| --- | --- | --- |
| `create_room` | 20 / phút | `fallback_memory` |
| `room_visit` | 60 / phút | `fallback_memory` |
| `pin_verify` | 10 / 10 phút / client | **`fail_closed`** |
| `pin_verify_room` | 50 / 10 phút / phòng | **`fail_closed`** |
| `pin_set` | 10 / phút | **`fail_closed`** |
| `save_content` | 120 / phút | `fallback_memory` |
| `upload` | 30 / phút | `fallback_memory` |
| `owner_mutation` | 60 / phút | `fallback_memory` |

### Chính sách suy giảm

1. **Có shared store và nó trả lời** → phán quyết của nó, có thẩm quyền.
2. **Có shared store nhưng lỗi** → theo `onStoreUnavailable`. Cả hai nhánh đều
   ghi log `rate_limit.store_unavailable` với `degraded: true`, nên guarantee yếu
   đi là điều **nhìn thấy được**, không phải điều được giả định.
   - `fail_closed` → 503 + `Retry-After: 30`, code `rate_limiter_unavailable`.
   - `fallback_memory` → limiter trong tiến trình, vẫn đếm, chỉ yếu hơn.
3. **Không cấu hình shared store** → limiter trong tiến trình, **không** coi là
   suy giảm. Local và single-process là setup được hỗ trợ, không phải sự cố; coi
   nó là sự cố sẽ khiến `fail_closed` có nghĩa là "verify PIN không chạy trên máy
   dev". Đặt `CLIPSYNC_REQUIRE_DISTRIBUTED_LIMITER=1` để readiness *fail* khi
   thiếu store, nên tình huống này không thể lọt ra production mà không ai biết.

**Vì sao PIN `fail_closed`:** fallback theo tiến trình bị bypass bằng cách để
request kế tiếp rơi vào instance khác. Với một bí mật 4 chữ số (10.000 khả năng)
thì đó không phải giới hạn. Redis chết sẽ khóa người dùng khỏi phòng có PIN trong
thời gian sự cố — đánh đổi có chủ đích: **tạm thời không dùng được tốt hơn âm
thầm brute-force được.**

**Vì sao xóa phòng `fallback_memory`:** đây là sản phẩm hứa dữ liệu biến mất khi
được yêu cầu. Một sự cố cache không được phép ngăn điều đó.

**Verify PIN bị giới hạn theo hai chiều.** Chỉ giới hạn theo client là giới hạn
đoán PIN *từ một địa chỉ*: 10 lần / 10 phút / địa chỉ là ngân sách mà vài trăm
địa chỉ tiêu hết trong một buổi chiều. Giới hạn theo phòng chặn tổng số lần đoán
bất kể phân tán thế nào.

**Key không bao giờ chứa dữ liệu thô.** Định dạng là `rl:<policy>:<hmac>`. Một
shared cache là nơi IP hoặc slug sẽ tồn tại ngoài database, người vận hành cache
đọc được, không có retention policy, và còn lại sau khi phòng đã bị xóa. Log lỗi
của limiter cố tình **vứt bỏ** exception, vì thông điệp của cache client trích
dẫn lệnh đã lỗi, và lệnh đó chứa key.

## 5. Alert tối thiểu khi deploy

| Alert | Điều kiện | Ý nghĩa |
| --- | --- | --- |
| **Readiness** | `/api/health/ready` ≠ 200 trong 5 phút | Sai cấu hình, thiếu migration, hoặc mất dependency |
| **Cron chết** | `jobs[cleanup].secondsSinceCompletion > 172800` (2 ngày) | Scheduler ngừng gọi. Không có alert này thì im lặng trông y hệt một tuần vắng khách |
| **Tồn đọng** | `deletionQueue.pending` tăng đều qua 3 lần đo | Cleanup chạy nhưng không theo kịp. Mỗi lần chạy vẫn báo success |
| **Xóa thất bại** | `deletionQueue.failed > 0` | Có phòng đã hết retry mà dữ liệu vẫn còn. Cần người xử lý |
| **Lệch DB/storage** | `reconciliation.openFindings` tăng đều | Upload hoặc xóa đang đứt giữa chừng |
| **Limiter suy giảm** | Có log `rate_limit.store_unavailable` | Redis sự cố; verify PIN đang từ chối |
| **Lỗi 5xx** | Log `level: error` với `errorCode` bất kỳ | Dùng `requestId` để nối các dòng của cùng một request |

Lấy số liệu:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/health/ops | jq
```

## 6. Xử lý sự cố

**`deletionQueue.failed > 0`**

Có phòng đã thử 5 lần và bỏ cuộc. Tra `deletion_error_code` để biết loại lỗi
(không có thông điệp provider — cố ý). Sau khi sửa nguyên nhân, đưa phòng trở lại
hàng đợi:

```sql
update rooms
set lifecycle_state = 'deletion_pending', deletion_attempts = 0, deletion_error_code = null
where lifecycle_state = 'deletion_failed';
```

**Phòng kẹt ở `deleting`**

Worker chết giữa chừng. Tự khỏi: sau 10 phút phòng được claim lại. Không cần can
thiệp trừ khi kéo dài hơn thế.

**Reconciliation báo `object_without_db`**

Chỉ là *ứng viên*, không phải kết luận. Một object không có row không phân biệt
được với một upload đang bay (upload ghi object trước, row sau) và với object của
hệ thống khác. **Không có xóa tự động.** Nếu quyết định dọn tay, chỉ dọn finding
vẫn còn sau một khoảng đủ dài để loại trừ upload đang dở.

**Thiếu migration**

`checks.database` = `degraded`. Ứng dụng vẫn phục vụ phòng đang có ở chế độ suy
giảm (xem `getRoom` trong `src/lib/rooms.ts`) thay vì sập toàn bộ. Chạy migration
còn thiếu; instance đang chạy tự nhận ra trong vòng 60 giây, hoặc ngay lập tức
sau một lần gọi `/api/health/ready` thành công.

## 7. Log

JSON một dòng mỗi bản ghi, allowlist theo `src/lib/log.ts`. Field chuẩn:
`timestamp`, `level`, `event`, `requestId`, `route`, `outcome`, `errorCode`,
`durationMs`.

Không bao giờ có mặt: room content · PIN hoặc PIN hash · cookie · `authorization`
header · **room slug** · filename · owner/access token · raw IP · raw user-agent.

Đây là **allowlist chứ không phải denylist**, và khác biệt đó là toàn bộ thiết
kế: một denylist phải được gia hạn mỗi lần có người thêm field, và cái ngày ai đó
log `{ body }` để debug nhanh thì room content đã nằm trong log mà không luật nào
kích hoạt.

`requestId` lấy từ `x-request-id` gửi vào **sau khi kiểm tra hình dạng** — header
do client kiểm soát, và một giá trị không kiểm tra là một field tự do trong mọi
dòng log của request đó, kể cả ký tự xuống dòng.
