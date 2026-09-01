# Interview guide — evidence integrity & zero-PII ingestion (MSP)

> Artifact của **Phase V** (`../../PLAN.md` §3). Định vị đang thẩm định:
> *evidence integrity + zero-PII ingestion cho external IT support, ưu tiên MSP.*
>
> **Không điền dữ liệu giả vào file này.** Nó là mẫu. Mỗi cuộc phỏng vấn được
> chép thành một file riêng trong `docs/discovery/interviews/` và tổng hợp vào
> `PHASE_V_EVIDENCE.md`. Một hàng trống là thông tin ("chưa hỏi được"); một hàng
> bịa là chất độc đối với một quyết định go/no-go.
>
> Lịch sử: bản trước của guide này phỏng vấn cho wedge "secure support handoff"
> (thu thập evidence tiện lợi). Market review 09/2026 (`../../PLAN.md` §1) kết
> luận wedge đó đã bị Birdie chiếm. Phần khung phỏng vấn được giữ; phần pitch,
> phần cạnh tranh và phần nghĩa vụ tuân thủ được viết lại.

## 0. Nguyên tắc

**Hỏi về ticket gần nhất, không hỏi ý kiến.** "Anh có thấy việc gửi log là phiền
không?" luôn nhận được câu trả lời lịch sự và vô dụng. "Ticket cuối cùng anh phải
xin khách một screenshot là ticket nào? Mở nó ra giúp tôi" nhận được một sự thật
có ngày tháng.

Bốn quy tắc:

1. **Quá khứ, không tương lai.** Hỏi họ đã làm gì, không hỏi họ sẽ dùng gì.
2. **Số đếm được, không tính từ.** "Thường xuyên" không phải dữ liệu; "khoảng 30
   lần tháng trước" thì có.
3. **Không mô tả sản phẩm trước phần 7.** Nói trước sẽ biến mọi câu trả lời sau
   đó thành sự lịch sự.
4. **Không dẫn dắt về bảo mật hay tuân thủ.** Đây là quy tắc quan trọng nhất cho
   định vị hiện tại, và cũng là quy tắc dễ vi phạm nhất: cả hai wedge của ta đều
   là wedge bảo mật, nên cám dỗ gợi ý là lớn nhất. Nếu vấn đề có thật, họ sẽ tự
   nêu trước khi tới phần 5. Nếu phải gợi ý mới có, đó **chính là** câu trả lời —
   ghi rõ rằng nó được gợi ý.

**Thời lượng:** 35–45 phút. **Mục tiêu:** 15 cuộc (`PLAN.md` §3 Phase V).

**Kill rule cần nhớ khi phỏng vấn:** nếu dưới 5/15 đội có pain lặp lại, Phase V
kết luận dừng build. Guide này tồn tại để con số đó là thật, không phải để nó đẹp.

## 1. Nhận dạng (3 phút)

| Trường | Giá trị |
| --- | --- |
| Ngày phỏng vấn | |
| Công ty (loại hình) | MSP / MSSP / SaaS B2B / triển khai hiện trường / security-DevOps / khác |
| Quy mô đội hỗ trợ | |
| Số **tổ chức khách hàng** phục vụ (MSP: con số này là ICP signal chính) | |
| PSA / RMM đang dùng | ConnectWise / HaloPSA / Atera / NinjaOne / Syncro / khác / không có |
| Help desk đang dùng | Zendesk / Freshdesk / HubSpot / Intercom / trong PSA / khác |
| Vai trò người được hỏi | |
| Kênh tiếp cận | |

> Với MSP, hai ô PSA/RMM quyết định Phase D (`PLAN.md` §3) chọn integration nào.
> Đây là dữ liệu có giá trị ngay cả khi cuộc phỏng vấn không đạt gate nào khác.

## 2. Tần suất — số cần cho exit gate (8 phút)

> Đây là phần định lượng điều kiện "≥20 handoff phù hợp mỗi tháng cho ít nhất một
> đội". Đừng chấp nhận ước lượng nếu có thể mở ticket ra đếm.

- Trong 30 ngày qua, bao nhiêu lần đội anh/chị phải **xin khách gửi** screenshot,
  log, file cấu hình, hoặc dữ liệu chẩn đoán khác?
- Nguồn của con số đó: đếm trong helpdesk/PSA / ước lượng / khác?
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
  Zalo/WhatsApp, upload trong helpdesk/PSA, khác)
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

## 5. Rủi ro, nghĩa vụ tuân thủ và người chịu trách nhiệm (8 phút)

> **Không dẫn dắt** (quy tắc 4). Nếu tới đây họ chưa hề nhắc tới rủi ro dữ liệu,
> hãy ghi rõ điều đó trước khi hỏi tiếp — nó có ý nghĩa hơn bất kỳ câu trả lời nào
> sau khi được gợi ý. Ba câu đầu là câu mở, không gợi ý; ba câu cuối được phép
> nêu tên quy định, và mọi câu trả lời sau đó phải bị đánh dấu là "được gợi ý".

Câu mở (hỏi trước, không nêu tên quy định nào):

