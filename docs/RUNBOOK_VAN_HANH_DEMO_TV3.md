# Sổ Tay Vận Hành & Kịch Bản Kiểm Thử Demo Backend — TV3 (Scholink)

> **Phân công TV3:** Phụ trách toàn diện **Collaboration Service**, **Web Admin / Organizer Kanban tối thiểu**, **Hạ tầng / Docker Replica Set**, **Roster Freeze & Submission Reservation (F33)**, và **Sao lưu Phục hồi Backup/Restore (F42)**.  
> **Căn cứ nghiệp vụ:** Tuân thủ Mục 18 (FR-TEAM-01..05), Mục 19 (FR-CHAT-01..06), Mục 7 (WF06, WF07), và Phụ lục 31-32 trong `Scholink_Tai_Lieu_Phat_Trien_Team.md` (SRS v3.2).

---

## 📌 Bảng Đối Chiếu Thành Quả TV3 Theo Các Milestone

| Milestone | Nội dung bàn giao kỹ thuật | Tệp mã nguồn phụ trách chính |
|---|---|---|
| **F06** | Dựng Docker Compose Replica Set rs0 hỗ trợ ACID Transaction, Health check Gateway & Skeleton Collaboration/Notification | [`docker-compose.yml`](file:///c:/Users/Administrator/Desktop/PROJECT/Scholink/docker-compose.yml), [`portal.controller.ts`](file:///c:/Users/Administrator/Desktop/PROJECT/Scholink/apps/gateway/src/portal.controller.ts) |
| **F15** | Membership nguyên tử chống race-condition tranh slot, unique `active_memberships`, và Web Admin cấp Organization/Organizer | [`team.use-case.ts`](file:///c:/Users/Administrator/Desktop/PROJECT/Scholink/apps/collaboration-service/src/application/use-cases/team.use-case.ts), [`admin-organization.controller.ts`](file:///c:/Users/Administrator/Desktop/PROJECT/Scholink/apps/identity-service/src/presentation/admin-organization.controller.ts) |
| **F24** | Chat Room, tin nhắn tuần tự tuyệt đối (Monotonic Seq), Outbox Pattern, Deduplication `clientMsgId`, ACL & Web Organizer Kanban | [`chat.use-case.ts`](file:///c:/Users/Administrator/Desktop/PROJECT/Scholink/apps/collaboration-service/src/application/use-cases/chat.use-case.ts), [`application.controller.ts`](file:///c:/Users/Administrator/Desktop/PROJECT/Scholink/apps/opportunity-service/src/presentation/application.controller.ts) |
| **F33** | Khóa nộp hồ sơ đội (Roster Freeze 10 phút), Fencing Token tự tăng, Submission Reservation, Consent đội và Worker dọn dẹp quá hạn | [`reservation.entity.ts`](file:///c:/Users/Administrator/Desktop/PROJECT/Scholink/apps/collaboration-service/src/domain/reservation.entity.ts), [`reservation-worker.service.ts`](file:///c:/Users/Administrator/Desktop/PROJECT/Scholink/apps/collaboration-service/src/infrastructure/workers/reservation-worker.service.ts) |
| **F42** | Đóng lỗi web/team/chat, kịch bản Sao lưu & Phục hồi tự động (Backup & Restore) 5 DB, Runbook vận hành demo | [`scripts/backup.ts`](file:///c:/Users/Administrator/Desktop/PROJECT/Scholink/scripts/backup.ts), [`scripts/restore.ts`](file:///c:/Users/Administrator/Desktop/PROJECT/Scholink/scripts/restore.ts) |

---

## 🚀 1. Khởi Động Nhanh Môi Trường Kiểm Thử

### Bước 1: Khởi chạy hạ tầng Docker
```bash
docker compose up -d
```
*Các dịch vụ sẽ sẵn sàng:*
- MongoDB 7.0 (Replica Set `rs0`): `localhost:27017`
- Redis 7.2: `localhost:6379`
- RabbitMQ Management: `http://localhost:15672` (guest / guest)
- EMQX Dashboard: `http://localhost:18083` (admin / public)

### Bước 2: Khởi tạo dữ liệu mẫu (Seed)
```bash
# Di chuyển vào thư mục backend
cd backend

# Cài đặt thư viện nếu chưa cài
pnpm install

# Khởi tạo dữ liệu mẫu
pnpm run seed
```
*Tạo sẵn tài khoản và dữ liệu mẫu:*
- **Admin:** `admin@scholink.edu.vn` / `ScholinkAdmin@2026`
- **Organizer:** `organizer@scholink.edu.vn` / `Organizer@2026`
- **Student:** `student@scholink.edu.vn` / `Student@2026`
- **Tổ chức:** Viện Nghiên cứu Trí tuệ Nhân tạo VinAI (`org_vinai_innovation_lab`)
- **Đội thi & Chat:** Đội BK AI Innovators (`team_bk_ai_innovators`) kèm phòng chat và tin nhắn Seq #1, #2.

### Bước 3: Chạy các Microservices
Mở các cửa sổ terminal riêng biệt trong thư mục `backend/`:
```bash
cd backend
pnpm run start:gateway        # API Gateway & Web Portal (Port 3000)
pnpm run start:identity       # Identity & Admin Organization (Port 3001)
pnpm run start:opportunity    # Opportunity & Kanban Application (Port 3002)
pnpm run start:collaboration  # Collaboration, Teams, Chat & Worker (Port 3003)
```

---

## 🎯 2. Hướng Dẫn Kịch Bản Demo Cho Hội Đồng / Giảng Viên

Truy cập trực tiếp **Scholink Web Portal** tại:
👉 **`http://localhost:3000/portal`**

---

### Kịch Bản 1: Web Admin — Quản trị Tổ chức & Cấp quyền Organizer (F15)
1. Trên thanh điều hướng, chọn tab **"🏢 Admin Tổ Chức"** (hoặc `http://localhost:3000/portal#admin`).
2. **Tạo tổ chức mới:**
   - Nhập: Tên đơn vị: *Tập đoàn Công nghệ FPT*, Mã thuế: *0102030405*, Email: *contact@fpt.com*.
   - Nhấn **"Tạo Tổ Chức"**.
   - Bảng danh sách bên dưới cập nhật ngay lập tức bản ghi mới.
3. **Cấp quyền Organizer:**
   - Chọn tổ chức vừa tạo.
   - Nhập email sinh viên: `student@scholink.edu.vn`.
   - Chọn vai trò: `ORGANIZER_ADMIN`.
   - Bấm **"Cấp Quyền Organizer"**.
   - Hệ thống tự động nâng vai trò người dùng từ `STUDENT` lên `ORGANIZER` và ghi nhận vào collection `organization_memberships`.

---

### Kịch Bản 2: Web Organizer — Thẩm định Hồ sơ với Bảng Kanban (F24)
1. Chọn tab **"📋 Kanban Organizer"** (hoặc `http://localhost:3000/portal#kanban`).
2. Chọn cuộc thi: **"Cuộc thi Scholink AI Challenge 2026"**.
3. Bảng Kanban tự động phân loại các hồ sơ đã nộp thành 6 cột:
   - `Mới nộp (APPLIED)`
   - `Đang Thẩm Định (REVIEWING)`
   - `Vào Vòng Trong (SHORTLISTED)`
   - `Phỏng Vấn (INTERVIEW)`
   - `Trúng Tuyển (ACCEPTED)`
   - `Từ Chối (REJECTED)`
4. **Kiểm tra chuyển trạng thái:**
   - Trên một thẻ hồ sơ ở cột *Mới nộp*, bấm nút **"Duyệt"** (chuyển sang `REVIEWING`) hoặc **"Vòng trong"** (`SHORTLISTED`).
   - Thẻ hồ sơ lập tức chuyển cột mượt mà.
   - Thao tác gửi kèm `expectedVersion` để chống xung đột ghi đè đồng thời (Optimistic Locking).

---

### Kịch Bản 3: Đội Thi, Tuyển Thành Viên Nguyên Tử & Roster Freeze (F15 & F33)
1. Chọn tab **"🤝 Đội Thi & Roster Freeze"** (hoặc `http://localhost:3000/portal#teams`).
2. **Tạo đội thi:**
   - Nhập tên: *Scholink AI Pioneers*, minSize: 2, maxSize: 4.
   - Nhấn **"Tạo Đội Thi Mới"**.
   - Hệ thống tự động tạo đội, gán trưởng đội, ghi nhận `active_memberships` duy nhất và tự động sinh phòng chat nhóm.
3. **Kiểm tra Roster Freeze (Khóa nộp hồ sơ đội 10 phút - F33):**
   - Chọn đội vừa tạo ở dropdown bên phải.
   - Nhấn **"🔒 Khóa Roster Freeze (10 phút)"**.
   - Trạng thái đội chuyển sang `SUBMITTING`. Hệ thống tự sinh `reservationId` và tăng `fencingToken` (+1).
   - Trong thời gian Roster Freeze, mọi hành vi thêm/bớt/rời đội đều bị chặn nghiêm ngặt (`STATE_CONFLICT`).
4. **Ký Consent đồng thuận nộp đội:**
   - Bấm **"✍️ Gửi Consent Thành Viên"**.
   - Hệ thống ghi nhận chữ ký SHA-256 (`payloadHash`) của thành viên vào phiên giữ chỗ.
5. **Mở khóa đội (Abort):**
   - Nhấn **"🔓 Mở Khóa Đội (Abort)"** để hủy phiên giữ chỗ và đưa đội trở lại trạng thái hoạt động bình thường.
   - Ngoài ra, background worker `ReservationWorkerService` tự động quét mỗi 30 giây để giải phóng nếu quá 10 phút.

---

### Kịch Bản 4: Trò Chuyện Nhóm & Thứ Tự Tin Nhắn Seq Tuyệt Đối (F24)
1. Chọn tab **"💬 Chat Monotonic Seq"** (hoặc `http://localhost:3000/portal#chat`).
2. Chọn phòng chat của đội ở danh sách bên trái.
3. **Kiểm tra thứ tự tin nhắn (Monotonic Sequence):**
   - Mọi tin nhắn hiển thị rõ ràng nhãn `Seq: #1`, `Seq: #2`, `Seq: #3`...
   - Nhập tin nhắn mới và bấm **"Gửi Tin"**.
   - Tin nhắn mới lập tức được cấp số `Seq` tự tăng nguyên tử tiếp theo (ví dụ: `Seq: #3`).
   - Sự kiện `MessageSent` được đồng thời ghi bền vững vào collection `outbox` để sẵn sàng phân phối qua broker mà không lo mất tin.
4. **Chống trùng tin nhắn (ClientMsgId Dedup):**
   - Nếu client gửi lại cùng `clientMsgId`, server lập tức nhận diện và trả về tin nhắn cũ, triệt tiêu hoàn toàn lỗi double-send khi mạng di động chập chờn.

---

### Kịch Bản 5: Sao Lưu & Phục Hồi Dữ Liệu Tự Động (F42)
1. **Thực hiện Sao lưu (Backup toàn bộ 5 Databases):**
   ```bash
   cd backend
   pnpm run backup
   ```
   - Terminal sẽ hiển thị chi tiết tiến trình trích xuất từng collection của cả 5 databases (`scholink_identity`, `scholink_opportunity`, `scholink_collaboration`, `scholink_billing`, `scholink_notification`).
   - Dữ liệu được đóng gói an toàn vào thư mục `backend/backups/backup-<TIMESTAMP>/` kèm tệp `manifest.json`.

2. **Thực hiện Phục hồi (Restore):**
   ```bash
   cd backend
   pnpm run restore
   ```
   - Tự động nhận diện bản backup mới nhất, làm sạch và nạp lại toàn bộ dữ liệu, khôi phục nguyên trạng 100% hệ thống chỉ trong vài giây.

---

### Kịch Bản 6: Kiểm Thử Hiệu Năng Cao gRPC vs RESTful (High-Load Architecture)

1. **Kiểm thử trực tiếp trên Swagger Gateway:**
   - Truy cập Swagger API Gateway: `http://localhost:3000/docs#/High-Load%20gRPC%20Gateways`
   - Gọi endpoint: `GET /api/v1/grpc/teams/team_bk_ai_innovators/details`
   - Quan sát trường `durationMs` trong JSON phản hồi (thời gian xử lý qua binary multiplexing cực ngắn).
2. **Kiểm thử gọi gRPC Roster Freeze & Submission:**
   - Gọi `POST /api/v1/grpc/teams/team_bk_ai_innovators/prepare-submission`
   - Dữ liệu gửi: `{ "leaderId": "student_01", "competitionId": "comp_scholink_ai_challenge_2026" }`
   - Gateway dispatch bằng stream gRPC xuống Collaboration Service, kích hoạt khóa đội và trả về `fencingToken` tức thì.
3. **Kiểm thử bằng Postman (gRPC Request):**
   - Mở Postman -> Chọn **New** -> **gRPC Request**.
   - URL: `localhost:50053` (Collaboration Service) hoặc `localhost:50051` (Identity Service).
   - Chọn method: `PrepareSubmission`, `ValidateReservation`, hoặc `GetProfileSnapshot`.
   - Bấm **Invoke** để trải nghiệm tốc độ phản hồi trực tiếp của gRPC Server.

---

## 🛡️ 3. Kiểm Tra Sức Khỏe Toàn Bộ 5 Microservices (F06)

Chọn tab **"🩺 Health & Topology"** trên Web Portal hoặc gọi trực tiếp:
```bash
curl http://localhost:3000/health
```
Phản hồi mẫu:
```json
{
  "status": "ok",
  "service": "api-gateway",
  "port": 3000,
  "microservices": {
    "identity": "http://localhost:3001",
    "opportunity": "http://localhost:3002",
    "collaboration": "http://localhost:3003",
    "billing": "http://localhost:3004",
    "notification": "http://localhost:3005"
  }
}
```

Xem danh sách đầy đủ các tuyến Reverse Proxy:
```bash
curl http://localhost:3000/routes
```

---
*Tài liệu được chuẩn hóa và thực hiện bởi TV3 Backend Team - Scholink Platform 2026.*
