# Sổ tay Hướng dẫn Phát triển Microservices Scholink (Dành cho Team)

> **Mục tiêu:** Cung cấp tài liệu quy chuẩn kiến trúc **Microservices Monorepo** (gồm 1 API Gateway + 5 Microservices nghiệp vụ độc lập + 1 Shared Library), tuân thủ nghiêm ngặt theo **Mục 23** trong tài liệu đặc tả `Scholink_Tai_Lieu_Phat_Trien_Team.md`.

---

## 1. Bản đồ Kiến trúc Microservices (Topology)

Dự án được phân tách thành **6 ứng dụng NestJS độc lập** và **1 thư viện chia sẻ**, mỗi service sở hữu process và database riêng:

```
Scholink/
├── backend/                       # [HỆ THỐNG BACKEND & MICROSERVICES NESTJS]
│   ├── apps/
│   │   ├── gateway/                  # [CỔNG API GATEWAY - Port 3000]
│   │   │   └── src/
│   │   │       ├── main.ts
│   │   │       ├── proxy.middleware.ts# Reverse Proxy tự động chuyển tiếp request tới đúng service
│   │   │       ├── health.controller.ts# Endpoint /health và /routes
│   │   │       ├── portal.controller.ts# Web Admin & Organizer Kanban Portal UI
│   │   │       └── gateway.module.ts
│   │   │
│   │   ├── identity-service/         # [IDENTITY MICROSERVICE - Port 3001 - DB: scholink_identity]
│   │   │   └── src/
│   │   │       ├── main.ts
│   │   │       ├── domain/           # User, Passport (7 thành phần), Consent
│   │   │       ├── application/      # AuthUseCase, PassportUseCase, OrganizationUseCase, Zod DTOs
│   │   │       ├── infrastructure/   # UserModel, PassportModel, OrganizationModel
│   │   │       └── presentation/     # AuthController, ProfileController, AdminOrganizationController
│   │   │
│   │   ├── opportunity-service/      # [OPPORTUNITY MICROSERVICE - Port 3002 - DB: scholink_opportunity]
│   │   │   └── src/
│   │   │       ├── main.ts
│   │   │       ├── domain/           # Opportunity, Application (Individual & Team)
│   │   │       ├── application/      # OpportunityUseCase, ApplicationUseCase
│   │   │       ├── infrastructure/   # OpportunityModel, ApplicationModel
│   │   │       └── presentation/     # OpportunityController, ApplicationController (Kanban API)
│   │   │
│   │   ├── collaboration-service/    # [COLLABORATION MICROSERVICE - Port 3003 - DB: scholink_collaboration]
│   │   │   └── src/
│   │   │       ├── main.ts
│   │   │       ├── domain/           # Team (Team-Up), JoinRequest, Reservation, ChatRoom, Message
│   │   │       ├── application/      # TeamUseCase, ChatUseCase
│   │   │       ├── infrastructure/   # TeamModel, ChatModel, ReservationWorker (Auto abort lease)
│   │   │       └── presentation/     # TeamController, ChatController
│   │   │
│   │   ├── billing-service/          # [BILLING MICROSERVICE - Port 3004 - DB: scholink_billing]
│   │   │   └── src/
│   │   │       ├── main.ts
│   │   │       ├── domain/           # Wallet (số nguyên VND), PaymentOrder
│   │   │       ├── application/      # WalletUseCase, Topup, Purchase SKU
│   │   │       ├── infrastructure/   # WalletModel, PaymentModel
│   │   │       └── presentation/     # WalletController (/api/v1/wallets)
│   │   │
│   │   └── notification-service/     # [NOTIFICATION MICROSERVICE - Port 3005 - DB: scholink_notification]
│   │       └── src/
│   │           ├── main.ts
│   │           ├── domain/           # Notification
│   │           ├── application/      # NotificationUseCase
│   │           ├── infrastructure/   # NotificationModel
│   │           └── presentation/     # NotificationController (/api/v1/notifications)
│   │
│   ├── libs/
│   │   └── shared/                   # [SHARED KERNEL - Thư viện dùng chung]
│   │       └── src/
│   │           ├── domain/           # DomainException, ErrorCode, Entity, AggregateRoot, Result
│   │           ├── application/      # PaginationHelper (cursor-based)
│   │           └── infrastructure/   # ZodValidationPipe, GlobalExceptionFilter, JwtAuthGuard,
│   │                                 # RolesGuard, IdempotencyGuard, CryptoService, DatabaseModule
│   │
│   ├── scripts/
│   │   ├── seed.ts                   # Khởi tạo dữ liệu mẫu (Admin, Organizer, Student, Passport 100%, học bổng/cuộc thi)
│   │   ├── backup.ts                 # Sao lưu tự động 5 databases độc lập
│   │   └── restore.ts                # Phục hồi cơ sở dữ liệu từ bản sao lưu
│   │
│   ├── package.json
│   ├── pnpm-workspace.yaml
│   ├── nest-cli.json
│   └── tsconfig.json
│
├── android/                          # [ỨNG DỤNG ANDROID KOTLIN CLIENT NATIVE ĐỘC LẬP]
├── docs/                             # [TÀI LIỆU KỸ THUẬT & RUNBOOK TOÀN DIỆN]
├── docker-compose.yml                # [HẠ TẦNG DÙNG CHUNG: MongoDB Replica Set, Redis, RabbitMQ, MinIO, EMQX]
└── README.md
```

