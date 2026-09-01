# Interview guide — Secure Support Handoff

> Artifact của Product Phase 0 (`../PRODUCT_ROADMAP.md` §5 Giai đoạn 0).
>
> **Không điền dữ liệu giả vào file này.** Nó là mẫu. Mỗi cuộc phỏng vấn được
> chép thành một file riêng trong `docs/discovery/interviews/` và tổng hợp vào
> `PHASE_0_EVIDENCE_TEMPLATE.md`. Một hàng trống là thông tin ("chưa hỏi được");
> một hàng bịa là chất độc đối với một quyết định go/no-go.

## 0. Nguyên tắc

**Hỏi về ticket gần nhất, không hỏi ý kiến.** "Anh có thấy việc gửi log là phiền
không?" luôn nhận được câu trả lời lịch sự và vô dụng. "Ticket cuối cùng anh phải
xin khách một screenshot là ticket nào? Mở nó ra giúp tôi" nhận được một sự thật
có ngày tháng.

Bốn quy tắc:

1. **Quá khứ, không tương lai.** Hỏi họ đã làm gì, không hỏi họ sẽ dùng gì.
2. **Số đếm được, không tính từ.** "Thường xuyên" không phải dữ liệu; "khoảng 30
   lần tháng trước" thì có.
3. **Không mô tả sản phẩm trước phần 6.** Nói trước sẽ biến mọi câu trả lời sau
   đó thành sự lịch sự.
4. **Không dẫn dắt về bảo mật.** Nếu vấn đề bảo mật có thật, họ sẽ tự nêu trước
   khi tới phần 5. Nếu phải gợi ý mới có, đó là câu trả lời — hãy ghi lại rằng đó
   là câu trả lời được gợi ý.

**Thời lượng:** 30–40 phút. **Mục tiêu:** 15–20 cuộc.

## 1. Nhận dạng (2 phút)

| Trường | Giá trị |
| --- | --- |
| Ngày phỏng vấn | |
| Công ty (loại hình) | MSP / SaaS B2B / triển khai hiện trường / security-DevOps / khác |
| Quy mô đội hỗ trợ | |
| Số khách hàng bên ngoài phục vụ | |
| Vai trò người được hỏi | |
| Kênh tiếp cận | |

## 2. Tần suất — số cần cho exit gate (8 phút)

> Đây là phần định lượng điều kiện "≥20 handoff phù hợp mỗi tháng". Đừng chấp
> nhận một con số ước lượng nếu có thể mở ticket ra đếm.

- Trong 30 ngày qua, bao nhiêu lần đội anh/chị phải **xin khách gửi** screenshot,
  log, file cấu hình, hoặc dữ liệu chẩn đoán khác?
- Nguồn của con số đó: đếm trong helpdesk / ước lượng / khác?
- Trong số đó, bao nhiêu lần dữ liệu **chứa thông tin không nên nằm lại trong
  ticket** (thông tin cá nhân, khóa, mật khẩu, dữ liệu khách hàng của họ)?
- Có mùa vụ không? Tháng cao điểm và tháng thấp điểm khác nhau bao nhiêu?

| Đo | Giá trị | Nguồn |
| --- | --- | --- |
| Handoff / tháng | | |
| Trong đó chứa dữ liệu nhạy cảm | | |
| Đạt ngưỡng ≥20/tháng? | có / không | |

## 3. Loại bằng chứng và thời gian (6 phút)

- Ba loại dữ liệu hay phải xin nhất là gì?
- Với ticket gần nhất: từ lúc anh/chị yêu cầu tới lúc **nhận đủ** dữ liệu là bao
  lâu?
- Bao nhiêu lượt trao đổi qua lại cho tới khi đủ? Lý do phải hỏi lại là gì —
  thiếu, sai vùng ảnh, sai khoảng thời gian, sai định dạng?
- Có bao nhiêu phần trăm khách hàng **không bao giờ** gửi đủ?

| Đo | Giá trị |
| --- | --- |
| Loại evidence phổ biến (xếp hạng) | |
| Thời gian tới khi đủ evidence (ticket gần nhất) | |
| Số lượt trao đổi / ticket | |
| Lý do phải hỏi lại | |

## 4. Cách làm hiện tại (6 phút)

- Hiện khách gửi bằng đường nào? (email đính kèm, WeTransfer, Google Drive,
  Zalo/WhatsApp, upload trong helpdesk, khác)
- Ai chọn đường đó — đội hỗ trợ hay khách?
- Đường đó hỏng ở đâu? (giới hạn dung lượng, khách không có tài khoản, ảnh bị nén,
  link hết hạn, khách không biết cách lấy log)
- Sau khi xong, dữ liệu đó **nằm lại ở đâu**, và trong bao lâu?
- Đã bao giờ phải đi xóa thủ công dữ liệu đã nhận chưa? Vì lý do gì?

| Đo | Giá trị |
| --- | --- |
| Workaround hiện tại | |
| Điểm hỏng được nêu | |
| Dữ liệu tồn tại ở đâu sau đó | |
| Đã từng phải xóa thủ công? | |

