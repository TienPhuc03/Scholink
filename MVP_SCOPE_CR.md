# Kiểm Soát Thay Đổi Phạm Vi MVP 5 Tuần (CR-MVP-01)

- **Mã CR**: `CR-MVP-01`
- **Cơ sở tham chiếu**: Đặc tả nghiệp vụ và thiết kế hệ thống **Scholink SRS v3.2** (17/10/2026) & Kế hoạch điều chỉnh MVP 5 tuần (18/10/2026).
- **Đầu mối phụ trách (Owner)**: TV1 (Identity, Media, Application/Intent, API/gRPC Contract).

---

## 1. Danh Sách Phạm Vi Giữ Trong MVP 5 Tuần & Phần Hoãn Sang R2/R3

| Nhóm Nghiệp Vụ | Giữ Trong MVP 5 Tuần (Bắt Buộc Chạy Thật) | Hoãn Hoặc Giới Hạn So Với SRS v3.2 Đầy Đủ |
| :--- | :--- | :--- |
| **Danh tính & Passport (TV1)** | • Đăng ký Email/OTP 6 số, đăng nhập, xoay vòng Refresh Token (`familyId`), đăng xuất, thu hồi phiên.<br/>• Hồ sơ Passport 7 thành phần (`scoreVersion=1`), phân quyền trường (`PRIVATE`/`TEAMMATES`/`PUBLIC`).<br/>• Upload tệp riêng tư (PDF/ảnh), kiểm tra MIME/dung lượng/trạng thái `READY`.<br/>• Đánh giá Readiness/Eligibility, tạo Preview bất biến (TTL 10 phút) và ký Consent SHA-256 (RFC 8785).<br/>• Yêu cầu xóa/ẩn danh tài khoản có mã theo dõi (`FR-AUTH-08`). | • Google OAuth (`FR-AUTH-02` phần OAuth).<br/>• Quản lý danh sách thiết bị từ xa nâng cao (`FR-AUTH-06`).<br/>• Xuất Digital CV PDF không watermark, mã QR, Pitch Video và xác minh chứng chỉ tự động (`FR-PROF-07`).<br/>• Đặt lịch Mentoring công khai. |
| **Học bổng & Cuộc thi (TV2)** | • Danh mục (Catalog) giữ đồng thời cả 2 loại `SCHOLARSHIP` và `COMPETITION`.<br/>• Bộ lọc kết hợp AND cơ bản, phân trang cursor-based ổn định.<br/>• Bookmark & xem cache ngoại tuyến (`updatedAt`).<br/>• Phân biệt rõ `IN_APP` (nộp trực tiếp trên Scholink) và `EXTERNAL` (mở nguồn ngoài + tự đánh dấu). | • Xếp hạng phổ biến 7 ngày có snapshot (`FR-OPP-03` phần P=V+3B+5A).<br/>• Xếp hạng mức độ phù hợp cá nhân nâng cao (`FR-OPP-07`).<br/>• Tin tài trợ ghim nổi bật (`FR-OPP-09`).<br/>• Không nhận hoặc chấm bài dự thi chính thức tại Scholink. |
| **Nộp Hồ Sơ Cá Nhân & Đội (TV1 & TV3)** | • Nộp cá nhân `IN_APP` từ đúng bản Snapshot đã xem trong Preview + Consent hợp lệ (`FR-APP-01..03`).<br/>• Rút hồ sơ trước hạn (`WITHDRAWN`) và nộp lại tăng `revision` trên cùng `Application` (`FR-APP-07`).<br/>• Xem Timeline lịch sử trạng thái và bản chụp theo từng `revision` (`FR-APP-08`).<br/>• Nộp đội `TEAM IN_APP` có `submission_intents` (`PENDING`/`COMMITTED`/`ABORTED`), khóa roster/reservation (`fencingToken`), đủ Consent từng thành viên và kiểm thử đạt ca `E05` (`FR-APP-05`). | • Xuất danh sách hồ sơ hàng loạt ra file cho Organizer (`FR-APP-09` thuộc R2).<br/>• Nếu ca kiểm thử phục hồi/đồng thời `E05` chưa đạt thì bắt buộc khóa `TEAM IN_APP` và báo cáo rõ MVP chưa hoàn tất R1 (không dùng `EXTERNAL` để thay thế nghiệm thu `FR-APP-05`). |
| **Crawler & Quản trị (TV2 & TV3)** | • Một bộ parser RSS/API cho nguồn được phép; nhập bổ sung thủ công.<br/>• Toàn bộ bài thu thập mới vào `PENDING_REVIEW` chờ Admin duyệt.<br/>• Cổng Web tối thiểu cho Admin (cấp quyền Organization/Organizer, duyệt bài) và Organizer (Kanban duyệt trạng thái hồ sơ). | • Tự động công bố nguồn `trusted` theo điểm `confidence >= 0.85` (`FR-CRAWL-06`).<br/>• Nhiều HTML adapter phức tạp, trích xuất bằng LLM (`FR-CRAWL-09`) và Dashboard BO hoàn chỉnh. |
| **Đội Thi, Chat & Thông Báo (TV2 & TV3)** | • Tạo đội, đăng `Request`, gửi/duyệt `JoinRequest`, cập nhật thành viên nguyên tử (`FR-TEAM-01..04`).<br/>• Chat nhóm đội thi (văn bản, `seq`, `lastReadSeq`, đồng bộ `afterSeq` khi kết nối lại).<br/>• Hộp thư thông báo, nhắc hạn `7/3/1` ngày theo giờ yên lặng `22:00–07:00`, đồng bộ lịch thiết bị. | • Bộ ghép đội tự động Matching/Proposal 48h (`FR-TEAM-06..09`).<br/>• Lời mời chat 1-1 (`direct-invites`), typing/presence đa thiết bị, gọi thoại/video WebRTC/TURN (`FR-CHAT-07..09`). |
| **Thương mại & Tích hợp (R2/R3)** | • Giữ ranh giới schema và hợp đồng cơ bản để không phá vỡ kiến trúc 5 Microservices. | • Không bật nạp ví, thanh toán sandbox, mua gói Plus/Promote (`FR-BILL-01..09`), đọc Gmail (`FR-MAIL-01..04`) và Scouting (`FR-BILL-10`) trong MVP 5 tuần. |

