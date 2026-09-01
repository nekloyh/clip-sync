# Bất biến kỹ thuật

> Cập nhật: 2026-09-01. Nguồn: chắt lọc từ `docs/ARCHITECTURE_ROADMAP.md`
> (2026-08-29), nay nằm lại trên `legacy/2026-09-pilot-readiness-wip`.
>
> **Tài liệu này không phải roadmap.** [`PLAN.md`](../PLAN.md) quyết định làm gì
> và theo thứ tự nào, và nó thắng khi có mâu thuẫn. File này chỉ ghi những ràng
> buộc kỹ thuật đúng bất kể phase nào đang chạy — thứ mà một session mới cần biết
> trước khi sửa code, và thứ mà một PR không được lặng lẽ vi phạm.
>
> Vì sao tách ra: `ARCHITECTURE_ROADMAP.md` là một kế hoạch kiến trúc cho một sản
> phẩm ta đã quyết định không xây (E2EE trước, rồi workspace/billing/AI gateway).
> Roadmap phase của nó mâu thuẫn trực tiếp với `PLAN.md` §3 — nó xếp redaction
> vào Phase 5 sau E2EE, còn `PLAN.md` đặt redaction client-side làm Phase B, wedge
> số một. Giữ cả hai trong repo là giữ hai nguồn chân lý. Phần dưới đây là phần
> vẫn đúng.

## 1. Bất biến sản phẩm

| # | Bất biến | Trạng thái hôm nay |
| --- | --- | --- |
| P1 | **Zero-PII ingestion**: nội dung nhạy cảm được phát hiện và che **trên máy khách, trước khi rời trình duyệt**. Server không bao giờ nhận bản chưa che. | **CHƯA ĐẠT** — mục tiêu của Phase B. Cho tới khi Phase B xong, không tài liệu, UI hay pitch nào được nói hoặc gợi ý là đã có. |
| P2 | **Evidence integrity**: mỗi bundle có manifest với hash từng file, timestamp và vai trò người upload; verify được ngoài hệ thống. | **CHƯA ĐẠT** — mục tiêu của Phase C. |
| P3 | **Xóa là xóa thật**: khi một phòng được xóa, mọi byte thuộc về nó biến mất, kể cả object không còn row nào trỏ tới. | **ĐANG SỬA** — hôm nay worker chỉ xóa object có row trỏ tới (GAP-8); fix nằm ở `feature/pilot-hardening`. |
| P4 | **Không log content/PIN/filename/slug nhạy cảm.** Hai lớp: allowlist ứng dụng (`src/lib/log.ts`, `src/lib/analytics/catalog.ts`) và bảng analytics không có cột để chứa. | **ĐÃ ĐẠT.** Giữ bởi test đối kháng — chúng chủ động truyền slug/PIN/cookie/filename/content vào rồi chứng minh bị loại: `src/lib/log.test.ts`, `src/lib/analytics/catalog.test.ts`, `src/test/room-authz.test.ts`. Xoá hoặc nới một trong số chúng phải được nêu tường minh trong PR. |
| P5 | **Mọi truy cập DB/Storage chạy server-side** bằng `service_role`, bên trong route handler đã kiểm tra quyền. Anon key không có quyền trên bảng. | **ĐÃ ĐẠT**. |
| P6 | **Owner capability tách khỏi quyền recipient**: biết URL hoặc biết PIN không phải là quyền owner; DB chỉ giữ hash. | **ĐÃ ĐẠT**. |

P1 và P2 là hai wedge của định vị hiện tại (`PLAN.md` §1). Cột trạng thái tồn tại
để không ai quảng cáo một bất biến chưa được xây — đó là dạng overclaim nguy hiểm
nhất với một sản phẩm bán bằng bảo mật.

## 2. Nguyên tắc code

1. **Thin transport.** Route handler parse/validate request, xác thực actor, gọi
   use case, map response. Route không tự viết query nghiệp vụ.
2. **Deny by construction.** Quyền được kiểm ở mức route handler, không phải ở
   helper — một handler quên gọi guard phải fail test, và `room-authz.test.ts`
   được viết ở mức đó chính vì lý do này.
3. **Metadata tối thiểu.** Metadata nhạy cảm (filename, checklist value, ticket
   context) phải được chứng minh là cần thiết trước khi được lưu.
4. **Security claim là testable contract.** Authorization, IDOR, replay, expiry,
   retention, revoke: mỗi lời hứa phải có test tự động hoặc production control
   chứng minh được. Một lời hứa trong README mà không có test là một lời hứa sẽ
   hỏng trong im lặng.
5. **Provider là adapter.** Supabase, Upstash, help desk, email không được trở
   thành domain model.
6. **Không tự thiết kế crypto.** Cipher suite, nonce, key derivation, envelope,
   recovery phải dùng primitive đã được review, và phải qua security review độc
   lập trước khi được quảng cáo (áp dụng khi tới Phase E). Đầu vào cho ADR đó —
   key hierarchy, sharing, rotation, recovery/key loss, protocol versioning —
   nằm ở `docs/PRODUCT_ROADMAP.md` và ở `docs/ARCHITECTURE_ROADMAP.md` §3, §8
   (ADR-004…ADR-006) trên `legacy/2026-09-pilot-readiness-wip`. Không chép chúng
   về trước khi Phase E thực sự bắt đầu; chép sớm là dựng lại nguồn chân lý thứ hai.
