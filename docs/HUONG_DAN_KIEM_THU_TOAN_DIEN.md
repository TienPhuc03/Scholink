# Sổ Tay Hướng Dẫn Kiểm Thử Toàn Diện (Full Test Suite) — Scholink

> **Mục tiêu:** Cung cấp tài liệu và kịch bản thực thi đầy đủ 6 kim tự tháp kiểm thử phần mềm cho hệ thống **Scholink Microservices Ecosystem**:
> 1. **Unit Testing** (Kiểm thử đơn vị)
> 2. **Integration Testing** (Kiểm thử tích hợp nghiệp vụ)
> 3. **End-to-End Testing (E2E)** (Kiểm thử luồng người dùng thực tế)
> 4. **Load & Stress Testing** (Kiểm thử tải & đo lường phân vị độ trễ p50, p95, p99)
> 5. **Security & OWASP Penetration Testing** (Kiểm thử an ninh bảo mật & chống tấn công)
> 6. **Regression Testing** (Kiểm thử hồi quy toàn diện)

---

## 📋 Bảng Lệnh Thực Thi Nhanh

Di chuyển vào thư mục `backend/`:

```bash
cd backend
```

| Loại kiểm thử | Lệnh thực thi (`pnpm`) | Tệp kiểm thử phụ trách | Mục tiêu kiểm tra |
|---|---|---|---|
| **1. Unit Tests** | `pnpm run test:unit` (hoặc `pnpm run test`) | `passport.entity.spec.ts`<br>`wallet.entity.spec.ts`<br>`reservation.entity.spec.ts`<br>`zod-validation.pipe.spec.ts` | Tính toán điểm Passport 7 thành phần, quy tắc bất biến số dư ví (`balance >= held >= 0`), khóa nộp đội Roster Freeze, lọc XSS & NoSQL. |
| **2. Integration Tests** | `pnpm run test` | `auth.use-case.spec.ts` | Xác thực đăng ký, phân quyền cố định STUDENT, JWT token rotation, replay attack, OTP cooldown 60s. |
| **3. Live E2E Tests** | `pnpm run test:e2e` | `scripts/test-e2e.ts` | 14 bước xuyên suốt API Gateway: Đăng ký, OTP, Upload PDF an toàn, Passport 100%, Consent SHA-256, Nộp đơn, Rút đơn, Nộp lại. |
| **4. Load / Benchmark** | `pnpm run test:load` | `scripts/load-test.ts` | Đo lường độ trễ mạng, thông lượng RPS, và các phân vị p50, p90, p95, p99 dưới tải đồng thời (CCU). |
| **5. Security / OWASP** | `pnpm run test:security` | `scripts/security-test.ts` | Kiểm thử BOLA/IDOR, chống leo quyền (Privilege Escalation), NoSQL Injection (`$gt`), giả mạo JWT, file độc hại `.exe`, và spam OTP (429). |
| **6. Regression Tests** | `pnpm run test:regression` | `scripts/regression-test.ts` | Kiểm tra tính toàn vẹn của hệ sinh thái sau mỗi bản release, đảm bảo logic cũ không bị lỗi. |
| **⚡ Chạy tất cả** | `pnpm run test:all` | Toàn bộ các bộ test | Chạy liên hoàn Unit + E2E + Security + Regression. |

---

## 🎯 Chi Tiết Từng Hạng Mục Kiểm Thử

### 1. Unit Testing (Kiểm thử đơn vị)
- **Điểm Passport 7 thành phần** ([`passport.entity.spec.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/apps/identity-service/src/domain/passport.entity.spec.ts)):
  - Cơ bản (20) + Học vấn (25) + Chứng chỉ (10) + Thành tích (15) + Kỹ năng (15) + CV/Video (5) + Ý định (10) = 100 điểm.
  - Chuẩn hóa & khử trùng lặp kỹ năng không phân biệt hoa thường.
- **Quy tắc bất biến tài chính ví** ([`wallet.entity.spec.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/apps/billing-service/src/domain/wallet.entity.spec.ts)):
  - `credit()` tăng số dư và tăng version.
  - `hold()` chặn khi vượt quá số dư khả dụng (`availableVnd`) bằng mã lỗi `INSUFFICIENT_FUNDS` (422).
  - `capture()` và `release()` bảo đảm tính toàn vẹn của số tiền đang giữ.
