# Pilot scorecard — Phase V concierge pilot

> Artifact của **Phase V** (`../../PLAN.md` §3) — chạy 3–5 pilot concierge bằng
> sản phẩm hiện tại cộng quy trình thủ công. Baseline hiện tại đủ để chạy pilot;
> redaction client-side (Phase B) và manifest (Phase C) **chưa có** khi pilot bắt
> đầu, nên phần 4 dưới đây đo *pain*, không đo tính năng.
>
> **Không điền dữ liệu giả.** Một pilot chưa chạy là một scorecard trống, không
> phải một scorecard toàn số 0. Mỗi pilot là một bản sao của file này trong
> `docs/discovery/pilots/<tên-đội>.md`.

## 0. Pilot này chứng minh cái gì, và không chứng minh cái gì

**Chứng minh:** một đội thật, với ticket thật và khách hàng thật, có dùng phòng
ClipSync cho công việc của họ hay không, có trả tiền cho việc đó hay không, và —
mới so với bản trước — hai wedge của định vị hiện tại có được nêu ra **trước khi
ta nhắc tới chúng** hay không.

**Không chứng minh:** rằng sản phẩm sẵn sàng cho quy mô lớn, rằng kiến trúc đúng,
hay rằng bảo mật đủ. Cũng **không** chứng minh redaction engine hoạt động —
Phase B có DoD riêng với eval set FP/FN (`PLAN.md` §3 Phase B).

**Điều kiện dừng pilot sớm:** nếu sau tuần 2 chưa có handoff thật nào (không tính
handoff do chính chúng ta tạo để hướng dẫn), dừng và ghi lý do. Kéo dài một pilot
không có usage chỉ tạo ra dữ liệu trông giống đang tiến triển.

## 1. Thông tin pilot

| Trường | Giá trị |
| --- | --- |
| Đội / công ty | |
| Loại hình (MSP / MSSP / SaaS / hiện trường / khác) | |
| Số tổ chức khách hàng phục vụ | |
| PSA / RMM / help desk đang dùng | |
| Người liên hệ chính (vai trò) | |
| Ngày bắt đầu | |
| Ngày kết thúc dự kiến | |
| Số agent tham gia | |
| Use case đã chốt cho pilot | |
| Cam kết thương mại khi bắt đầu | trả phí / LOI / miễn phí |
| Nếu miễn phí: lý do chấp nhận | |

> "Miễn phí vì họ chưa chắc" là một câu trả lời hợp lệ và cần được ghi lại —
> nhưng một pilot miễn phí **không** tính vào điều kiện "≥2 paid intent" của
> Phase V exit gate.

## 2. Baseline trước pilot

> Đo **trước** khi bật, nếu không sẽ không có gì để so sánh. Lấy từ phần 2–5 của
> `INTERVIEW_GUIDE.md`.

| Đo | Giá trị | Nguồn |
| --- | --- | --- |
| Handoff / tháng | | |
| Thời gian tới khi đủ evidence (trung vị) | | |
| Số lượt trao đổi / ticket | | |
| Tỷ lệ ticket phải hỏi lại dữ liệu | | |
| Đường gửi hiện tại | | |
| Cách họ chứng minh "đã xóa" hôm nay | artifact / lời nói / không có |

## 3. Usage trong pilot

> Lấy từ `/api/health/ops` và từ funnel SQL trong `../ANALYTICS.md` §6. Các số
> này là **privacy-safe theo thiết kế**: không có slug, filename hay nội dung.

| Tuần | Phòng tạo | Có người thứ hai vào | Có dữ liệu | Hoàn tất | Hết hạn |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |

| Đo tổng hợp | Giá trị | Ngưỡng KPI (`PLAN.md` §6) |
| --- | --- | --- |
| Handoff hoàn tất / agent / tuần | | |
| Median time-to-first-evidence | | < 5 phút |
| Completion rate (completed / (completed + expired)) | | |
| Recipient hoàn thành không cần trợ giúp | | ≥ 70% |
| Upload failure rate | | |
| Số phòng bị bỏ dở sau khi tạo | | |
| Handoff / tháng quy đổi (cho KPI "≥20/tháng/team") | | ≥ 20 với ≥1 team |

## 4. Tín hiệu cho hai wedge (phần quan trọng nhất của bản này)

> Pilot chạy trên baseline **chưa có** redaction client-side và **chưa có**
> manifest. Vì thế phần này không đo tính năng — nó đo xem sự vắng mặt của chúng
> có bị nhận ra hay không. Một pain không ai nêu khi nó đang tồn tại là một pain
> không ai sẽ trả tiền để giải quyết.
>
> **Quy tắc ghi chép:** với mỗi ô, ghi rõ tín hiệu là **tự phát** (họ nêu trước)
> hay **được hỏi** (ta hỏi trước). Chỉ tín hiệu tự phát mới là bằng chứng cho
> định vị; tín hiệu được hỏi là bằng chứng cho việc ta biết cách gợi ý.

### 4.1 Wedge zero-PII ingestion