7. **Migration chỉ đi tới.** `expand → migrate → contract`, có compatibility
   window và rollback ở cấp ứng dụng. Thiếu một migration phải lùi về hướng an
   toàn (mất quyền quản trị), không phát quyền cho người lạ — hành vi hiện tại
   của 003/004, mô tả trong README.

## 3. Background work

Cleanup và reconcile là hai đường chạy **không có người quan sát**, và đợt QA
2026-08-29 tìm thấy cả năm finding Major ở đúng hai vùng đó cộng client-side
durability. Vì thế các quy tắc dưới đây không phải lý thuyết:

1. **Worker claim bằng lease/visibility timeout thật.** Điều kiện claim phải nằm
   trong chính câu `UPDATE`, không nằm trong filter JavaScript phía trên nó: một
   staleness test chạy trong JS là test trên một row có thể đã bị người khác
   claim trước khi `UPDATE` chạy. (GAP-1.)
2. **Mọi handler idempotent**, và chạy lại được sau khi bị ngắt giữa chừng.
3. **Không job nào được báo `success` sau khi không quét được gì.** "Không tìm
   thấy vấn đề" và "không nhìn được vào đâu cả" phải phân biệt được trong
   `ops_runs`. (GAP-6.)
4. **PostgREST trả lỗi, không ném lỗi.** Mọi lời gọi `.rpc()` / query phải kiểm
   `error` trả về; bọc trong `try/catch` không thôi là một lỗi im lặng. (GAP-3.)
5. **Không tự nhân bản finding.** Cùng một drift, quan sát lại ngày mai, là cùng
   một fact — nếu không, alert "findings tăng đều" sẽ kêu vì reconciler tự nhân
   đôi. (GAP-2.)
6. **Metric bắt buộc cho mỗi job:** queue depth, oldest-age, attempts,
   last-success. Số đưa ra `/api/health/ops` phải là số **đếm**, không phải độ
   dài của trang đầu tiên. (GAP-2.)
7. **Retry có backoff và giới hạn**, và một phòng liên tục thất bại phải trôi về
   cuối hàng đợi thay vì chặn những phòng phía sau.

## 4. Architecture fitness functions

Cần được tự động hóa dần, không chỉ ghi trong tài liệu. Những dòng đã có test
được đánh dấu:

- ✅ Mọi event/log chỉ đi qua allowlisted contract; test **chủ động** truyền
  content/PIN/slug/filename vào để chứng minh chúng bị loại.
- ✅ Authorization được test ở mức route handler, không phải helper.
- ✅ Worker job có test cho retry, dead-letter và queue-age. `lifecycle.test.ts` đã có "leaves a room another worker just claimed" và "reclaims a room whose worker died", nhưng cả hai vẫn xanh với bug GAP-1; test **pin** được lease (claim làm mới đồng hồ, hai worker tranh nhau) đến cùng `feature/pilot-hardening`.
- ✅ Mutation retry được có test idempotency/concurrency.
- ✅ CI chạy typecheck, lint, test và production build cho mọi PR.
- ⬜ Redaction engine: eval set FP/FN chạy như regression test (Phase B DoD).
- ⬜ Manifest có test vector cố định và tamper detection (Phase C DoD).
- ⬜ Một happy-path e2e (create → join → checklist → redaction preview → upload →
  expire) chạy trong CI (`PLAN.md` §5).

## 5. Những việc không làm

- Không đổi sang microservices, Kubernetes hoặc event sourcing. Chỉ tách service
  khi có trigger đo được: worker làm ảnh hưởng latency của web sau khi đã tách
  deployment, bandwidth/CPU cần scaling policy khác hẳn, hoặc compliance buộc
  control plane và data plane chạy khác vùng. "Code lớn" không phải trigger.
- Không xây CRDT hoặc collaborative editor (`PLAN.md` §2 đã cắt).
- Không tạo abstraction cho mọi function, hoặc copy domain type qua nhiều package.
- Không đổi provider chỉ để "vendor-neutral" nếu adapter hiện tại đã đủ.
- Không cho server hoặc AI đọc raw evidence rồi vẫn gọi sản phẩm là zero-PII.
- Không xây integration thứ hai, workspace, SSO hoặc billing trước gate kinh
  doanh ở `PLAN.md` §3 Phase D.

## 6. Nợ kiến trúc đã biết

Ghi ra để không bị phát hiện lại như một điều bất ngờ. Không mục nào trong đây là
việc phải làm ngay — chúng là ràng buộc cần biết khi Phase B/C chạm vào cùng vùng
code:

- Route handler vẫn chứa authorization, orchestration và truy cập Supabase trực
  tiếp. Chấp nhận được ở quy mô hiện tại.
- `TextEditor` tập trung room state, realtime, upload, retry và UI orchestration.
  Phase B sẽ chạm vào đây (upload flow phải chèn được bước redaction preview);
  tách theo vertical slice vào lúc đó, không refactor trước.
- Slug hiện ~49 bit entropy. Đủ để không dò được, **chưa** đạt mức ≥128 bit của
  một credential dài hạn. README mô tả đúng con số này — giữ nguyên như vậy.
- Text và attachment là plaintext trên server; đây chính là thứ P1 sẽ đổi.
- Upload đi xuyên qua server và buffer file; chưa có resumable/direct upload.
