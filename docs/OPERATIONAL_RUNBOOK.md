# Sổ Tay Vận Hành Hệ Thống (Operational Runbook) — Scholink Microservices

> **Mã quy chuẩn:** SCHOL-14 Runbook  
> **Phiên bản:** 3.2-PROD  
> **Phạm vi:** 5 Microservices (Identity, Opportunity, Collaboration, Billing, Notification), API Gateway, MongoDB, Redis, EMQX MQTT Broker, MinIO S3 Object Storage.

---

## 📑 Mục Lục
1. [Yêu Cầu Tiền Đề & Môi Trường](#1-yêu-cầu-tiền-đề--môi-trường)
2. [Quy Trình Build Mã Nguồn (Build)](#2-quy-trình-build-mã-nguồn-build)
3. [Quy Trình Khởi Động Hệ Thống (Start)](#3-quy-trình-khởi-động-hệ-thống-start)
4. [Khởi Tạo Dữ Liệu Mẫu (Seed)](#4-khởi-tạo-dữ-liệu-mẫu-seed)
5. [Quy Trình Sao Lưu Toàn Diện (Backup DB & Object Storage)](#5-quy-trình-sao-lưu-toàn-diện-backup-db--object-storage)
6. [Quy Trình Phục Hồi Dữ Liệu & Kiểm Chứng Tệp Đọc Được (Restore & Verification)](#6-quy-trình-phục-hồi-dữ-liệu--kiểm-chứng-tệp-đọc-được-restore--verification)
7. [Quy Trình Xử Lý Sự Cố Hạ Tầng & Dịch Vụ (Failure Recovery)](#7-quy-trình-xử-lý-sự-cố-hạ-tầng--dịch-vụ-failure-recovery)
   - [7.1. Cơ sở dữ liệu MongoDB gặp sự cố hoặc mất kết nối](#71-cơ-sở-dữ-liệu-mongodb-gặp-sự-cố-hoặc-mất-kết-nối)
   - [7.2. Message Broker (EMQX MQTT) gặp sự cố](#72-message-broker-emqx-mqtt-gặp-sự-cố)
   - [7.3. Object Storage (MinIO) gặp sự cố](#73-object-storage-minio-gặp-sự-cố)
   - [7.4. Sự cố xác thực / Bên thứ ba gián đoạn](#74-sự-cố-xác-thực--bên-thứ-ba-gián-đoạn)
8. [Quy Trình Hoàn Nguyên & Rollback Hệ Thống](#8-quy-trình-hoàn-nguyên--rollback-hệ-thống)

---

## 1. Yêu Cầu Tiền Đề & Môi Trường

### 1.1. Hạ Tầng & Công Cụ Yêu Cầu
- **Node.js**: Phiên bản `>= 20.x` (khuyến nghị Node.js 22 LTS).
- **pnpm**: Phiên bản `>= 9.x` (`corepack enable && corepack prepare pnpm@latest --activate`).
- **MongoDB**: Phiên bản `>= 7.0` (Cổng 27017).
- **Redis**: Phiên bản `>= 7.0` (Cổng 6379) phục vụ Idempotency Key, Session Revocation, Rate Limiting.
- **EMQX Broker**: Phiên bản `>= 5.x` (Cổng MQTT 1883, HTTP API 18083) cho Chat Realtime.
- **MinIO S3**: Cổng 9000 (S3 API) & 9001 (Console) lưu trữ tệp minh chứng CV, chứng chỉ.

### 1.2. Biến Môi Trường (`backend/.env`)
Tham khảo tệp mẫu chuẩn [`backend/.env.example`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/.env.example).
> [!IMPORTANT]
> Tuyệt đối không lưu trữ khóa mật mã thực tế (`JWT_SECRET`, `ENCRYPTION_KEY`, `MINIO_SECRET_KEY`) trên Git repository.

---

## 2. Quy Trình Build Mã Nguồn (Build)

Di chuyển vào thư mục backend:
```bash
cd backend
```

### 2.1. Cài đặt thư viện phụ thuộc
```bash
pnpm install --frozen-lockfile
```

### 2.2. Biên dịch toàn bộ các Microservices & Shared Kernel
```bash
pnpm run build:all
```
Lệnh này sẽ tự động biên dịch theo thứ tự:
1. `libs/shared` (Shared Kernel)
2. `apps/gateway` (API Gateway)
3. `apps/identity-service` (Port 3001 & gRPC 50051)
4. `apps/opportunity-service` (Port 3002 & gRPC 50052)
5. `apps/collaboration-service` (Port 3003 & gRPC 50053)
6. `apps/billing-service` (Port 3004 & gRPC 50054)
7. `apps/notification-service` (Port 3005 & gRPC 50055)

Tất cả tệp đầu ra được đóng gói vào thư mục `backend/dist/`.

---

## 3. Quy Trình Khởi Động Hệ Thống (Start)

### 3.1. Chế độ Phát triển (Development - Hot Reload)
Mở các terminal riêng biệt để theo dõi logs:

```bash
# Terminal 1: API Gateway (Port 3000)
pnpm run start:gateway

# Terminal 2: Identity Microservice (Port 3001)
pnpm run start:identity

# Terminal 3: Opportunity Microservice (Port 3002)
pnpm run start:opportunity

# Terminal 4: Collaboration Microservice (Port 3003)
pnpm run start:collaboration

# Terminal 5: Billing Microservice (Port 3004)
pnpm run start:billing

# Terminal 6: Notification Microservice (Port 3005)
pnpm run start:notification
```

### 3.2. Chế độ Production (Production Containers / Daemon)
```bash
# Chạy với Node runtime đã biên dịch
NODE_ENV=production node dist/apps/gateway/main.js
NODE_ENV=production node dist/apps/identity-service/main.js
NODE_ENV=production node dist/apps/opportunity-service/main.js
NODE_ENV=production node dist/apps/collaboration-service/main.js
NODE_ENV=production node dist/apps/billing-service/main.js
NODE_ENV=production node dist/apps/notification-service/main.js
```

---

## 4. Khởi Tạo Dữ Liệu Mẫu (Seed)

Lệnh nạp dữ liệu mẫu ban đầu (Admin, 2 Đơn vị tổ chức Org A & Org B, các tài khoản mẫu, danh mục học bổng & cuộc thi):

```bash
cd backend
pnpm run seed
```

Dữ liệu khởi tạo bao gồm:
- **Admin**: `admin@scholink.edu.vn` (Mật khẩu: `Admin@123456`)
- **Organizer Org A**: `organizer.a@uit.edu.vn` (Tổ chức: `Đại học CNTT - UIT`)
- **Organizer Org B**: `organizer.b@hcmus.edu.vn` (Tổ chức: `Đại học KHTN - HCMUS`)
- **Sinh viên**: `student.test@uit.edu.vn` (Hồ sơ Passport mẫu, ví số dư khởi tạo)

---

## 5. Quy Trình Sao Lưu Toàn Diện (Backup DB & Object Storage)

Scholink áp dụng cơ chế sao lưu hợp nhất cả 5 cơ sở dữ liệu MongoDB và tệp nhị phân Object Storage kèm chữ ký kiểm tra `manifest.json`.

```bash
cd backend
pnpm run backup
```

### 5.1. Cơ chế hoạt động:
1. Trích xuất toàn bộ collection từ 5 DB (`scholink_identity`, `scholink_opportunity`, `scholink_collaboration`, `scholink_billing`, `scholink_notification`).
2. Quét toàn bộ thư mục `storage/` lưu trữ CV, chứng chỉ, avatar.
3. Tính toán mã băm mật mã học **SHA-256** cho từng collection và từng tệp lưu trữ.
4. Tạo tệp `backups/backup-<timestamp>/manifest.json` chứa chữ ký số và metadata kiểm toán.

---

## 6. Quy Trình Phục Hồi Dữ Liệu & Kiểm Chứng Tệp Đọc Được (Restore & Verification)

Để phục hồi dữ liệu từ bản sao lưu gần nhất hoặc bản sao lưu cụ thể vào môi trường kiểm thử:

```bash
cd backend
pnpm run restore
# Hoặc chỉ định rõ thư mục sao lưu:
# pnpm run restore backups/backup-2026-11-02T10-00-00-000Z
```

### 6.2. Kiểm chứng tệp đọc được (Readability Proof):
Sau khi sao chép tệp về `storage_test/`:
- Kịch bản sẽ tự động mở từng tệp nhị phân bằng file descriptor (`fs.openSync`), đọc khối dữ liệu đầu (Magic Header Bytes), và tính lại mã SHA-256 trên đĩa.
- In bảng chứng minh tính đọc được (Proof Table):

```text
========================================================================================
📊 BẢNG BÁO CÁO CHỨNG MINH TÍNH ĐỌC ĐƯỢC & TOÀN VẸN CỦA OBJECT STORAGE (READABILITY PROOF)
========================================================================================
Tên tệp                            | Dung lượng    | SHA-256     | Header xem trước          | Trạng thái đọc
-----------------------------------------------------------------------------------------
cvs/student_cv_nguyen_van_a.pdf    | 1024 B        | MATCH [OK]  | %PDF-1.4 %Scholink Verifi | ✅ READABLE (PASS)
certificates/ielts_certificate.pdf | 2048 B        | MATCH [OK]  | %PDF-1.4 %Scholink Verifi | ✅ READABLE (PASS)
========================================================================================
```

---

## 7. Quy Trình Xử Lý Sự Cố Hạ Tầng & Dịch Vụ (Failure Recovery)

### 7.1. Cơ sở dữ liệu MongoDB gặp sự cố hoặc mất kết nối
- **Triệu chứng:** API trả về mã lỗi HTTP 500 hoặc `SERVICE_UNAVAILABLE` với log `MongoNetworkError` / `MongooseServerSelectionError`.
- **Cơ chế tự bảo vệ:**
  - Microservices sử dụng kết nối bền vững với `serverSelectionTimeoutMS: 5000` và `heartbeatFrequencyMS: 10000`.
  - Trong quá trình ngắt quãng, các tiến trình nộp hồ sơ đội (`ReservationWorkerService`) giữ nguyên trạng thái khóa `SUBMITTING`, **không tự ý mở khóa sai lệch** (giữ khóa retry an toàn).
- **Quy trình khắc phục:**
  1. Kiểm tra trạng thái daemon MongoDB: `systemctl status mongod` hoặc `docker ps | grep mongo`.
  2. Khởi động lại service nếu tiến trình bị treo: `sudo systemctl restart mongod`.
  3. Khi kết nối phục hồi, Mongoose client tự động tái kết nối mà không cần khởi động lại microservice.

### 7.2. Message Broker (EMQX MQTT) gặp sự cố
- **Triệu chứng:** Người dùng trong phòng chat không nhận được tin nhắn realtime theo thời gian thực; log cảnh báo `MQTT Connection Lost`.
- **Cơ chế tự bảo vệ:**
  - **Không lấy MQTT làm nguồn dữ liệu chính**: Mọi tin nhắn văn bản trước hết được ghi bền vững vào MongoDB cùng `room`, `seq` tự tăng và bảng `outbox` trong cùng transaction.
  - Khi EMQX Broker gián đoạn, API gửi tin vẫn trả về HTTP 201 Created và cấp mã ACK cho client.
  - Worker Outbox chuyển sang chế độ backoff lũy thừa, lưu tạm sự kiện chưa phát.
- **Quy trình khắc phục:**
  1. Khởi động lại EMQX: `docker restart scholink-emqx`.
  2. Khi EMQX hoạt động trở lại, Outbox Worker tự động quét bảng outbox và phát bù toàn bộ sự kiện theo đúng thứ tự `seq`.
  3. Client áp dụng bộ lọc `(room, clientMsgId)` và `afterSeq` để loại bỏ tin nhắn trùng lặp.

### 7.3. Object Storage (MinIO) gặp sự cố
- **Triệu chứng:** Thao tác tải tệp minh chứng hoặc xác nhận tải tệp thất bại (`CompleteUpload` trả về 502/503).
- **Cơ chế tự bảo vệ:**
  - Presigned URL có thời hạn hợp lệ 15 phút.
  - Bảng `MediaAsset` giữ trạng thái `UPLOADING` cho tới khi xác nhận tệp hoàn tất.
- **Quy trình khắc phục:**
  1. Kiểm tra MinIO: `docker logs scholink-minio`.
  2. Khôi phục MinIO container hoặc khôi phục dữ liệu từ bản sao lưu qua `pnpm run restore`.
  3. Client có thể yêu cầu cấp lại Presigned URL mới thông qua endpoint `/api/v1/media/upload-url`.

### 7.4. Sự cố xác thực / Bên thứ ba gián đoạn
- **Triệu chứng:** Redis bị tắt khiến bộ nhớ đệm xác thực phiên không phản hồi tức thời.
- **Cơ chế tự bảo vệ:**
  - Hệ thống tự động chuyển sang **Local Fallback Memory Cache** trong `RedisService`.
  - Token JWT dạng mã hóa tự thân (Self-contained) vẫn được xác thực bằng `JWT_SECRET` tại API Gateway và các microservice, bảo đảm người dùng hợp lệ không bị gián đoạn phiên làm việc.

---

## 8. Quy Trình Hoàn Nguyên & Rollback Hệ Thống

Khi một phiên bản triển khai mới gặp lỗi nghiêm trọng (Critical Bug) trong quá trình hoạt động:

### 8.1. Rollback Cơ Sở Dữ Liệu
1. Dừng các tiến trình ghi mới:
   - Chuyển API Gateway sang chế độ bảo trì (hoặc ngắt nhận request ngoài).
2. Chạy lệnh phục hồi về bản sao lưu gần nhất trước khi triển khai:
   ```bash
   cd backend
   pnpm run restore backups/backup-safe-point
   ```
3. Xác nhận tính toàn vẹn của dữ liệu thông qua báo cáo SHA-256.

### 8.2. Rollback Ứng Dụng (Code Rollback)
1. Chuyển Git về phiên bản Release Tag an toàn gần nhất:
   ```bash
   git checkout tags/v1.0.0-release
   ```
2. Cài đặt lại thư viện và biên dịch lại:
   ```bash
   pnpm install --frozen-lockfile
   pnpm run build:all
   ```
3. Khởi động lại các Microservices và Gateway.
4. Thực hiện Smoke Test kiểm tra sức khỏe 3 tài khoản mẫu trước khi mở lại lưu lượng cho người dùng.
