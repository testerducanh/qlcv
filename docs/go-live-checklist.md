# Checklist go-live

Checklist này chưa phải xác nhận triển khai. Chỉ đánh dấu sau khi có bằng chứng
thực hiện trên môi trường production-like được phê duyệt.

## Quyết định và phạm vi

- [ ] Chủ sở hữu dịch vụ, người trực vận hành và đầu mối bảo mật đã được chỉ định.
- [ ] RTO/RPO, thời hạn lưu dữ liệu, hạn mức tệp và ngưỡng cảnh báo đã được lãnh
      đạo phê duyệt.
- [ ] IdP, phương thức 2FA, chính sách tài khoản đặc quyền và quản lý bí mật đã
      được thống nhất.
- [ ] Kiểm kê dữ liệu, nhà cung cấp ngoài, phân vùng mạng và quyền truy cập đã
      được duyệt.

## Bản phát hành và bảo mật

- [ ] CI build, lint, typecheck, unit, DB và e2e trên commit phát hành đều đạt.
- [ ] Secret scan và rà soát bảo mật độc lập đã hoàn tất; không còn phát hiện
      mức cao chưa xử lý/được chấp nhận rủi ro.
- [ ] API công khai có TLS, giới hạn tần suất, xoay/thu hồi khóa và hướng dẫn xử
      lý sự cố.
- [ ] Quyền truy cập, cấu hình CORS, cookie, upload, nhật ký và chính sách lưu
      trữ đã được kiểm tra trên cấu hình production.
- [ ] Kế hoạch triển khai, kiểm tra sau triển khai và rollback đã được diễn tập.

## Sao lưu và khôi phục

- [ ] PostgreSQL có backup mã hóa, lịch chạy và lưu trữ ngoài máy chủ chính.
- [ ] Kho tệp có backup/replication phù hợp và xác minh tính toàn vẹn.
- [ ] Đã khôi phục PostgreSQL và tệp vào môi trường trống; ghi thời gian thực tế,
      dữ liệu thiếu (nếu có), RTO/RPO đạt được.
- [ ] Có kiểm tra tự động và cảnh báo khi backup thất bại hoặc không đủ dung
      lượng.

## Giám sát và vận hành

- [ ] Có dashboard và cảnh báo API lỗi, worker dừng, hàng đợi tồn đọng, dung
      lượng đĩa, chứng chỉ sắp hết hạn và backup lỗi.
- [ ] Log tập trung có giới hạn truy cập, loại bỏ secret và quy định thời hạn
      lưu.
- [ ] Đã thử tắt worker và xác minh cảnh báo đến đúng người trực.
- [ ] Có tài liệu xử lý sự cố, khôi phục thảm họa và danh sách liên hệ nhà cung
      cấp.

## Tải, UAT và phê duyệt

- [ ] Kiểm thử tải với số người dùng mục tiêu do công ty phê duyệt.
- [ ] Đã diễn tập mất kết nối từng thành phần trọng yếu và xác minh phục hồi.
- [ ] UAT 2–4 tuần tại ít nhất hai chi nhánh hoàn tất; ý kiến có trạng thái xử
      lý.
- [ ] Đại diện lãnh đạo, bảo mật, vận hành và người dùng ký phê duyệt.

## Biên bản go/no-go

- Môi trường và phiên bản:
- Ngày:
- RTO/RPO đã thử:
- Rủi ro còn mở và người chấp nhận:
- Quyết định: Chưa quyết định / Go / No-go
- Người phê duyệt:
