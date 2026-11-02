# BÁO CÁO & TÀI LIỆU VẤN ĐÁP: KIẾN TRÚC MOBILE SCHOLINK (MVVM + REPOSITORY)

Tài liệu này tổng hợp toàn bộ kiến trúc, luồng hoạt động, cấu trúc mã nguồn và bộ câu hỏi phản biện dành cho phần ứng dụng di động **Scholink Mobile** phục vụ viết Báo cáo tốt nghiệp / đồ án và thi vấn đáp.

---

## I. TỔNG QUAN KIẾN TRÚC

Ứng dụng **Scholink Mobile** được xây dựng trên nền tảng **Flutter (Dart 3.x)** theo mô hình kiến trúc:
**MVVM (Model - View - ViewModel) kết hợp Repository Pattern** (chuẩn kiến trúc được chính Google và cộng đồng Flutter khuyên dùng cho các ứng dụng thực tế).

### 1. Tại sao chọn MVVM + Repository?
1. **Đơn giản, mạch lạc, dễ nhớ:** Luồng dữ liệu đi thẳng qua 3 mắt xích `View ➔ ViewModel ➔ Repository`, không bị phân mảnh qua hàng loạt tầng trung gian (như UseCase, Entity vs Model, Remote/Local DataSource riêng).
2. **Tách biệt trách nhiệm rõ ràng (Separation of Concerns):**
   - **View:** Chỉ lo vẽ giao diện và bắt tương tác người dùng.
   - **ViewModel:** Quản lý trạng thái màn hình (`Loading`, `Success`, `Error`) và logic hiển thị.
   - **Repository:** Đóng gói toàn bộ việc lấy dữ liệu từ mạng (REST API qua Dio) và bộ nhớ đệm (Local Cache / Secure Storage).
3. **Dễ viết Unit Test:** Có thể test độc lập toàn bộ ViewModel bằng cách giả lập (mock) Repository mà không cần bật máy ảo hay khởi động Flutter UI.
4. **Sẵn sàng tích hợp dịch vụ Cloud (Firebase):** Nhúng Firebase Auth, FCM, Storage thẳng vào tầng Repository mà không làm ảnh hưởng đến View hay ViewModel.

---

## II. BẢNG MÃ NGUỒN CÁC TÍNH NĂNG CHÍNH

Toàn bộ 5 phân hệ nghiệp vụ đã được chuẩn hóa đồng nhất:

| Tính năng | Model | Repository | ViewModel | Màn hình View |
| :--- | :--- | :--- | :--- | :--- |
| **1. Xác thực (Auth)** | `auth_model.dart` (`UserModel`) | `auth_repository.dart` | `login_viewmodel.dart` | `login_view.dart` |
| **2. Cơ hội (Opportunity)** | `opportunity_model.dart` (`OpportunityModel`) | `opportunity_repository.dart` | `opportunity_viewmodel.dart` | `opportunity_list_view.dart` |
| **3. Đội nhóm (Team)** | `team_model.dart` (`TeamModel`, `TeamMemberModel`) | `team_repository.dart` | `team_viewmodel.dart` | `team_list_view.dart` |
| **4. Tin nhắn Realtime (Chat)** | `chat_model.dart` (`ChatRoomModel`, `ChatMessageModel`) | `chat_repository.dart` | `chat_viewmodel.dart` | `chat_view.dart` |
| **5. Hồ sơ số (Passport)** | `passport_model.dart` (`PassportModel`, `EducationModel`) | `passport_repository.dart` | `passport_viewmodel.dart` | `passport_view.dart` |

---

## III. QUẢN LÝ PHỤ THUỘC (DEPENDENCY INJECTION)

Toàn bộ các thành phần được đăng ký và khởi tạo tập trung tại [`mobile/lib/core/di/service_locator.dart`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/mobile/lib/core/di/service_locator.dart) thông qua thư viện **`get_it`**:

