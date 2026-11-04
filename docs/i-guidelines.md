# Hướng dẫn giao diện qlcv (UI Guidelines)

Phiên bản 0.1 (bản nháp chờ duyệt) · 30/10/2026 · Kết quả của prompt P0.3

> **Nguồn.** File token trích từ xongviec.com chưa có trong dự án, nên tài liệu này dùng bộ token khởi đầu ở Phụ lục A của bộ prompt (`design-spec.md`). Mọi giá trị đề xuất nằm ở mục 8 "Giả định cần xác nhận". Chưa duyệt mục 8 thì chưa chạy P0.4.
>
> **Quy ước.** PHẢI = bắt buộc, kiểm thử được. NÊN = khuyến nghị. Phần hướng dẫn component chỉ dùng **tên token**, không dùng mã màu hay số px. Mã màu và số px chỉ xuất hiện ở mục 2 (nguồn token) và mục 8.

---

## 1. Bối cảnh và mục tiêu

- **Bề mặt:** dashboard web app cho người đã đăng nhập (không phải trang giới thiệu). Chạy trên điện thoại, máy tính bảng, máy tính; dùng ở hiện trường nên phải đọc được ngoài nắng và thao tác bằng một tay.
- **Phong cách:** có cấu trúc, dùng token, ưu tiên nội dung. Mật độ giao diện dày trên máy tính (bảng việc, cây việc), thoáng hơn trên điện thoại.
- **Người dùng:** chỉ huy trưởng, nhân viên văn phòng, quản lý, khách ngoài. Nhiều người không rành công nghệ, nên nhãn nút phải rõ nghĩa, ít thuật ngữ.
- **Mục tiêu:** nhất quán (một cách làm cho một việc), truy cập được (WCAG 2.2 AA), nhanh (nhập việc dưới 30 giây).

---

## 2. Token và nền tảng

`apps/web/src/design/tokens.json` (tạo ở P0.4) là nguồn sự thật duy nhất. Component chỉ gọi tên token. Bảng dưới là giá trị khởi đầu, đang chờ duyệt.

### 2.1 Màu

| Token | Giá trị | Dùng cho |
|---|---|---|
| `color.brand.primary` | `#112723` | Nút chính, liên kết, vòng focus, mục đang chọn |
| `color.brand.primary-hover` | `#1c3a34` | Nút chính khi rê chuột (đề xuất) |
| `color.surface.base` | `#f8fafc` | Nền trang |
| `color.surface.raised` | `#ffffff` | Thẻ, bảng, hộp thoại, ô nhập |
| `color.surface.muted` | `#eef1f5` | Nền nhóm phụ, thanh tiêu đề bảng, vùng bị vô hiệu |
| `color.text.primary` | `#0f172a` | Chữ nội dung chính (đề xuất) |
| `color.text.secondary` | `#64748b` | Chữ phụ, chú thích |
| `color.text.inverse` | `#ffffff` | Chữ trên nền thương hiệu |
| `color.border.default` | `#eef1f5` | Đường kẻ phân cách (không dùng cho viền ô nhập) |
| `color.border.strong` | `#64748b` | Viền ô nhập, nút viền, checkbox |
| `color.status.danger` | `#b91c1c` | Lỗi, quá hạn, nút xóa (đề xuất) |
| `color.status.warning` | `#b45309` | Cảnh báo, sắp đến hạn (đề xuất) |
| `color.status.success` | `#15803d` | Hoàn thành (đề xuất) |
| `color.status.info` | `#1d4ed8` | Thông tin, đang làm (đề xuất) |

Bảng tương phản phải kiểm bằng công cụ ở P0.4, không kết luận bằng mắt:

| Cặp | Ngưỡng |
|---|---|
| `text.primary`, `text.secondary` trên `surface.base`, `surface.raised`, `surface.muted` | tối thiểu 4,5:1 |
| `text.inverse` trên `brand.primary` | tối thiểu 4,5:1 |
| `border.strong` và vòng focus so với nền liền kề | tối thiểu 3:1 |
| `status.*` dùng làm chữ trên `surface.raised` | tối thiểu 4,5:1 |

### 2.2 Chữ

