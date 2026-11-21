# 💳 Kế Hoạch Kỹ Thuật: Đấu Nối Cổng Thanh Toán Thực Tế (PayOS & VNPAY) — Billing Microservice

> **Dự án:** Scholink Microservices Ecosystem  
> **Module phụ trách:** `billing-service` (Port 3004) & `gateway` (Port 3000)  
> **Mục tiêu:** Thay thế / Mở rộng cổng giả lập `SANDBOX_MOCK` bằng 2 cổng thanh toán thực tế phổ biến nhất tại Việt Nam: **PayOS (VietQR Chuẩn Napas 24/7)** và **VNPAY (Cổng thẻ ATM / Quốc tế)**.  
> **Thời gian dự kiến hoàn thành:** 4 Tuần (2 Sprints)  

---

## 🏛️ 1. Kiến Trúc Thiết Kế Mục Tiêu (Hexagonal / Clean Architecture)

Hệ thống thanh toán tuân thủ nguyên tắc **Hexagonal Architecture (Ports & Adapters)** để cho phép cắm/rút linh hoạt nhiều cổng thanh toán mà không làm thay đổi logic cốt lõi của ví (`Wallet` aggregate root) và nguyên tắc bất biến (`balance >= held >= 0`).

```mermaid
flowchart TD
    subgraph Client Layer
        Mobile[Mobile App / Web Portal]
    end

    subgraph API Gateway
        GW[Gateway Billing Controller]
    end

    subgraph Billing Microservice
        Controller[Wallet & Payment Controller]
        UseCase[Wallet & Payment Use Case]
        
        subgraph Domain Ports
            Port[<< Interface >>\nIPaymentGatewayAdapter]
        end
        
        subgraph Adapters Layer
            PayOS[PayOsPaymentAdapter\n(@payos/node)]
            VNPay[VnpayPaymentAdapter\n(HMAC-SHA512)]
            Sandbox[SandboxPaymentAdapter\n(Mock Test)]
        end
        
        subgraph Persistence & Ledger
            WalletRepo[WalletRepository\n(MongoDB)]
            PaymentRepo[PaymentOrderRepository\n(MongoDB)]
            Ledger[Double-Entry Ledger Log]
        end
    end

    subgraph External Gateways
        PayOS_Svc[PayOS Cloud API\n(VietQR Napas)]
        VNPay_Svc[VNPAY Gateway\n(ATM / Cards)]
    end

    Mobile -->|1. Tạo đơn nạp| GW
    GW --> Controller
    Controller --> UseCase
    UseCase --> Port
    Port -.-> PayOS
    Port -.-> VNPay
    Port -.-> Sandbox
    PayOS -->|2. Gọi API tạo link| PayOS_Svc
    VNPay -->|2. Sinh URL ký số| VNPay_Svc
    
    PayOS_Svc -->|3. Webhook IPN| Controller
    VNPay_Svc -->|3. Webhook IPN| Controller
    UseCase -->|4. Cộng tiền nguyên tử| WalletRepo
    UseCase -->|5. Ghi sổ kép| Ledger
```

---

## ⚖️ 2. So Sánh & Chiến Lược Lựa Chọn Cổng Thanh Toán

| Tiêu chí | **PayOS (Khuyến nghị Cổng chính)** | **VNPAY (Cổng bổ trợ)** |
|---|---|---|
| **Phương thức thanh toán** | Quét mã **VietQR** tự động (Mở app ngân hàng quét là thanh toán ngay 24/7). | Thẻ ATM nội địa, Thẻ quốc tế (Visa/Master/JCB), QR VNPAY. |
| **Trải nghiệm sinh viên** | Rất cao (100% sinh viên đều có app Mobile Banking hỗ trợ quét VietQR). | Trung bình - Khá (Phù hợp ai dùng thẻ tín dụng/quốc tế). |
| **Tốc độ xử lý Webhook** | **1 – 3 giây** (Realtime webhook ngay khi tiền vào tài khoản). | **5 – 30 giây** tùy ngân hàng. |
| **Thủ tục đăng ký & Sandbox** | Đăng ký tài khoản cá nhân/lập trình viên nhận ngay Client ID & API Key test không cần GPKD. | Yêu cầu đăng ký qua nhân viên VNPAY, cấu hình IPN phức tạp. |
| **SDK & Thư viện NodeJS** | Có SDK chính thức `@payos/node` chuẩn TypeScript. | Tự viết module ký số `crypto` (HMAC-SHA512) hoặc qua thư viện bên thứ 3. |
| **Chiến lược triển khai** | **Ưu tiên số 1 (Sprint 1)**: Cổng nạp tiền chính cho toàn bộ sinh viên. | **Ưu tiên số 2 (Sprint 2)**: Cổng thanh toán thẻ cho Nhà tài trợ / Organizer. |

