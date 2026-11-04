# ADR 0001: Chọn bộ công nghệ cho qlcv

Ngày: 30/10/2026 · Trạng thái: Đã chấp nhận

## Bối cảnh

Sản phẩm là hệ thống quản lý công việc – dự án cho doanh nghiệp nhiều chi nhánh. Yêu cầu chính: chạy tốt trên điện thoại ở hiện trường, nhập việc nhanh, dữ liệu tập trung trên máy chủ, phân quyền theo phạm vi, đính kèm nhiều ảnh và tệp, có lộ trình mở rộng dần (xem `docs/phan-tich-v2.md` mục 11 và 13).

Đội phát triển nhỏ, cần ra MVP trong 2–3 tháng và giữ một ngôn ngữ xuyên suốt để giảm chi phí chuyển đổi ngữ cảnh.

## Quyết định

| Lớp | Chọn | Lý do |
| --- | --- | --- |
| Ngôn ngữ | TypeScript strict cho cả hai đầu | Dùng chung kiểu dữ liệu giữa web và API; `strict` bắt lỗi sớm ở mô hình việc nhiều cấp và trạng thái. |
| Tổ chức mã | Monorepo pnpm workspaces: `apps/web`, `apps/api`, `packages/shared`, `packages/api-client`, `services/ai` | Một lần cài, một pipeline; tách được gói dùng chung mà không cần publish. |
| Giao diện | React 18 + Vite | Hệ sinh thái thư viện Kanban/Gantt/kéo thả dồi dào; Vite khởi động nhanh, cấu hình gọn. |
| Kiểu dáng | Tailwind CSS 4 sinh theme từ `tokens.json` | Một nguồn sự thật cho màu, chữ, khoảng cách; đổi token là đổi toàn hệ thống. |
| Component | Radix UI primitives | Hành vi bàn phím và trợ năng phức tạp (Dialog, Menu, Combobox…) đã được làm đúng; chỉ cần phần trình bày. |
| API | NestJS, modular monolith | Chia module theo nghiệp vụ (Dự án, Việc, Tệp, Thông báo, Phân quyền, Duyệt); tách dịch vụ sau mà không đổi mô hình. |
| Truy cập dữ liệu | Prisma + SQL thô khi cần | Prisma cho phần CRUD an toàn kiểu; phần cây việc đệ quy và ràng buộc phức tạp viết SQL/migration tay. |
| Cơ sở dữ liệu | PostgreSQL 16 | Truy vấn đệ quy cho việc con, JSONB có GIN cho trường tùy chỉnh, tìm kiếm toàn văn; sẵn PostGIS khi làm bản đồ GPMB. |
| Cache, hàng đợi | Redis 7 | Cache, giới hạn tần suất; hàng đợi thông báo và leo thang từ giai đoạn 2. |
| Tệp, ảnh | Object storage tương thích S3, tải bằng presigned URL | Ảnh hiện trường tăng nhanh nên không lưu trong CSDL; nội dung tệp không đi qua API. |
| Kiểm thử | Jest + supertest (API), Vitest + Testing Library (web), axe-core (trợ năng), Jest DB cho ràng buộc schema | Mỗi lớp có công cụ phù hợp; test ràng buộc DB chạy trên PostgreSQL thật trong transaction rollback. |
| Hạ tầng dev | Docker Compose | Một lệnh dựng đủ PostgreSQL, Redis, kho S3, Mailpit. |

## Hệ quả

- Một ngôn ngữ và một pipeline giúp đội nhỏ đi nhanh; đổi lại, backend không có lợi thế hiệu năng của ngôn ngữ biên dịch — chấp nhận được ở quy mô vài nghìn người dùng.
- PWA trước, chỉ bọc ứng dụng (Capacitor/React Native) khi thật cần thông báo đẩy ổn định.
- Kho tệp chỉ dùng chuẩn S3, nên nhà cung cấp là chi tiết triển khai: RustFS khi dev (xem [ADR 0003](0003-thay-minio-bang-rustfs.md)), S3 cloud hoặc RustFS/Garage/SeaweedFS tự dựng khi chạy thật.
- Chưa chốt: đơn vị triển khai (máy chủ riêng hay cloud), SSO và 2FA thuộc giai đoạn 4, dịch vụ AI thuộc giai đoạn 3 (`services/ai`).
