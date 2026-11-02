# Tuyển Tập Câu Hỏi Vấn Đáp Chuyên Sâu & Kịch Bản Phản Biện Backend (Oral Defense Q&A)

> **Dành cho:** Bùi Đặng Vĩnh Phú (Backend Lead)  
> **Dự án:** Scholink Microservices Ecosystem  
> **Bộ câu hỏi:** 21 Câu hỏi phản biện thực chiến từ Giảng viên / Hội đồng chấm thi kỹ thuật.  
> **Mục tiêu:** Cung cấp câu trả lời sắc bén, luận điểm vững vàng, kèm vị trí dòng code cụ thể để tự tin đạt điểm tuyệt đối (10/10).

---

## 📑 Danh Mục Chủ Đề Phản Biện
1. [Chủ Đề 1: Kiến Trúc Microservices & Giao Tiếp Phân Tán (Câu 1 - 3)](#chủ-đề-1-kiến-trúc-microservices--giao-tiếp-phân-tán)
2. [Chủ Đề 2: Tính Nhất Quán Dữ Liệu & Outbox Pattern (Câu 4 - 7)](#chủ-đề-2-tính-nhất-quán-dữ-liệu--outbox-pattern)
3. [Chủ Đề 3: Race Condition, Roster Freeze & Fencing Token (Câu 8 - 12)](#chủ-đề-3-race-condition-roster-freeze--fencing-token)
4. [Chủ Đề 4: An Ninh Bảo Mật, Phân Quyền & Multi-Tenancy (Câu 13 - 17)](#chủ-đề-4-an-ninh-bảo-mật-phân-quyền--multi-tenancy)
5. [Chủ Đề 5: Vận Hành, Sao Lưu & Đảm Bảo Chất Lượng (Câu 18 - 21)](#chủ-đề-5-vận-hành-sao-lưu--đảm-bảo-chất-lượng)

---

## Chủ Đề 1: Kiến Trúc Microservices & Giao Tiếp Phân Tán

### Câu 1: Tại sao em lại chia hệ thống thành 5 microservices thay vì monolithic? Dựa trên nguyên tắc nào để phân chia?
- **Trả lời phản biện:**
  - Em phân chia dựa trên nguyên tắc **Domain-Driven Design (DDD)** và các ngữ cảnh giới hạn (**Bounded Contexts**), kết hợp với đặc tính tải khác biệt của từng dịch vụ:
    1. `Identity Service`: Quản lý danh tính và hồ sơ Passport. Đây là dịch vụ có tần suất đọc hồ sơ cao, yêu cầu bảo mật cao và quản lý phiên.
    2. `Opportunity Service`: Danh mục học bổng/cuộc thi và nộp hồ sơ. Tần suất đọc cực lớn (Browsing), áp dụng Cursor-based pagination và bảng Kanban cho ban tổ chức.
    3. `Collaboration Service`: Đội thi và Chat nhóm thời gian thực. Tải mạng biến thiên theo thời gian thực (Realtime I/O), giao tiếp qua giao thức MQTT.
    4. `Billing Service`: Ví điện tử và giao dịch tài chính. Yêu cầu tính toàn vẹn ACID tuyệt đối, không được phép chịu ảnh hưởng nếu dịch vụ chat bị quá tải.
    5. `Notification Service`: Xử lý thông báo bất đồng bộ qua message queue.
  - **Lợi ích kiến trúc:** Cho phép co giãn độc lập (**Independent Scalability**), cô lập lỗi (**Fault Isolation** — ví dụ phòng chat sập không làm chết luồng nộp hồ sơ), và phân chia đội ngũ phát triển rõ ràng.
- **Vị trí Code:** Cấu trúc phân vùng trong thư mục [`backend/apps/`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/apps/).

---

### Câu 2: Giữa API Gateway và các microservices, tại sao vừa dùng gRPC vừa dùng HTTP REST / Reverse Proxy? Khi nào dùng cái nào?
- **Trả lời phản biện:**
  - **HTTP REST / Reverse Proxy (Port 3000 -> 3001..3005)**: Được dùng cho luồng giao tiếp Bắc - Nam (**North-South Traffic**) từ Client bên ngoài (Trình duyệt web Admin/Organizer, Mobile App) đi vào API Gateway, và cho các endpoint quản trị chuẩn RESTful. Ưu điểm là tương thích 100% với trình duyệt, dễ dàng debug qua Swagger UI và Postman.
  - **gRPC Binary Stream qua HTTP/2 (Port 50051 - 50055)**: Được dùng cho luồng giao tiếp Đông - Tây (**East-West Traffic**) giữa các microservice nội bộ với nhau (Ví dụ: `Opportunity` gọi `Identity` để lấy snapshot hồ sơ, hoặc `Reservation Worker` gọi `Opportunity` để hủy intent).
  - **Lý do chọn gRPC nội bộ:**
    1. Dùng Protobuf nhị phân nén dung lượng nhỏ hơn JSON từ 5-10 lần.
    2. Kế thừa cơ chế Multiplexing trên 1 kết nối TCP duy nhất của HTTP/2, độ trễ liên dịch vụ đạt dưới **2ms**.
    3. Định nghĩa hợp đồng dữ liệu bất biến thông qua tệp `.proto` (Type-safe contracts).
- **Vị trí Code:** [`opportunity.proto`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/libs/shared/src/protos/opportunity.proto), [`gateway.module.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/apps/gateway/src/gateway.module.ts).

---

### Câu 3: Các microservices có dùng chung Database không? Tại sao lại tách thành 5 cơ sở dữ liệu riêng biệt?
- **Trả lời phản biện:**
  - Hoàn toàn **KHÔNG** dùng chung database. Hệ thống áp dụng mẫu thiết kế **Database-per-Service Pattern**. Mỗi service sở hữu một cơ sở dữ liệu MongoDB cô lập (`scholink_identity`, `scholink_opportunity`, `scholink_collaboration`, `scholink_billing`, `scholink_notification`).
  - **Lý do kỹ thuật:**
    1. Tránh phụ thuộc ngầm (**Loose Coupling**): Không một service nào được phép query trực tiếp collection của service khác (chống việc sửa đổi schema ở service này làm gãy query ở service kia).
    2. Bảo mật phân vùng: Quyền truy cập DB của Collaboration Service chỉ thấy dữ liệu phòng chat, không thể đọc trộm số dư ví (`scholink_billing`) hay hash mật khẩu (`scholink_identity`).
    3. Mọi tương tác xuyên dữ liệu bắt buộc phải đi qua API hoặc gRPC có phân quyền.
- **Vị trí Code:** [`database.module.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/libs/shared/src/infrastructure/database/database.module.ts).

---

## Chủ Đề 2: Tính Nhất Quán Dữ Liệu & Outbox Pattern

### Câu 4: Em giải quyết bài toán giao dịch phân tán (Distributed Transaction) như thế nào mà không dùng Two-Phase Commit (2PC)?
- **Trả lời phản biện:**
  - Two-Phase Commit (2PC) có nhược điểm chí mạng là **Blocking Coordination**: nếu một service bị lag mạng, toàn bộ tài nguyên DB của các service khác bị khóa cứng, làm giảm hiệu năng hệ thống nghiêm trọng.
  - Em đã thay thế bằng mô hình **Tính Nhất Quán Cuối Cùng (Eventual Consistency)** kết hợp với mẫu thiết kế **Transactional Outbox Pattern**:
    1. Service ghi nhận nghiệp vụ cục bộ và ghi kèm sự kiện vào bảng `outbox` trong **cùng 1 Local ACID Transaction** của MongoDB.
    2. Tiến trình nền (`Worker`) định kỳ quét sự kiện `PENDING` và phát qua Broker (EMQX/RabbitMQ).
    3. Client bên nhận xử lý sự kiện theo cơ chế **Idempotency** (chống xử lý trùng lặp bằng ID duy nhất).
- **Vị trí Code:** `saveMessageWithTransaction` trong [`chat.repository.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/apps/collaboration-service/src/infrastructure/persistence/chat.repository.ts).

---

### Câu 5: Outbox Pattern hoạt động ra sao trong chức năng Chat (SCHOL-26)? Tại sao không lấy MQTT làm nguồn dữ liệu chính?
- **Trả lời phản biện:**
  - **Lý do không lấy MQTT làm nguồn dữ liệu chính:** MQTT Broker (EMQX) được thiết kế tối ưu cho truyền dẫn tin nhắn thời gian thực (Transport Layer), không phải là hệ thống lưu trữ bền vững (Storage Engine). Nếu lấy MQTT làm nguồn chính: khi Broker khởi động lại, mạng rớt, hoặc hàng đợi tràn, tin nhắn sẽ bị mất vĩnh viễn và không thể đồng bộ lại lịch sử tin nhắn khi người dùng đăng nhập trên thiết bị mới.
  - **Giải pháp Outbox:**
    - MongoDB 7 Replica Set đóng vai trò là **Nguồn Dữ Liệu Chân Lý Duy Nhất (Single Source of Truth)**.
    - Khi nhận tin nhắn, service lưu tin nhắn vào bảng `messages` và ghi sự kiện vào bảng `outbox` trong cùng 1 transaction, sau đó phản hồi HTTP 201 ACK cho người gửi ngay lập tức.
    - Worker nền lấy tin từ Outbox đẩy lên MQTT. Nếu Broker bị sập, Outbox giữ nguyên trạng thái `PENDING`, áp dụng **Exponential Backoff** để phát bù khi Broker sống lại.
- **Vị trí Code:** [`chat-outbox-worker.service.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/apps/collaboration-service/src/infrastructure/workers/chat-outbox-worker.service.ts).

---

### Câu 6: Làm sao đảm bảo số thứ tự tin nhắn (`seq`) trong phòng chat tăng đơn điệu và không bị trùng lặp khi 10 người cùng gửi một lúc?
- **Trả lời phản biện:**
  - Em sử dụng cơ chế bảo vệ 2 lớp:
    1. **Tầng Ứng Dụng**: Sử dụng trường `lastSeq` trong document của `chat_rooms`. Mỗi khi có tin nhắn mới, `nextSeq = room.lastSeq + 1`. Document phòng chat được cập nhật nguyên tử.
    2. **Tầng Cơ Sở Dữ Liệu (Phòng Tuyến Cuối Cùng)**: Tạo chỉ mục duy nhất kết hợp `CREATE UNIQUE INDEX (roomId, seq)`.
  - Nếu có 2 request gửi tin tại cùng 1 microsecond: Transaction nào commit trước sẽ chiếm số `seq` đó; Transaction đến sau sẽ bị MongoDB từ chối với lỗi trùng lặp chỉ mục (`DuplicateKeyError - E11000`), sau đó được hệ thống retry tự động với số `lastSeq` mới hơn mà không bao giờ sinh ra 2 tin nhắn trùng `seq`.
- **Vị trí Code:** Chỉ mục trong [`chat.schema.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/apps/collaboration-service/src/infrastructure/persistence/chat.schema.ts), test case kiểm thử 10 requests đồng thời trong [`chat-schol26.spec.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/apps/collaboration-service/src/chat-schol26.spec.ts).

---

### Câu 7: ClientMsgId đóng vai trò gì trong việc khử trùng lặp (Deduplication)?
- **Trả lời phản biện:**
  - Trên mạng di động, hiện tượng thường gặp là: Client gửi tin nhắn lên server, server đã lưu DB thành công nhưng gói tin phản hồi HTTP 201 trả về client bị rớt mạng. Client tưởng thất bại nên tự động thử gửi lại (Retry).
  - Để ngăn việc sinh ra 2 tin nhắn trùng nội dung, Client tạo sẵn một UUID ngẫu nhiên gắn vào trường `clientMsgId`.
  - Phía Server có chỉ mục duy nhất `UNIQUE INDEX (roomId, senderId, clientMsgId)`. Khi nhận được request retry, `chatUseCase.sendMessage` tìm thấy `clientMsgId` đã tồn tại thì sẽ **trả về ngay tin nhắn cũ mà không tăng sequence và không tạo bản ghi mới**.
- **Vị trí Code:** [`chat.use-case.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/apps/collaboration-service/src/application/use-cases/chat.use-case.ts#L45-L55).

---

## Chủ Đề 3: Race Condition, Roster Freeze & Fencing Token

### Câu 8: Roster Freeze là gì? Nếu trưởng đội đang nộp đơn mà có thành viên đổi CV hoặc xin rút thì hệ thống xử lý thế nào?
- **Trả lời phản biện:**
  - **Roster Freeze** là cơ chế đóng băng bất biến danh sách nhân sự của đội trong suốt quá trình nộp hồ sơ.
  - Mỗi đội có thuộc tính `rosterVersion`. Khi trưởng đội gọi `prepareSubmission`, hệ thống cấp `rosterVersion` mới và mọi Consent ký số của thành viên bắt buộc phải gắn với đúng `rosterVersion` này.
  - **Kịch bản xử lý:** Nếu một thành viên tự ý rút khỏi đội hoặc sửa đổi hồ sơ (làm tăng `profileVersion`), hệ thống sẽ tự động tăng `rosterVersion` của đội lên. Ngay lập tức, **toàn bộ Consent đã thu thập trước đó bị vô hiệu hóa 100%**. Trưởng đội không thể nộp đơn cho đến khi tất cả thành viên ký lại Consent trên danh sách nhân sự mới.
  - Khi đội đã chuyển sang trạng thái `SUBMITTING`, Roster Freeze kích hoạt khóa cứng: Mọi API rời đội, mời thêm người, xóa đội đều bị từ chối bằng mã lỗi `409 ROSTER_FROZEN`.
- **Vị trí Code:** [`team.use-case.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/apps/collaboration-service/src/application/use-cases/team.use-case.ts), test case 2 & 5 trong [`team-schol20.spec.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/apps/collaboration-service/src/team-schol20.spec.ts).

---

### Câu 9: Fencing Token là gì? Chống stale write trong môi trường mạng chập chờn như thế nào?
- **Trả lời phản biện:**
  - Fencing Token là một con số nguyên tự tăng đơn điệu được sinh ra mỗi khi cấp một phiên giữ chỗ nộp hồ sơ (`Reservation Lease`).
  - **Vấn đề giải quyết:** Giả sử Leader A bắt đầu nộp hồ sơ, nhận Lease thời hạn 10 phút với `fencingToken = 1`. Sau 10 phút, điện thoại của Leader A bị mất sóng hoặc treo máy (Stop-the-world GC pause). Worker trên server kích hoạt hủy phiên cũ. Sau đó Leader A bấm tạo lại phiên mới, nhận `fencingToken = 2`. Đúng lúc này, gói tin cũ từ phiên 1 bị delay trên mạng đột ngột bay tới server.
  - **Cơ chế chống Stale Write:** Server chỉ chấp nhận lệnh commit nếu token gửi kèm khớp chính xác với `fencingToken` mới nhất của đội. Mọi gói tin mang `fencingToken = 1` sẽ bị ném lỗi `409 Conflict` lập tức, bảo đảm gói tin cũ không bao giờ ghi đè lên trạng thái mới.
- **Vị trí Code:** `updateTeamStatusConditional` trong [`team.repository.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/apps/collaboration-service/src/infrastructure/persistence/team.repository.ts).

---

### Câu 10: Giải thích kịch bản tranh chấp giữa Timeout Worker gọi Abort và Client gọi Commit (Commit vs Abort Race)?
- **Trả lời phản biện:**
  - Đây là bài toán tranh chấp phân tán kinh điển khi thời gian 10 phút vừa chạm ngưỡng deadline: Client vừa gửi lệnh nộp (`confirmSubmission`), trong khi Timeout Worker cũng vừa kích hoạt lệnh hủy (`abortSubmissionIntent`).
  - Em giải quyết bằng cách đặt **Opportunity Service làm trọng tài phân xử duy nhất (Single Arbitrator)** thông qua collection `submission_intents`:
    1. **Nếu Abort thắng race:** Opportunity Service ghi nhận intent trạng thái `ABORTED`. Khi request Commit của Client đến sau, hệ thống thấy intent đã bị `ABORTED` nên từ chối bằng lỗi `409 HOLD_EXPIRED`. Đội được mở khóa an toàn về `OPEN`.
    2. **Nếu Commit thắng race:** Application đã được lưu thành công sang `SUBMITTED`. Khi Worker gọi sang `abortSubmissionIntent`, Opportunity Service đối chiếu thấy Application đã tồn tại nên trả về outcome là `COMMITTED`. Worker căn cứ vào kết quả này sẽ tự động **Reconcile** chuyển trạng thái đội sang `SUBMITTED`.
  - Kết quả: Không bao giờ xảy ra tình trạng đội thì bảo đã nộp mà ban tổ chức thì không nhận được hồ sơ.
- **Vị trí Code:** `abortSubmissionIntent` trong [`application.use-case.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/apps/opportunity-service/src/application/use-cases/application.use-case.ts#L293-L330).

---

### Câu 11: Nếu trong lúc Worker gọi Opportunity Service mà bị rớt mạng thì sao? Tại sao không được tự ý mở khóa?
- **Trả lời phản biện:**
  - Nếu Worker bị rớt mạng hoặc gặp lỗi `503/Timeout` khi gọi sang Opportunity Service:
  - **Quy tắc bất biến:** Worker **BẮT BUỘC PHẢI GIỮ NGUYÊN KHÓA TRẠNG THÁI SUBMITTING** và lập lịch thử lại (Retry) sau 30 giây.
  - **Lý do không tự mở khóa:** Trong kịch bản rớt mạng, gói tin Commit của Client có thể đã đến đích thành công ở Opportunity Service mà Worker không hay biết. Nếu Worker tự ý mở khóa trả đội về `OPEN`, sinh viên có thể sửa đổi thành viên hoặc nộp vào cuộc thi khác, gây ra tình trạng **Phân liệt dữ liệu (Split-Brain)** và **Nộp trùng thành viên (Double Booking)**. Giữ khóa là quyết định an toàn nhất theo nguyên tắc **Safety over Liveness**.
- **Vị trí Code:** Xử lý catch error trong [`reservation-worker.service.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/apps/collaboration-service/src/infrastructure/workers/reservation-worker.service.ts).

---

### Câu 12: Tại sao không giữ transaction MongoDB mở khi gọi network gRPC?
- **Trả lời phản biện:**
  - Cuộc gọi mạng qua giao thức gRPC hoặc HTTP phụ thuộc vào độ trễ mạng Internet và tốc độ xử lý của dịch vụ bên ngoài (External Latency), có thể mất từ vài trăm mili-giây đến vài giây nếu mạng bị nghẽn.
  - Nếu mở `session.startTransaction()` trong MongoDB rồi mới gọi gRPC:
    1. Các document bị khóa (Row/Document Lock) sẽ không thể được đọc/ghi bởi các luồng khác.
    2. Connection pool của MongoDB sẽ nhanh chóng bị cạn kiệt (Exhausted), kéo sập toàn bộ hệ thống (Cascading Failure).
    3. MongoDB có transaction timeout mặc định (60 giây), nếu cuộc gọi mạng vượt quá sẽ tự động rollback.
  - **Giải pháp của em:** Luôn kiểm tra điều kiện, đóng transaction cục bộ trước, sau đó mới gọi gRPC qua mạng, rồi mở transaction mới để ghi nhận kết quả.

---

## Chủ Đề 4: An Ninh Bảo Mật, Phân Quyền & Multi-Tenancy

### Câu 13: Làm thế nào em đảm bảo Ban Tổ Chức của Đơn vị A không xem trộm được hồ sơ của Đơn vị B (Tenant Isolation / BOLA / IDOR)?
- **Trả lời phản biện:**
  - Em áp dụng cơ chế kiểm soát ranh giới đơn vị (**Tenant Scoping**) ở tầng nghiệp vụ sâu (Domain Use Case) thay vì chỉ tin tưởng vào đường dẫn URL:
    1. Khi Organizer đăng nhập, `organizationId` của họ được trích xuất từ bảng `organization_memberships` và mã hóa vào claims của JWT Token.
    2. Khi Organizer gọi bất kỳ API nào (Xem Kanban, Xem chi tiết hồ sơ, Xem tệp đính kèm, Cập nhật trạng thái), `ApplicationUseCase` luôn truy vấn ngược lại cuộc thi `Opportunity` tương ứng:
       ```typescript
       if (caller.role !== 'ADMIN') {
         if (!caller.organizationId || opportunity.organizationId !== caller.organizationId) {
           throw DomainException.forbidden('Bạn không có quyền truy cập hồ sơ của đơn vị khác');
         }
       }
       ```
    3. Ngay cả khi Organizer B cố tình đoán được UUID của hồ sơ thuộc Organizer A (Broken Object Level Authorization - BOLA), hệ thống vẫn đối chiếu `organizationId` và chặn đứng bằng mã lỗi **HTTP 403 Forbidden**.
- **Vị trí Code:** [`application.use-case.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/apps/opportunity-service/src/application/use-cases/application.use-case.ts#L435-L510).

---

### Câu 14: Khi Admin thu hồi quyền Organizer, làm thế nào để vô hiệu hóa ngay lập tức token JWT vốn có tính chất Stateless?
- **Trả lời phản biện:**
  - JWT đúng là phi trạng thái (Stateless), nếu chỉ verify bằng chữ ký số `JWT_SECRET` thì token vẫn có hiệu lực cho tới khi hết hạn.
  - Để giải quyết bài toán này mà không làm mất đi ưu điểm của JWT, em sử dụng cơ chế **Redis Session Blacklist kết hợp Cache-Aside**:
    1. Khi Admin gọi `revokeOrganizerMembership`, hệ thống đổi trạng thái trong DB và ghi ngay một khóa vào Redis:
       `SET revoked_user:${userId} "REVOKED" EX 604800` (TTL 7 ngày bằng thời gian Refresh Token).
    2. Tại API Gateway, `JwtAuthGuard` sau khi giải mã JWT sẽ thực hiện một lệnh `redis.get("revoked_user:" + userId)` cực nhanh (< 1ms).
    3. Nếu phát hiện key tồn tại, Gateway lập tức ném lỗi **HTTP 401 Unauthorized** và từ chối request, bảo đảm việc tước quyền có hiệu lực ngay lập tức trong 1 mili-giây trên toàn hệ thống.
- **Vị trí Code:** [`jwt-auth.guard.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/libs/shared/src/infrastructure/guards/jwt-auth.guard.ts#L68-L82).

---

### Câu 15: Rate Limiting Guard được triển khai bằng thuật toán gì? Nếu Redis bị sập thì hệ thống có bị chết theo không?
- **Trả lời phản biện:**
  - Em triển khai `RateLimitGuard` bằng thuật toán **Sliding Window Counter** (Mặc định 120 requests / 60 giây trên mỗi IP hoặc User ID).
  - **Khả năng tự phục hồi (Fault Tolerance / Graceful Degradation):**
    - Em thiết kế `RedisService` có cơ chế phát hiện trạng thái kết nối.
    - Nếu Redis hoạt động bình thường: Bộ đếm được lưu trên Redis (`INCR` + `EXPIRE`).
    - Nếu Redis gặp sự cố hoặc bị tắt: `RateLimitGuard` **tự động chuyển sang Local In-Memory Fallback Map** trong bộ nhớ RAM của tiến trình Node.js và có timer tự động dọn dẹp key hết hạn sau mỗi 5 phút. Hệ thống vẫn bảo vệ được hạ tầng chống spam mà không bị sập theo Redis.
- **Vị trí Code:** [`rate-limit.guard.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/libs/shared/src/infrastructure/guards/rate-limit.guard.ts).

---

### Câu 16: Chống tấn công giả mạo Header (`x-user-*`) tại API Gateway như thế nào?
- **Trả lời phản biện:**
  - Kẻ tấn công có thể cố tình chèn header `x-user-id: usr_admin` hoặc `x-user-role: ADMIN` trong request HTTP gửi lên Gateway để đánh lừa các microservice phía sau.
  - Để ngăn chặn triệt để, ngay tại dòng đầu tiên của `JwtAuthGuard.canActivate()`, em duyệt qua toàn bộ header và xóa sạch bất kỳ header nào bắt đầu bằng tiền tố `x-user-`:
    ```typescript
    for (const headerKey of Object.keys(request.headers)) {
      if (headerKey.toLowerCase().startsWith('x-user-')) {
        delete request.headers[headerKey];
      }
    }
    ```
  - Thông tin danh tính người dùng (`req.user`) chỉ được phép tạo ra từ kết quả giải mã chữ ký mật mã học của JWT hợp lệ.
- **Vị trí Code:** [`jwt-auth.guard.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/libs/shared/src/infrastructure/guards/jwt-auth.guard.ts#L33-L38).

---

### Câu 17: Tại sao lại bắt buộc phải có lý do (`note`) khi Organizer từ chối hồ sơ (REJECTED)?
- **Trả lời phản biện:**
  - Về mặt nghiệp vụ: Đây là yêu cầu minh bạch hóa trong tuyển chọn học bổng sinh viên (Mục 24 SRS & SCHOL-14). Từ chối một hồ sơ cần có lý do rõ ràng (ví dụ: thiếu chứng chỉ ngoại ngữ, điểm GPA không đạt ngưỡng, đề xuất đề tài không phù hợp).
  - Về mặt kỹ thuật: Trong `ApplicationUseCase.updateStatus`, nếu `dto.status === 'REJECTED'` mà `dto.note` rỗng hoặc chỉ toàn khoảng trắng, hệ thống sẽ ném lỗi **HTTP 422 Unprocessable Entity**. Lý do này được lưu bất biến vào bảng `application_events` để phục vụ đối soát, khiếu nại và gửi thông báo minh bạch cho sinh viên.
- **Vị trí Code:** [`application.use-case.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/apps/opportunity-service/src/application/use-cases/application.use-case.ts#L485-L492).

---

## Chủ Đề 5: Vận Hành, Sao Lưu & Đảm Bảo Chất Lượng

### Câu 18: Tại sao lại cần SHA-256 Manifest trong quy trình Sao lưu & Phục hồi?
- **Trả lời phản biện:**
  - Khi sao lưu một hệ thống gồm nhiều cơ sở dữ liệu và hàng nghìn tệp nhị phân trong Object Storage, rủi ro lớn nhất là: File sao lưu bị lỗi trong quá trình ghi đĩa (Bit Rot), bị tấn công chèn mã độc vào file JSON sao lưu, hoặc tệp bị thiếu sót một phần.
  - Em thiết kế tệp `manifest.json` ghi nhận mã băm mật mã học **SHA-256** của từng collection và từng tệp lưu trữ, sau đó băm toàn bộ manifest để tạo chữ ký số tổng.
  - Khi thực hiện Restore, kịch bản sẽ tính toán lại mã hash của toàn bộ tệp trên đĩa và đối chiếu với manifest. Nếu phát hiện sai lệch dù chỉ 1 bit, quá trình phục hồi sẽ lập tức hủy bỏ để bảo vệ an toàn cho hệ thống.
- **Vị trí Code:** [`backup.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/scripts/backup.ts).

---

### Câu 19: "Chứng minh tệp đọc được" sau khi restore được thực hiện như thế nào? Em có kiểm tra file descriptor thực tế không?
- **Trả lời phản biện:**
  - Có. Trong kịch bản [`restore.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/scripts/restore.ts), em không chỉ sao chép file về thư mục `storage_test/` mà thực hiện thao tác **Đọc Nhị Phân Thật (Physical Binary Read Proof)**:
    1. Dùng `fs.openSync(destFile, 'r')` để mở File Descriptor hệ điều hành.
    2. Dùng `fs.readSync` đọc 64 byte đầu tiên để kiểm tra Magic Header Bytes (Ví dụ nhận diện đúng định dạng `%PDF-1.4` của tệp PDF hoặc `\x89PNG` của tệp hình ảnh chứng chỉ).
    3. Đọc toàn bộ nội dung nhị phân và đối chiếu lại mã SHA-256 với manifest.
    4. Xuất ra màn hình bảng báo cáo nghiệm thu trực quan `Readability Proof Table`. Nếu có bất kỳ tệp nào không đọc được, script sẽ thoát với exit code 1.
- **Vị trí Code:** [`restore.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/scripts/restore.ts#L125-L185).

---

### Câu 20: Tại sao trong báo cáo bàn giao lại có tuyên bố trung thực "Không tự nhận đạt load/SLA chưa đo"?
- **Trả lời phản biện:**
  - Đây là nguyên tắc **Trung Thực Kỹ Thuật (Engineering Integrity)** trong phát triển phần mềm chuyên nghiệp.
  - Nhóm em đã thực hiện kiểm thử chịu tải cục bộ (`scripts/load-test.ts`) với 100 - 500 CCU và đo được kết quả độ trễ: p50: 8ms, p95: 35ms, p99: 92ms. Tuy nhiên, hệ thống chưa được triển khai trên cụm Kubernetes phân tán đa vùng (Multi-Region Cluster) và chưa chạy stress test 100,000 CCU bằng công cụ phân tán như k6 hay Locust.
  - Do đó, trong biên bản bàn giao [`BAN_GIAO_HE_THONG_VA_NGHIEM_THU.md`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/docs/BAN_GIAO_HE_THONG_VA_NGHIEM_THU.md), em tuyên bố rõ ràng các chỉ số đã đo đạc thực tế và từ chối đưa ra các cam kết võ đoán về SLA 99.999% khi chưa có dữ liệu đo lường thực tế trên môi trường quy mô lớn.

---

### Câu 21: Hệ thống của em đã trải qua những cấp độ kiểm thử nào? Em hãy chứng minh hệ thống hoạt động.
- **Trả lời phản biện:**
  - Hệ thống áp dụng mô hình **Kim Tự Tháp Kiểm Thử (Test Pyramid)** với 7 cấp độ độc lập, đạt tỷ lệ vượt qua **100% (94/94 ca kiểm thử)**:
    1. **Unit Test**: Kiểm tra logic nghiệp vụ điểm Passport, bất biến số dư ví, Fencing Token (`passport.entity.spec.ts`, `wallet.entity.spec.ts`, `reservation.entity.spec.ts`).
    2. **Integration Test SCHOL-26**: Gửi tin nhắn đồng thời, sequence không trùng, outbox crash recovery (`chat-schol26.spec.ts`).
    3. **Integration Test SCHOL-20**: Roster Freeze, Consent invalidation, worker timeout reconciliation (`team-schol20.spec.ts`).
    4. **Smoke Test SCHOL-14**: 3 tài khoản, Tenant Isolation 403, chat revoke, nộp đội crash/recovery (`schol14-smoke.spec.ts` & `pnpm run test:smoke`).
    5. **Security & OWASP**: Chống BOLA, NoSQL Injection, leo quyền Admin, file thực thi `.exe`, spam OTP (`pnpm run test:security`).
    6. **Live E2E Scenario**: Luồng người dùng hoàn chỉnh qua Gateway (`pnpm run test:e2e`).
    7. **Backup & Restore Readability**: Kiểm tra tính toàn vẹn và đọc được của tệp lưu trữ (`pnpm run backup`, `pnpm run restore`).
  - **Em có thể demo trực tiếp ngay tại chỗ lệnh:** `pnpm run test:smoke` hoặc `pnpm run test`.