| Token | Giá trị | Ghi chú |
|---|---|---|
| `font.family.base` | chuỗi phông hệ thống có dấu tiếng Việt, kèm phông dự phòng | Không nhúng phông ngoài ở bản đầu |
| `font.size.xs` | 12 px | Chỉ nhãn phụ, huy hiệu, chú thích. Không dùng cho nội dung cần đọc liên tục |
| `font.size.sm` | 13 px | Bảng dày trên máy tính |
| `font.size.md` | 14 px | **Chữ nội dung mặc định**; tối thiểu cho nội dung trên điện thoại |
| `font.size.lg` | 16 px | Ô nhập trên điện thoại (tránh trình duyệt tự phóng to), tiêu đề thẻ |
| `font.size.xl` | 20 px | Tiêu đề mục |
| `font.size.2xl` | 24 px | Tiêu đề trang |
| `font.weight.regular` | 400 | Nội dung |
| `font.weight.medium` | 600 | Nhãn, nút, tiêu đề cột |
| `font.weight.bold` | 700 | Tiêu đề |
| `font.line-height.tight` | 1,25 | Tiêu đề |
| `font.line-height.base` | 1,5 | Nội dung |

### 2.3 Khoảng cách, bo góc, bóng, chuyển động

| Nhóm | Token |
|---|---|
| Khoảng cách nhỏ (viền, khe) | `space.1` đến `space.9` theo thang 1 px đến 9 px của spec gốc |
| Khoảng cách bố cục | `space.12`, `space.16`, `space.24`, `space.32`, `space.48` |
| Bo góc | `radius.sm`, `radius.md`, `radius.lg`, `radius.full` |
| Bóng | `shadow.1`, `shadow.2`, `shadow.3`, `shadow.4` (cùng gốc màu thương hiệu) |
| Chuyển động | `motion.fast`, `motion.base`, `motion.slow`; PHẢI tắt hoặc rút gọn khi hệ điều hành bật giảm chuyển động |
| Vùng chạm | `target.min-touch` (44 x 44 px), `target.min-pointer` (24 x 24 px) |
| Chế độ tối | Chưa làm; chỉ chừa cấu trúc token (xem mục 8, điểm g) |

### 2.4 Trạng thái công việc

Trạng thái PHẢI hiện bằng **chữ hoặc biểu tượng kèm màu**, không chỉ bằng màu.

| Trạng thái | Token màu | Dấu hiệu thứ hai |
|---|---|---|
| Chưa làm | `color.text.secondary` | Biểu tượng vòng tròn rỗng |
| Đang làm | `color.status.info` | Biểu tượng nửa vòng |
| Chờ duyệt | `color.status.warning` | Biểu tượng đồng hồ |
| Đã xong | `color.status.success` | Biểu tượng dấu tích |
| Tạm dừng, bị chặn | `color.status.danger` | Biểu tượng dấu chấm than |
| Quá hạn (cờ) | `color.status.danger` | Nhãn chữ "Quá hạn", kèm số ngày |

---

## 3. Quy tắc chung cho mọi component

### 3.1 Bảy trạng thái bắt buộc

| Trạng thái | Quy tắc |
|---|---|
| default | Dùng token mặc định của biến thể |
| hover | Chỉ có trên thiết bị có chuột; đổi nền hoặc viền bằng token, không dựa riêng vào màu chữ |
| focus-visible | PHẢI có vòng focus nhìn thấy khi dùng bàn phím: màu `brand.primary`, độ dày bằng `space.2` hoặc hơn, cách phần tử `space.2`, tương phản 3:1 với nền. PHẢI không bị cắt bởi `overflow` của phần tử cha |
| active | Đang nhấn; đậm hơn hover một mức |
| disabled | Dùng `surface.muted` và `text.secondary`; PHẢI có thuộc tính vô hiệu thật (không chỉ đổi màu); nếu lý do không rõ thì NÊN có chú giải vì sao |
| loading | PHẢI giữ nguyên kích thước; hiện biểu tượng quay kèm chữ cho trình đọc màn hình ("Đang lưu"); chặn nhấn lặp |
| error | Viền `status.danger` kèm biểu tượng kèm thông báo chữ cạnh trường; PHẢI liên kết thông báo với trường qua `aria-describedby`; PHẢI đặt `aria-invalid` |

### 3.2 Quy tắc khác

