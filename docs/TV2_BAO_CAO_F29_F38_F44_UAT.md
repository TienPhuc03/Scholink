# TV2 — Rà soát 5 tuần, F29/F38 và UAT F44

> Phạm vi TV2: Home/Khám phá, học bổng/cuộc thi, bookmark, inbox/nhắc hạn, lịch (mobile Flutter) + Catalog, parser nguồn, Notification (backend) + đầu mối UAT.
> Cập nhật: 08/11/2026. Kết quả ghi theo **bằng chứng đã chạy**; mục chưa chạy ghi `NOT_RUN`, không tự đánh PASS.

---

## 1. Trạng thái 15 gói của TV2

| Gói | Nội dung | Trạng thái | Bằng chứng |
|---|---|---|---|
| F02 | Mobile: model, card, list/detail | PASS | `opportunity_model_test`, `opportunity_widgets_test` |
| F05 | Backend: Catalog, list/detail, dữ liệu mẫu | PASS (đã sửa phân trang, gRPC thiếu trường) | E2E C1–C5 |
| F08 | Test tuần 1 | PASS | — |
| F11 | Mobile: filter, bookmark, offline | PASS (viết lại ở F29) | `opportunity_repository_test`, `opportunity_viewmodel_test` |
| F14 | Backend: filter/bookmark, nhập liệu, parser | PASS (đã sửa route gateway, crawler đoán hạn) | E2E S2–S3, A3; `catalog-crawler-fixes.spec` |
| F17 | Test filter/hạn/bookmark/offline | PASS | test BR11 trước/tại/sau; E2E C2–C3 |
| F20 | Mobile: inbox, nhắc, lịch | PASS (lịch thật ở F29) | thiết bị ảo: D2-3…D2-7 |
| F23 | Backend: nhắc 7/3/1, quiet hours, inbox/push | PASS (đã sửa inbox trùng key, worker) | E2E S4–S7 |
| F26 | Test quiet hours/gia hạn/hủy | PASS | E2E S9, S11, A6; `notification-f41-fixes.spec` |
| F29 | Mobile tuần 4 | PASS | mục 3, 5 |
| F32 | Backend: review/publish, event, dữ liệu 20+20 | PASS | E2E A3–A6 |
| F35 | Test event đảo thứ tự, parser lỗi, **2 thiết bị** | PASS trên 2 **thiết bị ảo**; máy thật `NOT_RUN` | mục 5 |
| F38 | Mobile tuần 5 | PASS | mục 3, 5 |
| F41 | Backend: external mark, CRAWL-08, thống kê | PASS | E2E S10, A7 |
| F44 | UAT, checklist thiết bị, video, hướng dẫn | PASS trên thiết bị ảo + video; máy thật `NOT_RUN` | mục 5–8 |

## 2. Lỗi đã tìm và sửa (3 vòng rà soát + chạy thật)

**Bảo mật**
- Endpoint nội bộ của Notification (`/events/*`, `/transactional`, `/reminders`) đi xuyên gateway → ai cũng tạo được thông báo cho người khác. Gateway giờ trả 404 (E2E G3, G4).

**Catalog / crawler (F05, F14, F32, F41)**
- Gateway thiếu route bookmark/external-mark → app nhận 404.
- `findMany` bỏ qua `cursor` → trang 2 trùng trang 1. Nay phân trang keyset `(registerDeadline, id)`.
- Catalog đưa cơ hội đã đóng lên đầu → mặc định chỉ trả cơ hội còn mở (`includeClosed=true` để xem cả đã đóng).
- Qua gRPC mất `eligibilityRules`, `updatedAt`… → thêm trường vào `opportunity.proto` (21–29).
- Crawler tự đoán hạn (+30 ngày, hoặc lấy `pubDate` của RSS) → thiếu hạn để trống, Admin phải nhập; ngày-không-giờ tính theo múi giờ **nguồn**.
- Duyệt vẫn công bố cơ hội quá hạn → bị chặn. Bộ đếm công bố/từ chối theo nguồn không bao giờ tăng → đếm theo `crawlerSourceId`.

