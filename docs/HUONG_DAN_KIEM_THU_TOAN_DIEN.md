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
| **2. Integration Tests** | `pnpm run test` | `auth.use-case.spec.ts`<br>`chat-schol26.spec.ts`<br>`team-schol20.spec.ts` | Xác thực đăng ký, JWT token rotation, replay attack, OTP cooldown 60s.<br>**SCHOL-26:** Gửi đồng thời seq không trùng, clientMsgId dedup, outbox crash recovery, read cursor tăng đơn điệu, rời đội cấm chat & MQTT ACL.<br>**SCHOL-20:** PrepareSubmission kiểm leader & membership hợp lệ, thu consent gắn profile/snapshot/roster, conditional transition sang SUBMITTING, validate token/lease/consents, worker timeout gọi Opportunity AbortSubmissionIntent (COMMITTED reconcile, ABORTED mở khóa, mất mạng giữ khóa retry), rời/chuyển trưởng tuân thủ Roster Freeze & thu hồi quyền chat. |
| **3. Live E2E Tests** | `pnpm run test:e2e` | `scripts/test-e2e.ts` | 14 bước cơ sở + các bước SCHOL-20 & SCHOL-26 xuyên suốt API Gateway: Đăng ký, OTP, Upload PDF an toàn, Passport 100%, Consent SHA-256, Nộp đơn, Rút đơn, Nộp lại, Chat nhóm, MQTT Webhook Auth/ACL. |
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

### 2. Integration Testing (Kiểm thử tích hợp Use Case, SCHOL-26 & SCHOL-20)
- **Xác thực & Bảo mật phiên** ([`auth.use-case.spec.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/apps/identity-service/src/application/use-cases/auth.use-case.spec.ts)):
  - Kiểm tra ép quyền sinh viên (`role: STUDENT`), chặn client gửi role giả mạo.
  - Kiểm tra mã băm mật khẩu `bcrypt` và cấp cặp khóa Access/Refresh JWT Token.
  - Kiểm tra bộ đếm Cooldown 60 giây khi gửi OTP (trả về mã lỗi 429).
- **Chat Nhóm & MQTT Reconnect SCHOL-26** ([`chat-schol26.spec.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/apps/collaboration-service/src/chat-schol26.spec.ts)):
  - **Mongoose Schemas & Unique Indexes:** Kiểm tra index `{ roomId: 1, seq: 1 }` (unique), `{ roomId: 1, senderId: 1, clientMsgId: 1 }` (unique partial), `{ roomId: 1, userId: 1 }` (unique read receipt) và `{ status: 1, nextRetryAt: 1, createdAt: 1 }`.
  - **Gửi đồng thời (Concurrent send 10 tin nhắn):** Kiểm tra `seq` tăng đơn điệu tuyệt đối `[1..10]`, không trùng lặp.
  - **Idempotency với `clientMsgId`:** Cùng payload trả tin cũ (`isDuplicate: true`); khác payload trả 409 `CLIENT_MESSAGE_CONFLICT`; hai người gửi khác nhau không bị gộp.
  - **Crash Simulation (Outbox Pattern):** Phục hồi bản ghi `PENDING` sau crash commit DB, phát lại thành công và cập nhật `PUBLISHED`.
  - **Worker Retry Safety:** Exponential backoff `2^retryCount * 1000`, chuyển `FAILED` sau 5 lần thất bại.
  - **Notification Coordination:** Gắn `businessKey: 'chat_msg_' + messageId` đảm bảo không phát duplicate inbox.
  - **Reconnect sync `afterSeq`:** Kéo bù tin nhắn sau seq đã nhận.
  - **Read cursor tăng đơn điệu:** Sử dụng `$max`, không bị lùi khi nhận ack trễ.
  - **Rời đội & Thu hồi quyền:** Sau khi rời đội bị chặn 403 khi gửi tin, chặn 403 khi đọc tin, và MQTT ACL từ chối subscribe (`deny`).
- **Consent Đội, Roster Freeze & Reservation SCHOL-20** ([`team-schol20.spec.ts`](file:///C:/Users/Administrator/Desktop/PROJECT/Scholink/backend/apps/collaboration-service/src/team-schol20.spec.ts)):
  - **PrepareSubmission:** Kiểm tra quyền trưởng đội (403), ngưỡng minSize/maxSize (422), kiểm tra toàn bộ thành viên có active membership hợp lệ trong đội (409 nếu thiếu hoặc sai đội). Cấp lease 10 phút, tăng `fencingToken` và `rosterVersion`.
  - **Cập nhật có điều kiện (Optimistic Concurrency):** Ngăn chặn race condition khi 2 tiến trình gọi `prepareSubmission` đồng thời, chỉ 1 tiến trình được phép chuyển sang `SUBMITTING`.
  - **Thu thập Consent:** Gắn `snapshotId`, `payloadHash`, `profileVersion` và `rosterVersion`. Từ chối người ngoài (403) và từ chối nếu `rosterVersion` không khớp (409 `VERSION_MISMATCH`). Đủ 100% consent mới cho phép nộp.
  - **Roster Freeze:** Chặn `leaveTeam` và `transferLeader` khi đội đang ở trạng thái `SUBMITTING` (409 `STATE_CONFLICT`).
  - **Rời đội ở ACTIVE:** Cập nhật đội hình, xóa `ActiveMembership`, thu hồi quyền phòng chat tức thì, tăng `rosterVersion` và hủy phiên giữ chỗ chưa hoàn tất.
  - **ValidateReservation & Confirm:** Kiểm tra fencingToken, thời hạn lease, rosterVersion và điều kiện 100% consent. Confirm chuyển `CONFIRMED` và `SUBMITTED`, an toàn không giữ transaction khi gọi network. Chặn confirm sau khi đã abort.
  - **Worker Timeout & Opportunity Intent:** Gọi `AbortSubmissionIntent` khi lease hết hạn. Nếu Opportunity trả `ABORTED` -> worker mở khóa đội về `ACTIVE`. Nếu Opportunity trả `COMMITTED` -> worker đối chiếu và xác nhận đội `SUBMITTED`. Nếu mất kết nối mạng -> giữ nguyên khóa (`status: SUBMITTING`), an toàn retry chu kỳ sau mà không mở khóa bậy.
  - **Ràng buộc 1 thành viên 1 đội:** Ngăn chặn sinh viên tham gia hoặc tạo 2 đội trong cùng 1 cuộc thi.
  - **Mở lại đội (Reopen from Withdrawal):** Trưởng đội có thể mở lại đội từ hồ sơ đã rút về `ACTIVE` kèm tăng `rosterVersion`.

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