```dart
// 1. Core Singletons
sl.registerSingleton<ApiClient>(DioApiClient(...));
sl.registerSingleton<SecureStorageHelper>(SecureStorageHelperImpl());
sl.registerSingleton<MqttManager>(MqttManagerImpl());

// 2. Feature Repositories (Lazy Singleton - khởi tạo khi cần)
sl.registerLazySingleton<OpportunityRepository>(() => OpportunityRepository(apiClient: sl(), localCache: sl()));
sl.registerLazySingleton<TeamRepository>(() => TeamRepository(sl()));
sl.registerLazySingleton<ChatRepository>(() => ChatRepository(sl()));

// 3. ViewModels (Factory - tạo mới khi màn hình mở ra)
sl.registerFactory<OpportunityViewModel>(() => OpportunityViewModel(sl()));
sl.registerFactory<TeamViewModel>(() => TeamViewModel(repository: sl(), secureStorage: sl()));
sl.registerFactory<ChatViewModel>(() => ChatViewModel(repository: sl(), mqttManager: sl(), secureStorage: sl()));
```

---

## IV. BỘ CÂU HỎI VẤN ĐÁP & HƯỚNG DẪN TRẢ LỜI "ĂN ĐIỂM"

### Câu 1: Em hãy trình bày kiến trúc của ứng dụng Mobile và giải thích tại sao nhóm lại chọn kiến trúc này?
> **Trả lời:**  
> *"Dạ thưa thầy/cô, ứng dụng Mobile của nhóm em được xây dựng theo mô hình **MVVM (Model - View - ViewModel) kết hợp Repository Pattern** - đây là kiến trúc chuẩn được chính Google khuyến nghị cho Flutter:  
> - **View:** Là các Widget giao diện, chỉ hiển thị và nhận sự kiện từ người dùng.  
> - **ViewModel:** Kế thừa `ChangeNotifier`, nhận sự kiện từ View, gọi Repository để lấy dữ liệu, quản lý trạng thái (`Loading`, `Success`, `Error`) và gọi `notifyListeners()` để báo View cập nhật.  
> - **Repository:** Đóng gói toàn bộ logic truy xuất dữ liệu từ REST API qua Dio, lưu cache ngoại tuyến và bảo mật token qua KeyStore/Keychain.  
> Nhờ mô hình này, luồng dữ liệu 1 chiều rất rõ ràng, code gọn gàng, loại bỏ được các file trung gian dư thừa và rất dễ viết Unit Test cho logic hiển thị mà không cần khởi động UI."*

### Câu 2: Luồng dữ liệu (Data Flow) khi người dùng mở màn hình danh sách cơ hội diễn ra như thế nào?
> **Trả lời:**  
> *"Dạ, luồng đi qua 4 bước rất cụ thể:  
> 1. Màn hình `OpportunityListView` khi khởi tạo (`initState`) gọi hàm `viewModel.loadOpportunities()`.  
> 2. `OpportunityViewModel` chuyển trạng thái sang `Loading` để View hiện vòng xoay tải trang, sau đó gọi `repository.getOpportunities()`.  
> 3. `OpportunityRepository` gửi request HTTP GET qua `Dio` đến Backend NestJS API Gateway (cổng 3000), parse JSON thành `List<OpportunityModel>` và lưu 1 bản cache vào máy. Nếu mất mạng, Repository tự động lấy bản cache đã lưu trước đó trả về.  
> 4. `OpportunityViewModel` nhận kết quả, cập nhật biến danh sách `_items`, chuyển trạng thái `Success` và kích hoạt `notifyListeners()`. `OpportunityListView` lắng nghe thông báo này và render lại danh sách các thẻ học bổng/cuộc thi lên màn hình."*

### Câu 3: Nếu tích hợp các dịch vụ đám mây của Firebase thì em đặt code ở đâu trong kiến trúc này?
> **Trả lời:**  
> *"Dạ, toàn bộ các SDK của Firebase như **Firebase Auth** (Google Sign-In), **Firebase Cloud Messaging** (FCM Push Notification), và **Firebase Storage** (upload ảnh/tệp) được đóng gói hoàn toàn trong tầng **Repository / Service**:  
> - Tầng View và ViewModel chỉ giao tiếp với Repository mà không trực tiếp phụ thuộc vào thư viện Firebase (đạt tính chất Loose Coupling).  
> - Điều này giúp hệ thống rất linh hoạt: Nếu sau này hệ thống muốn đổi từ Firebase Storage sang AWS S3 hay MinIO, nhóm em chỉ cần sửa code bên trong Repository mà **không phải sửa bất kỳ dòng code nào trên giao diện (View) hay ViewModel**."*
