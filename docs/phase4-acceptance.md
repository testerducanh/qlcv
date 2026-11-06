# Giai đoạn 4 – Kế hoạch nghiệm thu và UAT

## Trạng thái

Đây là kế hoạch và sổ ghi nhận UAT, không phải biên bản nghiệm thu cuối cùng.
Chưa có bằng chứng UAT 2–4 tuần tại ít nhất hai chi nhánh hoặc chữ ký của lãnh
đạo; do đó chưa thể kết luận giai đoạn 4 sẵn sàng go-live.

| Phạm vi              | Trạng thái         | Bằng chứng hiện có                                                                                                                              |
| -------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| P4.1 Dashboard/KPI   | Đã kiểm tra cục bộ | DB test, UI test, benchmark 100.000 việc trong `kpi-definitions.md`                                                                             |
| P4.2 Cổng khách      | Đã kiểm tra cục bộ | Unit, DB, UI tests; chưa có UAT khách hàng ngoài                                                                                                |
| P4.3 Tìm kiếm        | Một phần           | Benchmark tối ưu đến 100.000 việc; chưa đủ 500.000 việc/2 triệu nhận xét và chưa có quyết định OpenSearch                                       |
| P4.4 API/webhook     | Một phần           | API key theo dự án và test read-only; webhook, UI quản trị và các API còn lại chưa xong                                                         |
| P4.5 SSO/2FA/audit   | Chưa nghiệm thu    | Chưa chọn IdP; chưa có test đăng nhập SSO hoặc kiểm tra sửa nhật ký                                                                             |
| P4.6 Thông báo ngoài | Đã kiểm tra cục bộ | Mailpit xác nhận email và deep link; test dự án mật không lộ tiêu đề; retry, hạn mức và Zalo/SMS mock đã chạy                                   |
| P4.7 Vận hành        | Một phần           | Backup mã hóa đã restore-test cục bộ: 45 bảng, 22 migration; chưa xác minh kho tệp/off-site, cảnh báo worker thật, production rollback hoặc tải |

## Đối tượng và kịch bản UAT

Thực hiện trong môi trường staging đã nạp dữ liệu giả lập, có ít nhất hai chi
nhánh và không dùng dữ liệu cá nhân thật nếu chưa được phê duyệt.

| Vai trò            | Kịch bản tối thiểu                                               | Kết quả mong đợi                                                   |
| ------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| Lãnh đạo           | Xem KPI toàn tổ chức, lọc chi nhánh/phòng, mở danh sách chi tiết | Chỉ thấy phạm vi được cấp; bảng thay thế biểu đồ chứa cùng số liệu |
| Giám đốc chi nhánh | Lọc dashboard, mở việc quá hạn trong chi nhánh                   | Không thấy dữ liệu chi nhánh khác                                  |
| Trưởng phòng       | Xem tải phòng và thử lọc sang phòng khác                         | Bộ lọc vượt quyền bị từ chối, không lộ KPI cá nhân phòng khác      |
| Chủ dự án          | Mời khách, giới hạn việc/tệp, thu hồi quyền                      | Khách chỉ truy cập mục được chia sẻ; thu hồi có hiệu lực           |
| Nhân viên          | Dùng API key chỉ đọc, thử tạo việc                               | Đọc được việc trong phạm vi; thao tác ghi bị từ chối               |
| Khách ngoài        | Mở cổng trên điện thoại, tải tệp được chia sẻ và nộp kết quả     | Không truy cập ID ngoài whitelist; nội dung nộp giữ dấu thời gian  |

SSO, 2FA, webhook và thông báo ngoài chỉ đưa vào UAT sau khi các luồng tương ứng
được triển khai và cấu hình staging.

## Nhật ký buổi UAT

Tạo một bản ghi cho mỗi buổi; lặp lại theo tuần trong 2–4 tuần tại ít nhất hai
chi nhánh.

| Ngày/tuần      | Chi nhánh | Vai trò | Kịch bản | Kết quả (đạt/lỗi/chặn) | Mã lỗi/góp ý | Bằng chứng | Người xác nhận |
| -------------- | --------- | ------- | -------- | ---------------------- | ------------ | ---------- | -------------- |
| Chưa thực hiện | —         | —       | —        | —                      | —            | —          | —              |

### Mẫu ghi nhận lỗi/góp ý

- Mã:
- Ngày, chi nhánh, vai trò:
- Môi trường và trình duyệt/thiết bị:
- Các bước tái hiện:
- Kết quả mong đợi:
- Kết quả thực tế:
- Mức độ ảnh hưởng:
- Ảnh/video/log đã loại bỏ dữ liệu nhạy cảm:
- Trạng thái xử lý và người xác nhận:

## Điều kiện kết thúc UAT

- [ ] Đã chạy đủ 2–4 tuần tại ít nhất hai chi nhánh.
- [ ] Mọi lỗi nghiêm trọng/cao đã được xử lý và kiểm thử lại; lỗi còn lại có người
      chấp nhận rủi ro bằng văn bản.
- [ ] Đại diện từng vai trò ký xác nhận kịch bản thuộc phạm vi của mình.
- [ ] Lãnh đạo phê duyệt các tham số leo thang, hạn mức tệp, chính sách lưu dữ
      liệu và việc hiển thị chỉ số cá nhân.
- [ ] Các cổng bảo mật, backup/restore và rollback trong
      `go-live-checklist.md` đã đạt.
