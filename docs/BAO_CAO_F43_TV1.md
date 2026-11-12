# Báo cáo F43 – Phần việc TV1 (Identity, Passport, Application)

Ngày lập: 12/11/2026 · Người lập: TV1 · Nhánh: `Phuc`

Báo cáo theo yêu cầu của gói F43 trong kế hoạch 5 tuần: mỗi phần có bằng chứng, ghi rõ phần
đã đạt, chưa đạt và đã hoãn; không tự đánh PASS theo kế hoạch. Kết quả "Đạt" dưới đây chỉ có
nghĩa là đã có test tự động chạy qua; những gì chưa chạy trên thiết bị hoặc môi trường thật được
ghi riêng ở mục 4.

## 1. Kết quả chạy kiểm thử (12/11/2026)

| Lệnh | Thư mục | Kết quả |
|---|---|---|
| `pnpm run build` | `backend/` | Đạt (gateway build sạch) |
| `pnpm test` | `backend/` | 33/33 suite, 276/276 test đạt |
| `pnpm run test:race` | `backend/` | 4/4 kịch bản đạt trên MongoDB replica set thật (E05) |
| `flutter test` | `mobile/` | xem mục 1.1 |
| `flutter analyze` | `mobile/` | Không có lỗi; các mục info còn lại thuộc `team_list_view.dart`, `chat_view.dart` (TV3) |

### 1.1 Mobile

`flutter test` chạy toàn bộ test trong `mobile/test/`, gồm các nhóm của TV1:
`auth/`, `passport/` (có `passport_documents_test.dart` mới), `application/`, `f37_app_test.dart`.

## 2. Kết quả theo bộ kiểm thử ưu tiên của TV1

| Bộ | Nội dung | Kết quả | Bằng chứng |
|---|---|---|---|
| E01 | Đăng ký, OTP email, đăng nhập, refresh, đăng xuất | Đạt (tự động) | `identity-service/src/f04-backend.spec.ts`, `auth.use-case.spec.ts`; mobile `test/features/auth/` |
| E02 | Passport: sửa có `expectedVersion`, quyền hiển thị trường, upload tệp riêng tư | Đạt (tự động) | `profile-privacy.spec.ts`, `object-storage.service.spec.ts`; mobile `passport_test.dart`, `profile_privacy_test.dart`, `passport_documents_test.dart` |
| E03 | Nộp cá nhân: readiness, preview bất biến, consent, idempotency, rút/nộp lại | Đạt (tự động) | mobile `apply_viewmodel_test.dart`, `application_f28_test.dart`, `application_ui_test.dart`; backend `gateway-application.controller.spec.ts` |
| E05 (phần Application) | Commit/abort đội, thành viên không thuộc 2 hồ sơ còn hiệu lực, retry không tạo trùng | Đạt trên MongoDB thật | `opportunity-service/src/f34-race.e2e-spec.ts` (xem mục 3) |

## 3. F34 – Kiểm tra tranh chấp nộp đội (E05)

Chạy bằng `pnpm run test:race` trên MongoDB replica set `rs0` (docker compose), database riêng
`scholink_race_f34` được xoá trước và sau khi chạy. Mỗi kịch bản lặp 25 vòng (đổi bằng `F34_ROUNDS`).

| Kịch bản | Kết quả lần chạy 12/11/2026 |
|---|---|
| Commit và abort cùng một submission intent chạy song song | 14 lần commit thắng, 11 lần abort thắng, **0 lần cả hai cùng thắng**; dữ liệu lưu khớp kết quả |
| Hai đội cùng commit, dùng chung 1 thành viên | Luôn đúng 1 đội thành công; thành viên chung chỉ có 1 bản ghi active |
| Gửi lại commit 3 lần với cùng `submissionId` | Đúng 1 Application và 1 bản ghi outbox |
| Commit đến sau khi lease đã bị abort | Bị từ chối `HOLD_EXPIRED`, không tạo Application |

**Lỗi tìm ra và đã sửa:** trước khi sửa, trên replica set mọi lần commit hồ sơ đội đều thất bại
(Mongoose từ chối `create()` nhiều bản ghi `application_members` trong transaction khi thiếu
`ordered: true`). Unit test không phát hiện vì chạy không có transaction. Đã sửa trong
`application.repository.ts` (`insertActiveApplicationMembers`).

