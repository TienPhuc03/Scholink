# 📚 Thư Mục Tài Liệu Kỹ Thuật Dự Án Scholink (Documentation Index)

Thư mục này tập trung toàn bộ tài liệu đặc tả nghiệp vụ, kiến trúc hệ thống, sổ tay phát triển và kịch bản vận hành demo cho hệ sinh thái **Scholink Microservices, Android Native & Kế Hoạch Chuyển Đổi Flutter**.

---

## 📑 Danh Mục Tài Liệu Chi Tiết

| Tên Tài Liệu | Mục Đích & Nội Dung Chính | Liên Kết Trực Tiếp |
|---|---|---|
| 🌟 **Tổng Quan Toàn Diện Dự Án** | **Tài liệu tổng hợp tất tần tật về Scholink**: Mục tiêu, sơ đồ kiến trúc 5 Microservices + Gateway, luồng nghiệp vụ cốt lõi (Nộp hồ sơ bất biến, Roster Freeze đội thi, Kanban thẩm định), mobile Android Native, Web Portal, Docker và hướng dẫn vận hành. | [TONG_QUAN_DU_AN.md](./TONG_QUAN_DU_AN.md) |
| 🚀 **Thiết Kế Chuyển Đổi Flutter (OOP & Null-Safety)** | **Thiết kế kiến trúc di động Flutter**: Áp dụng 4 trụ cột OOP, nguyên lý SOLID, Clean Architecture (Feature-First), phòng thủ Null-Safety 3 tầng (DTO nullable ➔ Defensive Mapper ➔ Non-null Domain Entity ➔ Result Monad), BLoC pattern, Dio Interceptors và bảng ánh xạ 1-1 từ Android sang Flutter. | [THIET_KE_FLUTTER_OOP_NULL_SAFETY.md](./THIET_KE_FLUTTER_OOP_NULL_SAFETY.md) |
| **Scholink SRS v3.2** | **Đặc tả Yêu cầu Nghiệp vụ & Thiết kế Hệ thống Toàn diện** (Bản chuẩn 52 trang / 220KB) bao gồm: 12 workflow (WF01..WF12), các Functional Requirements (FR-APP, FR-TEAM, FR-CHAT, FR-BILL, FR-NOTI), thiết kế cơ sở dữ liệu và API. | [Scholink_Tai_Lieu_Phat_Trien_Team.md](./Scholink_Tai_Lieu_Phat_Trien_Team.md) |
| **Sổ Tay Phát Triển Cho Team** | Quy chuẩn kiến trúc **Microservices Monorepo** (1 Gateway + 5 Services độc lập + Shared Kernel), nguyên tắc cô lập database, validation bằng Zod, cấu trúc thư mục Clean Architecture và hướng dẫn seed dữ liệu. | [HUONG_DAN_PHAT_TRIEN.md](./HUONG_DAN_PHAT_TRIEN.md) |
| **Runbook Vận Hành Demo (TV3)** | Sổ tay kịch bản vận hành & demo thực tế cho **Thành viên 3 (TV3)**: Dựng Docker Replica Set (F06), Team-Up & Membership nguyên tử, Web Admin Organizations (F15), Chat Monotonic Seq & Outbox, Web Organizer Kanban (F24), Roster Freeze & Submission Reservation 10 phút (F33), Sao lưu & Phục hồi 5 DB (F42). | [RUNBOOK_VAN_HANH_DEMO_TV3.md](./RUNBOOK_VAN_HANH_DEMO_TV3.md) |
| **Sổ Tay Phát Triển Android** | Hướng dẫn phát triển ứng dụng di động **Android Native Kotlin**: Clean Architecture + MVVM + Jetpack Compose (Material3), bảo mật lưu token bằng Android Keystore (AES-256-GCM), offline cache với Room, IdempotencyInterceptor và kết nối EMQX MQTT. | [HUONG_DAN_ANDROID.md](./HUONG_DAN_ANDROID.md) |
| **Sổ Tay Kiểm Thử Toàn Diện** | Hướng dẫn đầy đủ 6 kim tự tháp kiểm thử: Unit Tests, Integration Tests, E2E Tests, Load Benchmark (p50/p95/p99), Security OWASP Penetration Testing và Regression Suite. | [HUONG_DAN_KIEM_THU_TOAN_DIEN.md](./HUONG_DAN_KIEM_THU_TOAN_DIEN.md) |

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
