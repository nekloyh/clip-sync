# Pilot scorecard

> Artifact của Product Phase 0 (`../PRODUCT_ROADMAP.md` §5 Giai đoạn 0) — chạy
> 3–5 pilot concierge bằng sản phẩm hiện tại cộng quy trình thủ công.
>
> **Không điền dữ liệu giả.** Một pilot chưa chạy là một scorecard trống, không
> phải một scorecard toàn số 0. Mỗi pilot là một bản sao của file này trong
> `docs/discovery/pilots/<tên-đội>.md`.

## 0. Pilot này chứng minh cái gì, và không chứng minh cái gì

**Chứng minh:** một đội thật, với ticket thật và khách hàng thật, có dùng phòng
ClipSync cho công việc của họ hay không, và có trả tiền cho việc đó hay không.

**Không chứng minh:** rằng sản phẩm sẵn sàng cho quy mô lớn, rằng kiến trúc đúng,
hay rằng bảo mật đủ. Đó là các gate của Technical Phase 1–3.

**Điều kiện dừng pilot sớm:** nếu sau tuần 2 chưa có handoff thật nào (không tính
handoff do chính chúng ta tạo để hướng dẫn), dừng và ghi lý do. Kéo dài một pilot
không có usage chỉ tạo ra dữ liệu trông giống đang tiến triển.

## 1. Thông tin pilot

| Trường | Giá trị |
| --- | --- |
| Đội / công ty | |
| Loại hình (MSP / SaaS / hiện trường / khác) | |
| Người liên hệ chính (vai trò) | |
| Ngày bắt đầu | |
| Ngày kết thúc dự kiến | |
| Số agent tham gia | |
| Use case đã chốt cho pilot | |
| Cam kết thương mại khi bắt đầu | trả phí / LOI / miễn phí |
| Nếu miễn phí: lý do chấp nhận | |

> "Miễn phí vì họ chưa chắc" là một câu trả lời hợp lệ và cần được ghi lại —
> nhưng một pilot miễn phí **không** tính vào điều kiện "≥2 đội trả từ 100
> USD/tháng".

## 2. Baseline trước pilot

> Đo **trước** khi bật, nếu không sẽ không có gì để so sánh. Lấy từ phần 2–3 của
> `INTERVIEW_GUIDE.md`.

| Đo | Giá trị | Nguồn |
| --- | --- | --- |
| Handoff / tháng | | |
| Thời gian tới khi đủ evidence (trung vị) | | |
| Số lượt trao đổi / ticket | | |
| Tỷ lệ ticket phải hỏi lại dữ liệu | | |
| Đường gửi hiện tại | | |

## 3. Usage trong pilot

> Lấy từ `/api/health/ops` và từ funnel SQL trong `../ANALYTICS.md` §6. Các số
> này là **privacy-safe theo thiết kế**: không có slug, filename hay nội dung.

| Tuần | Phòng tạo | Có người thứ hai vào | Có dữ liệu | Hoàn tất | Hết hạn |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |

| Đo tổng hợp | Giá trị |
| --- | --- |
| Handoff hoàn tất / agent / tuần | |
| Median time-to-first-evidence | |
| Completion rate (completed / (completed + expired)) | |
| Upload failure rate | |
| Số phòng bị bỏ dở sau khi tạo | |

## 4. Chất lượng và ma sát

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

## 5. Sự cố trong pilot

| Ngày | Cái gì hỏng | Ảnh hưởng tới người dùng | Nguyên nhân | Đã sửa? |
| --- | --- | --- | --- | --- |
| | | | | |

Kiểm tra kèm theo mỗi sự cố:

- [ ] Có xuất hiện trong `/api/health/ops` không, hay chỉ người dùng báo?
- [ ] Alert nào lẽ ra phải kêu (`../OPERATIONS.md` §5)?
- [ ] Nếu không alert nào kêu: đó là finding, ghi vào runbook.

## 6. Kết quả thương mại

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

## 7. Đánh giá

| Tiêu chí | Đạt? | Ghi chú |
| --- | --- | --- |
| Đội dùng thật cho ticket thật (không phải dùng thử) | | |
| ≥3 handoff / agent / tuần | | |
| Median time-to-first-evidence < 5 phút | | |
| Không có sự cố mất dữ liệu | | |
| Không có hiểu nhầm về bảo mật còn tồn tại khi kết thúc | | |
| Có cam kết thương mại | | |

**Kết luận:** design partner / tiếp tục theo dõi / dừng

**Giả thuyết bị pilot này bác bỏ:**