**Nhắc hạn (F23, F26, F35)**
- `businessKey` trùng → chỉ mốc 7 ngày vào inbox. Nay mỗi mốc một thông báo, chạy lại job không tạo trùng.
- So `version` khiến `merge` làm mất mọi nhắc → so **hạn thật**; hạn đổi mà mất sự kiện thì lập lại.
- Opportunity Service không phản hồi → worker từng gửi bằng dữ liệu giả định → nay ném lỗi để BullMQ retry (3 lần).
- Push lỗi bị nuốt → `pushStatus` riêng, retry có giới hạn. Sự kiện gia hạn đến sai thứ tự bị bỏ qua.
- Job còn sót mà không có bản ghi nhắc vẫn gửi → nay bỏ qua.
- API `GET/PUT /notifications/preferences` (kênh, múi giờ); đổi múi giờ lập lại nhắc chưa gửi.

**Lỗi chỉ lộ ra khi chạy thật (E2E 08/11)**
- `GrpcExceptionFilter` gắn ở controller vừa gRPC vừa HTTP → mọi lỗi HTTP (409/404…) **treo request** tới khi client timeout. Ảnh hưởng cả `auth`, `profile`, `application` controller. Sửa trong filter dùng chung: ngữ cảnh HTTP dùng ánh xạ lỗi HTTP.
- Lỗi từ service con qua gateway bị đổi thành "Http Exception" → giữ nguyên `code`/`message` gốc.
- Gọi giữa các service không có timeout → thêm 10 giây.

**Push qua MQTT (F23 "inbox/push theo milestone", 08/11)**
- Worker gửi push lên EMQX (đã có trong `docker-compose.yml`) ở topic `users/{userId}/notifications`, QoS 1, chờ PUBACK; broker lỗi/không phản hồi → BullMQ thử lại (3 lần), lần cuối ghi `pushStatus=FAILED`; người dùng tắt Push → không gửi. Client MQTT 3.1.1 tối giản tự viết (`infrastructure/push/mqtt-push.publisher.ts`), không thêm thư viện.
- Cấu hình: `MQTT_BROKER_URL` (mặc định `mqtt://localhost:1883`), `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_PUSH_ENABLED=false` để tắt.
- App: `PushListener` nhận tin khi app đang chạy/chạy nền → thông báo hệ thống (kênh `scholink_reminders`), mỗi mốc hiện một lần dù broker gửi lại; chạm thông báo mở đúng cơ hội, chạm cả chồng thông báo mở Hộp thư; đăng xuất/hết phiên ngắt MQTT.
- Sửa kèm: `MqttManagerImpl.connect` (core TV3) mở 2 kết nối khi Chat và Push cùng kết nối lúc khởi động → nay dùng chung một kết nối.

**Mobile (F11, F20, F29, F38)**
- Gửi `q` thay vì `keyword`, gửi `type=BOOKMARKED` (400), lỗi mạng bị nuốt, fallback dữ liệu mock (đã xóa), nút mở nguồn không mở gì, hộp thoại "nộp thành công" giả, lịch chỉ giả lập.
- Hộp thư chỉ tải 1 lần → badge số chưa đọc, làm mới khi mở lại tab/khi app trở lại.

## 3. Việc F29 / F38 đã làm (mobile)