---

## 2. Quy tắc Bất biến trong Kiến trúc Microservice (Core Rules)

1. **Cô lập Cơ sở Dữ liệu (Database Isolation):**
   - Mỗi microservice sở hữu một database logic riêng (`scholink_identity`, `scholink_opportunity`, `scholink_collaboration`, `scholink_billing`, `scholink_notification`).
   - **Tuyệt đối cấm** một service query trực tiếp database/collection của service khác.
2. **Giao tiếp Xuyên Service (Cross-Service Communication):**
   - Client gọi REST qua API Gateway (Port 3000). Gateway sử dụng `ReverseProxyMiddleware` định tuyến trong suốt tới port của service đích.
   - Bất đồng bộ: Phát Domain Event qua RabbitMQ / Outbox pattern.
3. **Thư viện chung (`libs/shared`):**
   - Chỉ chứa các tiện ích kỹ thuật (lỗi, ID, filter, pipe, guard, mã hóa crypto RFC 8785, kết nối DB).
   - **Tuyệt đối không** đưa Entity nghiệp vụ hay Mongoose Schema vào `libs/shared` để tránh tạo coupling phụ thuộc ngầm.
4. **Validation & Bảo mật:**
   - Validation 100% bằng **Zod** (`ZodValidationPipe`).
   - Phân quyền RBAC (`@Roles('STUDENT')`, `@Roles('ORGANIZER')`, `@Roles('ADMIN')`).
   - Header `Idempotency-Key` với decorator `@Idempotent()` cho các thao tác nộp hồ sơ và tài chính.
   - Chuẩn hóa format lỗi đồng nhất toàn hệ thống: `{ error: { code, message, details, correlationId } }`.

---

## 3. Khởi tạo Dữ liệu Mẫu (Seed Script)

Trước khi bắt đầu kiểm thử, anh em chạy lệnh seed để tạo sẵn tài khoản và dữ liệu mẫu:
```bash
pnpm run seed
```

**Dữ liệu có sẵn sau khi seed:**
- **Admin:** `admin@scholink.edu.vn` / `ScholinkAdmin@2026` (Quyền ADMIN)
- **Organizer:** `organizer@scholink.edu.vn` / `Organizer@2026` (Ban tổ chức VinAI)
- **Student:** `student@scholink.edu.vn` / `Student@2026` (Sinh viên kèm Passport 100% và ví 500,000 VND)
- **Học bổng & Cuộc thi:**
  - Học bổng Nghiên cứu Tài năng Trẻ VinAI 2026 (FULL, IN_APP)
  - Học bổng Nữ sinh Công nghệ FPT 2026 (PARTIAL, IN_APP)
  - Cuộc thi Scholink AI Challenge 2026 (COMPETITION, TEAM IN_APP)
  - National Student Startup Hackathon 2026 (COMPETITION, EXTERNAL)

---

## 4. Lệnh Khởi chạy Từng Microservice

Anh em có thể mở các terminal riêng để chạy độc lập từng service mà mình phụ trách:

```bash
# 1. Khởi động hạ tầng Docker (MongoDB, Redis, RabbitMQ, MinIO, EMQX)
docker compose up -d

# 2. Chạy API Gateway (Port 3000)
pnpm run start:gateway

# 3. Chạy Identity Service (Port 3001)
pnpm run start:identity

# 4. Chạy Opportunity Service (Port 3002)
pnpm run start:opportunity

# 5. Chạy Collaboration Service (Port 3003)
pnpm run start:collaboration

# 6. Chạy Billing Service (Port 3004)
pnpm run start:billing

# 7. Chạy Notification Service (Port 3005)
pnpm run start:notification
```

---

## 5. Tài liệu Swagger UI cho Từng Service

Mỗi service khi chạy đều tự động cung cấp Swagger UI tài liệu tương tác:
- **API Gateway (Cổng chính):** `http://localhost:3000/docs`
- **Identity Microservice:** `http://localhost:3001/docs`
- **Opportunity Microservice:** `http://localhost:3002/docs`
- **Collaboration Microservice:** `http://localhost:3003/docs`
- **Billing Microservice:** `http://localhost:3004/docs`
- **Notification Microservice:** `http://localhost:3005/docs`
