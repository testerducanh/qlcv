# P4.3 – Đo và tối ưu PostgreSQL full-text search

## Kết quả

Đo trên PostgreSQL cục bộ (`qlcv`, `localhost:5433`) với 10.000 việc khớp từ
khóa `bao cao`, trang 20 kết quả, một lượt làm nóng và 10 lượt đo. Dữ liệu thử
được tạo trong transaction và rollback sau khi hoàn tất. Bộ dữ liệu này không có
nhận xét hay tệp đính kèm; đây là phép đo truy vấn tìm kiếm việc, không đại diện
cho kịch bản 500.000 việc / 2 triệu nhận xét hoặc SLA production.

| Phiên bản    |        p50 |        p95 |                       Thay đổi |
| ------------ | ---------: | ---------: | -----------------------------: |
| Trước tối ưu | 2.283,3 ms | 4.914,8 ms |                              — |
| Sau tối ưu   |   124,7 ms |   137,5 ms | p50 giảm 94,5%; p95 giảm 97,2% |

Đo thêm sau tối ưu với 100.000 việc khớp từ khóa, cùng 10 mẫu và một lượt làm
nóng: p50 **379,3 ms**, p95 **465,2 ms**, dưới ngân sách test 30.000 ms. Phép đo
này chỉ có việc, chưa có nhận xét; không so sánh với baseline trước tối ưu.

Ngân sách p95 của phép đo 10.000 việc là 15.000 ms. Các kết quả đạt ngân sách
test trên PostgreSQL cục bộ; không xem đây là cam kết hiệu năng production.

## Thay đổi

GIN index và `search_vector` hiện có được giữ nguyên. Trước tối ưu, API tải toàn
bộ ID, điểm xếp hạng và đoạn trích của mọi kết quả về Node.js, tải tiếp toàn bộ
công việc khớp, lọc quyền rồi mới phân trang. Sau tối ưu:

- Lọc theo tổ chức và quyền xem công việc ngay trong truy vấn PostgreSQL.
- Tính tổng số kết quả, xếp hạng và phân trang trong SQL; chỉ tải chi tiết và
  tạo đoạn trích cho trang hiện tại.
- Vẫn kiểm tra quyền một lần nữa khi dựng kết quả từ các bản ghi chi tiết; kết
  quả SQL không cấp quyền thay cho bước này.

Test DB kiểm tra tìm kiếm không dấu tiếng Việt, highlight an toàn, phạm vi tổ
chức và hành vi sau khi chuyển nhận xét sang việc khác.

## OpenSearch

OpenSearch chưa được cài đặt. Với bộ dữ liệu 10.000 việc khớp và p95 đo được
137,5 ms sau tối ưu, hiện chưa có bằng chứng để gánh thêm chi phí vận hành một
search cluster. Khuyến nghị tiếp tục dùng PostgreSQL cho đến khi đo trên dữ liệu
production-like (đặc biệt là nhận xét/tệp) cho thấy p95 không đạt ngưỡng sản
phẩm đã thống nhất.

Nếu sau đó cân nhắc OpenSearch, cần tính chi phí node, RAM, dung lượng, bản sao
lưu và trực vận hành; đồng bộ qua outbox/queue có retry, idempotency, tombstone
cho xóa và tác vụ đối soát. Rủi ro chính là chỉ mục trễ hoặc sai lệch, kết quả
không nhất quán giữa hai kho, và phải áp lại quyền dự án lên mọi kết quả tìm
kiếm. Quyết định triển khai vẫn thuộc về người dùng.

## OCR

OCR chỉ được đánh giá, chưa được thêm vào sản phẩm. OCR cục bộ (ví dụ Tesseract)
cần worker CPU, gói ngôn ngữ tiếng Việt và quy trình trích xuất/cập nhật/xóa văn
bản. OCR quản lý theo trang có thể giảm vận hành nhưng tính phí theo số trang và
cần đánh giá nơi lưu dữ liệu, quyền riêng tư và yêu cầu lưu trữ. Chưa đủ dữ liệu
về số trang scan để đưa ra ước tính chi phí đáng tin cậy.

## Chạy lại benchmark

Chạy trong môi trường PostgreSQL đã migrate:

```powershell
$env:SEARCH_BENCH_TASKS='10000'
$env:SEARCH_BENCH_SAMPLES='10'
$env:SEARCH_BENCH_P95_BUDGET_MS='15000'
pnpm --filter @qlcv/api run test:db -- my-work/my-work.db-spec.ts -t "measures full-text search"
```

Có thể tăng `SEARCH_BENCH_TASKS` và `SEARCH_BENCH_SAMPLES`; thời gian đo phụ
thuộc máy, cấu hình PostgreSQL, dữ liệu và mức tải đồng thời.
