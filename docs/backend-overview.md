# Tổng quan backend

## Kiến trúc

API là NestJS modular monolith, Prisma truy cập PostgreSQL, Redis phục vụ giới hạn đăng nhập và sự kiện nội bộ, S3-compatible storage giữ tệp.

| Module        | Trách nhiệm                                                   |
| ------------- | ------------------------------------------------------------- |
| `auth`        | Đăng nhập, refresh token, đổi/đặt lại mật khẩu, guard JWT     |
| `permissions` | Ma trận quyền theo vai trò và phạm vi; `@RequirePermission`   |
| `management`  | Chi nhánh, phòng ban, người dùng, dự án và thành viên         |
| `tasks`       | Cây việc, checklist, nhãn, phụ thuộc, cập nhật hàng loạt      |
| `attachments` | Upload staging, kiểm tra nội dung, phiên bản và thùng rác tệp |
| `p16`         | Nhận xét, mention, thông báo, activity và thùng rác           |
| `my-work`     | Việc của tôi, tìm kiếm và saved views                         |
| `infra`       | Prisma, Redis, S3 và cấu hình dùng chung                      |

## Luồng request

1. Nest định tuyến request và chạy `AuthGuard`; route theo dự án tiếp tục kiểm tra tài nguyên bằng guard tương ứng.
2. Controller kiểm tra đầu vào bằng Zod và chuyển actor đã xác thực cho service.
3. Service kiểm tra phạm vi/tài nguyên và quyền cụ thể. Không trả nội dung tài nguyên mật cho người ngoài phạm vi; dùng 404 khi cần che sự tồn tại.
4. Thay đổi nhiều bảng và activity log được ghi trong transaction. Các side effect như thông báo phát qua `InternalEventsModule` hoặc được ghi cùng transaction.
5. `ApiExceptionFilter` chuẩn hóa lỗi; logger ghi request và lỗi phía server.

## Tài liệu API và client kiểu

- Swagger UI: `GET /docs`; đặc tả: `GET /openapi.json`.
- `pnpm gen:api` build API rồi sinh `packages/api-client/openapi.json` và `packages/api-client/src/generated.d.ts` từ metadata OpenAPI bằng `openapi-typescript`.
- CI chạy lại sinh mã và yêu cầu hai file trên không thay đổi; nếu API đổi, chạy `pnpm gen:api` và commit các kết quả được sinh.
- Endpoint chính có tóm tắt tiếng Việt trong Swagger. OpenAPI đánh dấu security cho route cần access token; route công khai được giới hạn ở sức khỏe, các bước auth công khai và chấp nhận lời mời bằng token.
- `GET /branches/available` chỉ trả các chi nhánh đang hoạt động trong tổ chức và phạm vi tạo dự án của actor; `GET /projects/:id/available-members` chỉ trả tài khoản đang hoạt động ở cùng chi nhánh, chưa thuộc dự án và chỉ cho quản lý dự án.

## Thêm endpoint

1. Chọn module sở hữu chức năng; khai báo controller trong module và import module tại `apps/api/src/app.module.ts`.
2. Dùng `AuthGuard` cho route cần đăng nhập; dùng `@RequirePermission` cho hành động theo quyền và kiểm tra quyền trên tài nguyên trong service. Không dựa riêng vào việc ẩn nút ở frontend.
3. Định nghĩa schema Zod giới hạn kích thước, enum, UUID và ngày; không nhận đối tượng Prisma tùy ý từ client.
4. Ghi thay đổi liên quan cùng activity log trong transaction. Với tệp, dùng luồng staging và xác minh nội dung, không dùng URL không giới hạn.
5. Thêm `@ApiOperation` tiếng Việt và mô tả request/response cho API chính. Thêm unit/DB/e2e test phù hợp.
6. Chạy `pnpm gen:api`, kiểm tra generated diff, rồi chạy lint, typecheck, test và build.

## Kiểm thử và dữ liệu dev