- Có quy định nội bộ nào về việc dữ liệu khách hàng được lưu ở đâu và bao lâu
  không? Ai đặt ra?
- Đã bao giờ có sự cố, suýt sự cố, hoặc một lần audit hỏi tới chuyện này chưa?
- Nếu ngày mai một khách hàng yêu cầu "chứng minh dữ liệu chẩn đoán của chúng tôi
  đã bị xóa", anh/chị trả lời bằng cái gì? (Chú ý: câu trả lời "tôi nói là đã
  xóa" khác hẳn "tôi xuất được log/manifest" — ghi nguyên văn.)

Câu có nêu tên (đánh dấu mọi câu trả lời sau đây là **được gợi ý**):

- Hợp đồng với khách hàng của anh/chị có điều khoản nào về xử lý dữ liệu chẩn đoán
  không? Ai review nó?
- NIS2 (áp dụng dần tới 10/2026) hoặc PDPL VN 91/2025 có nằm trong phạm vi của
  đội anh/chị không? Ai trong công ty đang chịu trách nhiệm chuẩn bị?
- Khách hàng của anh/chị có bao giờ **từ chối** gửi dữ liệu vì lo ngại không? Lần
  gần nhất là khi nào?

| Đo | Giá trị |
| --- | --- |
| Có policy nội bộ? | |
| Sự cố/audit đã xảy ra? | |
| **Chứng minh được việc đã xóa bằng artifact, hay chỉ bằng lời?** | artifact / lời nói / không trả lời được |
| Điều khoản hợp đồng về dữ liệu chẩn đoán? | có / không / không biết |
| NIS2 / PDPL trong phạm vi? | có / không / không biết |
| Khách từng từ chối gửi dữ liệu? | |
| Vấn đề bảo mật do họ **tự nêu** hay do **được gợi ý**? | tự nêu / được gợi ý / không nêu |

> Ô "chứng minh được việc đã xóa" là ô đắt nhất trong toàn bộ guide đối với wedge
> evidence integrity. Một đội trả lời "tôi nói là đã xóa" mà không thấy đó là vấn
> đề thì manifest/chain-of-custody **không** bán được cho họ, dù họ có pain về
> thu thập evidence.

## 6. Đã đánh giá gì rồi — phân biệt với đối thủ (5 phút)

> Phần này mới so với bản trước, và nó tồn tại vì market review đã kết luận wedge
> "thu thập evidence tiện lợi" không còn khác biệt. Mục tiêu: biết họ đã thấy gì,
> và tại sao thứ đó chưa giải quyết vấn đề.

- Đội anh/chị đã thử công cụ nào cho việc này chưa? (secure link/upload portal,
  add-on redaction của help desk, DLP, tự dựng)
- Nếu có: dùng được bao lâu, tại sao dừng hoặc tại sao chưa đủ?
- Help desk của anh/chị có tính năng che PII/redaction không? Có bật không? Ai
  quyết định bật?
- **Câu phân biệt (hỏi nguyên văn):** "Khi công cụ đó che thông tin nhạy cảm, nó
  che ở đâu — trên máy khách trước khi gửi, hay trên server sau khi đã nhận?"
  Rồi: "Sự khác biệt đó có ý nghĩa với anh/chị không, và vì sao?"
- Đội anh/chị có đang dùng AI agent nào đọc screenshot/log trong ticket không?
  Nếu có, ai chịu trách nhiệm về dữ liệu đưa vào đó?

| Đo | Giá trị |
| --- | --- |
| Công cụ đã đánh giá / đang dùng | |
| Lý do chưa đủ | |
| Help desk có redaction? Có bật? | |
| **Phân biệt client-side vs server-side có ý nghĩa với họ?** | có, tự giải thích được / có, sau khi nghe / không |
| Đang dùng AI agent đọc evidence? | |

> Ô in đậm là ô đo trực tiếp giả thuyết trung tâm của định vị hiện tại. Nếu phần
> lớn đội trả lời "không", wedge zero-PII ingestion là một khác biệt kỹ thuật
> không ai mua — và đó là một phát hiện đáng giá hơn cả một pilot.

## 7. Phản ứng với giải pháp (6 phút)

> Chỉ tới đây mới mô tả sản phẩm, và mô tả bằng đúng hai câu, không demo trước.

Hai câu để đọc:

> "Một phòng tạm thời có link, khách mở là dùng được, không cần tạo tài khoản,
> không cần cài gì. Trước khi bất cứ thứ gì rời máy khách, trình duyệt của họ
> quét và che thông tin nhạy cảm — server chúng tôi không bao giờ nhận bản chưa
> che; và mỗi phòng xuất ra được một manifest có hash từng file để anh/chị chứng
> minh đã nhận gì, khi nào, và rằng nó chưa bị sửa."

- Nghe xong, anh/chị thấy nó thay thế được bước nào trong quy trình hiện tại?
- Trong hai vế đó — che trước khi gửi, và manifest chứng minh — vế nào đáng giá
  hơn với anh/chị? Có vế nào **không** đáng giá không?