- Catalog: phân trang, tìm kiếm chờ ngừng gõ, bỏ kết quả cũ về muộn, offline hiện bản lưu kèm giờ, retry/xoay màn giữ bộ lọc, mở link nguồn thật (`url_launcher`), khóa nộp khi đã đóng, giờ hạn theo giờ máy + múi giờ nguồn.
- Bookmark & đánh dấu nguồn đồng bộ server; khách bấm Lưu → đăng nhập → app tự lưu tiếp.
- Lịch thiết bị qua kênh native Kotlin (`MainActivity.kt`, CalendarContract): xin quyền, 1 sự kiện/cơ hội + alarm từng mốc, lưu lại thì cập nhật, từ chối quyền báo lỗi.
- Cài đặt thông báo: hộp thư luôn bật, push (xin `POST_NOTIFICATIONS`), email, múi giờ.
- Hộp thư: không còn mock, "đã đọc" khi offline xếp hàng gửi lại, bấm nhắc mở cơ hội, bấm cập nhật hồ sơ mở màn của TV1.
- Cỡ chữ 1.3×/2.0×, TalkBack (card đọc thành một câu + nút "Lưu <tên>" riêng).

## 4. API mới / thay đổi

| Method | Path | Ghi chú |
|---|---|---|
| GET | `/api/v1/opportunities?includeClosed=true` | Mặc định chỉ cơ hội còn mở; `nextCursor` dùng được thật |
| GET | `/api/v1/opportunities/bookmarks/me` | Danh sách đã lưu |
| POST | `/api/v1/opportunities/:id/bookmark` | Body `{bookmarked}` idempotent |
| GET/POST | `/api/v1/opportunities/:id/external-mark` | Body `{marked}`; IN_APP → 409 |
| GET/PUT | `/api/v1/notifications/preferences` | `{timezone, pushEnabled, emailEnabled}` |
| — | `/api/v1/notifications/events/*`, `/transactional`, `/reminders` | Gateway trả 404 |

## 5. Kết quả UAT 3 vai trò

### 5.1 E2E qua gateway thật (Mongo replica set + Redis + BullMQ + 4 service) — **27/27 PASS**, chạy lặp được

Lệnh: `cd backend && node scripts/e2e-tv2.js` (cần stack + seed đang chạy). Job nhắc được "tua nhanh" bằng `promote()` trong BullMQ thay vì đợi 7/3/1 ngày.

| # | Vai trò | Kiểm tra | Kết quả |
|---|---|---|---|
| G1–G4 | Khách | Xem catalog; lưu bị 401; endpoint nội bộ bị chặn (404) | PASS |
| C1–C5 | Khách | Phân trang hết 40 cơ hội/6 trang không lặp; không có cơ hội đã đóng; lọc loại; tìm từ khóa; chi tiết có `updatedAt` + điều kiện | PASS |
| S1–S3 | Sinh viên | Đăng nhập; lưu idempotent; danh sách đã lưu | PASS |
| S4–S7 | Sinh viên | 3 nhắc 7d/3d/1d ngoài 22:00–07:00; worker gửi 3 thông báo khác nhau; chạy lại không trùng; push ghi riêng | PASS |
| S8–S11 | Sinh viên | Đã đọc; đổi múi giờ lập lại nhắc, múi giờ sai 400; external mark EXTERNAL 201 / IN_APP 409; bỏ lưu hủy nhắc + gỡ job | PASS |
| A1–A2 | Admin | Đăng nhập; sinh viên gọi API quản trị bị 403 | PASS |
| A3–A7 | Admin | Crawl thiếu hạn không bị đoán; không công bố khi thiếu hạn (lý do rõ); nhập hạn → công bố; gia hạn lập nhắc version mới; thống kê ADM-03 | PASS |

### 5.2 Trên thiết bị (APK debug thật, backend thật)

Thiết bị: 2 **máy ảo Android 14** (Pixel 7 `emulator-5554`, Pixel 6 `emulator-5556`). Máy thật: `NOT_RUN`.