- `pnpm test`: unit test; không cần dịch vụ ngoài.
- `pnpm test:db`: test PostgreSQL thật; cần migration và DB cục bộ.
- `pnpm test:e2e`: chạy lại seed demo rồi kiểm thử HTTP qua PostgreSQL, Redis và S3; cần `pnpm infra:up`, `pnpm db:migrate` và `.env` dev. Không chạy lệnh này với cấu hình hoặc dữ liệu production.
- `pnpm seed`: tạo/cập nhật dữ liệu demo giả. Script từ chối `NODE_ENV=production`; mọi tài khoản dùng chung mật khẩu dev được ghi trong README.

## Cấu hình bảo vệ

- Access token yêu cầu secret riêng trong production; refresh token chỉ lưu bản băm và được xoay vòng.
- Auth rate limit dùng Redis; JSON và form body có giới hạn theo `BODY_LIMIT`.
- CORS lấy danh sách origin từ `CORS_ORIGINS` và bật credentials; chỉ cấu hình origin tin cậy, không dùng wildcard.
- Upload kiểm tra quyền, MIME/signature, kích thước, quota và thời hạn presigned URL.
- Test e2e rà soát metadata security của mọi thao tác OpenAPI; ngoại lệ công khai được liệt kê tường minh trong test. Đây là kiểm tra độ phủ metadata, không thay thế review quyền trên service.

## Việc để sau và nợ kỹ thuật

Các mục dưới đây đã được người dùng chấp nhận hoãn cho dev/staging (2026-11-05), không được xem là chấp nhận cho production:

| Mức  | Việc còn lại                                                                       | Rủi ro / điều kiện đóng                                                                                                                                       |
| ---- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cao  | `NoopVirusScanner` hiện là implementation được inject cho pipeline tệp.            | Tệp chỉ được kiểm tra loại/nội dung, chưa quét mã độc. Thay bằng scanner được vận hành thực tế và kiểm thử fail-closed trước khi cho phép dữ liệu production. |
| Vừa  | HTTP e2e cần PostgreSQL, Redis và S3-compatible storage, nhưng chưa chạy trong CI. | Lỗi tích hợp có thể lọt khỏi CI; bổ sung service/test job hoặc ghi nhận quy trình nghiệm thu tương đương.                                                     |
| Vừa  | Một số operation OpenAPI chưa mô tả đầy đủ request/response/query.                 | Client sinh tự động chưa có kiểu chính xác cho mọi route; bổ sung metadata DTO/schema và kiểm tra drift.                                                      |
| Vừa  | Chưa nghiệm thu hiển thị ảnh từ thiết bị iOS/Android thực tế.                      | Pipeline đọc metadata hướng ảnh, nhưng cần bộ ảnh đại diện thiết bị và xác nhận UX trước khi coi upload ảnh di động hoàn tất.                                 |
| Thấp | Benchmark 2.000 việc phụ thuộc máy và trạng thái dịch vụ local.                    | Giữ ngưỡng theo test có kiểm soát; đo lại với dữ liệu/phần cứng đại diện production trước khi đặt cam kết SLO.                                                |
| Cổng | Một số checklist thủ công P1.1/P1.3/P1.5/P1.6 và review độc lập còn mở.            | Không đánh dấu cổng 1A hoàn tất cho đến khi các mục đó được kiểm tra và review độc lập hoàn tất.                                                              |

Trong lượt rà soát mã hiện tại, đã kiểm tra `PermissionsGuard`, `TaskResourceGuard` và các luồng tra cứu, liệt kê, tải xuống, xóa, khôi phục trong `AttachmentsService`. Các truy vấn đính kèm giới hạn theo tổ chức/dự án; trước khi trả metadata hoặc URL tải đều kiểm tra quyền xem việc, còn xóa/khôi phục kiểm tra quyền người tải hoặc quản lý. Không thấy đường truy cập trái quyền rõ ràng trong phạm vi đã đọc. Đây là rà soát trong cùng phiên, không phải đánh giá độc lập và không thay thế kiểm thử chuyên biệt hoặc kiểm thử xâm nhập.
