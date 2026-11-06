# Sổ tay vận hành QLCV

Trạng thái: hướng dẫn và công cụ ban đầu cho môi trường phát triển cục bộ.
Tài liệu này không xác nhận production-ready; production deployment, lưu backup
ngoài máy chủ chính, backup kho tệp, giám sát độc lập và diễn tập rollback còn mở.

## Trạng thái dịch vụ

- `GET /health/live`: kiểm tra tiến trình API.
- `GET /health`: kiểm tra API, PostgreSQL, Redis và bucket S3.
- `GET /health/operations`: worker nhắc việc còn heartbeat mới và độ sâu hàng
  đợi. Endpoint yêu cầu `Authorization: Bearer <OPS_MONITOR_TOKEN>`.
- Worker gửi heartbeat mỗi 30 giây; heartbeat hết hạn sau 90 giây khi worker
  dừng. Hạn mức hàng đợi cảnh báo mặc định là 500 mục đang chờ hoặc trì hoãn.

### Cảnh báo worker

1. Tạo `OPS_MONITOR_TOKEN` ngẫu nhiên dài tối thiểu 32 ký tự và đặt cùng token
   trong API và môi trường monitor. Không lưu giá trị thật trong Git.
2. Đặt `OPS_ALERT_EMAIL`, `OPS_API_URL`, `REDIS_URL` và cấu hình SMTP trên máy
   giám sát độc lập với API/worker.
3. Chạy `pnpm --filter @qlcv/api run ops:monitor` theo lịch mỗi phút bằng
   Task Scheduler, cron hoặc dịch vụ giám sát được phê duyệt.
4. Script gửi email lần đầu khi API không truy cập được, worker stale hoặc hàng
   đợi vượt ngưỡng; giới hạn lặp cùng loại cảnh báo trong 30 phút và gửi email
   phục hồi khi trạng thái bình thường.
5. Diễn tập trong staging: dừng worker, đợi ít nhất 90 giây, kiểm tra thư cảnh
   báo đến đúng người trực; bật worker lại và xác nhận thư phục hồi.

Monitor cần SMTP và Redis hoạt động để gửi/giới hạn cảnh báo. Nên có thêm cảnh
báo độc lập của nền tảng lưu trữ/monitor để phát hiện trường hợp chính các dịch
vụ này bị gián đoạn.

## Backup PostgreSQL và kiểm tra khôi phục

### Tạo backup mã hóa

`QLCV_BACKUP_PASSPHRASE` phải là bí mật ngẫu nhiên tối thiểu 32 ký tự, phân phối
qua secret manager; không dùng giá trị mẫu, không đặt trong lệnh shell lưu vào
history, log hoặc `.env` đã commit. Cấp bí mật trực tiếp cho tiến trình từ kho
bí mật đã phê duyệt. Chọn đích backup trên ổ đĩa được kiểm soát, ngoài thư mục
repo.

Tạo backup (đường dẫn dưới đây chỉ là ví dụ; cần chọn nơi lưu trữ phù hợp):

```powershell
pnpm --filter @qlcv/api run db:backup -- C:\qlcv-backups\qlcv-2026-11-06.qlcv
```

Backup là PostgreSQL custom dump được mã hóa AES-256-GCM; cạnh file có manifest
SHA-256 để phát hiện hỏng file. Khóa được dẫn xuất bằng scrypt. Bản backup hiện
được tạo từ PostgreSQL service trong `infra/docker-compose.yml`; cần tích hợp
riêng cho môi trường production.

### Khôi phục thử vào database cô lập

```powershell
pnpm --filter @qlcv/api run db:backup:verify -- C:\qlcv-backups\qlcv-2026-11-06.qlcv
```

Lệnh tạo database tạm có tiền tố `qlcv_restore_verify_`, giải mã và khôi phục,
kiểm tra bảng cùng lịch sử migration, rồi chỉ xóa database tạm do chính lệnh
này tạo. Không dùng chức năng này để ghi đè database thật. Chạy hàng tuần trên
staging và lưu log kết quả, thời lượng, số bảng/migration cùng người xác nhận.

### Khôi phục thảm họa

Chưa thực hiện trên production. Trước khi khôi phục thật: tuyên bố sự cố, dừng
ghi dữ liệu, xác nhận chủ sở hữu và database đích, lưu snapshot hiện trạng,
kiểm tra passphrase và backup độc lập, khôi phục vào môi trường cô lập, xác minh
toàn vẹn PostgreSQL và kho tệp, rồi mới xin phê duyệt chuyển dịch vụ. Không
khôi phục đè production bằng thao tác tự động.

Backup hiện chưa sao chép bucket S3/RustFS sang kho độc lập, chưa mã hóa và luân
chuyển bản sao ngoài máy chủ, và không cung cấp PITR/WAL archive. Vì vậy chưa
đủ bằng chứng phục hồi toàn bộ dữ liệu/tệp hoặc cam kết RPO.

## Triển khai, rollback và ứng phó sự cố

Chưa có Dockerfile phát hành cho API/web/worker, reverse proxy HTTPS, pipeline
CI/CD hoặc phiên bản triển khai có thể rollback. Không chạy `infra:reset` trên
môi trường có dữ liệu: lệnh đó xóa volumes cục bộ.

RTO/RPO, người trực, ngưỡng cảnh báo, thời hạn lưu dữ liệu/tệp, nơi lưu backup
off-site và quy trình phê duyệt cần được công ty quyết định trước production.
Khuyến nghị khởi điểm để thảo luận (chưa được phê duyệt): RTO 4 giờ, RPO 24 giờ,
backup mã hóa hằng ngày, giữ 30 bản ngày và kiểm tra restore hằng tuần.