## 4. Danh sách đạt / chưa đạt / hoãn (phạm vi TV1)

### 4.1 Đã đạt (có test tự động)

- **F10 / F13 – AUTH-02/03/04/05:** đăng ký, OTP email bắt buộc trước khi kích hoạt, đăng nhập, refresh xoay vòng có chặn replay, đăng xuất thu hồi phiên, quên/đặt lại mật khẩu.
- **F10 / PROF-01:** form Passport, khoá lạc quan bằng `expectedVersion` (409 `VERSION_MISMATCH`).
- **F13 / PROF-04:** upload tệp qua presigned URL lên bucket riêng tư (MinIO, ký SigV4 tự viết, đã kiểm bằng bộ mẫu chính thức của AWS); backend quét chính các byte đã lưu (magic bytes, kích thước thật, mẫu mã độc) thay vì tin dữ liệu app gửi; link tải về 5 phút chỉ cấp cho chủ tệp khi tệp READY. App tải CV (PDF) và ảnh đại diện (JPEG/PNG/WebP) trong tab Passport.
- **F19 / F22 – PROF-03/08, APP-01/02/03/08:** readiness, đính kèm PDF, preview bất biến, consent, nộp cá nhân với idempotency (cùng key + cùng body khi retry).
- **F28 – APP-07/08:** rút trước hạn, nộp lại tăng revision, xem snapshot từng lần nộp.
- **F31 / F37 – APP-05:** intent commit/abort đội, consent từng thành viên, màn nộp hồ sơ đội (xem mục 3).
- **F40 – AUTH-08:** xoá tài khoản (nhập lại mật khẩu, chọn giữ/xoá snapshot) trên app; backend thu hồi mọi phiên, tạo mã theo dõi, ghi outbox `user.deleted`; relay outbox chuyển sự kiện sang Opportunity để giữ hoặc ẩn danh snapshot theo lựa chọn.
- **Outbox relay (Mục 27/28 SRS):** Identity và Opportunity có worker relay (giao ít nhất một lần, thử lại có giãn cách, dừng sau 8 lần và ghi log để xử lý tay). Sự kiện nộp/nộp lại/rút hồ sơ tạo thông báo trong hộp thư cho sinh viên (và mọi thành viên đội), chống trùng theo `businessKey`.
- **Giao diện:** 6 màn Application theo Figma (Đơn ứng tuyển, Chi tiết Đơn, Snapshot, Nộp hồ sơ đội, Apply thiếu hồ sơ, Nộp thành công).

### 4.2 Chưa đạt / chưa có bằng chứng

| Mục | Tình trạng | Việc cần làm |
|---|---|---|
| Chạy trên thiết bị / máy ảo | Chưa có ảnh hoặc log chạy thật cho các màn TV1 | Chạy theo `HUONG_DAN_KIEM_THU_TOAN_DIEN.md`, chụp ảnh từng màn |
| Lưu tệp thật end-to-end | Code xong và có test ký URL, nhưng **chưa chạy với MinIO thật**: image `quay.io/minio/minio:RELEASE.2024-02-24T17-11-14Z` trong `docker-compose.yml` hiện trả 401 khi pull, Docker Hub cũng từ chối | TV3 (chủ hạ tầng) đổi sang image MinIO tải được; khi bucket không kết nối được, identity tự quay về chế độ giả lập và ghi log |
| Relay outbox chạy liên tục nhiều instance | Thiết kế cho 1 instance mỗi service (đã ghi chú trong code) | Thêm lease/claim trước khi chạy 2 replica |
| F07, F16, F25 – review code Kotlin/Flutter của TV2 | Không có bản ghi review (PR comment) làm bằng chứng | Bổ sung link PR review nếu có |
| E04 (tranh slot thành viên cuối đội) | Thuộc TV3 (TEAM-03), TV1 không chạy | Đối chiếu kết quả của TV3 |

### 4.3 Hoãn theo CR phạm vi MVP

Google OAuth, quản lý thiết bị nâng cao, hồ sơ công khai/mentoring, CV PDF/QR/pitch, xác minh
chứng chỉ đầy đủ (theo bảng "Phạm vi demo và phần hoãn" trong kế hoạch, mục Danh tính/Passport).

## 5. Cách tái hiện

```bash
docker compose up -d          # thư mục gốc repo
cd backend
pnpm install
pnpm test
pnpm run test:race
cd ../mobile
flutter test
```