| Quan sát | Ghi nhận | Tự phát / được hỏi |
| --- | --- | --- |
| Có ai hỏi "dữ liệu này che trước hay sau khi gửi?" | | |
| Có agent nào **tự tay** che/cắt ảnh trước khi bảo khách gửi không? Mất bao lâu? | | |
| Có lần nào khách gửi lên thứ lẽ ra không nên gửi? Bao nhiêu lần? | | |
| Khi đó xử lý thế nào — xóa phòng, xóa ticket, báo cáo, hay không làm gì? | | |
| Có ai từ chối dùng vì "server các anh vẫn đọc được"? | | |

### 4.2 Wedge evidence integrity

| Quan sát | Ghi nhận | Tự phát / được hỏi |
| --- | --- | --- |
| Có ai hỏi "làm sao tôi chứng minh đã nhận đúng file này?" | | |
| Có ai cần xuất/lưu lại evidence ra ngoài ClipSync (đính vào ticket, gửi audit)? | | |
| Có tranh chấp nào về "khách đã gửi rồi / chưa gửi" trong pilot không? | | |
| Có ai hỏi về timestamp, checksum, hoặc ai đã upload cái gì? | | |
| Có yêu cầu nào về việc chứng minh dữ liệu **đã bị xóa**? | | |

**Kết luận wedge (bắt buộc điền, một trong ba):**

- `zero-PII mạnh hơn` / `integrity mạnh hơn` / `cả hai đều yếu`
- Lý do, kèm bằng chứng tự phát:

## 5. Chất lượng và ma sát

| Câu hỏi | Ghi nhận |
| --- | --- |
| Khách hàng có mở được link mà không cần hướng dẫn thêm không? | |
| Bao nhiêu lần agent phải giải thích cách dùng? | |
| Thiết bị/trình duyệt nào gây trục trặc? | |
| Có ai hiểu nhầm về mức độ bảo mật không? (nguyên văn) | |
| Có ai hỏi về E2EE, thời hạn tùy chỉnh, hoặc thu hồi link không? | |
| Agent mất quyền owner lần nào? (đổi máy, xóa cookie) | |
| Có yêu cầu tính năng nào lặp lại ở ≥2 đội? | |

> Ô cuối là ô có giá trị nhất cho roadmap: một yêu cầu từ một đội là một ý kiến;
> cùng một yêu cầu từ hai đội độc lập là một tín hiệu.
>
> Lưu ý riêng cho ô "hiểu nhầm về bảo mật": pilot chạy trên baseline **không**
> E2EE và **không** redaction. Bất kỳ ai rời pilot mà vẫn tin là có, là một lỗi
> của ta, phải sửa ngay trong pilot và ghi vào đây nguyên văn.

## 6. Sự cố trong pilot

| Ngày | Cái gì hỏng | Ảnh hưởng tới người dùng | Nguyên nhân | Đã sửa? |
| --- | --- | --- | --- | --- |
| | | | | |

Kiểm tra kèm theo mỗi sự cố:

- [ ] Có xuất hiện trong `/api/health/ops` không, hay chỉ người dùng báo?
- [ ] Alert nào lẽ ra phải kêu (`../OPERATIONS.md` §5)?
- [ ] Nếu không alert nào kêu: đó là finding, ghi vào runbook.
- [ ] Có phải sự cố PII/secret không? Nếu có, KPI "Safety = 0" (`PLAN.md` §6) đã
      bị vi phạm — ghi vào đây và vào báo cáo Phase V, không lặng lẽ sửa.

## 7. Kết quả thương mại

| Đo | Giá trị |
| --- | --- |
| Tiếp tục sau pilot? | có / không / chưa quyết |
| Mức giá đã chấp nhận (USD/tháng) | |
| Hình thức | thanh toán thật / LOI / chưa có |
| Ngày thanh toán hoặc ngày ký LOI | |
| Link/tham chiếu tới bằng chứng | |
| Nếu không tiếp tục: lý do nguyên văn | |

> "Chưa quyết" sau khi pilot kết thúc được tính là **không**. Exit gate hỏi về
> tiền và chữ ký, không hỏi về thiện chí.

## 8. Đánh giá

Cột **Nguồn** phân biệt ngưỡng bắt buộc với ngưỡng do người chạy pilot tự đặt.
Chỉ hàng ghi `PLAN.md §6` mới là KPI ràng buộc; hàng ghi `heuristic` là mức tự
đặt cho pilot này và có thể chỉnh, miễn ghi lại lý do.

| Tiêu chí | Nguồn | Đạt? | Ghi chú |
| --- | --- | --- | --- |
| Đội dùng thật cho ticket thật (không phải dùng thử) | heuristic | | |
| ≥3 handoff / agent / tuần | heuristic (quy đổi từ ≥20/tháng/team, `PLAN.md` §6) | | |
| Median time-to-first-evidence < 5 phút | `PLAN.md` §6 | | |
| Recipient hoàn thành không cần trợ giúp ≥70% | `PLAN.md` §6 | | |
| Giảm ≥1 vòng hỏi-lại per ticket so với baseline §2 | `PLAN.md` §6 | | |
| Không có sự cố mất dữ liệu | heuristic | | |
| Không có sự cố PII/secret | `PLAN.md` §6 | | |
| Không có hiểu nhầm về bảo mật còn tồn tại khi kết thúc | heuristic | | |
| **Ít nhất một wedge được nêu tự phát (§4)** | heuristic | | |
| Có cam kết thương mại | heuristic | | |

**Kết luận:** design partner / tiếp tục theo dõi / dừng

**Giả thuyết bị pilot này bác bỏ:**