| # | Bước | Kết quả |
|---|---|---|
| D2-1 | Khách xem danh sách, lọc Cuộc thi không lẫn học bổng, mở chi tiết | PASS |
| D2-2 | Khách bấm Lưu → sheet "Bạn cần đăng nhập" → đăng nhập → app tự lưu: *Đã lưu "…". Bạn sẽ nhận nhắc hạn trong Hộp thư.* | PASS |
| D2-3 | Hộp thư có nhắc thật từ worker; bấm nhắc mở đúng cơ hội | PASS |
| D2-4 | Lưu vào lịch: hộp thoại quyền hệ thống → Allow → 1 sự kiện + 3 alarm (đã dời khỏi giờ yên lặng) | PASS |
| D2-5 | Lưu lần 2: vẫn 1 sự kiện (không trùng) | PASS |
| D2-6 | Thu hồi quyền lịch → "Từ chối quyền Lịch thiết bị: chưa có sự kiện nào được tạo…", không thêm sự kiện, app vẫn dùng được | PASS |
| D2-7 | Cài đặt: tắt Push → lưu; bật Push → hộp thoại `POST_NOTIFICATIONS` → Allow → lưu | PASS |
| D2-8 | Xoay ngang khi đang lọc "Nguồn ngoài": bộ lọc và danh sách giữ nguyên | PASS |
| D1-1 | **Thiết bị 2**: đăng nhập cùng tài khoản → "⭐ Đã lưu" có cơ hội lưu ở máy kia | PASS |
| D1-2 | Badge Thông báo = 2 (3 nhắc, 1 đã đọc ở máy kia) | PASS |
| — | TalkBack: cây accessibility đọc card thành 1 câu, nút "Lưu <tên>", tab "Thông báo, Tab 4 of 5" | PASS (qua uiautomator) |
| P-1 | App đăng nhập → EMQX ghi nhận **1** kết nối, subscribe `users/<id>/notifications` | PASS |
| P-2 | Lưu cơ hội → job nhắc chạy → worker publish MQTT → điện thoại (app chạy nền) hiện thông báo "Nhắc hạn (còn 7 ngày): …" | PASS |
| P-3 | Chạm 1 thông báo → mở đúng chi tiết cơ hội | PASS |
| P-4 | Nhiều thông báo bị Android gộp chồng → chạm vào chồng → mở Hộp thư; badge tăng theo push | PASS |
| P-5 | Khởi động lạnh từ thông báo (app đã đóng activity) → mở đúng cơ hội | PASS |
| P-6 | App bị hệ điều hành đóng hẳn | Không nhận push (giới hạn của MQTT, xem mục 9); nhắc có trong Hộp thư khi mở lại |