- **Khóa nộp hồ sơ đội (Roster Freeze)** ([`reservation.entity.spec.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/apps/collaboration-service/src/domain/reservation.entity.spec.ts)):
  - Fencing token tự tăng chống stale write.
  - Thu thập đủ Consent SHA-256 của tất cả thành viên trong 10 phút.
  - Tự động phát hiện phiên hết hạn (Lease Expired).
- **Lọc đầu vào & Chống NoSQL Injection** ([`zod-validation.pipe.spec.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/libs/shared/src/infrastructure/pipes/zod-validation.pipe.spec.ts)):
  - Loại bỏ thẻ HTML nguy hại.
  - Chặn ngay lập tức các thuộc tính chứa ký tự `$` hoặc `.` chống tấn công toán tử MongoDB.

---

### 2. Integration Testing (Kiểm thử tích hợp Use Case)
- **Xác thực & Bảo mật phiên** ([`auth.use-case.spec.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/apps/identity-service/src/application/use-cases/auth.use-case.spec.ts)):
  - Kiểm tra ép quyền sinh viên (`role: STUDENT`), chặn client gửi role giả mạo.
  - Kiểm tra mã băm mật khẩu `bcrypt` và cấp cặp khóa Access/Refresh JWT Token.
  - Kiểm tra bộ đếm Cooldown 60 giây khi gửi OTP (trả về mã lỗi 429).

---

### 3. Load & Concurrency Testing (Kiểm thử tải)
- Tệp thực thi: [`backend/scripts/load-test.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/scripts/load-test.ts)
- Mô phỏng người dùng đồng thời (CCU 20 - 50 connections).
- Xuất báo cáo thời gian thực:
  - **Thông lượng (RPS)**: Số lượng request xử lý mỗi giây.
  - **Phân vị p50**: Độ trễ 50% người dùng nhận được.
  - **Phân vị p95 & p99**: Độ trễ cao nhất ở ngưỡng tải đỉnh điểm.

---

### 4. Security & OWASP Penetration Testing (Kiểm thử an ninh)
- Tệp thực thi: [`backend/scripts/security-test.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/scripts/security-test.ts)
- Kiểm tra trực tiếp các lỗ hổng:
  1. **Privilege Escalation**: Chặn người dùng tự phong `ADMIN` khi đăng ký.
  2. **NoSQL Injection**: Gửi payload `{"email": {"$gt": ""}}` bị chặn bằng HTTP 400.
  3. **Broken Authentication**: Thử gửi JWT giả mạo chữ ký số, chặn bằng HTTP 401.
  4. **Refresh Token Replay**: Dùng lại token cũ sau khi xoay vòng bị chặn 401 và thu hồi toàn bộ session.
  5. **BOLA / IDOR**: Sinh viên A cố tình lấy cắp file CV của Sinh viên B bị chặn HTTP 403.
  6. **Malicious File Upload**: Chặn upload file `.exe` hoặc MIME type trái phép.
  7. **Spam Cooldown**: Gửi lại mã OTP liên tục bị chặn bằng HTTP 429.

---

### 5. Regression Testing (Kiểm thử hồi quy)
- Tệp thực thi: [`backend/scripts/regression-test.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/scripts/regression-test.ts)
- Đảm bảo khi sửa đổi hoặc thêm tính năng mới, các luồng nghiệp vụ cốt lõi không bị phá hỏng:
  - Đăng ký và tính điểm Passport.
  - Lấy danh sách cơ hội có cursor-based pagination.
  - Đảm bảo tính duy nhất qua `Idempotency-Key`.
  - Kết nối Gateway Proxy tới các microservices khác.
