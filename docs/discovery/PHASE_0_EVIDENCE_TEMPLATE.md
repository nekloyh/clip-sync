# Phase 0 — bảng bằng chứng exit gate

> Nơi tổng hợp bằng chứng cho **Product Phase 0 business exit gate**
> (`../PRODUCT_ROADMAP.md` §5 Giai đoạn 0).
>
> **Trạng thái hiện tại: `WAITING_FOR_EXTERNAL_EVIDENCE`.** Mọi bảng dưới đây
> đang trống. Đây là mẫu, và một hàng trống nghĩa là chưa thu thập được — không
> phải là số 0, và tuyệt đối không được điền bằng dữ liệu ước lượng, dữ liệu mô
> phỏng hay dữ liệu "để minh họa".
>
> Cập nhật lần cuối: chưa có dữ liệu nào được nhập.

## 0. Ba điều kiện, và cái gì được tính

| # | Điều kiện | Ngưỡng | Cái gì **được** tính là bằng chứng |
| --- | --- | --- | --- |
| G1 | Đội có handoff đủ thường xuyên | ≥10 trong 15 đội có ≥20 handoff phù hợp/tháng | Số đếm từ helpdesk của họ, hoặc ảnh chụp màn hình thống kê. Ước lượng miệng được ghi nhận nhưng **đánh dấu riêng** |
| G2 | Đội đồng ý pilot | ≥5 đội | Ngày bắt đầu đã chốt và người tham gia đã có tên. "Quan tâm" không tính |
| G3 | Đội trả tiền | ≥2 đội trả từ 100 USD/tháng, hoặc LOI tương đương | Giao dịch thanh toán, hoặc LOI có ghi mức giá và có chữ ký. Lời hứa miệng không tính |

Ba quy tắc:

1. **Một đội chỉ được đếm một lần cho mỗi điều kiện.** Hai người ở cùng công ty
   là một đội.
2. **Không suy ra G3 từ G2.** Đồng ý pilot miễn phí không phải là willingness-to-pay;
   đó chính là câu hỏi mà pilot sinh ra để trả lời.
3. **Không có gì trong repository chứng minh được ba điều kiện này.** Automated
   test, funnel SQL và health check là bằng chứng cho Phase 1, không phải cho
   phần này.

## 1. G1 — Tần suất handoff

Nguồn: `INTERVIEW_GUIDE.md` §2.

| # | Đội (ẩn danh) | Loại hình | Handoff/tháng | Trong đó nhạy cảm | Nguồn số liệu | ≥20? | Ngày |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |
| 4 | | | | | | | |
| 5 | | | | | | | |
| 6 | | | | | | | |
| 7 | | | | | | | |
| 8 | | | | | | | |
| 9 | | | | | | | |
| 10 | | | | | | | |
| 11 | | | | | | | |
| 12 | | | | | | | |
| 13 | | | | | | | |
| 14 | | | | | | | |
| 15 | | | | | | | |

**Tổng kết G1**

| Đo | Giá trị |
| --- | --- |
| Số cuộc phỏng vấn đã hoàn tất | 0 |
| Số đội đạt ≥20 handoff/tháng | 0 |
| Trong đó có số liệu đếm được (không phải ước lượng) | 0 |
| **Đạt ngưỡng 10/15?** | **chưa có dữ liệu** |

## 2. G2 — Cam kết pilot

Nguồn: `PILOT_SCORECARD.md` §1.

| # | Đội | Người ký/đồng ý (vai trò) | Ngày bắt đầu | Use case | Trả phí ngay? | Scorecard |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |

**Tổng kết G2**

| Đo | Giá trị |
| --- | --- |
| Số đội đã chốt ngày bắt đầu | 0 |
| Số pilot đã chạy xong | 0 |
| **Đạt ngưỡng ≥5?** | **chưa có dữ liệu** |

## 3. G3 — Thanh toán hoặc LOI

Nguồn: `PILOT_SCORECARD.md` §6.

| # | Đội | Hình thức | Mức giá (USD/tháng) | Ngày | Tham chiếu bằng chứng | Người duyệt chi |
| --- | --- | --- | ---: | --- | --- | --- |
| 1 | | thanh toán / LOI | | | | |
| 2 | | thanh toán / LOI | | | | |

**Tổng kết G3**

| Đo | Giá trị |
| --- | --- |
| Số đội đã trả tiền thật | 0 |
| Số đội đã ký LOI có giá | 0 |
| **Đạt ngưỡng ≥2?** | **chưa có dữ liệu** |

## 4. Baseline định lượng thu được

Những số này là đầu vào cho mục tiêu của các phase sau, và là thứ so sánh được
với funnel đo bằng `../ANALYTICS.md` §6 khi pilot chạy.

| Đo | Trung vị | Khoảng | Cỡ mẫu |
| --- | --- | --- | ---: |
| Handoff / tháng / đội | | | 0 |
| Thời gian tới khi đủ evidence | | | 0 |
| Số lượt trao đổi / ticket | | | 0 |
| Tỷ lệ phải hỏi lại dữ liệu | | | 0 |
| Mức giá đội tự nêu (USD/tháng) | | | 0 |

## 5. ICP v1 (điền sau khi có ≥10 phỏng vấn)

| Trường | Kết luận | Dựa trên |
| --- | --- | --- |
| Loại hình có tần suất cao nhất | | |
| Buyer thực tế | | |
| User thực tế | | |
| Ba use case hàng đầu | | |
| Kênh tiếp cận hiệu quả nhất | | |
| Chu kỳ mua quan sát được | | |

## 6. Giả thuyết bị bác bỏ

> Phần quan trọng nhất của tài liệu này, và phần dễ bị bỏ trống nhất. Một đợt
> discovery không bác bỏ được gì là một đợt discovery đã hỏi những câu chỉ có một
> câu trả lời.

| Giả thuyết ban đầu | Bằng chứng phản bác | Hệ quả với roadmap |
| --- | --- | --- |
| | | |

## 7. Kết luận exit gate

| Điều kiện | Trạng thái |
| --- | --- |
| G1 — ≥10/15 đội có ≥20 handoff/tháng | `WAITING_FOR_EXTERNAL_EVIDENCE` |
| G2 — ≥5 đội đồng ý pilot | `WAITING_FOR_EXTERNAL_EVIDENCE` |
| G3 — ≥2 đội trả ≥100 USD/tháng hoặc LOI | `WAITING_FOR_EXTERNAL_EVIDENCE` |

**Kết luận:** `WAITING_FOR_EXTERNAL_EVIDENCE`

Không đủ căn cứ để tuyên bố đạt hay không đạt. Theo `../PRODUCT_ROADMAP.md` §5,
nếu cuối cùng **không** đạt, hành động là giữ ClipSync ở phạm vi utility miễn
phí/open-source và tìm vertical khác — **không** phải hạ ngưỡng.