---

## 📋 3. Kế Hoạch Triển Khai Chi Tiết (4 Giai Đoạn)

### 🔹 Giai Đoạn 1: Tái Cấu Trúc Domain & Xây Dựng Port Adapter (Tuần 1)
* **Mục tiêu:** Định nghĩa hợp đồng cổng thanh toán trừu tượng (Port) và chuẩn hóa mô hình dữ liệu đơn hàng.
* **Các công việc cụ thể:**
  1. Cài đặt thư viện: `pnpm add @payos/node` tại thư mục `backend/apps/billing-service`.
  2. Tạo Port Interface: `IPaymentGatewayAdapter` với các phương thức:
     - `createPaymentLink(params: CreatePaymentLinkParams): Promise<PaymentLinkResult>`
     - `verifyWebhook(payload: any, signature?: string): Promise<WebhookVerificationResult>`
     - `queryOrder(orderCode: number | string): Promise<PaymentStatusResult>`
     - `cancelPaymentLink(orderCode: number | string): Promise<boolean>`
  3. Mở rộng `PaymentOrder` Entity:
     - Bổ sung trường `orderCode: number` (Số nguyên duy nhất để phục vụ PayOS sinh QR).
     - Bổ sung `paymentUrl`, `qrCodeUrl`, `gatewayTransId`, `paidAt`, `webhookPayload`.
     - Cập nhật enum trạng thái: `CREATED`, `PENDING`, `SUCCEEDED`, `FAILED`, `EXPIRED`, `CANCELLED`.
  4. Đăng ký `PaymentGatewayFactory` để tự động inject Adapter phù hợp dựa trên `dto.provider`.

### 🔹 Giai Đoạn 2: Tích Hợp Chi Tiết PayOS SDK (Tuần 2)
* **Mục tiêu:** Hoàn thiện luồng nạp tiền VietQR PayOS từ tạo link thanh toán đến nhận Webhook tự động.
* **Các công việc cụ thể:**
  1. Tạo `PayOsPaymentAdapter`:
     - Khởi tạo client PayOS với `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`.
     - Phương thức `createPaymentLink`: Tạo đơn hàng trên PayOS với `amount`, `description` (Ví dụ: `SCHOLINK NAP 50K`), `returnUrl`, `cancelUrl`.
  2. Xây dựng Endpoint Webhook an toàn:
     - Route: `POST /api/v1/payments/webhook/payos`.
     - Xác thực chữ ký: Sử dụng `payos.verifyPaymentWebhookData(body)` để đảm bảo 100% request đến từ máy chủ PayOS.
  3. Giao dịch nguyên tử (ACID Transaction):
     - Mở transaction MongoDB:
       * Khóa dòng đơn hàng theo `orderCode` (chống xử lý lặp / duplicate webhook).
       * Cập nhật `order.markSucceeded()`.
       * Ghi tăng số dư ví `wallet.credit(amountVnd)`.
       * Ghi bản ghi sổ cái kép `BillingLedger`.
       * Phát sự kiện `payment.succeeded` qua Outbox để `notification-service` gửi thông báo cho sinh viên.
  4. Cập nhật Gateway:
     - Cho phép bypass xác thực JWT riêng đối với route Webhook (`/api/v1/payments/webhook/*`) để PayOS gọi vào.

### 🔹 Giai Đoạn 3: Tích Hợp Bổ Trợ Cổng VNPAY (Tuần 3)
* **Mục tiêu:** Bổ sung tùy chọn thanh toán qua thẻ ATM / Visa / QR VNPAY.
* **Các công việc cụ thể:**
  1. Tạo `VnpayPaymentAdapter`:
     - Tạo hàm ký số `hashHmacSha512` chuẩn quy chuẩn của VNPAY.
     - Sinh URL thanh toán `vnp_Url` với đầy đủ tham số: `vnp_TmnCode`, `vnp_Amount`, `vnp_TxnRef`, `vnp_OrderInfo`, `vnp_ReturnUrl`, `vnp_IpAddr`.
  2. Xử lý IPN (Instant Payment Notification):
     - Route: `GET /api/v1/payments/webhook/vnpay-ipn` & `GET /api/v1/payments/vnpay-return`.
     - Kiểm tra mã checksum `vnp_SecureHash` trước khi thay đổi trạng thái đơn hàng.
     - Trả về mã phản hồi chuẩn của VNPAY (`{"RspCode": "00", "Message": "Confirm Success"}`).

