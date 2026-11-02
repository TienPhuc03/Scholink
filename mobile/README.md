# 📱 Scholink Mobile Platform (Flutter MVVM + Repository Architecture)

Ứng dụng di động đa nền tảng **Scholink Mobile** được xây dựng trên nền tảng **Flutter (Dart 3.x)**, tuân thủ mô hình **MVVM (Model - View - ViewModel) kết hợp Repository Pattern** chuẩn Google và phòng thủ **Sound Null-Safety**.

---

## 🏗️ 1. Cấu Trúc Khung Thư Mục Source Code (`mobile/lib/`)

```
mobile/
├── pubspec.yaml                      # Cấu hình dependencies (Dio, Provider, GetIt, SecureStorage, MQTT...)
├── analysis_options.yaml             # Bộ quy tắc kiểm tra tĩnh nghiêm ngặt (Strict Null-Safety & Casts)
├── README.md                         # Sổ tay kiến trúc dự án
│
├── lib/
│   ├── main.dart                     # Điểm khởi chạy ứng dụng (Entrypoint), nạp DI
│   ├── app.dart                      # Root MaterialApp Widget, quản lý Bottom Navigation & Auth State
│   │
│   ├── core/                         # [TẦNG HẠ TẦNG & DÙNG CHUNG CỐT LÕI]
│   │   ├── constants/                # API Endpoints, Màu sắc thương hiệu (AppColors)
│   │   ├── database/                 # Bộ đệm ngoại tuyến (LocalCacheManager)
│   │   ├── di/                       # Dependency Injection tập trung (ServiceLocator - GetIt)
│   │   ├── errors/                   # Result<S, F> Monad, Phân cấp Failure
│   │   ├── network/                  # ApiClient (Dio), AuthInterceptor, IdempotencyInterceptor
│   │   ├── realtime/                 # MqttManager kết nối EMQX Broker
│   │   ├── storage/                  # SecureStorageHelper (Keystore/Keychain)
│   │   ├── theme/                    # Material 3 Theme & Typography
│   │   └── viewmodels/               # BaseViewModel (Kế thừa ChangeNotifier cho mô hình MVVM)
│   │
│   └── features/                     # [5 MODULE TÍNH NĂNG THEO MÔ HÌNH MVVM + REPOSITORY]
│       ├── auth/                     # Xác thực: Đăng nhập, Đăng ký, Quản lý Token
│       │   ├── auth_model.dart       # UserModel, DTOs & parse JSON
│       │   ├── auth_repository.dart  # Repository gọi ApiClient & SecureStorage
│       │   ├── presentation/
│       │   │   ├── viewmodels/login_viewmodel.dart # ViewModel kế thừa BaseViewModel
│       │   │   └── views/login_view.dart           # Giao diện Flutter View
│       │
│       ├── opportunity/              # Khám phá cơ hội: Học bổng & Cuộc thi
│       │   ├── opportunity_model.dart      # OpportunityModel & parse JSON
│       │   ├── opportunity_repository.dart # Repository gọi API & Local Cache
│       │   ├── presentation/
│       │   │   ├── viewmodels/opportunity_viewmodel.dart
│       │   │   └── views/opportunity_list_view.dart
│       │
│       ├── team/                     # Ghép đội (Team-Up): Tạo đội, Gia nhập, Rời đội
│       │   ├── team_model.dart       # TeamModel, TeamMemberModel
│       │   ├── team_repository.dart  # Repository gọi ApiClient
│       │   ├── presentation/
│       │   │   ├── viewmodels/team_viewmodel.dart
│       │   │   └── views/team_list_view.dart
│       │
│       ├── chat/                     # Phòng chat đội & cá nhân, MQTT Realtime
│       │   ├── chat_model.dart       # ChatRoomModel, ChatMessageModel
│       │   ├── chat_repository.dart  # Repository gọi ApiClient
│       │   ├── presentation/
│       │   │   ├── viewmodels/chat_viewmodel.dart
│       │   │   └── views/chat_view.dart
│       │
│       └── passport/                 # Hồ sơ số sinh viên: Điểm hoàn thiện, Học vấn
│           ├── passport_model.dart       # PassportModel, EducationModel
│           ├── passport_repository.dart  # Repository gọi ApiClient
│           ├── presentation/
│           │   ├── viewmodels/passport_viewmodel.dart
│           │   └── views/passport_view.dart
│
└── android/                          # Cấu hình Android Runner (minSdk 26, targetSdk 34)
```

---

## 🧩 2. Mô Hình Luồng Dữ Liệu 3 Mắt Xích (Data Flow)

Toàn bộ luồng ứng dụng đi thẳng qua 3 tầng rõ ràng:

```
[ VIEW ]                  [ VIEWMODEL ]                 [ REPOSITORY ]            [ BACKEND ]
Giao diện Flutter   --->  Quản lý State & Logic   --->   Truy xuất Dữ liệu   --->  NestJS API Gateway
(Nhận tương tác user)     (Kế thừa BaseViewModel)        (Gọi Dio / Storage)       (Port 3000)
```

1. **View (Presentation):** Người dùng tương tác (nhấn nút, nhập form). View gọi hàm tương ứng trên ViewModel.
2. **ViewModel (Logic & State):** Đặt trạng thái `isLoading = true`, gọi Repository, bắt kết quả (`Result<T, Failure>`). Nếu thành công, lưu dữ liệu vào biến và gọi `notifyListeners()`.
3. **Repository (Data):** Gọi REST API qua `ApiClient` (Dio), parse JSON sang `Model`, fallback sang `LocalCache` nếu mất mạng.
4. **View tự động re-render:** Giao diện tự động cập nhật ngay khi `notifyListeners()` được kích hoạt.