- Điều gì khiến nó **không** dùng được ở chỗ anh/chị?
- Thiếu thứ gì thì đội anh/chị không thể dùng cho ticket thật? (bắt buộc vs. mong
  muốn)

| Đo | Giá trị |
| --- | --- |
| Thay thế bước nào | |
| **Vế nào đáng giá hơn** | redaction trước upload / manifest & integrity / cả hai / không vế nào |
| Vế bị coi là thừa | |
| Blocker bắt buộc | |
| Mong muốn (không blocker) | |

## 8. Người mua và mức chi (4 phút)

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

## 9. Willingness-to-pay và cam kết (5 phút)

> Đây là phần quyết định exit gate. **Đề nghị thật, không hỏi giả định.** "Anh
> có sẵn sàng trả không?" là một câu hỏi vô nghĩa; "tuần sau tôi gửi hợp đồng
> pilot 100 USD/tháng, anh ký chứ?" thì không.
>
> Khoảng giá đang thẩm định: **50–150 USD/team/tháng** (`PLAN.md` §3 Phase V).
> Mở bằng 100 USD/tháng; ghi lại mức họ phản đối và mức họ chấp nhận.

- Nếu công cụ này giảm được [số ở phần 3] xuống một nửa, nó đáng giá bao nhiêu
  mỗi tháng với đội anh/chị?
- **Đề nghị cụ thể:** pilot có trả phí, 100 USD/tháng, trong 4–6 tuần, bắt đầu
  từ [ngày].
- Nếu 100 là quá cao: 50 thì sao? Nếu họ đồng ý ngay: 150 thì sao?
- Nếu chưa trả phí được ngay: anh/chị ký được một LOI ghi mức giá và điều kiện
  chứ?
- Nếu không: điều gì cần đúng trước đã?

| Đo | Giá trị |
| --- | --- |
| Mức giá họ tự nêu | |
| Đồng ý pilot? | có / không / có điều kiện |
| Điều kiện kèm theo | |
| Mức chấp nhận trong khoảng 50–150 USD/tháng | |
| Ký LOI? | có / không |
| Nếu không, lý do nêu ra | |

## 10. Bậc thang cam kết (điền ngay sau cuộc gọi)

> Một cuộc phỏng vấn "rất tích cực" không phải dữ liệu. Bậc thang này tồn tại để
> chuyển sự nhiệt tình thành một trong sáu bậc quan sát được, và để biết đội nào
> đang đứng yên. Chỉ đánh dấu bậc đã **xảy ra**, không đánh dấu bậc được hứa.

| Bậc | Hành vi cần quan sát được | Đã đạt? | Ngày |
| --- | --- | --- | --- |
| 0. Đã nói chuyện | Phỏng vấn xong | | |
| 1. Đưa artifact | Họ gửi số liệu, ảnh chụp thống kê, hoặc ticket ẩn danh | | |
| 2. Thử thật | Họ tự mở một phòng và dùng nó một lần, không cần ta thao tác hộ | | |
| 3. Đưa cho khách hàng thật | Dùng cho **một ticket thật** với khách hàng của họ | | |
| 4. Pilot đã chốt | Có ngày bắt đầu và tên người tham gia | | |
| 5. Paid intent | Thanh toán thật hoặc LOI có ghi giá và có chữ ký | | |

> Bậc 1 và 2 là nơi phần lớn pipeline chết, và là nơi rẻ nhất để phát hiện điều
> đó. Một đội nói "rất cần" ở phần 7 nhưng không vượt được bậc 1 trong hai tuần
> đã trả lời câu hỏi của Phase V.

## 11. Kết luận của người phỏng vấn (viết ngay sau khi kết thúc)

| Trường | Giá trị |
| --- | --- |
| Đạt ngưỡng ≥20 handoff/tháng? | có / không |
| Đau đủ để đổi quy trình? | có / không / chưa rõ |
| **Tính vào "pain lặp lại" cho kill rule 5/15?** | có / không |
| Có ngân sách và người ký? | có / không / chưa rõ |
| Design partner tiềm năng? | có / không |
| Bậc cam kết cao nhất đạt được (§10) | |
| Câu trích dẫn đáng giữ (nguyên văn) | |
| Bằng chứng đã thu được (link ticket ẩn danh, ảnh chụp số liệu) | |
| Điều bất ngờ nhất | |
| Giả thuyết bị câu trả lời này **bác bỏ** | |

> Ô cuối cùng là ô quan trọng nhất, và là ô dễ bỏ trống nhất. Một loạt phỏng vấn
> không bác bỏ được giả thuyết nào là một loạt phỏng vấn đã hỏi sai câu.
>
> Ba giả thuyết mà định vị hiện tại đứng trên, và cần bị thách thức trong loạt
> này: (1) đội hỗ trợ phân biệt được và quan tâm tới client-side vs server-side
> redaction; (2) có ai đó bị hỏi "chứng minh đã xóa" đủ thường xuyên để trả tiền
> cho manifest; (3) MSP là kênh dễ vào hơn đội support in-house.