Video & ảnh: `D:\SCHOLINK_BE\TV2_demo\` (ngoài repo) — `TV2_demo_1_khach_luu_dang_nhap.mp4`, `TV2_demo_2_hop_thu_lich_cai_dat.mp4`, `TV2_demo_3_push_mqtt.mp4` (push → chạm mở cơ hội), `TV2_demo_3b_cham_chong_thong_bao.mp4` (chồng thông báo → Hộp thư), thư mục `screens\`.

Kiểm thử tự động (08/11): backend 23 suite / **226 test** (gồm `mqtt-push.spec.ts` với broker giả), mobile **155 test** (gồm `push_listener_test.dart`), E2E qua gateway **27/27**.

> Ghi chú an toàn: AVD Pixel_7 đang đăng nhập tài khoản Google cá nhân, nên **không** thử lưu lịch trên máy đó (sự kiện sẽ đồng bộ lên Google Calendar thật). Phần lịch thử trên AVD `Scholink_Test_2` với một lịch cục bộ.

## 6. Checklist thiết bị

| Hạng mục | Android 14 (ảo) | Android 8–12 | Máy thật |
|---|---|---|---|
| Cài APK mới | PASS | NOT_RUN | NOT_RUN |
| Quyền lịch: cho phép / từ chối | PASS / PASS | NOT_RUN | NOT_RUN |
| Quyền thông báo (13+) | PASS | — | NOT_RUN |
| Máy không có lịch nào | Đã kiểm (trước khi tạo lịch cục bộ: không có lịch) | NOT_RUN | NOT_RUN |
| Xoay màn | PASS | NOT_RUN | NOT_RUN |
| Hai thiết bị cùng tài khoản | PASS | — | NOT_RUN |
| Cỡ chữ lớn | PASS (widget test 1.3×/2.0×) | NOT_RUN | NOT_RUN |
| Mất mạng | PASS (widget/unit test) | NOT_RUN | NOT_RUN |

## 7. Build APK

Máy kiểm tra chỉ có JDK 25 (kể cả JBR của Android Studio), Gradle 8.14.3 không chạy được. Cách đã dùng (không đổi cấu hình chung):

```powershell
$env:JAVA_HOME = "$env:USERPROFILE\.jdks\jdk-21.0.13+9"   # Temurin 21 bản portable
cd mobile\android; .\gradlew.bat assembleDebug
```

Hoặc cài JDK 21 rồi `flutter config --jdk-dir=<đường dẫn>`. APK: `mobile/build/app/outputs/flutter-apk/app-debug.apk` (BUILD SUCCESSFUL, 6 phút).

## 8. Hướng dẫn nhanh cho người dùng

1. **Tìm cơ hội**: tab *Cơ hội* → gõ từ khóa hoặc chọn *Học bổng*/*Cuộc thi*, *Nộp online*/*Nguồn ngoài*. Kéo xuống để làm mới, cuộn cuối để xem thêm.
2. **Lưu & nhắc hạn**: bấm biểu tượng lưu → Hộp thư nhắc trước hạn 7, 3, 1 ngày (không gửi 22:00–07:00). Xem lại ở *⭐ Đã lưu*, trên mọi máy cùng tài khoản.
3. **Lịch điện thoại**: chi tiết → biểu tượng chuông → chọn mốc → *Lưu vào Lịch thiết bị*. Lưu lại chỉ cập nhật sự kiện cũ.
4. **Nguồn ngoài**: *Đăng ký tại website nguồn* mở trang ban tổ chức (không gửi thông tin của bạn); *Tự đánh dấu đã nộp tại nguồn* để tự theo dõi.
5. **Cài đặt thông báo**: tab *Thông báo* → biểu tượng điều chỉnh → Push, Email, múi giờ → *Lưu cài đặt*.

## 9. Giới hạn còn mở

- **Push**: chạy qua MQTT/EMQX — tới được app đang chạy hoặc đang chạy nền; app đã bị hệ điều hành đóng hẳn thì không nhận push (nhắc vẫn có trong Hộp thư khi mở lại, đúng ghi chú SRS "không hứa MQTT sống liên tục"). Muốn nhận cả khi app bị đóng cần FCM: nhóm tạo dự án Firebase (`google-services.json`, service account) rồi thêm một publisher FCM cạnh publisher MQTT.
- **EMQX chưa bật xác thực/ACL**: hiện ai kết nối broker cũng subscribe được topic của người khác. Khi triển khai cần bật webhook auth/ACL của EMQX (collaboration-service đã có `mqtt/auth`, `mqtt/acl` của TV3) và cấp `MQTT_USERNAME/PASSWORD` cho notification-service; app hiện kết nối không mật khẩu.
- **Email**: tùy chọn được lưu nhưng chưa gửi — cần tài khoản SMTP của nhóm.
- Máy thật, Android 8–12: `NOT_RUN`.
- Sự kiện bookmark → Notification gửi HTTP một lần (không outbox): nếu Notification tắt đúng lúc lưu, cơ hội đó chưa có nhắc.
- `opportunity.proto` có trường mới: restart cả gateway và opportunity-service khi triển khai.
- Port nội bộ của service (3001–3005) không có xác thực cho route admin của opportunity-service; chỉ an toàn khi các port này không mở ra ngoài (chỉ gateway 3000 công khai).
- `scripts/smoke-test-schol14.ts` (TV3) còn 11 lỗi TypeScript.
