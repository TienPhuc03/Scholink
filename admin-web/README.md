# Scholink Portal (Organizer & Super Admin)

Web quản trị cho Ban tổ chức và Quản trị viên, theo design spec *Scholink Portal*. React + Vite, gọi trực tiếp API Gateway (`Scholink/backend`, cổng 3000) qua proxy của Vite.

## Chạy

```bash
# 1. Backend (Mongo + Redis phải đang chạy)
cd Scholink/backend && npm run build:all && npm run start:all

# 2. Portal
cd Scholink/admin-web && npm install && npm run dev   # http://localhost:5173
```

Gateway ở chỗ khác thì đặt biến `GATEWAY_URL` (ví dụ `GATEWAY_URL=http://10.0.0.5:3000 npm run dev`).
Build tĩnh: `npm run build` → `dist/` (khi deploy, cần reverse proxy `/api` và `/health` về gateway).

## Chức năng

| Vai trò | Trang | API |
|---|---|---|
| ADMIN | Tổng quan (chỉ số BO, crawler, giao dịch) | `GET /admin/opportunities/analytics/bo-dashboard`, `crawler/alerts` |
| ADMIN | Đơn vị tổ chức: tạo, tạm khóa/kích hoạt (kèm lý do), cấp/thu hồi Organizer | `/admin/organizations/*` |
| ADMIN | Kiểm duyệt cơ hội: duyệt (bổ sung schema bắt buộc), từ chối kèm lý do, gộp bản trùng (so sánh 2 bên), thao tác hàng loạt | `/admin/opportunities/review-queue`, `:id/approve|reject|merge|diff` |
| ADMIN | Danh mục cơ hội + gia hạn | `/opportunities/organizer/my-opportunities`, `/admin/opportunities/:id/extend` |
| ADMIN | Nguồn crawler: bật/tắt, chạy job, chạy lại, thêm nguồn | `/admin/opportunities/crawler/*` |
| ORGANIZER | Tổng quan đơn vị, Cơ hội của tôi (đăng cơ hội mới) | `/opportunities`, `/applications/organizer/kanban/:id` |
| ADMIN + ORGANIZER | Kanban hồ sơ: kéo thả đổi trạng thái (khóa lạc quan `expectedVersion`), từ chối bắt buộc lý do, chi tiết hồ sơ (SHA-256, tệp đính kèm, audit trail) | `PATCH /applications/:id/status`, `/applications/organizer/:id` |

Access token tự refresh khi hết hạn (`/auth/refresh`), đăng xuất gọi `/auth/logout`.

## Chưa có

- Trang quản lý người dùng (tab Sinh viên / Ban tổ chức / Quản trị viên trong spec): backend chưa có API liệt kê người dùng.
- Xem PDF nhúng: API tệp đính kèm chỉ trả `assetId` + trạng thái, chưa có URL tải.