### 🔹 Giai Đoạn 4: Đối Soát, Xử Lý Sự Cố & Kiểm Thử Toàn Diện (Tuần 4)
* **Mục tiêu:** Bảo vệ bất biến tài chính, xử lý đơn treo và hoàn thiện kiểm thử tự động.
* **Các công việc cụ thể:**
  1. **Background Worker đối soát đơn treo (Reconciliation Cron Job):**
     - Quét định kỳ mỗi 5 phút các đơn nạp tiền ở trạng thái `PENDING` quá 15 phút.
     - Gọi `gatewayAdapter.queryOrder(orderCode)` để hỏi trạng thái từ PayOS / VNPAY:
       * Nếu cổng báo đã thành công nhưng webhook bị mất kết nối mạng: Tự động hoàn tất cộng tiền ví (`lateSuccess`).
       * Nếu quá thời hạn quy định (15 phút) mà chưa thanh toán: Đánh dấu `EXPIRED`.
  2. **Bộ kiểm thử tự động (Test Suite):**
     - Unit test tính đúng đắn của chữ ký số Webhook PayOS / VNPAY.
     - Integration test kiểm tra tính Idempotent: Gửi 10 request webhook cùng 1 lúc ➔ Chỉ đúng 1 lần cộng tiền ví duy nhất.
     - Test giao dịch rollback: Nếu ghi sổ cái lỗi ➔ Hủy toàn bộ thay đổi số dư ví.
  3. **Cập nhật giao diện Web Portal & Mobile App:**
     - Web Portal: Thêm nút chọn nạp tiền qua PayOS (hiện mã VietQR động trực quan trên màn hình).
     - Mobile App: Tự động kích hoạt DeepLink mở ứng dụng ngân hàng tương ứng khi bấm nạp tiền.

---

## 🔒 4. Biện Pháp Bảo Mật & Quy Tắc Bất Biến Tài Chính

1. **Nguyên tắc bất biến số nguyên VND:** Không bao giờ lưu trữ số thực (float/double); mọi giá trị tiền tệ đều là số nguyên VND (`integer`).
2. **Xác thực Webhook Raw Body:** Toàn bộ dữ liệu Webhook phải được đối chiếu chữ ký HMAC mật mã (`checksumKey` / `secureHash`) trước khi phân tích payload.
3. **Idempotency nghiêm ngặt:** Mỗi giao dịch thanh toán mang một `orderCode` duy nhất. Nếu Webhook gửi lại nhiều lần, hệ thống trả về HTTP `200 OK` nhưng không được phép cộng tiền lần 2.
4. **Không tin tưởng Return URL:** Chỉ cộng tiền khi nhận được Webhook máy chủ-tới-máy chủ (Server-to-Server IPN), tuyệt đối không dựa vào URL redirect về trình duyệt của người dùng.

---

## 📦 5. Bảng Biến Môi Trường Cần Bổ Sung (`.env`)

```ini
# ============================================================================
# CẤU HÌNH CỔNG THANH TOÁN THỰC TẾ (PAYOS & VNPAY)
# ============================================================================
# Cấu hình PayOS (VietQR Chuẩn Napas)
PAYOS_CLIENT_ID=your-payos-client-id
PAYOS_API_KEY=your-payos-api-key
PAYOS_CHECKSUM_KEY=your-payos-checksum-key
PAYOS_RETURN_URL=http://localhost:3000/portal#wallet
PAYOS_CANCEL_URL=http://localhost:3000/portal#wallet

# Cấu hình VNPAY (Thẻ ATM & Quốc Tế)
VNPAY_TMN_CODE=your-vnpay-tmn-code
VNPAY_HASH_SECRET=your-vnpay-hash-secret
VNPAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=http://localhost:3000/api/v1/payments/vnpay-return
```

---

## 🏁 6. Tiêu Chí Nghiệm Thu (Acceptance Criteria)

- [ ] Sinh viên bấm nạp 50.000đ ➔ Hiển thị mã VietQR động có sẵn số tiền và nội dung chuyển khoản.
- [ ] Dùng app ngân hàng thật (hoặc app sandbox PayOS) chuyển khoản ➔ Ví tiền trong Scholink nhảy số trong vòng 3 giây không cần F5.
- [ ] Giả mạo dữ liệu Webhook (sai checksum) ➔ Bị chặn ngay lập tức với mã lỗi `400 Bad Request`.
- [ ] Tắt mạng khi thanh toán ➔ Sau khi có mạng lại, worker đối soát tự động phát hiện và cộng tiền đủ.
- [ ] Chạy 50 request webhook đồng thời cho cùng 1 đơn hàng ➔ Ví chỉ được cộng tiền đúng 1 lần duy nhất (Pass Concurrency Test).