- PHẢI không dùng mã màu, số px thô, kiểu chữ ngoài token trong component. Lint chặn ở P0.4.
- PHẢI không tạo ngoại lệ riêng về khoảng cách hoặc kiểu chữ cho một màn hình.
- PHẢI xử lý: nội dung dài (cắt bằng dấu ba chấm kèm xem đầy đủ khi rê hoặc chạm), nội dung tràn (không vỡ bố cục), trạng thái rỗng, trạng thái tải, trạng thái lỗi mạng.
- Responsive: PHẢI hoạt động ở 375, 768, 1280 px; không cuộn ngang ở trang (bảng rộng cuộn trong khung riêng hoặc đổi sang dạng thẻ).
- Vùng chạm: PHẢI tối thiểu `target.min-touch` trên màn hình cảm ứng, `target.min-pointer` trên máy tính. Phần tử nhỏ hơn PHẢI có vùng chạm mở rộng vô hình.
- Biểu tượng một mình PHẢI có tên truy cập (`aria-label`) và NÊN có chú giải.

---

## 4. Quy tắc từng component

Bàn phím, chuột, cảm ứng là hành vi PHẢI làm đúng. Mọi component PHẢI qua đủ 7 trạng thái ở mục 3.1.

### 4.1 Nhóm nhập liệu

| Component | Biến thể và cấu trúc | Bàn phím | Chuột và cảm ứng | Nội dung dài, rỗng |
|---|---|---|---|---|
| Button | chính, phụ (viền), chữ (không viền), nguy hiểm; có thể kèm biểu tượng trước chữ | `Enter` và `Space` kích hoạt | Một lần nhấn; PHẢI chống nhấn đúp khi loading | Nhãn dài thì xuống dòng, không cắt; nhãn PHẢI là động từ rõ nghĩa |
| IconButton | như Button, chỉ biểu tượng; PHẢI có `aria-label` | như Button | Vùng chạm đủ ngưỡng dù biểu tượng nhỏ | Không áp dụng |
| Input | nhãn trên ô; chú thích; thông báo lỗi; tiền tố và hậu tố | `Tab` vào, `Esc` không xóa nội dung | Chạm vào nhãn thì focus vào ô | Giá trị dài cuộn ngang trong ô; trên điện thoại chữ bằng `font.size.lg` |
| Textarea | như Input; tự giãn chiều cao đến giới hạn | như Input | Kéo giãn bằng tay trên máy tính | Vượt giới hạn thì cuộn trong ô |
| Select | danh sách đơn, ô hiện giá trị đã chọn | `Space` hoặc `Enter` mở; mũi tên chọn; `Esc` đóng; gõ chữ nhảy tới mục | Trên điện thoại NÊN dùng bộ chọn gốc của hệ điều hành | Mục dài bị cắt kèm chú giải; không có mục thì hiện "Không có lựa chọn" |
| Combobox (chọn người, nhãn) | ô gõ tìm kèm danh sách gợi ý; chọn một hoặc nhiều (hiện dạng thẻ nhỏ) | Gõ để lọc; mũi tên xuống mở; `Enter` chọn; `Esc` đóng; `Backspace` xóa thẻ cuối | Chạm mục để chọn; chạm dấu x trên thẻ để bỏ | Tìm không dấu vẫn ra kết quả có dấu; không có kết quả hiện "Không tìm thấy"; danh sách dài cuộn trong khung |
| DatePicker | ô nhập kèm lịch; định dạng dd/MM/yyyy; tô ngày nghỉ theo lịch dự án | Mũi tên đổi ngày; `PageUp/PageDown` đổi tháng; `Enter` chọn; `Esc` đóng | Chạm ngày để chọn; trên điện thoại lịch mở dạng ngăn kéo | Ngày không hợp lệ hiện lỗi cạnh ô, không tự đổi âm thầm |
| Checkbox | ô vuông kèm nhãn; trạng thái chọn, bỏ chọn, một phần | `Space` đổi | Vùng chạm gồm cả nhãn | Nhãn dài xuống dòng |
| Radio | nhóm tùy chọn loại trừ, có tiêu đề nhóm | Mũi tên đổi trong nhóm; `Tab` ra khỏi nhóm | Vùng chạm gồm cả nhãn | Nhãn dài xuống dòng |
| Switch | bật/tắt có hiệu lực ngay; nhãn mô tả hành động | `Space` đổi | Chạm hoặc kéo | Trạng thái bật/tắt PHẢI có chữ hoặc `aria-checked` |

### 4.2 Nhóm điều hướng và lớp phủ

