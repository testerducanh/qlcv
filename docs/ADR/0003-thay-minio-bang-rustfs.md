# ADR 0003: Thay MinIO bằng RustFS cho kho tệp khi phát triển

Ngày: 31/10/2026 · Trạng thái: Đã chấp nhận

MinIO đã xóa ảnh Docker (minio/minio, minio/mc) khỏi Docker Hub và quay.io từ tháng 9/2026, nên Docker Compose dev không còn chạy được.

Quyết định: dùng RustFS (Apache 2.0, tương thích S3, cổng 9000 và 9001 như MinIO) cho môi trường dev. Mã nguồn không đổi vì chỉ dùng chuẩn S3 (presigned URL).

Hệ quả: ghim phiên bản ảnh (rustfs/rustfs:1.0.0). Môi trường thật chưa chọn: có thể dùng S3 của nhà cung cấp cloud, hoặc RustFS, Garage, SeaweedFS tự dựng. Quyết định khi tới P4.7.