# Hướng dẫn rà soát và chỉnh sửa mẫu

Các mẫu trong `seed/templates/` là dữ liệu khởi đầu, không phải quy trình hay biểu mẫu đã được phê duyệt. Mẫu công ty được nạp ở trạng thái nháp để đơn vị chuyên môn rà soát trước khi sử dụng.

## Chỉnh mẫu trong giao diện

1. Đăng nhập bằng tài khoản có quyền tạo và quản lý mẫu, mở **Thư viện mẫu**.
2. Chọn mẫu cần rà soát. Dùng phần **Xem trước cây việc** để kiểm tra cấu trúc trước khi sửa.
3. Với mẫu nháp do bạn sở hữu, sửa cây việc trong trình soạn thảo JSON rồi chọn **Lưu thành phiên bản mới**. Hệ thống giữ phiên bản cũ; dự án đã nạp trước đó không bị thay đổi.
4. Chỉ đưa nội dung chung, không có tên người, ngày thực tế, dữ liệu dự án hoặc tệp thật. Dùng `role` để biểu thị vai trò, checklist để mô tả điều kiện cần rà soát và `startOffsetWorkdays` / `dueOffsetWorkdays` cho mốc tương đối.
5. Ghi rõ các bước, biểu mẫu, căn cứ và thời hạn pháp lý cần đơn vị có thẩm quyền điền hoặc xác nhận. Không tự suy diễn nội dung pháp lý.
6. Gửi mẫu cấp tổ chức qua luồng duyệt `template_publish`. Chỉ mẫu đã được công bố mới hiển thị cho người dùng khác và được dùng như mẫu dùng chung.

## Cấu trúc nội dung

Mỗi phiên bản có dạng JSON với khóa `tasks`. Mỗi nút có `title`, `type` (`group`, `task` hoặc `milestone`), `checklist` và `children`. Chỉ `group` được chứa nút con. Các trường thời lượng và ngày trong mẫu là độ lệch theo ngày làm việc, không phải ngày lịch cố định.

Ví dụ tối thiểu:

```json
{
  "tasks": [
    {
      "title": "Giai đoạn cần rà soát",
      "type": "group",
      "checklist": [],
      "children": [
        {
          "title": "Xác nhận đầu vào",
          "type": "task",
          "role": "Đầu mối",
          "checklist": ["Đơn vị phụ trách xác nhận nội dung"],
          "children": []
        }
      ]
    }
  ]
}
```

Sau khi nạp, việc trở thành dữ liệu độc lập trong dự án. Bản hiện tại chỉ thêm cây việc và checklist; chưa có thao tác hoàn tác, thay thế cây việc, ánh xạ nhãn/tệp hay quy trình lưu dự án hiện có thành mẫu. Hãy thử trên dự án kiểm thử và xác minh nội dung trước khi sử dụng trong công việc thật.

## Rà soát trước công bố

- Đơn vị nghiệp vụ rà soát phạm vi, thứ tự và vai trò.
- Pháp chế điền hoặc xác nhận căn cứ, biểu mẫu và thời hạn nếu cần.
- Thử nạp vào dự án thử có lịch ngày làm việc và ngày nghỉ tương tự dự án dự kiến.
- Kiểm tra đầu ra sau khi nạp; ghi nhận người rà soát và phiên bản được chấp thuận.
