# 📋 BÁO CÁO NGHIỆM THU: SCHOL-32 & SCHOL-33 (SPRINT 1)
- **Đầu mối thực hiện:** Phú (Fullstack: FE + BE)
- **Reviewer nghiệm thu:** Nhân
- **Phạm vi hoàn thành:** Tạo đội, JoinRequest, Kiểm soát Slot nguyên tử, Roster Freeze & Nền hạ tầng.

---

## 1. DANH SÁCH MÃ NGUỒN & ENDPOINT ĐÃ HOÀN TẤT

### 🟢 Backend (SCHOL-32):
| Thành phần | Đường dẫn tệp | Mô tả hoàn thiện |
|---|---|---|
| **CI / CD Workflow** | `.github/workflows/ci.yml` | Tự động hóa build, lint, typecheck, secret leak check và chạy test trên GitHub Actions. |
| **Team Invariants & Tests** | `backend/apps/collaboration-service/src/domain/team.entity.ts` | Chặn chuyển giao trưởng đội khi đang nộp hồ sơ (`SUBMITTING`), bảo toàn quy tắc slot nguyên tử `minSize` - `maxSize`. |
| **Test Concurrency Suite** | `backend/apps/collaboration-service/src/domain/team.entity.spec.ts` | Bộ kiểm thử tự động: Leader chiếm 1 slot, tranh slot cuối (`SLOT_FULL`), khóa đội `SUBMITTING`, và rollback khi abort. |
| **Seed Data 3 Persona** | `backend/scripts/seed.ts` | Khởi tạo sẵn 3 tài khoản sinh viên độc lập phục vụ kịch bản demo: `student@scholink.edu.vn`, `applicant1@scholink.edu.vn`, `applicant2@scholink.edu.vn`. |
| **Sửa Mock Auth Tests** | `backend/apps/identity-service/src/application/use-cases/auth.use-case.spec.ts` | Đồng bộ signature mock repository để toàn bộ suite `pnpm test` đạt **100% PASS (46/46 tests)**. |

### 🟣 Frontend (SCHOL-33):
- **Tệp màn hình:** `backend/apps/gateway/src/portal.controller.ts` tại Tab **"🤝 Đội Thi & Tuyển Thành Viên"** (`http://localhost:3000/portal#teams`).
- **Các tính năng UI hoàn chỉnh:**
  1. **Bộ chuyển đổi tài khoản (Persona Switcher):** Nút chuyển đổi nhanh giữa 3 tài khoản (Trưởng Đội, Ứng Viên A, Ứng Viên B tranh slot cuối) với token JWT thật từ `/api/v1/auth/login`.
  2. **Form Tạo Đội Thi:** Tên đội, mô tả, vị trí/kỹ năng cần, `minSize`, `maxSize`, tự động validate từ backend.
  3. **Danh Sách Đội Theo Cuộc Thi:** Hiển thị thẻ từng đội, trưởng đội, danh sách thành viên, số lượng slot thời gian thực (`1/2`), badge trạng thái tuyển (`FORMING`, `ACTIVE`, `SUBMITTING`).
  4. **Nút Hành Động Ngữ Cảnh:**
     - Người chưa có đội: Nút **"➕ Xin Vào Đội"** (Kèm popup nhập lời nhắn).
     - Thành viên: Badge **"✅ Thành viên"** + Nút **"Rời Đội"**.
     - Đội đã đủ người: Khóa nút, hiển thị Badge **"🔒 Đã đủ slot (2/2)"**.
  5. **Bảng Trưởng Đội Duyệt/Từ Chối JoinRequest:** Tự động hiện khi Persona là Trưởng đội, hiển thị các đơn `PENDING` kèm 2 nút **"✅ Duyệt Vào Đội"** và **"❌ Từ Chối"**, tự động `disabled` nút khi đang xử lý để chống double-click.

---

## 2. BẢNG KỊCH BẢN KIỂM THỬ (TEST MATRIX CHO REVIEWER NHÂN)

