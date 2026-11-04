# ADR 0002: Một bảng task, chỉ mục phân số và truy vấn đệ quy

Ngày: 04/11/2026 · Trạng thái: Đã chấp nhận

## Bối cảnh

Cây công việc gồm Nhóm việc, Việc, Mốc lồng nhau tối đa 5 cấp (`docs/design-spec.md`, P1.1). Anh em trong cùng một cha sắp lại thứ tự thường xuyên (kéo thả, nhập nhanh); đọc cây con phải giữ đúng thứ tự anh em. Có nhiều cách mô hình hóa: ba bảng riêng cho từng loại, số thứ tự nguyên phải đánh lại khi chèn, extension `ltree` lưu cả đường dẫn. Mỗi cách phải cân lại chi phí đọc, ghi và nguy cơ lệch dữ liệu.

## Quyết định

Ba quyết định ràng buộc với nhau:

1. **Một bảng `task` cho cả Nhóm việc, Việc, Mốc** (cột `type`).
   Ba loại chỉ khác ý nghĩa nghiệp vụ nhẹ, còn cấu trúc cây hoàn toàn giống nhau: cùng `parent_id`, `position`, `depth`; cùng trigger tính độ sâu, chặn chu trình, kéo dự án xuống cây con; cùng quy tắc duy nhất theo anh em (migration `20261103075643_init`). Tách ba bảng phải viết ràng buộc ba lần và mỗi truy vấn cây phải `UNION` cả ba. Một số cột (`start_date`, `duration_days`, `completed_at`) sẽ trống trên nhóm/mốc, chưa đáng tách bảng.
2. **`position` là chuỗi chỉ mục phân số, so theo byte (`COLLATE "C"`).**
   Chèn một việc giữa hai việc bất kỳ chỉ viết khóa nằm giữa (ví dụ giữa `a0` và `a1` là `a05`) — tức một dòng; dùng số nguyên phải cập nhật cả dãy anh em mỗi lần chèn. Kéo thả một cây con xong chỉ đổi khóa của gốc, không quét lại cả cành. `COLLATE "C"` để thứ tự so sánh theo byte, không phụ thuộc locale cài trên máy (dev hay sản xuất khác locale vẫn đồng nhất; xem test "thứ tự so sánh theo byte" trong `apps/api/src/db/schema.db-spec.ts`). Đổi lại: khóa dài dần nếu chèn liên tiếp nhiều lần tại cùng một điểm; ứng dụng sẽ sinh khóa theo quy ước dùng chung (nằm ở `packages/shared` từ P1.11) và cần compaction khi quá dài.
3. **Đọc cây bằng `WITH RECURSIVE`, không dùng `ltree`.**
   `parent_id` là nguồn sự thật duy nhất. Thêm cột `ltree` thì mỗi lần kéo thả hay đổi cha phải đồng bộ đường dẫn — thêm một nguồn dữ liệu để chăm và dễ lệch. Quy mô mục tiêu là 500 việc (mượt), 2.000 việc (chấp nhận được, có ảo hóa), nên CTE đệ quy với index `(parent_id, position)` là đủ. ltree chỉ tiện cho thứ tự theo đường dẫn từ điển, không phải thứ tự theo `position` mà yêu cầu đặt cần.

## Hệ quả

- Trigger `qlcv_task_before_write` / `qlcv_task_after_move` là nơi duy nhất tính `depth`, kiểm tra cùng dự án, chặn chu trình, và cập nhật `project_id` xuống cây con khi đổi cha; test ràng buộc nằm ở `apps/api/src/db/schema.db-spec.ts`.
- Ứng dụng chịu trách nhiệm sinh khóa `position` hợp lệ bằng một module dùng chung duy nhất, có test riêng; chi tiết sinh khóa chốt khi tới P1.11.
- Nếu sau này cần đọc cây với tần suất cao (Timeline với 2.000+ việc) mà CTE đệ quy chậm, lựa chọn kế tiếp là bảng closure tự lưu, trước khi cân nhắc `ltree`.