---

## 2. Các Quy Tắc Bảo Toàn Bắt Buộc Dù Là MVP (Non-Negotiable Invariants)

1. **Kiểm quyền tại Server (Zero-Trust Identity)**:
   - `userId`, `role` và `organizationId` bắt buộc lấy từ Token/Membership đã xác minh phía Server; tuyệt đối không nhận `ownerId`, `studentId` hay `role: 'ADMIN'/'ORGANIZER'` tự khai từ phía Client.
2. **Bảo vệ Bí mật & Dữ liệu Cá nhân (`NFR11`)**:
   - Không lưu hardcode `JWT_SECRET`, `ENCRYPTION_KEY`, mật khẩu DB trong mã nguồn.
   - Không rò rỉ dữ liệu Passport của người khác, stack trace nội bộ hoặc token trong phản hồi lỗi và nhật ký (log).
3. **Tính Bất Biến Của Hồ Sơ Đã Xem (`FR-PROF-08`, `FR-APP-01`)**:
   - Bản Snapshot và danh sách tệp mà sinh viên đã xem ở bước Preview và ký Consent (băm SHA-256 chuẩn hóa RFC 8785) chính là dữ liệu được lưu vào `application_revisions`. Sửa Passport sau khi nộp không làm thay đổi hồ sơ đã nộp.
4. **Chống Ghi Trùng & Tranh Chấp Đồng Thời (`FR-APP-03`, `FR-APP-05`, `FR-TEAM-03`)**:
   - Mọi lệnh nộp hồ sơ yêu cầu `Idempotency-Key` kết hợp ràng buộc duy nhất dưới Database (`applications`, `application_members`, `active_memberships`).
   - Trong luồng nộp đội, `Commit` và `Abort` tranh quyền nguyên tử trên cùng `submission_intents`, không bao giờ cùng thắng.
5. **Tệp Riêng Tư (`BR15`)**:
   - Không mở bucket public; chỉ cho phép đính kèm tệp thuộc chủ sở hữu và đã ở trạng thái `READY`.