## 5. Rủi ro, tuân thủ và người chịu trách nhiệm (6 phút)

> **Không dẫn dắt.** Nếu tới đây họ chưa hề nhắc tới rủi ro dữ liệu, hãy ghi rõ
> điều đó — nó có ý nghĩa hơn bất kỳ câu trả lời nào sau khi được gợi ý.

- Có quy định nội bộ nào về việc dữ liệu khách hàng được lưu ở đâu và bao lâu
  không? Ai đặt ra?
- Đã bao giờ có sự cố, suýt sự cố, hoặc một lần audit hỏi tới chuyện này chưa?
- Nếu ngày mai có yêu cầu "chứng minh dữ liệu chẩn đoán của khách X đã bị xóa",
  anh/chị trả lời thế nào?
- Khách hàng của anh/chị có bao giờ **từ chối** gửi dữ liệu vì lo ngại không?

| Đo | Giá trị |
| --- | --- |
| Có policy nội bộ? | |
| Sự cố/audit đã xảy ra? | |
| Chứng minh được việc đã xóa? | |
| Vấn đề bảo mật do họ tự nêu hay do được gợi ý? | tự nêu / được gợi ý / không nêu |

## 6. Phản ứng với giải pháp (6 phút)

> Chỉ tới đây mới mô tả sản phẩm, và mô tả bằng đúng một câu, không demo trước.

Một câu để đọc:

> "Một phòng tạm thời có link, khách mở là dùng được, không cần tạo tài khoản,
> không cần cài gì; dán text và ảnh vào; phòng tự hủy, và anh/chị đóng được bất
> cứ lúc nào."

- Nghe xong, anh/chị thấy nó thay thế được bước nào trong quy trình hiện tại?
- Điều gì khiến nó **không** dùng được ở chỗ anh/chị?
- Thiếu thứ gì thì đội anh/chị không thể dùng cho ticket thật? (bắt buộc vs. mong
  muốn)

| Đo | Giá trị |
| --- | --- |
| Thay thế bước nào | |
| Blocker bắt buộc | |
| Mong muốn (không blocker) | |

## 7. Người mua và mức chi (4 phút)

> Ba vai trò này thường là ba người khác nhau. Gộp lại là cách nhanh nhất để có
> một pipeline gồm những người thích sản phẩm nhưng không ký được gì.

- Ai sẽ là người **dùng** hằng ngày?
- Ai **quyết định** đưa một công cụ mới vào quy trình?
- Ai **duyệt chi**, và ở mức nào thì cần thêm một cấp phê duyệt?
- Gần đây đội anh/chị mua công cụ nào? Quy trình mua đó diễn ra thế nào và mất
  bao lâu?

| Vai trò | Ai | Ghi chú |
| --- | --- | --- |
| User | | |
| Decision maker | | |
| Budget holder | | |
| Ngưỡng cần phê duyệt thêm | | |
| Công cụ mua gần nhất & thời gian mua | | |

## 8. Willingness-to-pay và cam kết (4 phút)

> Đây là phần quyết định exit gate. **Đề nghị thật, không hỏi giả định.** "Anh
> có sẵn sàng trả không?" là một câu hỏi vô nghĩa; "tuần sau tôi gửi hợp đồng
> pilot 100 USD/tháng, anh ký chứ?" thì không.

- Nếu công cụ này giảm được [số ở phần 3] xuống một nửa, nó đáng giá bao nhiêu
  mỗi tháng với đội anh/chị?
- **Đề nghị cụ thể:** pilot có trả phí, từ 100 USD/tháng, trong 4–6 tuần, bắt đầu
  từ [ngày].
- Nếu chưa trả phí được ngay: anh/chị ký được một LOI ghi mức giá và điều kiện
  chứ?
- Nếu không: điều gì cần đúng trước đã?

| Đo | Giá trị |
| --- | --- |
| Mức giá họ tự nêu | |
| Đồng ý pilot? | có / không / có điều kiện |
| Điều kiện kèm theo | |
| Trả phí ≥100 USD/tháng? | có / không |
| Ký LOI? | có / không |
| Nếu không, lý do nêu ra | |

## 9. Kết luận của người phỏng vấn (viết ngay sau khi kết thúc)

| Trường | Giá trị |
| --- | --- |
| Đạt ngưỡng ≥20 handoff/tháng? | có / không |
| Đau đủ để đổi quy trình? | có / không / chưa rõ |
| Có ngân sách và người ký? | có / không / chưa rõ |
| Design partner tiềm năng? | có / không |
| Câu trích dẫn đáng giữ (nguyên văn) | |
| Bằng chứng đã thu được (link ticket ẩn danh, ảnh chụp số liệu) | |
| Điều bất ngờ nhất | |
| Giả thuyết bị câu trả lời này **bác bỏ** | |

> Ô cuối cùng là ô quan trọng nhất, và là ô dễ bỏ trống nhất. Một loạt phỏng vấn
> không bác bỏ được giả thuyết nào là một loạt phỏng vấn đã hỏi sai câu.
