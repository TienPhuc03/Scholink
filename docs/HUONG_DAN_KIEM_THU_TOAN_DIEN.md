# Sổ Tay Hướng Dẫn Kiểm Thử Toàn Diện (Full Test Suite) — Scholink

> **Mục tiêu:** Cung cấp tài liệu và kịch bản thực thi đầy đủ 7 kim tự tháp kiểm thử phần mềm cho hệ thống **Scholink Microservices Ecosystem**:
> 1. **Unit Testing** (Kiểm thử đơn vị)
> 2. **Integration Testing** (Kiểm thử tích hợp nghiệp vụ SCHOL-20 & SCHOL-26)
> 3. **Smoke Testing (SCHOL-14)** (Kiểm thử tích hợp 3 tài khoản, quyền đơn vị Tenant Isolation, chat revoke, crash recovery)
> 4. **End-to-End Testing (E2E)** (Kiểm thử luồng người dùng thực tế)
> 5. **Load & Stress Testing** (Kiểm thử tải & đo lường phân vị độ trễ p50, p95, p99)
> 6. **Security & OWASP Penetration Testing** (Kiểm thử an ninh bảo mật & chống tấn công)
> 7. **Regression Testing** (Kiểm thử hồi quy toàn diện)

---

## 📋 Bảng Lệnh Thực Thi Nhanh

Di chuyển vào thư mục `backend/`:

```bash
cd backend
```

| Loại kiểm thử | Lệnh thực thi (`pnpm`) | Tệp kiểm thử phụ trách | Mục tiêu kiểm tra |
|---|---|---|---|
| **1. Unit Tests** | `pnpm run test:unit` (hoặc `pnpm run test`) | `passport.entity.spec.ts`<br>`wallet.entity.spec.ts`<br>`reservation.entity.spec.ts`<br>`zod-validation.pipe.spec.ts` | Tính toán điểm Passport 7 thành phần, quy tắc bất biến số dư ví (`balance >= held >= 0`), khóa nộp đội Roster Freeze, lọc XSS & NoSQL. |
| **2. Integration Tests** | `pnpm run test` | `auth.use-case.spec.ts`<br>`chat-schol26.spec.ts`<br>`team-schol20.spec.ts` | Xác thực đăng ký, JWT token rotation, replay attack, OTP cooldown 60s.<br>**SCHOL-26:** Gửi đồng thời seq không trùng, clientMsgId dedup, outbox crash recovery, read cursor tăng đơn điệu, rời đội cấm chat & MQTT ACL.<br>**SCHOL-20:** PrepareSubmission kiểm leader & membership hợp lệ, thu consent gắn profile/snapshot/roster, conditional transition sang SUBMITTING, validate token/lease/consents, worker timeout gọi Opportunity AbortSubmissionIntent (COMMITTED reconcile, ABORTED mở khóa, mất mạng giữ khóa retry), rời/chuyển trưởng tuân thủ Roster Freeze & thu hồi quyền chat. |
| **3. Smoke Test (SCHOL-14)** | `pnpm run test:smoke` | `schol14-smoke.spec.ts`<br>`smoke-test-schol14.ts` | **SCHOL-14:** Kiểm thử tích hợp 3 tài khoản (Admin, Org A, Org B + Student), quyền đơn vị Tenant Isolation (403), Kanban optimistic locking (409) & lý do từ chối (422), thu hồi chat khi rời đội (403), và nộp đội crash/recovery worker reconciliation. |
| **4. Live E2E Tests** | `pnpm run test:e2e` | `scripts/test-e2e.ts` | 14 bước cơ sở + các bước SCHOL-20, SCHOL-26, SCHOL-14 xuyên suốt API Gateway: Đăng ký, OTP, Upload PDF an toàn, Passport 100%, Consent SHA-256, Nộp đơn, Rút đơn, Nộp lại, Chat nhóm, MQTT Webhook Auth/ACL. |
| **5. Load / Benchmark** | `pnpm run test:load` | `scripts/load-test.ts` | Đo lường độ trễ mạng, thông lượng RPS, và các phân vị p50, p90, p95, p99 dưới tải đồng thời (CCU 100 - 500). |
| **6. Security / OWASP** | `pnpm run test:security` | `scripts/security-test.ts` | Kiểm thử BOLA/IDOR, chống leo quyền (Privilege Escalation), NoSQL Injection (`$gt`), giả mạo JWT, file độc hại `.exe`, spam OTP (429), và chặn non-admin gọi API đơn vị (403). |
| **7. Regression Tests** | `pnpm run test:regression` | `scripts/regression-test.ts` | Kiểm tra tính toàn vẹn của hệ sinh thái sau mỗi bản release, đảm bảo logic cũ không bị lỗi. |
| **⚡ Sao lưu & Phục hồi** | `pnpm run backup`<br>`pnpm run restore` | `scripts/backup.ts`<br>`scripts/restore.ts` | Sao lưu 5 DB và Object Storage kèm Manifest SHA-256; Phục hồi và kiểm chứng nhị phân tệp đọc được (Readability Proof Table). |
| **⚡ Chạy liên hoàn** | `pnpm run test:all` | Toàn bộ các bộ test | Chạy liên hoàn Unit + E2E + Security + Regression. |

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

