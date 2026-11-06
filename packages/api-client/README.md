# @qlcv/api-client

Kiểu TypeScript được sinh từ OpenAPI của API bằng `openapi-typescript`.

## Sinh lại

Từ thư mục gốc repo, chạy:

```sh
pnpm gen:api
```

Lệnh build API, dựng tài liệu OpenAPI từ metadata NestJS, rồi cập nhật:

- `openapi.json`: đặc tả API được sinh.
- `src/generated.d.ts`: kiểu cho đường dẫn, tham số, request và response.

Không sửa trực tiếp `src/generated.d.ts`. CI sinh lại client và kiểm tra diff để phát hiện đặc tả bị lệch.
