# 📱 Scholink Mobile Platform (Flutter MVVM & Clean Architecture Skeleton)

Dự án ứng dụng di động đa nền tảng **Scholink Mobile** được tái cấu trúc từ Android Native (Kotlin) sang **Flutter (Dart 3.x)**, tuân thủ mô hình **MVVM (Model - View - ViewModel)** kết hợp **Clean Architecture** và phòng thủ **Null-Safety 3 lớp**.

---

## 🏗️ 1. Cấu Trúc Khung Thư Mục Source Code (`mobile/lib/`)

```
mobile/
├── pubspec.yaml                      # Cấu hình dependencies (Dio, Provider, GetIt, SecureStorage, MQTT...)
├── analysis_options.yaml             # Bộ quy tắc kiểm tra tĩnh nghiêm ngặt (Strict Null-Safety & Casts)
├── README.md                         # Sổ tay kiến trúc khung dự án
│
├── lib/
│   ├── main.dart                     # Điểm khởi chạy ứng dụng (Entrypoint), nạp DI
│   ├── app.dart                      # Root MaterialApp Widget, quản lý Bottom Navigation & Auth State
│   │
│   ├── core/                         # [TẦNG HẠ TẦNG & DÙNG CHUNG CỐT LÕI]
│   │   ├── constants/                # API Endpoints, Màu sắc thương hiệu (AppColors)
│   │   ├── database/                 # Bộ đệm ngoại tuyến (LocalCacheManager)
│   │   ├── di/                       # Bộ định vị dịch vụ Dependency Injection (ServiceLocator - GetIt)
│   │   ├── errors/                   # Result<S, F> Monad, Phân cấp Failure, ApiErrorModel
│   │   ├── network/                  # ApiClient (Dio), AuthInterceptor, IdempotencyInterceptor
│   │   ├── realtime/                 # MqttManager kết nối EMQX Broker
│   │   ├── storage/                  # SecureStorageHelper (Keystore/Keychain)
│   │   ├── theme/                    # Material 3 Theme & Typography
│   │   └── viewmodels/               # BaseViewModel (Kế thừa ChangeNotifier cho mô hình MVVM)
│   │
│   └── features/                     # [5 MODULE TÍNH NĂNG NGHIỆP VỤ]
│       ├── auth/                     # Xác thực: Đăng nhập, Đăng ký, Quản lý Token
│       ├── passport/                 # Hồ sơ số: Điểm hoàn thiện, 7 thành phần, Học vấn, Kỹ năng
│       ├── opportunity/              # Khám phá cơ hội: Học bổng & Cuộc thi, Bộ lọc, Cache ngoại tuyến
│       ├── team/                     # Ghép đội (Team-Up): Danh sách đội, Slot nguyên tử, Tạo/Rời đội
│       └── chat/                     # Phòng chat đội & cá nhân, Đồng bộ tin nhắn qua MQTT
│
└── android/                          # Cấu hình Android Runner (minSdk 26, targetSdk 34)
```

---

## 🧩 2. Mô Hình Phân Tầng MVVM Trong Từng Feature

Mỗi feature bên trong `features/<feature_name>/` được tổ chức đồng nhất theo 3 phân tầng chuẩn:

```
feature_name/
├── domain/                           # [MODEL - NGHIỆP VỤ THUẦN DART]
│   ├── entities/                     # Thực thể cốt lõi, 100% thuộc tính Non-nullable
│   ├── repositories/                 # Hợp đồng giao tiếp trừu tượng (abstract interface class)
│   └── usecases/                     # Từng ca sử dụng nghiệp vụ độc lập (Single Responsibility)
│
├── data/                             # [MODEL - DỮ LIỆU & NGOẠI VI]
│   ├── datasources/                  # RemoteDataSource (gọi API) & LocalDataSource (Cache)
│   ├── dtos/                         # DTOs phòng thủ mạng (toàn bộ trường Nullable T?)
│   ├── mappers/                      # Defensive Mapper biến đổi DTO ➔ Domain Entity
│   └── repositories/                 # Hiện thực hóa Repository Interface
│
└── presentation/                     # [VIEW & VIEWMODEL]
    ├── viewmodels/                   # ViewModel kế thừa BaseViewModel quản lý State, gọi UseCase
    └── views/                        # Flutter Widgets (Scaffold/Card/Dialog) lắng nghe ViewModel
```

---

## 🛡️ 3. Cơ Chế Phòng Thủ Null-Safety 3 Tầng (Three-Tier Defense)

1. **Tầng 1 (Network & DTOs):**
   - Mọi trường dữ liệu nhận về từ API được khai báo là `Type?` (có thể null), không giả định dữ liệu máy chủ luôn luôn đầy đủ.
2. **Tầng 2 (Mappers & Domain):**
   - Áp dụng toán tử fallback an toàn (`??`), kiểm tra trường định danh bắt buộc (`id`). Nếu thiếu dữ liệu cốt lõi, chặn ngay tại biên và ném `ValidationFailure`.
   - Toàn bộ Entity thuộc tầng Domain được bảo vệ với các trường non-nullable (`Type`).
3. **Tầng 3 (Presentation & ViewModels):**
   - Toàn bộ tác vụ trả về `Result<Success, Failure>` Monad.
   - Giao diện người dùng phân giải trạng thái qua `fold()` hoặc `ViewState.loading / success / error`, triệt tiêu hoàn toàn nguy cơ sập ứng dụng do `NullPointerException`.

---

## 🏛️ 4. Bốn Trụ Cột OOP Trong Cấu Trúc Khung

- **Encapsulation (Đóng gói):** Các thuộc tính trạng thái trong ViewModel, Client và Entity đều là `private` (`_state`, `_items`, `_dio`), chỉ truy cập qua getters.
- **Abstraction (Trừu tượng):** Mọi giao tiếp giữa Data và Domain đều qua `abstract interface class` (`AuthRepository`, `ApiClient`, `MqttManager`).
- **Inheritance (Kế thừa):** Toàn bộ ViewModel kế thừa từ `BaseViewModel` (`ChangeNotifier`); toàn bộ lỗi kế thừa từ `Failure`.
- **Polymorphism (Đa hình):** Hoán đổi linh hoạt giữa Remote DataSource, Local Cache và Mock thông qua Dependency Injection (`GetIt`).
