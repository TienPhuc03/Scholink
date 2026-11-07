# 📚 Danh Mục Tài Liệu Kỹ Thuật Hệ Thống Scholink (Master Documentation Index)

> Hệ sinh thái Nền Tảng Học Bổng & Cuộc Thi Sinh Viên Toàn Diện — **Scholink Microservices & Flutter Mobile**.  
> Thư mục này tập trung toàn bộ tài liệu kiến trúc kỹ thuật, quy chuẩn phát triển, hướng dẫn vận hành và biên bản nghiệm thu bàn giao của dự án.

---

## 🧭 Bản Đồ Tài Liệu Hệ Thống

```
docs/
├── README.md                              # [TRANG CHỦ] Mục lục tra cứu tài liệu kỹ thuật
│
├── 🏛️ KIẾN TRÚC & ĐẶC TẢ NGHIỆP VỤ
│   ├── TONG_QUAN_DU_AN.md                 # Kiến trúc tổng thể 5 Microservices, Gateway & Luồng phân tán
│   ├── Scholink_Tai_Lieu_Phat_Trien_Team.md # Đặc tả Yêu cầu Nghiệp vụ chuẩn SRS v3.2 (52 trang)
│   └── HUONG_DAN_PHAT_TRIEN.md            # Quy chuẩn code Monorepo, Database Isolation & Shared Kernel
│
├── 🛠️ VẬN HÀNH & KIỂM THỬ HỆ THỐNG
│   ├── OPERATIONAL_RUNBOOK.md             # Sổ tay Build, Start, Seed, Backup/Restore & Xử lý sự cố
│   └── HUONG_DAN_KIEM_THU_TOAN_DIEN.md    # 7 Kim tự tháp kiểm thử (Unit, Integration, Smoke, E2E, Load)
│
└── 📦 BÀN GIAO & NGHIỆM THU
    ├── BAN_GIAO_HE_THONG_VA_NGHIEM_THU.md # Biên bản bàn giao, checklist nghiệm thu, Git Tag & OpenAPI
    └── TV2_BAO_CAO_F29_F38_F44_UAT.md     # TV2: rà soát 5 tuần, F29/F38, UAT 3 vai trò, checklist thiết bị
```

---

## 📑 Danh Mục Tài Liệu Chi Tiết

| STT | Tài Liệu | Mục Đích & Nội Dung Chính | Phạm Vi Phụ Trách |
|:---:|---|---|---|
| **1** | **[Tổng Quan Toàn Diện Dự Án](./TONG_QUAN_DU_AN.md)** | • Sơ đồ kiến trúc tổng thể toàn bộ hệ sinh thái Scholink, topology 5 microservices, API Gateway, Docker Compose, mô hình phân tán và 5 quy tắc bất biến về an toàn dữ liệu. | 🏛️ Kiến trúc hệ thống |
| **2** | **[Đặc Tả Nghiệp Vụ SRS v3.2](./Scholink_Tai_Lieu_Phat_Trien_Team.md)** | • Bản tài liệu đặc tả chuẩn 52 trang: Định nghĩa chi tiết các thực thể dữ liệu (Entities), 12 luồng nghiệp vụ (Workflows) và danh mục mã lỗi toàn hệ thống. | 📑 Đặc tả chức năng |
| **3** | **[Sổ Tay Phát Triển Microservices](./HUONG_DAN_PHAT_TRIEN.md)** | • Quy chuẩn kiến trúc Monorepo, cấu trúc phân tầng Clean Architecture, quy tắc cô lập cơ sở dữ liệu và hướng dẫn thêm module mới. | 💻 Phát triển Backend |
| **4** | **[Sổ Tay Vận Hành & Khắc Phục Sự Cố](./OPERATIONAL_RUNBOOK.md)** | • Hướng dẫn quy trình Build, Start, Seed dữ liệu mẫu 3 tài khoản, kịch bản Sao lưu/Phục hồi toàn vẹn mã SHA-256, và kịch bản Rollback khi mất mạng/sập broker. | 🛠️ Vận hành & DevOps |
| **5** | **[Sổ Tay Kiểm Thử Toàn Diện](./HUONG_DAN_KIEM_THU_TOAN_DIEN.md)** | • Hướng dẫn chạy 7 loại kiểm thử tự động: Unit test, Integration test, Smoke test 3 tài khoản, E2E test, và Load test đo phân vị độ trễ (p50/p95/p99). | 🧪 Kiểm thử chất lượng |
| **6** | **[Biên Bản Bàn Giao & Nghiệm Thu](./BAN_GIAO_HE_THONG_VA_NGHIEM_THU.md)** | • Hồ sơ bàn giao kỹ thuật cuối dự án: Đóng gói Git Tag `v1.0.0-release`, tài liệu OpenAPI Swagger, gói APK Mobile, báo cáo kiểm thử và danh mục Known Issues. | 📦 Nghiệm thu sản phẩm |

---

## 🌐 Bảng Tra Cứu Cổng Dịch Vụ Khi Hệ Thống Khởi Chạy

| Dịch vụ / Cổng quản trị | Đường dẫn truy cập (URL) | Ghi chú tài khoản |
|---|---|---|
| **Web Admin & Organizer Kanban Portal** | `http://localhost:3000/portal` | Giao diện quản trị tổ chức & Kanban thẩm định |
| **API Gateway Swagger Docs** | `http://localhost:3000/docs` | Tài liệu API toàn bộ hệ thống |
| **Identity Microservice Swagger** | `http://localhost:3001/docs` | API Xác thực, Passport, Phân quyền đơn vị |
| **Opportunity Microservice Swagger**| `http://localhost:3002/docs` | API Học bổng, Cuộc thi, Nộp đơn Kanban |
| **Collaboration Microservice Swagger**| `http://localhost:3003/docs` | API Đội thi, Roster Freeze, Chat Realtime |
| **Billing Microservice Swagger** | `http://localhost:3004/docs` | API Ví điện tử, Mua gói Boost/Plus |
| **Notification Microservice Swagger**| `http://localhost:3005/docs` | API Hộp thư thông báo trong ứng dụng |
| **EMQX MQTT Dashboard** | `http://localhost:18083` | `admin` / `public` (Quản trị kênh realtime) |
| **RabbitMQ Management** | `http://localhost:15672` | `guest` / `guest` (Quản trị hàng đợi message) |
| **MinIO S3 Web Console** | `http://localhost:9001` | `scholink_minio_admin` / `scholink_minio_password` |
