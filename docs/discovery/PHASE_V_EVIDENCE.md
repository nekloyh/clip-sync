# Phase V — bảng bằng chứng exit gate

> Nơi tổng hợp bằng chứng cho **Phase V validation sprint** (`../../PLAN.md` §3).
>
> **Trạng thái hiện tại: `WAITING_FOR_EXTERNAL_EVIDENCE`.** Mọi bảng dưới đây
> đang trống. Đây là mẫu, và một hàng trống nghĩa là chưa thu thập được — không
> phải là số 0, và tuyệt đối không được điền bằng dữ liệu ước lượng, dữ liệu mô
> phỏng hay dữ liệu "để minh họa".
>
> Cập nhật lần cuối: chưa có dữ liệu nào được nhập.
>
> Tiền thân: `PHASE_0_EVIDENCE_TEMPLATE.md` (định vị "secure support handoff",
> ngưỡng 10/15 × ≥20 handoff và ≥2 đội trả ≥100 USD). Ngưỡng đã được thay bằng
> exit gate và kill rule của `PLAN.md` §3 Phase V; xem §0 dưới đây.

## 0. Bốn điều kiện, và cái gì được tính

`PLAN.md` §3 Phase V định nghĩa exit gate ("≥5 pilot, ≥2 paid intent/LOI, 1
workflow ≥20 lần/tháng/team") và kill rule ("<5/15 đội có pain lặp lại → dừng
feature build"). Bốn hàng dưới đây là bốn điều kiện đó, tách ra để đếm được.

| # | Điều kiện | Ngưỡng | Cái gì **được** tính là bằng chứng |
| --- | --- | --- | --- |
| G1 | Pain lặp lại (kill rule) | ≥5 trong 15 đội | Đội mô tả được **một sự kiện có ngày tháng** trong 30 ngày qua, không phải một ý kiến. `INTERVIEW_GUIDE.md` §11 ô "tính vào pain lặp lại" |
| G2 | Có workflow đủ dày | ≥1 đội có ≥20 handoff phù hợp/tháng | Số đếm từ helpdesk/PSA của họ, hoặc ảnh chụp thống kê. Ước lượng miệng được ghi nhận nhưng **đánh dấu riêng** |
| G3 | Đội chạy pilot | ≥5 đội | Ngày bắt đầu đã chốt và người tham gia đã có tên. "Quan tâm" không tính |
| G4 | Paid intent | ≥2 đội, trong khoảng 50–150 USD/team/tháng | Giao dịch thanh toán, hoặc LOI có ghi mức giá và có chữ ký. Lời hứa miệng không tính |

> **Ghi chú về G3.** `PLAN.md` §3 Phase V liệt kê hoạt động là "3–5 concierge
> pilot" nhưng exit gate ghi "≥5 pilot". Số ràng buộc là **5** (exit gate thắng);
> "3–5" là ước lượng khối lượng công việc, không phải ngưỡng. Nếu chốt được 4
> pilot chất lượng cao, đó là một quyết định cần ghi vào §8 chứ không phải một
> gate được coi là đã đạt.

Bốn quy tắc:

1. **Một đội chỉ được đếm một lần cho mỗi điều kiện.** Hai người ở cùng công ty
   là một đội.
2. **Không suy ra G4 từ G3.** Đồng ý pilot miễn phí không phải là willingness-to-pay;
   đó chính là câu hỏi mà pilot sinh ra để trả lời.
3. **Không suy ra G1 từ sự nhiệt tình.** Một đội nói "rất cần" mà không nêu được
   sự kiện nào trong 30 ngày qua **không** tính vào 5/15.
4. **Không có gì trong repository chứng minh được bốn điều kiện này.** Automated
   test, funnel SQL và health check là bằng chứng cho chất lượng code, không phải
   cho phần này.

## 1. G1 — Pain lặp lại (kill rule 5/15)

Nguồn: `INTERVIEW_GUIDE.md` §2, §5, §11.

Cột **Wedge tự phát** lấy từ `INTERVIEW_GUIDE.md` §6 và §7 — đội có tự nêu vấn đề
client-side redaction hoặc chứng minh integrity **trước khi** ta mô tả sản phẩm
hay không. Đây là cột đo giả thuyết trung tâm của định vị hiện tại; một loạt
phỏng vấn đạt G1 nhưng cột này trống nghĩa là pain có thật còn *wedge* thì không.

| # | Đội (ẩn danh) | Loại hình | PSA/help desk | Sự kiện có ngày tháng? | Pain lặp lại? | Wedge tự phát | Ngày |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | | | | | | zero-PII / integrity / không | |
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
| Số đội có pain lặp lại kèm sự kiện có ngày tháng | 0 |
| Số đội tự phát nêu wedge zero-PII | 0 |
| Số đội tự phát nêu wedge integrity | 0 |
| **Đạt ngưỡng ≥5/15?** | **chưa có dữ liệu** |

## 2. G2 — Workflow đủ dày (≥20 handoff/tháng)

Nguồn: `INTERVIEW_GUIDE.md` §2.

| # | Đội | Handoff/tháng | Trong đó nhạy cảm | Nguồn số liệu | Đếm được hay ước lượng? | ≥20? |
| --- | --- | ---: | ---: | --- | --- | --- |
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |

**Tổng kết G2**

| Đo | Giá trị |
| --- | --- |
| Số đội đạt ≥20 handoff/tháng | 0 |
| Trong đó có số liệu đếm được (không phải ước lượng) | 0 |
| **Đạt ngưỡng ≥1 đội?** | **chưa có dữ liệu** |

## 3. G3 — Pilot đã chốt

Nguồn: `PILOT_SCORECARD.md` §1.

| # | Đội | Người ký/đồng ý (vai trò) | Ngày bắt đầu | Use case | Trả phí ngay? | Scorecard |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |

**Tổng kết G3**

| Đo | Giá trị |
| --- | --- |
| Số đội đã chốt ngày bắt đầu | 0 |
| Số pilot đã chạy xong | 0 |
| **Đạt ngưỡng ≥5?** | **chưa có dữ liệu** |

## 4. G4 — Paid intent

Nguồn: `PILOT_SCORECARD.md` §7.

| # | Đội | Hình thức | Mức giá (USD/tháng) | Ngày | Tham chiếu bằng chứng | Người duyệt chi |
| --- | --- | --- | ---: | --- | --- | --- |
| 1 | | thanh toán / LOI | | | | |
| 2 | | thanh toán / LOI | | | | |

**Tổng kết G4**

| Đo | Giá trị |
| --- | --- |
| Số đội đã trả tiền thật | 0 |
| Số đội đã ký LOI có giá | 0 |
| Mức giá quan sát được (khoảng, trung vị) | |
| **Đạt ngưỡng ≥2?** | **chưa có dữ liệu** |

## 5. Bậc thang cam kết trên toàn pipeline

Tổng hợp `INTERVIEW_GUIDE.md` §10 cho mọi đội. Bảng này trả lời câu hỏi mà bốn
gate ở trên không trả lời được: pipeline đang **kẹt ở đâu**.

| Bậc | Số đội đã đạt |
| --- | ---: |
| 0. Đã nói chuyện | 0 |
| 1. Đưa artifact | 0 |
| 2. Thử thật | 0 |
| 3. Đưa cho khách hàng thật | 0 |
| 4. Pilot đã chốt | 0 |
| 5. Paid intent | 0 |

> Hình dạng của cột này quan trọng hơn tổng của nó. Sụt mạnh ở bậc 1→2 nghĩa là
> pain có thật nhưng giải pháp chưa đáng công cài đặt; sụt ở 3→4 nghĩa là dùng
> được nhưng chưa đáng để đổi quy trình; sụt ở 4→5 nghĩa là đáng dùng nhưng không
> đáng trả tiền. Ba kết luận đó dẫn tới ba hành động hoàn toàn khác nhau.

## 6. Baseline định lượng thu được

Những số này là đầu vào cho KPI ở `PLAN.md` §6, và là thứ so sánh được với funnel
đo bằng `../ANALYTICS.md` §6 khi pilot chạy.

| Đo | Trung vị | Khoảng | Cỡ mẫu |
| --- | --- | --- | ---: |
| Handoff / tháng / đội | | | 0 |
| Thời gian tới khi đủ evidence | | | 0 |
| Số lượt trao đổi / ticket | | | 0 |
| Tỷ lệ phải hỏi lại dữ liệu | | | 0 |
| Số đội chứng minh được "đã xóa" bằng artifact | | | 0 |
| Mức giá đội tự nêu (USD/tháng) | | | 0 |

## 7. ICP v1 (điền sau khi có ≥10 phỏng vấn)

| Trường | Kết luận | Dựa trên |
| --- | --- | --- |
| Loại hình có tần suất cao nhất | | |
| MSP có dễ vào hơn support in-house không? | | |
| PSA/help desk xuất hiện nhiều nhất (chọn integration Phase D) | | |
| Buyer thực tế | | |
| User thực tế | | |
| Ba use case hàng đầu | | |
| Kênh tiếp cận hiệu quả nhất | | |
| Chu kỳ mua quan sát được | | |

## 8. Giả thuyết bị bác bỏ

> Phần quan trọng nhất của tài liệu này, và phần dễ bị bỏ trống nhất. Một đợt
> discovery không bác bỏ được gì là một đợt discovery đã hỏi những câu chỉ có một
> câu trả lời.

Ba giả thuyết mà định vị hiện tại đứng trên (`PLAN.md` §1), cần được xác nhận
hoặc bác bỏ tường minh trong loạt này:

| # | Giả thuyết ban đầu | Bằng chứng phản bác | Hệ quả với roadmap |
| --- | --- | --- | --- |
| H1 | Đội hỗ trợ phân biệt được, và quan tâm tới, client-side vs server-side redaction | | Bác bỏ → Phase B mất lý do tồn tại; xem lại toàn bộ §1 của PLAN |
| H2 | Có đủ đội bị hỏi "chứng minh đã xóa/đã nhận" để trả tiền cho manifest | | Bác bỏ → Phase C xuống ưu tiên, cân nhắc gộp vào Phase D |
| H3 | MSP là kênh dễ vào hơn đội support in-house | | Bác bỏ → đổi ICP, giữ nguyên wedge |
| | | | |

## 9. Kết luận exit gate

| Điều kiện | Ngưỡng | Trạng thái |
| --- | --- | --- |
| G1 — pain lặp lại | ≥5/15 | `WAITING_FOR_EXTERNAL_EVIDENCE` |
| G2 — workflow ≥20 handoff/tháng | ≥1 đội | `WAITING_FOR_EXTERNAL_EVIDENCE` |
| G3 — pilot đã chốt | ≥5 | `WAITING_FOR_EXTERNAL_EVIDENCE` |
| G4 — paid intent | ≥2 | `WAITING_FOR_EXTERNAL_EVIDENCE` |

**Kết luận:** `WAITING_FOR_EXTERNAL_EVIDENCE`

Không đủ căn cứ để tuyên bố đạt hay không đạt.

Theo `PLAN.md` §3, nếu G1 **không** đạt (dưới 5/15), hành động ở ngày 14 là dừng
feature build và quay lại portfolio-finish mode: release case study rồi freeze —
**không** hạ ngưỡng, và không chuyển sang Phase B "để xem thử".
