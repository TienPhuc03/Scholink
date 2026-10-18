# Sổ tay Hướng dẫn Phát triển Ứng dụng Android Kotlin (Scholink)

> **Mục tiêu:** Cung cấp tài liệu quy chuẩn và kiến trúc ứng dụng Android Native Kotlin cho team mobile, tuân thủ đúng Mục 33 trong tài liệu đặc tả `Scholink_Tai_Lieu_Phat_Trien_Team.md`.

---

## 1. Cấu hình Kỹ thuật Chung
- **Ngôn ngữ:** Kotlin 1.9+ / 2.0+
- **Giao diện:** Jetpack Compose (Material3)
- **Hệ điều hành mục tiêu:** `minSdk = 26` (Android 8.0 Oreo), `targetSdk = 34`
- **Mô hình kiến trúc:** Clean Architecture (UI ➔ Domain ➔ Data) + MVVM

---

## 2. Cấu trúc thư mục Android Source Code

```
android/app/src/main/java/com/scholink/app/
├── ScholinkApplication.kt          # Application class khởi tạo Room, Keystore, MQTT
├── MainActivity.kt                 # Activity chính điều hướng Jetpack Compose Scaffold
│
├── core/                           # [HẠ TẦNG & TIỆN ÍCH DÙNG CHUNG]
│   ├── common/                     # Resource<T> wrapper (Loading, Success, Error)
│   ├── network/                    # Retrofit, OkHttp, AuthInterceptor, IdempotencyInterceptor
│   ├── database/                   # Room Database (ScholinkDatabase, OpportunityDao, Entity)
│   ├── datastore/                  # SecureTokenStorage (mã hóa Keystore AES-256-GCM)
│   ├── realtime/                   # MqttManager kết nối EMQX MQTT broker
│   └── ui/theme/                   # Material3 Theme, Color, Typography
│
└── features/                       # [CÁC MODULE TÍNH NĂNG THEO CLEAN ARCHITECTURE]
    ├── auth/                       # Đăng nhập, đăng ký, xác thực OTP
    │   ├── data/                   # AuthApi (Retrofit)
    │   ├── domain/model/           # LoginRequest, AuthResponse
    │   └── ui/                     # LoginViewModel, LoginScreen (Compose)
    │
    ├── passport/                   # Quản lý Passport & Điểm hoàn thiện 7 thành phần
    │   ├── data/                   # PassportApi
    │   ├── domain/model/           # PassportDetail, EducationDetail
    │   └── ui/                     # PassportViewModel, PassportScreen
    │
    ├── opportunity/                # Tìm kiếm học bổng & cuộc thi, offline cache
    │   ├── data/                   # OpportunityApi
    │   ├── domain/model/           # OpportunityItem, OpportunityListResponse
    │   └── ui/                     # OpportunityListViewModel, OpportunityListScreen
    │
    ├── application/                # Nộp hồ sơ học bổng / cuộc thi, Preview & Consent
    │   └── data/                   # ApplicationApi
    │
    ├── team/                       # Tìm đồng đội (Team-Up), tạo đội, gia nhập đội
    │   ├── data/                   # TeamApi
    │   └── domain/model/           # TeamDetail, CreateTeamRequest
    │
    └── chat/                       # Chat phòng đội thi & tin nhắn trực tiếp
        ├── data/                   # ChatApi
        └── domain/model/           # ChatRoomDetail, ChatMessage
```

---

## 3. Các Nguyên tắc Phát triển Bắt buộc (Mục 33 SRS)

### A. Tầng UI & Quản lý trạng thái
1. **ViewModel phát `StateFlow<UiState>`**:
   - Mọi màn hình Compose lắng nghe trạng thái qua `collectAsState()`.
   - Bắt buộc xử lý đủ 4 trạng thái: **Loading**, **Success**, **Error**, và **Empty/Offline**.
   - Tuyệt đối không gọi Retrofit hoặc Room Database trực tiếp trong hàm `@Composable`.

### B. Bảo mật & Lưu trữ Token (Keystore)
1. Không bao giờ lưu token hoặc refresh token ở dạng plain text trong `SharedPreferences` thông thường.
2. Dự án sử dụng [`SecureTokenStorage`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/android/app/src/main/java/com/scholink/app/core/datastore/SecureTokenStorage.kt) dựa trên `EncryptedSharedPreferences` với khóa bảo vệ bởi **Android Keystore** (`MasterKey.KeyScheme.AES256_GCM`).
3. Khi người dùng đăng xuất (`Logout`), xóa toàn bộ dữ liệu phiên làm việc và ngắt kết nối MQTT.

### C. Cơ chế Ngoại tuyến (Offline Caching) với Room
1. Danh sách cơ hội đã xem được tự động lưu vào Room Database qua [`OpportunityDao`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/android/app/src/main/java/com/scholink/app/core/database/dao/OpportunityDao.kt).
2. Khi mất mạng, màn hình vẫn hiển thị bản lưu gần nhất kèm thông báo trạng thái ngoại tuyến.

### D. Tự động thêm Idempotency-Key
1. [`IdempotencyInterceptor`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/android/app/src/main/java/com/scholink/app/core/network/IdempotencyInterceptor.kt) tự động sinh UUID `Idempotency-Key` cho mọi request thay đổi dữ liệu (`POST`, `PUT`, `PATCH`), đảm bảo đồng bộ hoàn hảo với backend chống gửi trùng giao dịch và nộp hồ sơ.

---

## 4. Hướng dẫn Chạy Thử trên Máy ảo Android

1. **Khởi động Backend và Hạ tầng:**
   ```bash
   # Khởi động hạ tầng và dữ liệu mẫu
   docker compose up -d
   pnpm run seed

   # Chạy API Gateway và các microservices nghiệp vụ
   pnpm run start:gateway
   pnpm run start:identity
   pnpm run start:opportunity
   pnpm run start:collaboration
   pnpm run start:billing
   pnpm run start:notification
   ```
2. **Chạy Android Emulator:**
   - Mở thư mục `android/` bằng **Android Studio**.
   - Máy ảo Android tự động kết nối tới backend máy tính thông qua IP `http://10.0.2.2:3000` (đã được cấu hình sẵn trong [`RetrofitClient.kt`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/android/app/src/main/java/com/scholink/app/core/network/RetrofitClient.kt)).
   - Nhấn **Run (Shift + F10)** để build và cài đặt ứng dụng lên máy ảo.