| Component | Biến thể và cấu trúc | Bàn phím | Chuột và cảm ứng | Nội dung dài, rỗng |
|---|---|---|---|---|
| Tabs | thanh tab ngang, một tab đang chọn; nội dung ứng với tab | Mũi tên trái/phải đổi tab; `Home/End` | Chạm tab; thanh tab dài cuộn ngang trong khung | Nhãn tab NÊN dưới 2 từ; quá nhiều tab chuyển vào menu "Thêm" |
| Dialog | tiêu đề, nội dung, nút hành động; nền mờ phía sau | PHẢI nhốt focus bên trong; `Esc` đóng; đóng xong trả focus về nút đã mở | Nhấn ra ngoài đóng (trừ hộp xác nhận nguy hiểm) | Nội dung dài cuộn trong hộp, tiêu đề và nút cố định; trên điện thoại gần toàn màn hình |
| Drawer | ngăn trượt từ phải (máy tính) hoặc toàn màn hình (điện thoại); dùng cho chi tiết việc | như Dialog | Vuốt hoặc nút đóng; PHẢI luôn có nút đóng nhìn thấy | Nội dung dài cuộn riêng; tiêu đề cố định |
| Toast | thông báo ngắn, có thể kèm nút "Hoàn tác" | PHẢI không cướp focus; vùng thông báo `aria-live`; toast có hành động tồn tại tối thiểu 8 giây và dừng khi rê hoặc focus | Vuốt để đóng | Nội dung ngắn; xếp chồng tối đa 3 |
| Tooltip | chú giải ngắn, chỉ chữ | Hiện khi focus; `Esc` đóng | Hiện khi rê; trên cảm ứng chạm giữ hoặc không dùng (thông tin quan trọng PHẢI có chỗ khác) | PHẢI không chứa nút hoặc liên kết |
| Menu, ContextMenu | danh sách hành động; có phân nhóm và mục nguy hiểm cuối | `Enter/Space` mở; mũi tên chọn; `Esc` đóng; phím chữ nhảy mục | Chuột phải mở trên máy tính; nút "..." trên cảm ứng (PHẢI có để thay chuột phải) | Mục vô hiệu hiện kèm lý do |

### 4.3 Nhóm hiển thị

| Component | Biến thể và cấu trúc | Bàn phím | Chuột và cảm ứng | Nội dung dài, rỗng |
|---|---|---|---|---|
| Badge, Tag | trạng thái, nhãn có màu; có thể có nút xóa | Nút xóa vào được bằng `Tab` | Vùng chạm nút xóa đủ ngưỡng | Cắt kèm chú giải; nhiều thẻ thì hiện "+N" |
| Avatar | ảnh hoặc chữ cái đầu; nhóm xếp chồng | Không focus nếu chỉ để hiển thị | Rê hoặc chạm hiện tên | Không có ảnh thì dùng chữ cái đầu; `alt` là tên người |
| ProgressBar | thanh tiến độ 0-100 kèm số phần trăm | Không focus | Không tương tác | PHẢI hiện số phần trăm bằng chữ; PHẢI có `role="progressbar"` kèm giá trị |
| Card | thẻ việc hoặc dự án; tiêu đề, thông tin phụ, hành động | Thẻ có thể mở được thì vào được bằng `Tab` và `Enter` | Chạm cả thẻ mở chi tiết; hành động riêng không kích hoạt thẻ | Tiêu đề dài cắt tối đa 2 dòng; nhiều nhãn không vỡ thẻ |
| EmptyState | biểu tượng, một câu giải thích, nút hành động chính | Nút vào được bằng `Tab` | như Button | PHẢI nói rõ vì sao rỗng và làm gì tiếp ("Chưa có việc nào. Thêm việc đầu tiên.") |
| Skeleton | khung xương thay nội dung khi tải | Không focus | Không tương tác | PHẢI có thông báo "Đang tải" cho trình đọc màn hình; tắt hoạt ảnh khi giảm chuyển động |
| ProgressBar tải tệp | xem FileUploader | | | |

### 4.4 Nhóm dữ liệu và tệp

