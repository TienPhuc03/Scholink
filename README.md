# Scholink — Microservices Ecosystem & Platform

[![Node.js](https://img.shields.io/badge/Node.js-v22-green.svg)](https://nodejs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-v11-red.svg)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-v5-blue.svg)](https://www.typescriptlang.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-v7-brightgreen.svg)](https://www.mongodb.com/)
[![Kotlin](https://img.shields.io/badge/Kotlin-Native%20Android-purple.svg)](https://kotlinlang.org/)
[![Clean Architecture](https://img.shields.io/badge/Architecture-Clean%20%2F%20Hexagonal-orange.svg)]()

Nền tảng hỗ trợ sinh viên tìm kiếm học bổng & cuộc thi, quản lý hồ sơ Passport số hóa, tìm kiếm đồng đội (Team-Up), nộp hồ sơ trực tuyến, liên lạc thời gian thực và quản lý tài chính ví tích hợp.

Dự án được xây dựng dựa trên đặc tả kỹ thuật **Scholink SRS v3.2** (17/10/2026) theo kiến trúc **Clean Architecture / Hexagonal Architecture** với **1 API Gateway + 5 Microservices nghiệp vụ độc lập** và ứng dụng **Android Kotlin Native**.

---

## 🏛️ Topology Kiến trúc 5 Microservices

| Service | Port | Database cô lập | Module sở hữu & Trách nhiệm chính |
|---|---|---|---|
| **API Gateway** | `3000` | N/A | Cổng vào duy nhất điều phối HTTP Reverse Proxy, CORS, Correlation ID, Swagger docs và định tuyến tới 5 microservices. |
| **Identity Service** | `3001` | `scholink_identity` | Tài khoản, JWT HS256/RS256, xoay vòng refresh token, Passport sinh viên, tính điểm hoàn thiện 7 thành phần, snapshot bất biến và Consent SHA-256. |
| **Opportunity Service** | `3002` | `scholink_opportunity` | Danh mục Học bổng & Cuộc thi, bộ lọc cursor-based, crawler/kiểm duyệt, nộp hồ sơ cá nhân/đội thi (`IN_APP`/`EXTERNAL`), rút hồ sơ. |
| **Collaboration Service** | `3003` | `scholink_collaboration` | Đội thi, tìm kiếm đồng đội (Team-Up), phòng chat 1-1 & nhóm đội, WebRTC signaling, báo cáo vi phạm. |
| **Billing Service** | `3004` | `scholink_billing` | Ví tiền số nguyên VND, số dư khả dụng (`balance >= held >= 0`), thanh toán sandbox, giữ/thu hồi tiền (Hold/Capture), mua gói SKU Plus/Boost. |
| **Notification Service** | `3005` | `scholink_notification` | Hộp thư in-app, nhắc hạn deadline (T-7, T-3, T-1), gửi mail thông báo, cầu nối MQTT cho client Android. |

---

## 🔀 Bảng định tuyến API Gateway (Reverse Proxy)

Tất cả các client (Android mobile app, Web portal) đều giao tiếp duy nhất qua **API Gateway (Port 3000)**:

| Tiền tố đường dẫn (Prefix) | Microservice tiếp nhận | Cổng đích |
|---|---|---|
| `/api/v1/auth/*` | Identity Microservice | `http://localhost:3001` |
| `/api/v1/profiles/*` | Identity Microservice | `http://localhost:3001` |
| `/api/v1/opportunities/*` | Opportunity Microservice | `http://localhost:3002` |
| `/api/v1/applications/*` | Opportunity Microservice | `http://localhost:3002` |
| `/api/v1/teams/*` | Collaboration Microservice | `http://localhost:3003` |
| `/api/v1/chats/*` | Collaboration Microservice | `http://localhost:3003` |
| `/api/v1/wallets/*` | Billing Microservice | `http://localhost:3004` |
| `/api/v1/notifications/*` | Notification Microservice | `http://localhost:3005` |

---

## 🚀 Khởi động nhanh (Quick Start)

### 1. Yêu cầu môi trường
- **Node.js**: v20+ hoặc v22+
- **pnpm** hoặc **npm**
- **Docker & Docker Compose**
- **Android Studio Ladybug / Koala** (cho app Android)

### 2. Khởi chạy Hạ tầng Docker
```bash
docker compose up -d
```
- MongoDB: `localhost:27017`
- Redis: `localhost:6379`
- RabbitMQ Management: `http://localhost:15672` (guest / guest)
- MinIO Console: `http://localhost:9001` (scholink_minio_admin / scholink_minio_password)
- EMQX MQTT Dashboard: `http://localhost:18083` (admin / public)

### 3. Cài đặt Dependencies & Khởi tạo Dữ liệu mẫu (Seed)
```bash
# Cài đặt thư viện
pnpm install

# Khởi tạo dữ liệu mẫu (Tạo tài khoản Admin, Organizer, Student, Passport 100%, học bổng/cuộc thi mẫu)
pnpm run seed
```

**Tài khoản kiểm thử sau khi Seed:**
- **ADMIN:** `admin@scholink.edu.vn` | Mật khẩu: `ScholinkAdmin@2026`
- **ORGANIZER:** `organizer@scholink.edu.vn` | Mật khẩu: `Organizer@2026`
- **STUDENT:** `student@scholink.edu.vn` | Mật khẩu: `Student@2026`

### 4. Chạy các Microservices
Mở từng cửa sổ terminal để chạy các service cần phát triển:
```bash
pnpm run start:gateway        # API Gateway (Port 3000)
pnpm run start:identity       # Identity Service (Port 3001)
pnpm run start:opportunity    # Opportunity Service (Port 3002)
pnpm run start:collaboration  # Collaboration Service (Port 3003)
pnpm run start:billing        # Billing Service (Port 3004)
pnpm run start:notification   # Notification Service (Port 3005)
```

Xem tài liệu OpenAPI tương tác tại:
- **API Gateway (Tổng quan):** `http://localhost:3000/docs`
- **Identity Service:** `http://localhost:3001/docs`
- **Opportunity Service:** `http://localhost:3002/docs`
- **Collaboration Service:** `http://localhost:3003/docs`
- **Billing Service:** `http://localhost:3004/docs`
- **Notification Service:** `http://localhost:3005/docs`

---

## 📱 Ứng dụng Android Kotlin Client
Mã nguồn ứng dụng di động nằm trong thư mục `android/`:
- **Clean Architecture + MVVM + Jetpack Compose (Material3)**
- **Retrofit & OkHttp** tự động kết nối Gateway qua `http://10.0.2.2:3000/api/v1/`
- **EncryptedSharedPreferences (Android Keystore)** lưu trữ an toàn Access/Refresh token
- **Room Database** lưu cache offline danh sách cơ hội và trạng thái hồ sơ
- **EMQX Paho MQTT Client** nhận thông báo và tin nhắn chat theo thời gian thực

👉 Xem hướng dẫn chi tiết cho mobile tại: **[android/HUONG_DAN_ANDROID.md](./android/HUONG_DAN_ANDROID.md)**

---

## 📖 Sổ tay phát triển cho Team
👉 **[Tài liệu hướng dẫn phát triển cho Team (HUONG_DAN_PHAT_TRIEN.md)](./HUONG_DAN_PHAT_TRIEN.md)**  
👉 **[Đặc tả nghiệp vụ chi tiết Scholink SRS v3.2](./Scholink_Tai_Lieu_Phat_Trien_Team.md)**