# qlcv — Hệ thống quản lý công việc và dự án

Monorepo cho ứng dụng quản lý công việc – dự án dùng cho doanh nghiệp nhiều chi nhánh: người dùng tự tạo dự án, nhóm việc, việc, việc con, checklist, đính kèm ảnh và tệp, giao việc và theo dõi tiến độ.

Tài liệu gốc nằm trong [`docs/`](docs/):

| File                                           | Nội dung                                                                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`docs/phan-tich-v2.md`](docs/phan-tich-v2.md) | Phân tích nghiệp vụ v2.0: mô hình dữ liệu, chức năng lõi, phân quyền, phê duyệt, KPI, lộ trình |
| [`docs/design-spec.md`](docs/design-spec.md)   | Bộ prompt thi công theo từng giai đoạn (P0.1 → P5.x)                                           |
| [`docs/i-guidelines.md`](docs/i-guidelines.md) | Hướng dẫn giao diện: token, trạng thái component, trợ năng, chuẩn nội dung                     |
| [`docs/ADR/`](docs/ADR/)                       | Các quyết định kiến trúc đã chốt                                                               |

## Yêu cầu môi trường

- **Node.js 24** trở lên (đã kiểm tra với Node 26)
- **pnpm 12** (repo ghim trong `packageManager`; chạy `corepack enable` nếu chưa có pnpm)
- **Docker Desktop** cho hạ tầng dev (PostgreSQL, Redis, kho tệp S3, Mailpit)

## Chạy từ đầu trong 10 phút

```bash
# 1. Cài phụ thuộc (có hook husky + commitlint)
pnpm install

# 2. Tạo file môi trường (giá trị mặc định đã dùng được cho máy dev)
cp .env.example .env

# 3. Dựng hạ tầng: postgres:16, redis:7, RustFS (S3), Mailpit
pnpm infra:up

# 4. Tạo schema và dữ liệu khởi tạo cho database
pnpm db:migrate

# 5. Chạy API (cổng 3000)
pnpm dev
```

Giao diện web chạy ở một terminal khác:

```bash
pnpm --filter @qlcv/web dev   # http://localhost:5173
```

Kiểm tra API và hạ tầng:

```bash
curl http://localhost:3000/health/live   # {"status":"ok"} — chỉ báo tiến trình sống
curl http://localhost:3000/health        # db, redis, s3 — trả 503 nếu có dịch vụ lỗi
```

### Cổng dịch vụ (đổi được trong `.env`)

| Dịch vụ     | Cổng        | Ghi chú                           |
| ----------- | ----------- | --------------------------------- |
| API         | 3000        | NestJS                            |
| Web         | 5173        | Vite                              |
| PostgreSQL  | 5433        | Ánh xạ ra ngoài, tránh trùng 5432 |
| Redis       | 6379        | Cache và hàng đợi                 |
| RustFS (S3) | 9000 / 9001 | API S3 và giao diện quản trị      |
| Mailpit     | 8025 / 1025 | Xem email dev và cổng SMTP        |

Kho tệp dùng **RustFS** thay cho MinIO (MinIO đã gỡ ảnh Docker khỏi Docker Hub từ 9/2026 — xem [ADR 0003](docs/ADR/0003-thay-minio-bang-rustfs.md)). Code chỉ dùng chuẩn S3 nên không phụ thuộc nhà cung cấp.

## Lệnh thường dùng

| Lệnh                           | Việc nó làm                                        |
| ------------------------------ | -------------------------------------------------- |
| `pnpm dev`                     | Chạy API ở chế độ watch                            |
| `pnpm --filter @qlcv/web dev`  | Chạy web (Vite)                                    |
| `pnpm build`                   | Build mọi package                                  |
| `pnpm lint`                    | ESLint toàn bộ                                     |
| `pnpm typecheck`               | `tsc --noEmit` toàn bộ                             |
| `pnpm test`                    | Unit test (Jest cho API, Vitest cho web)           |
| `pnpm test:db`                 | Test ràng buộc database thật (cần `pnpm infra:up`) |
| `pnpm format`                  | Prettier ghi lại toàn bộ                           |
| `pnpm infra:up` / `infra:down` | Dựng / tắt hạ tầng dev                             |
| `pnpm infra:reset`             | Xóa volume và dựng lại hạ tầng                     |
| `pnpm db:migrate` / `db:reset` | Áp dụng migration / tạo lại database từ đầu        |

## Cấu trúc

```
apps/
  api/            NestJS (modular monolith), Prisma, PostgreSQL, Redis, S3
    prisma/       schema.prisma và migration (gồm trigger, CHECK, index đặc biệt)
  web/            React 18 + Vite + Tailwind 4 đọc từ design token
    src/design/   tokens.json — nguồn sự thật duy nhất về màu, chữ, khoảng cách
    src/components/  Thư viện component nền (Radix UI)
    src/dev/      Trang /dev/components (chỉ môi trường dev)
packages/
  shared/         Kiểu và hàm dùng chung
  api-client/     Client sinh từ OpenAPI (để trống, làm ở P1.8)
services/
  ai/             Dịch vụ đọc Excel/PDF (Python, từ giai đoạn 3)
infra/            docker-compose.yml cho môi trường dev
docs/             Tài liệu phân tích, thi công, giao diện, ADR
```

## Xem thư viện component

Ở môi trường dev, mở <http://localhost:5173/dev/components> để xem mọi component ở mọi trạng thái, kèm nút chuyển sang bề rộng điện thoại (375 px).

Quy ước giao diện: **không** dùng mã màu hay số px thô trong `src`; chỉ dùng token. ESLint (`qlcv/no-raw-design-values`) chặn vi phạm này.

## Quy ước mã nguồn

- Tên bảng, cột, biến, endpoint bằng tiếng Anh; nhãn giao diện và thông báo lỗi bằng tiếng Việt, đặt trong `apps/web/src/i18n/vi.ts`, không viết cứng trong component.
- Giờ lưu UTC, hiển thị theo `Asia/Bangkok`; ngày dạng `dd/MM/yyyy`.
- Id dạng UUID. Xóa mềm (`deletedAt`) cho dự án, việc, tệp; thùng rác giữ 30 ngày.
- Commit theo conventional commits (commitlint chặn commit sai quy ước); pre-commit chạy lint-staged + Prettier.
- Không commit `.env` hay bí mật. `.env.example` chỉ chứa giá trị giả dùng cho dev.

## Kiểm thử

- `pnpm test` — test đơn vị và component; không cần database.
- `pnpm test:db` — test ràng buộc schema trên PostgreSQL thật (trigger cây việc, bất biến nhật ký, index duy nhất). Mỗi test chạy trong transaction và luôn rollback.
- Test giao diện gồm axe-core (trợ năng), kiểm tra bàn phím và test tương phản token.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) chạy trên mọi pull request và trên `main`: cài phụ thuộc, lint, typecheck, test, build.

## Xử lý sự cố

| Hiện tượng                                                  | Cách xử lý                                                                       |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| API không khởi động, báo "Cấu hình môi trường không hợp lệ" | Thiếu biến trong `.env`; đối chiếu `.env.example`.                               |
| `/health` báo `degraded`                                    | Một dịch vụ chưa lên: kiểm tra `docker compose -f infra/docker-compose.yml ps`.  |
| Cổng bị trùng                                               | Sửa cổng trong `.env` (ví dụ `POSTGRES_PORT=5434`) rồi chạy `pnpm infra:up` lại. |
| Prisma client chưa có                                       | `pnpm --filter @qlcv/api db:generate`.                                           |
| Migration lỗi giữa đường                                    | `pnpm db:reset` (xóa dữ liệu dev) rồi `pnpm db:migrate`.                         |