| Component | Biến thể và cấu trúc | Bàn phím | Chuột và cảm ứng | Nội dung dài, rỗng |
|---|---|---|---|---|
| Table, TreeTable | tiêu đề cột cố định; hàng; cây việc mở/thu gọn; chọn nhiều hàng | Mũi tên lên/xuống đổi hàng; mũi tên phải/trái mở/thu gọn; `Space` chọn; `Alt`+mũi tên di chuyển việc; `Enter` mở chi tiết | Kéo thả đổi vị trí; chuột phải hoặc "..." mở menu; trên điện thoại đổi sang dạng thẻ | Cột dài cắt kèm chú giải; từ 1.000 hàng PHẢI ảo hóa; bảng rỗng dùng EmptyState |
| Pagination | trang trước/sau, số trang, cỡ trang | `Tab` qua từng nút; trang hiện tại có `aria-current` | Vùng chạm đủ ngưỡng | Nhiều trang thì rút gọn bằng dấu ba chấm |
| FileUploader | vùng thả tệp, nút "Chọn tệp", nút "Chụp ảnh" trên điện thoại; hàng đợi tệp kèm thanh tiến độ | Vùng thả vào được bằng `Tab`, `Enter` mở hộp chọn tệp | Kéo thả, dán từ clipboard, chọn nhiều tệp | Mỗi tệp có thanh tiến độ, nút hủy, nút thử lại; lỗi hiện rõ (sai loại, quá dung lượng, vượt hạn mức); hiện thông báo kết quả cho trình đọc màn hình |
| CommentThread | danh sách nhận xét theo chuỗi; ô soạn kèm @nhắc tên; ảnh đính kèm | `@` mở danh sách người; `Ctrl+Enter` gửi; `Esc` đóng danh sách | Chạm "Trả lời" mở ô soạn lồng | Nhận xét dài có "Xem thêm"; chưa có nhận xét hiện EmptyState; có dấu "đã sửa" |

---

## 5. Mẫu bố cục màn hình

Mô tả mẫu, chưa thiết kế chi tiết.

| Màn hình | Máy tính | Điện thoại |
|---|---|---|
| Danh sách dự án | Thanh lọc trên, lưới thẻ hoặc bảng; chuyển được giữa hai kiểu | Danh sách thẻ một cột, bộ lọc trong ngăn kéo |
| Cây việc | TreeTable, cột bật tắt được, dòng nhập nhanh ở cuối | Danh sách thẻ, không cuộn ngang; nút "+" nổi |
| Kanban | Cột theo trạng thái, mỗi cột cuộn dọc riêng | Cuộn ngang giữa các cột hoặc chuyển cột bằng tab |
| Timeline | Danh sách việc bên trái, biểu đồ bên phải, cuộn đồng bộ | Chế độ ngang hoặc xem rút gọn; không làm hỏng cuộn trang |
| Chi tiết việc | Drawer bên phải, cuộn dọc; tiêu đề và nút đóng cố định | Toàn màn hình |
| Việc của tôi | Các tab, mỗi dòng có hành động nhanh một chạm | Thẻ, một thao tác cho mỗi hành động chính |
| Cài đặt | Menu bên trái, nội dung bên phải | Danh sách mục, bấm vào mở trang con |

---

## 6. Yêu cầu trợ năng (WCAG 2.2 AA) và cách kiểm thử

Mỗi dòng PHẢI kiểm thử được. "Đạt" và "Không đạt" là tiêu chí cụ thể.

| Yêu cầu | Đạt | Không đạt | Cách kiểm thử |
|---|---|---|---|
| Tương phản chữ | Chữ thường 4,5:1 trở lên; chữ lớn 3:1 trở lên | Dưới ngưỡng | Test tương phản tự động theo cặp token ở P0.4 |
| Tương phản thành phần | Viền ô nhập, biểu tượng, vòng focus 3:1 trở lên | Viền ô nhập dùng `border.default` | Test tương phản; xem bằng mắt ở màn hình chói |
| Focus nhìn thấy | Mọi phần tử tương tác có vòng focus rõ khi nhấn `Tab` | Vòng focus bị che, bị cắt, hoặc bị tắt | Test bàn phím và chụp ảnh vòng focus; axe-core |
| Bàn phím đủ | Mọi chức năng làm được chỉ bằng bàn phím, có cách thay cho kéo thả | Có thao tác chỉ làm được bằng chuột | Test Playwright theo bảng phím ở mục 4 |
| Không bẫy focus | Rời được mọi thành phần bằng bàn phím (trừ Dialog thì `Esc` thoát) | Kẹt trong một vùng | Test Playwright |
| Thứ tự focus | Theo đúng thứ tự đọc | Nhảy lung tung | Test thủ công kèm `Tab` |
| Trả focus | Đóng Dialog hoặc Drawer thì focus về nút đã mở | Focus mất hoặc về đầu trang | Test Playwright |
| Kích thước vùng chạm | Tối thiểu theo token vùng chạm | Nhỏ hơn | Test đo kích thước phần tử |
| Không chỉ dựa vào màu | Trạng thái có chữ hoặc biểu tượng | Chỉ có màu | Rà thủ công; mô phỏng mù màu trong công cụ trình duyệt |
| Nhãn trường | Mọi trường có nhãn nhìn thấy, liên kết đúng | Chỉ có chữ gợi ý trong ô | axe-core |
| Thông báo lỗi | Lỗi hiện chữ cạnh trường, đọc được bằng trình đọc màn hình | Lỗi chỉ đổi màu viền | Test với trình đọc màn hình; axe-core |
| Thông báo động | Toast, kết quả tải tệp, chuyển cột Kanban được đọc ra | Im lặng | Test thủ công với trình đọc màn hình |
| Phóng to | Đến 200% (và co hẹp 320 px) không mất nội dung hay chức năng | Mất chữ, chồng đè | Test Playwright ở khung hẹp |
| Giảm chuyển động | Hoạt ảnh tắt hoặc rút gọn khi hệ điều hành bật cài đặt giảm chuyển động | Vẫn chạy hoạt ảnh lớn | Test giả lập `prefers-reduced-motion` |
| Tên truy cập | Biểu tượng một mình có `aria-label`; ảnh có mô tả thay thế | Thiếu | axe-core |

---

## 7. Chuẩn nội dung và giọng điệu

- Tiếng Việt, ngắn gọn, xưng "bạn". Câu chủ động. Không dùng thuật ngữ kỹ thuật khi có từ thường.
- Nhãn nút là **động từ cụ thể**: "Thêm việc con", "Nhận việc", "Nộp kết quả", "Lưu thay đổi". Không dùng "OK", "Bấm vào đây", "Gửi".
- Ngày dạng dd/MM/yyyy, giờ theo múi giờ Asia/Bangkok. Số lượng dùng dấu chấm phân cách nghìn.
- Mọi chữ giao diện nằm trong từ điển i18n, không viết cứng trong component.

| Tình huống | Nên viết | Không nên viết |
|---|---|---|
| Nút xóa | "Xóa việc" | "OK", "Xóa" khi không rõ xóa gì |
| Xác nhận nguy hiểm | "Xóa việc này và 3 việc con? Bạn có 30 ngày để khôi phục từ thùng rác." | "Bạn có chắc không?" |
| Lỗi nhập | "Tên việc không được để trống." | "Lỗi dữ liệu" |
| Lỗi mạng | "Mất kết nối. Thay đổi của bạn đã được lưu tạm và sẽ gửi khi có mạng." | "Network error" |
| Trạng thái rỗng | "Hôm nay bạn chưa có việc nào." | "Không có dữ liệu" |
| Thành công | "Đã lưu." | "Thao tác thành công!!!" |
| Từ chối việc | "Vui lòng nêu lý do từ chối." | "Bắt buộc" |

---

## 8. Giả định cần xác nhận

Các điểm bất thường của file token gốc và phương án mặc định tôi đề xuất. **Hãy ghi quyết định của bạn vào cột cuối trước khi chạy P0.4.**