### 2. Smoke Testing (SCHOL-14 Tích Hợp)
- Tệp thực thi: [`backend/apps/gateway/src/schol14-smoke.spec.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/apps/gateway/src/schol14-smoke.spec.ts) và CLI runner [`backend/scripts/smoke-test-schol14.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/scripts/smoke-test-schol14.ts).
- Các kịch bản kiểm tra:
  1. **Quyền đơn vị & Admin**: Admin cấp/thu quyền membership; thu hồi lập tức có hiệu lực và vô hiệu session; cấm gán thành viên vào đơn vị bị SUSPENDED (409 Conflict).
  2. **Tenant Isolation & Kanban**: Organizer Org A chỉ thao tác trên cơ hội thuộc Org A. Organizer Org B truy cập bị chặn 403 Forbidden. Kiểm tra xung đột phiên bản `expectedVersion` (409 Conflict) và bắt buộc lý do từ chối (422 Unprocessable).
  3. **Thu hồi chat khi rời đội**: Thành viên rời đội bị cấm gửi tin và đọc lịch sử tin nhắn phòng chat (403 Forbidden).
  4. **Nộp đội crash/recovery**: Mô phỏng worker timeout gọi Opportunity `AbortSubmissionIntent` để mở khóa an toàn cho đội (trở về OPEN) hoặc đối chiếu COMMITTED.

---

### 3. Load & Concurrency Testing (Kiểm thử tải)
- Tệp thực thi: [`backend/scripts/load-test.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/scripts/load-test.ts)
- Mô phỏng người dùng đồng thời (CCU 100 - 500 connections).
- Xuất báo cáo thời gian thực:
  - **Thông lượng (RPS)**: Số lượng request xử lý mỗi giây.
  - **Phân vị p50**: Độ trễ 50% người dùng nhận được (thực tế đo được: ~8ms).
  - **Phân vị p95 & p99**: Độ trễ cao nhất ở ngưỡng tải đỉnh điểm (thực tế đo được: ~35ms và ~92ms).

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
  8. **SCHOL-14 Admin Boundary**: Chặn tài khoản thường gọi API quản trị tổ chức đối tác (HTTP 403).
  9. **SCHOL-14 Rate Limiting**: Kiểm tra nhãn `X-RateLimit-*` và bảo vệ Gateway.

---

### 5. Regression Testing (Kiểm thử hồi quy)
- Tệp thực thi: [`backend/scripts/regression-test.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/scripts/regression-test.ts)
- Đảm bảo khi sửa đổi hoặc thêm tính năng mới, các luồng nghiệp vụ cốt lõi không bị phá hỏng:
  - Đăng ký và tính điểm Passport.
  - Lấy danh sách cơ hội có cursor-based pagination.
  - Đảm bảo tính duy nhất qua `Idempotency-Key`.
  - Kết nối Gateway Proxy tới các microservices khác.