| STT | Kịch bản kiểm thử | Các bước thực hiện | Kết quả mong đợi | Thực tế | Trạng thái |
|:---:|---|---|---|---|:---:|
| **TC01** | **Trưởng đội chiếm 1 slot khi tạo đội** | 1. Chọn tài khoản **Trưởng Đội (Student 1)**.<br/>2. Tạo đội mới: Tên *"AI Vision"*, `minSize=2`, `maxSize=2`. | Đội được tạo với status `FORMING`, số thành viên `1/2`, Leader chiếm sẵn slot đầu tiên. | Đội hiển thị `1/2` slot, leader có vai trò `LEADER`. | **PASS** |
| **TC02** | **Ứng viên A gửi yêu cầu gia nhập** | 1. Bấm chuyển sang **Ứng Viên A (Student 2)**.<br/>2. Bấm nút **"➕ Xin Vào Đội"** tại đội vừa tạo.<br/>3. Nhập lời nhắn: *"Em xin vào làm CV PyTorch"*. | Backend ghi nhận JoinRequest trạng thái `PENDING`. Thông báo gửi thành công. | Gửi thành công, JoinRequest lưu vào database. | **PASS** |
| **TC03** | **Trưởng đội duyệt thành viên vào đội** | 1. Chuyển lại về **Trưởng Đội (Student 1)**.<br/>2. Khu vực *"Yêu cầu xin vào đội"* xuất hiện đơn của `usr_student_002`.<br/>3. Bấm **"✅ Duyệt Vào Đội"**. | Thành viên `usr_student_002` được thêm vào đội. Số slot cập nhật thành `2/2` (Đầy slot). Trạng thái đội chuyển thành `ACTIVE`. | Cập nhật nguyên tử: Slot thành `2/2`, status thành `ACTIVE`. | **PASS** |
| **TC04** | **Ứng viên B tranh slot cuối bị chặn (SLOT_FULL)** | 1. Chuyển sang **Ứng Viên B (Student 3)**.<br/>2. Bấm xin vào đội đã đủ `2/2` slot. | Thẻ đội hiển thị badge *"🔒 Đã đủ slot (2/2)"*. Nếu cố tình gửi request, server trả về lỗi `SLOT_FULL (Mã 409)`. | Hệ thống chặn và hiện lỗi `SLOT_FULL: Đội thi đã đủ thành viên`. | **PASS** |
| **TC05** | **Chặn sinh viên ở 2 đội trong cùng cuộc thi** | 1. Đang ở **Ứng Viên A** (đã ở trong đội).<br/>2. Cố tình bấm tạo đội mới hoặc xin vào đội khác. | Server từ chối với lỗi `STATE_CONFLICT (Mã 409)` do vi phạm Unique Index `active_memberships`. | Server báo lỗi `Bạn đã tham gia một đội thi trong cuộc thi này`. | **PASS** |
| **TC06** | **Chặn người không có quyền duyệt request (403)** | 1. Đang ở **Ứng Viên A** hoặc **Ứng Viên B**.<br/>2. Cố tình gọi API duyệt JoinRequest của đội khác. | Server trả về mã lỗi `403 FORBIDDEN_RESOURCE`. Giao diện ẩn các nút duyệt. | Bị chặn với lỗi `403 FORBIDDEN_RESOURCE`. | **PASS** |
| **TC07** | **Khóa nộp hồ sơ (Roster Freeze) & Chặn đổi thành viên** | 1. Trưởng đội bấm **"🔒 Khóa Roster Freeze (10 phút)"**.<br/>2. Đội chuyển sang `SUBMITTING`.<br/>3. Thành viên cố tình bấm Rời đội hoặc Chuyển trưởng đội. | Thao tác thay đổi thành viên bị chặn hoàn toàn với lỗi `STATE_CONFLICT: Roster Freeze`. | Thao tác rời đội/chuyển trưởng bị chặn đúng quy định. | **PASS** |

---

## 3. HƯỚNG DẪN REVIEWER CHẠY DEMO THỰC TẾ

Reviewer (Nhân) chỉ cần thực hiện 3 bước sau trên máy:

### Bước 1: Khởi động Hạ tầng & Seed Dữ liệu
```bash
# 1. Khởi động Docker MongoDB Replica Set
docker compose up -d

# 2. Cài đặt thư viện & Nạp dữ liệu mẫu
cd backend
pnpm install
pnpm run seed
```

### Bước 2: Chạy API Gateway & Collaboration Service
Mở 2 terminal trong thư mục `backend/`:
```bash
# Terminal 1: Chạy API Gateway & Web Portal
pnpm run start:gateway

# Terminal 2: Chạy Collaboration Microservice
pnpm run start:collaboration
```

### Bước 3: Mở Web Portal & Thao tác Demo
Truy cập trình duyệt: 👉 **`http://localhost:3000/portal#teams`**
1. Nhìn lên thanh chuyển đổi Persona: Bấm chọn **"👑 Trưởng Đội (Student 1)"** ➔ Hệ thống tự động đăng nhập.
2. Form bên trái: Nhập tên đội *"Scholink AI Pioneers"*, bấm **"🚀 Tạo Đội Thi Mới"** ➔ Thấy đội xuất hiện ở danh sách bên phải với `1/2` slot.
3. Bấm chuyển sang **"🙋 Ứng Viên A (Student 2)"** ➔ Thấy nút **"➕ Xin Vào Đội"** ➔ Nhập lời nhắn và gửi.
4. Bấm chuyển lại **"👑 Trưởng Đội"** ➔ Thấy khung xanh lá *"Yêu cầu xin vào đội"* xuất hiện đơn của Ứng viên A ➔ Bấm **"✅ Duyệt Vào Đội"** ➔ Đội lập tức cập nhật thành `2/2 (🔒 Đã đủ slot)`.
5. Bấm chuyển sang **"🙋‍♂️ Ứng Viên B"** ➔ Thấy thẻ đội đã bị khóa slot, không thể vào thêm ➔ Hoàn thành kịch bản nghiệm thu!

---

## 4. KẾT QUẢ KIỂM THỬ TỰ ĐỘNG (AUTOMATED TEST REPORT)
```bash
$ pnpm test

PASS apps/billing-service/src/domain/wallet.entity.spec.ts
PASS apps/collaboration-service/src/domain/team.entity.spec.ts (SCHOL-32)
PASS apps/identity-service/src/domain/passport.entity.spec.ts
PASS apps/collaboration-service/src/domain/reservation.entity.spec.ts (F33)
PASS libs/shared/src/infrastructure/pipes/zod-validation.pipe.spec.ts
PASS apps/identity-service/src/application/use-cases/auth.use-case.spec.ts
PASS apps/identity-service/src/f04-backend.spec.ts

Test Suites: 7 passed, 7 total
Tests:       46 passed, 46 total
Snapshots:   0 total
Time:        9.211 s
```