| # | Điểm trong file gốc | Vấn đề | Phương án mặc định | Lý do | Quyết định của bạn |
|---|---|---|---|---|---|
| a | `font.weight.base` = 700 | Cả đoạn chữ đều đậm, khó đọc | Nội dung 400; nhãn và nút 600; tiêu đề 700; thành ba token riêng | Chữ đậm toàn bộ làm mất phân cấp | [ ] Duyệt  [ ] Sửa: |
| b | `font.size.base` = 12 px, thang 10,5 đến 15 px | Nhỏ, 10,5 px khó đọc | Giữ 12 px cho nhãn phụ; nội dung mặc định 14 px; bảng dày 13 px; ô nhập trên điện thoại 16 px; bỏ 10,5 px | WCAG không cấm cỡ nhỏ nhưng chữ nội dung 12 px khó đọc ngoài hiện trường | [ ] Duyệt  [ ] Sửa: |
| c | `color.surface.muted` = nền đen, `color.text.inverse` = xám xanh sẫm | Có vẻ gán nhầm tên | `surface.muted` là xám nhạt (`#eef1f5`); `text.inverse` là trắng (`#ffffff`) | Tên gọi "muted" và "inverse" chỉ hợp lý theo nghĩa này | [ ] Duyệt  [ ] Sửa: |
| d | `color.border.default` và `color.border.muted` chứa 4 giá trị | Là giá trị bốn cạnh, không dùng trực tiếp | `border.default` = xám nhạt (đường kẻ); thêm `border.strong` = xám đậm (viền ô nhập, nút) | Viền nhạt không đạt tương phản 3:1 cho ô nhập (WCAG 1.4.11) | [ ] Duyệt  [ ] Sửa: |
| e | Thang khoảng cách chỉ đến 9 px | Thiếu giá trị cho bố cục lớn | Thêm 12, 16, 24, 32, 48 px | Cần cho lề, khoảng cách giữa khối | [ ] Duyệt  [ ] Sửa: |
| f | Không có màu thương hiệu | Thiếu màu cho nút chính, liên kết, focus | Dùng `#112723` (màu nền chủ đạo của site gốc) làm `brand.primary`; bóng `shadow.4` cùng gốc | Đủ tương phản với nền sáng; nhất quán với tham chiếu | [ ] Duyệt  [ ] Chọn màu khác: |
| g | Chế độ tối | Không có trong file | Chưa làm; chỉ chừa cấu trúc token | Tránh phình phạm vi MVP | [ ] Duyệt  [ ] Làm sớm |
| h | Màu trạng thái (`danger`, `warning`, `success`, `info`) và `text.primary`, `brand.primary-hover` | File gốc không có | Đề xuất ở mục 2.1 | Cần cho trạng thái việc và lỗi | [ ] Duyệt  [ ] Sửa: |

Hai việc cần đo bằng công cụ chứ không kết luận bằng mắt: tương phản của `text.secondary` trên `surface.base` có thể sát ngưỡng 4,5:1, và `border.default` không đủ làm viền ô nhập. P0.4 có test tương phản để bắt các trường hợp này.

---

## 9. Phản mẫu (không được làm)

- Dùng mã màu, số px, kiểu chữ ngoài token.
- Chỉ dùng màu để phân biệt trạng thái.
- Tắt vòng focus (`outline: none`) mà không có thay thế nhìn thấy.
- Nút chỉ có biểu tượng mà không có tên truy cập.
- Nhãn nút mơ hồ ("OK", "Bấm vào đây", "Gửi").
- Placeholder thay cho nhãn.
- Chức năng chỉ làm được bằng kéo thả hoặc chuột phải.
- Toast tự biến mất khi có hành động quan trọng bên trong.
- Bảng bắt cuộn ngang cả trang trên điện thoại.
- Hộp thoại lồng hộp thoại.
- Báo lỗi chung chung ("Đã xảy ra lỗi") mà không nói cách xử lý.
- Hoạt ảnh lớn không tắt được khi người dùng bật giảm chuyển động.

---

## 10. Danh sách kiểm tra QA (trước khi gộp một thay đổi giao diện)

- [ ] Chỉ dùng token; lint chặn mã hex và px thô đã xanh.
- [ ] Đủ 7 trạng thái: default, hover, focus-visible, active, disabled, loading, error.
- [ ] Làm được hoàn toàn bằng bàn phím; vòng focus nhìn thấy; focus được trả về đúng chỗ.
- [ ] Có đường thay thế cho kéo thả và chuột phải.
- [ ] Vùng chạm đủ ngưỡng trên cảm ứng.
- [ ] Kiểm tra ở 375, 768, 1280 px: không cuộn ngang trang, không mất nội dung.
- [ ] Phóng to 200%: không mất chức năng.
- [ ] Đã có trạng thái rỗng, tải, lỗi, mất mạng.
- [ ] Nội dung dài và tràn không vỡ bố cục.
- [ ] Test axe-core xanh; test tương phản xanh.
- [ ] Nhãn và thông báo đúng chuẩn nội dung mục 7, nằm trong từ điển i18n.
- [ ] Hoạt ảnh tắt hoặc rút gọn khi bật giảm chuyển động.