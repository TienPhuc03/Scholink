# 📚 Thư Mục Tài Liệu Kỹ Thuật Dự Án Scholink (Documentation Index)

Thư mục này tập trung toàn bộ tài liệu đặc tả nghiệp vụ, kiến trúc hệ thống, sổ tay phát triển và kịch bản vận hành demo cho hệ sinh thái **Scholink Microservices & Android Native Platform**.

---

## 📑 Danh Mục Tài Liệu Chi Tiết

| Tên Tài Liệu | Mục Đích & Nội Dung Chính | Liên Kết Trực Tiếp |
|---|---|---|
| **Scholink SRS v3.2** | **Đặc tả Yêu cầu Nghiệp vụ & Thiết kế Hệ thống Toàn diện** (Bản chuẩn 52 trang / 220KB) bao gồm: 12 workflow (WF01..WF12), các Functional Requirements (FR-APP, FR-TEAM, FR-CHAT, FR-BILL, FR-NOTI), thiết kế cơ sở dữ liệu và API. | [Scholink_Tai_Lieu_Phat_Trien_Team.md](./Scholink_Tai_Lieu_Phat_Trien_Team.md) |
| **Sổ Tay Phát Triển Cho Team** | Quy chuẩn kiến trúc **Microservices Monorepo** (1 Gateway + 5 Services độc lập + Shared Kernel), nguyên tắc cô lập database, validation bằng Zod, cấu trúc thư mục Clean Architecture và hướng dẫn seed dữ liệu. | [HUONG_DAN_PHAT_TRIEN.md](./HUONG_DAN_PHAT_TRIEN.md) |
| **Runbook Vận Hành Demo (TV3)** | Sổ tay kịch bản vận hành & demo thực tế cho **Thành viên 3 (TV3)**: Dựng Docker Replica Set (F06), Team-Up & Membership nguyên tử, Web Admin Organizations (F15), Chat Monotonic Seq & Outbox, Web Organizer Kanban (F24), Roster Freeze & Submission Reservation 10 phút (F33), Sao lưu & Phục hồi 5 DB (F42). | [RUNBOOK_VAN_HANH_DEMO_TV3.md](./RUNBOOK_VAN_HANH_DEMO_TV3.md) |
| **Sổ Tay Phát Triển Android** | Hướng dẫn phát triển ứng dụng di động **Android Native Kotlin**: Clean Architecture + MVVM + Jetpack Compose (Material3), bảo mật lưu token bằng Android Keystore (AES-256-GCM), offline cache với Room, IdempotencyInterceptor và kết nối EMQX MQTT. | [HUONG_DAN_ANDROID.md](./HUONG_DAN_ANDROID.md) |

---

## 🌐 Đường Dẫn Truy Cập Nhanh Hệ Thống Khi Khởi Chạy

- **Web Admin & Organizer Kanban Portal (TV3):** `http://localhost:3000/portal`
- **Tài liệu Swagger API Gateway (Tổng quan):** `http://localhost:3000/docs`
- **Identity Microservice Swagger:** `http://localhost:3001/docs`
- **Opportunity Microservice Swagger:** `http://localhost:3002/docs`
- **Collaboration Microservice Swagger:** `http://localhost:3003/docs`
- **Billing Microservice Swagger:** `http://localhost:3004/docs`
- **Notification Microservice Swagger:** `http://localhost:3005/docs`
- **RabbitMQ Management Dashboard:** `http://localhost:15672` (guest / guest)
- **MinIO S3 Web Console:** `http://localhost:9001` (scholink_minio_admin / scholink_minio_password)
- **EMQX MQTT Dashboard:** `http://localhost:18083` (admin / public)
