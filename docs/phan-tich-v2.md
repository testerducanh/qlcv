**TÀI LIỆU PHÂN TÍCH NGHIỆP VỤ**

**Hệ thống quản lý công việc và dự án**

Phân tích mô hình tham chiếu Xong Việc (xongviec.com) và đề xuất thiết kế cho doanh nghiệp nhiều chi nhánh. **Phiên bản 2.0 định hướng lại:** tập trung vào công cụ quản lý công việc – dự án dùng chung, trong đó người dùng tự tạo việc, việc con, đính kèm ảnh và tệp, giao việc và theo dõi. Nghiệp vụ xây dựng và vận hành khu công nghiệp chỉ còn ở dạng một số mẫu có sẵn và các mô-đun mở rộng sau này.

|                   |                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| **Phiên bản**     | 2.0 – Bản đề xuất để thảo luận (điều chỉnh định hướng so với v1.1)                                           |
| **Ngày lập**      | 29/10/2026                                                                                                   |
| **Lập bởi**       | Phân tích nghiệp vụ IT                                                                                       |
| **Đối tượng đọc** | Ban lãnh đạo, giám đốc chi nhánh, trưởng các phòng ban, đại diện người dùng hiện trường, Công nghệ thông tin |
| **Phân loại**     | Nội bộ                                                                                                       |

_Tài liệu mang tính tham chiếu. Các tham số (thời hạn xác nhận, bậc leo thang, giới hạn dung lượng tệp, ngưỡng duyệt) là giá trị minh họa, do công ty quyết định. Danh mục mẫu chỉ là điểm khởi đầu để các phòng chuyên môn tự chỉnh, không phải biểu mẫu hay quy trình pháp lý chuẩn._

## Lịch sử phiên bản

| **Phiên bản** | **Ngày**   | **Nội dung thay đổi**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1.0**       | 29/10/2026 | Bản đầu: phân tích Xong Việc, khoảng cách, mô hình dữ liệu, các phân hệ, phân quyền, phê duyệt, KPI, kiến trúc, lộ trình.                                                                                                                                                                                                                                                                                                                                                                              |
| **1.1**       | 29/10/2026 | Bổ sung giao việc – nhận việc, triển khai KCN (giai đoạn, cổng G0–G6), bán hàng trạm trộn (doanh thu, chỉ tiêu theo người) và phần nghiệp vụ xây dựng chuyên sâu (WBS/BOQ, nghiệm thu, thanh toán, HSE, EVM…).                                                                                                                                                                                                                                                                                         |
| **2.0**       | 29/10/2026 | • **Định hướng lại** sang quản lý công việc – dự án tổng quát: người dùng tự tạo dự án, nhóm việc, việc, việc con, checklist, đính kèm ảnh và tệp, giao việc.<br>• Bỏ nghiệp vụ xây dựng chuyên sâu khỏi lõi (xem mục 1.2); giữ lại dưới dạng thư viện mẫu (mục 6) và mô-đun mở rộng (mục 12).<br>• Đối chiếu lại với giao diện công khai của xongviec.com (mục 2).<br>• Viết lại giao việc – nhận việc thành 3 mức kiểm soát nhẹ/chuẩn/chặt; thu gọn phân quyền, phê duyệt, KPI, kiến trúc, lộ trình. |

## Mục lục

**1.** Tóm tắt điều hành và kết quả rà soát bản v1.1

**2.** Phân tích hệ thống tham chiếu: Xong Việc

**3.** Định hướng và nguyên tắc thiết kế

**4.** Mô hình tổ chức và dữ liệu

**5.** Chức năng cốt lõi

**6.** Thư viện mẫu và quản lý mẫu

**7.** Triển khai KCN trên nền quản lý công việc

**8.** Phân quyền

**9.** Phê duyệt (tùy chọn)

**10.** Dashboard và chỉ số KPI

**11.** Kiến trúc công nghệ đề xuất

**12.** Mô-đun mở rộng (ngoài lõi)

**13.** Lộ trình triển khai

**14.** Rủi ro và biện pháp giảm thiểu

**15.** Các điểm cần công ty quyết định sớm

**A.** Phụ lục A – Ba luồng minh họa

**B.** Phụ lục B – Thuật ngữ

_Gợi ý đọc: lãnh đạo xem mục 1, 3, 8, 13, 15; bộ phận nghiệp vụ xem mục 5–7; CNTT xem mục 4, 11._

# 1. Tóm tắt điều hành và kết quả rà soát bản v1.1

## 1.1. Định hướng điều chỉnh

Bản v1.1 đi khá sâu vào nghiệp vụ xây dựng (khối lượng, thanh toán, nghiệm thu, an toàn, hợp đồng, EVM) và đã biến trạm trộn bê tông thành một phân hệ bán hàng riêng. Yêu cầu hiện tại là một hệ thống **quản lý công việc – quản lý dự án** thuần túy, không can thiệp sâu vào nghiệp vụ xây dựng. Do đó v2.0 chốt lại như sau:

- **Người dùng làm chủ cấu trúc.** Tự tạo dự án, nhóm việc, việc, việc con, checklist; tự đính kèm ảnh, tệp; tự chọn giao cho ai, hạn khi nào. Hệ thống không áp đặt mô hình dữ liệu của một ngành.

- **Nghiệp vụ ngành chỉ đi vào dưới dạng mẫu.** Chỉ giữ một số mẫu dự án và mẫu việc (triển khai KCN, thủ tục pháp lý, GPMB, san lấp, cầu đường, vận hành, họp giao ban). Người dùng nạp mẫu rồi sửa thoải mái.

- **Kiểm soát là tùy chọn.** Xác nhận nhận việc, bằng chứng, duyệt kết quả, cổng giữa các giai đoạn chỉ bật khi dự án hoặc mẫu yêu cầu; mặc định gọn nhẹ như Xong Việc.

- **Phần chuyên ngành tách khỏi lõi.** Bán hàng trạm trộn, vận hành KCN, chi phí – hợp đồng, nghiệm thu chuyên sâu được giữ làm mô-đun mở rộng làm sau, nối với lõi qua liên kết việc, trường tùy chỉnh và API.

## 1.2. Kết quả rà soát bản v1.1

Bảng dưới đánh giá từng khối nội dung của v1.1 theo mục tiêu mới và cách xử lý trong v2.0.

| **Nội dung trong v1.1**                                                                                                                                                                                                   | **Nhận định**                                                                                                         | **Xử lý trong v2.0**                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Mục 6: WBS/BOQ, khối lượng, nghiệm thu khối lượng và thanh toán (IPC), ITP/NCR/Hold point, HSE, đấu thầu và hợp đồng, nhân lực – máy – vật tư, nhật ký thi công, hồ sơ hoàn công, EVM, đặc thù GPMB/san lấp/cầu đường** | Quá sâu vào nghiệp vụ xây dựng; buộc người dùng theo mô hình dữ liệu cứng; làm phình phạm vi và thời gian triển khai. | **Bỏ khỏi lõi.** Chỉ còn gợi ý nội dung trong thư viện mẫu (mục 6); các khối cần thiết đưa vào mô-đun mở rộng (mục 12). |
| **Mục 9: bán hàng trạm trộn (khách hàng, báo giá, doanh thu, công nợ, chỉ tiêu từng nhân viên)**                                                                                                                          | Là phân hệ CRM/bán hàng độc lập, không phải quản lý công việc.                                                        | **Chuyển sang mô-đun mở rộng.** Ở lõi chỉ giữ ý “chỉ tiêu và nhắc nợ giao như một việc” và mẫu việc cho trạm trộn.      |
| **Mục 5.4, 5.5: vận hành KCN (lô đất, khách thuê, tiện ích, ticket), chi phí và hợp đồng**                                                                                                                                | Phân hệ nghiệp vụ riêng.                                                                                              | **Mô-đun mở rộng.** Ở lõi: mẫu “Vận hành định kỳ” với việc lặp lại.                                                     |
| **Mục 7: triển khai KCN (giai đoạn A–H, cổng G0–G6, RACI, nhịp điều hành, sổ rủi ro)**                                                                                                                                    | Giá trị tốt nhưng viết như quy trình bắt buộc.                                                                        | **Giữ, viết lại** thành mẫu “Triển khai KCN”, cổng tùy chọn, nhịp họp sinh việc (mục 7).                                |
| **Mục 8: giao việc – nhận việc**                                                                                                                                                                                          | Đúng trọng tâm nhưng thiên về kiểm soát chặt; thiếu việc con, đính kèm ảnh/tệp, giao nhanh.                           | **Giữ và viết lại** với 3 mức kiểm soát, bổ sung việc con, ảnh và tệp (mục 5).                                          |
| **Mục 10, 11: phân quyền và phê duyệt**                                                                                                                                                                                   | Gắn với nhiều vai trò nghiệp vụ cố định (Pháp chế, trạm trộn, TVGS…), nhiều luồng duyệt cứng.                         | **Rút gọn** thành vai trò dự án × phạm vi và luồng duyệt cấu hình được (mục 8, 9).                                      |
| **Mục 12: KPI**                                                                                                                                                                                                           | Nhiều KPI nghiệp vụ (EVM, doanh thu, NCR…).                                                                           | **Giữ KPI quản lý công việc**, KPI chuyên ngành thuộc mô-đun (mục 10).                                                  |
| **Mục 13, 14: kiến trúc, lộ trình**                                                                                                                                                                                       | Thiếu dịch vụ tệp/ảnh; lộ trình trải rộng nhiều phân hệ.                                                              | **Viết lại**: bổ sung dịch vụ tệp, tìm kiếm; MVP nhỏ hơn (mục 11, 13).                                                  |

**Những thiếu sót của v1.1 so với yêu cầu mới** (nay đã bổ sung ở v2.0):

- Chưa có việc con nhiều cấp và thao tác gõ nhanh, dán danh sách thành việc.

- Chưa nêu rõ đính kèm ảnh và tệp trên việc, trên checklist, trên nhận xét; thư viện tệp của dự án; ảnh chụp ngoại tuyến.

- Chưa có trường tùy chỉnh, nhãn, bộ lọc đã lưu, chế độ xem lịch, việc lặp lại.

- Chưa có quản lý mẫu (tạo mẫu từ dự án có sẵn, mẫu theo cấp công ty/chi nhánh/cá nhân, phiên bản).

- Một số quy tắc cứng (ví dụ “hoàn thành chỉ chốt khi có biên bản nghiệm thu được duyệt”) mâu thuẫn với việc để người dùng tự do; nay chuyển thành tùy chọn.

## 1.3. Kết luận chính

- **Giữ** các điểm mạnh của Xong Việc: lập kế hoạch nhanh, ngôn ngữ giản dị, thẻ trên điện thoại, “Việc hôm nay”, checklist, mốc, thư viện mẫu, nhập từ Excel/PDF bằng AI, thùng rác 30 ngày, hoàn tác, in có khung chữ ký.

- **Bổ sung** những gì doanh nghiệp nhiều chi nhánh cần mà một công cụ cá nhân chưa có: việc con nhiều cấp, đính kèm ảnh và tệp, giao việc có xác nhận, phân quyền theo chi nhánh/phòng/dự án, thông báo và leo thang, cổng cho người ngoài, nhật ký truy vết.

- **Không sao chép** mô hình dữ liệu nằm trên máy cá nhân. Doanh nghiệp cần máy chủ trung tâm, dữ liệu thuộc công ty, có bộ nhớ đệm ngoại tuyến cho hiện trường.

- **Thứ tự làm:** lõi quản lý việc (dự án, việc, việc con, giao việc, đính kèm, bình luận, Kanban/danh sách/timeline) → thông báo và nhận việc nâng cao → thư viện mẫu và nhập AI → dashboard đa chi nhánh và cổng ngoài → mô-đun chuyên ngành khi có nhu cầu.

|                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Lưu ý về phạm vi và độ tin cậy**<br>Phần phân tích Xong Việc dựa trên nội dung HTML công khai của trang chủ (màn hình ứng dụng khi chưa đăng nhập, đối chiếu lại ngày 29/10/2026). Không có quyền truy cập mã nguồn hay hạ tầng, nên phần công nghệ là suy luận. Một số chức năng nằm sau đăng nhập (ví dụ đính kèm tệp trên việc, quyền chi tiết) chưa quan sát được; cần dùng thử bản có tài khoản để xác minh trước khi chốt yêu cầu. |

# 2. Phân tích hệ thống tham chiếu: Xong Việc

## 2.1. Tổng quan

| **Hạng mục**           | **Nhận định**                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Loại sản phẩm**      | Ứng dụng web cài được (PWA) quản lý tiến độ dạng Gantt, dùng được trên điện thoại và máy tính, có chế độ ngoại tuyến.                  |
| **Ngách**              | Thi công và cải tạo dân dụng quy mô nhỏ và vừa; người dùng là chủ thầu, chỉ huy trưởng, tổ đội, giám sát, chủ nhà.                     |
| **Giá trị cốt lõi**    | Lập bảng tiến độ trong vài phút, sửa bất cứ lúc nào, gửi cho chủ nhà xem trên điện thoại và qua Zalo.                                  |
| **Mô hình kinh doanh** | Miễn phí một công trình; gói trả phí từ 12.400 đồng/tháng (đang ưu đãi) cho nhiều công trình, link cho chủ nhà, mời tối đa 10 người.   |
| **Điểm khác biệt**     | Địa phương hóa sâu (ngày công, khung 3 chữ ký, Zalo), rào cản vào thấp, nhập dự toán bằng AI, giao diện thẻ thay bảng trên điện thoại. |

## 2.2. Các chức năng quản lý công việc quan sát được

Bảng dưới chỉ liệt kê phần liên quan đến quản lý công việc, rút ra từ giao diện công khai của xongviec.com.

| **Nhóm**               | **Quan sát trên giao diện**                                                                                                                                                                                                              | **Bài học cho thiết kế**                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Khởi tạo**           | Hai cách bắt đầu: dùng thử không cần tài khoản hoặc đăng ký. Wizard vài bước: tên và loại công trình, ngày khởi công, chọn giai đoạn, thêm thử việc cho giai đoạn đầu, chọn kiểu thanh và cột hiển thị, màn hình “Kế hoạch đã sẵn sàng”. | Wizard ngắn, cho bỏ qua, mọi thứ sửa được sau. Giữ nguyên tinh thần.              |
| **Nội dung khởi đầu**  | Ba lựa chọn: công trình trống (tự thêm việc), từ mẫu có sẵn, từ file Excel/PDF/JSON (AI đọc dự toán dựng sẵn bảng việc để kiểm tra rồi nạp). Nạp vào công trình mới hoặc đang mở, có nút hoàn tác.                                       | Mẫu và nhập file là đường tắt chính; luôn có hoàn tác.                            |
| **Cấu trúc**           | Công trình → Giai đoạn → Việc, thêm Mốc (hình thoi). Giai đoạn tự đánh số, ngày và số ngày lấy từ việc bên trong.                                                                                                                        | Chỉ hai cấp. **Thiếu việc con**; cần mở rộng nhiều cấp.                           |
| **Thêm việc**          | Biểu mẫu gọn: tên việc, giai đoạn, thời gian (bắt đầu, số ngày, kết thúc), “Giao cho” (mặc định “Chưa giao”), liên kết, ghi chú, tiêu chí nghiệm thu; có “Thêm tiếp việc khác”.                                                          | Giao việc ngay lúc tạo. Giữ.                                                      |
| **Thao tác trên việc** | Chuột phải: chèn việc mới phía dưới, nhân bản, chuyển thành Mốc, tiêu chí nghiệm thu, nhận xét, xóa.                                                                                                                                     | Menu ngữ cảnh gọn. Giữ, thêm “Tạo việc con”, “Đính kèm”.                          |
| **Checklist**          | Mỗi việc có checklist hiển thị tiến độ dạng 0/n mục.                                                                                                                                                                                     | Nền tốt cho tiêu chí hoàn thành và bằng chứng.                                    |
| **Phụ thuộc**          | Ba kiểu nối: Cuốn chiếu, Gối đầu, Xong mới làm; tính theo ngày làm việc, có độ trễ ± ngày.                                                                                                                                               | Ngôn ngữ giản dị thay cho thuật ngữ Gantt. Giữ.                                   |
| **Cột và trạng thái**  | Bật/tắt cột: Ghi chú, Người phụ trách (bật/tự động/tắt), Nhãn (có màu), Trạng thái, Tiến độ %. Trạng thái: Đang làm, Đã xong, Chậm TĐ, Chưa làm/tạm dừng; cho đổi tên trạng thái trong cài đặt.                                          | Người dùng tự chọn cột. Giữ, thêm cột Tệp, trường tùy chỉnh.                      |
| **Chế độ xem**         | Bốn chế độ: Timeline, Dữ liệu (bảng), Kanban, Tổng hợp; “Thẻ thay bảng, không cuộn ngang” trên điện thoại; thu phóng ngày/tuần, kiểu thanh.                                                                                              | Giữ, thêm chế độ Lịch.                                                            |
| **Cá nhân hóa việc**   | Màn hình “Việc hôm nay”: Hôm nay, Trễ hạn, Sắp đến hạn, Tất cả, Mốc rủi ro; ô “Xong?”. Có “Nhận xét việc này”.                                                                                                                           | Giữ và mở rộng thành “Việc của tôi” (mục 5.4).                                    |
| **Cộng tác**           | Mã mời vào công trình, quyền xem/sửa, link cho chủ nhà xem và tự cập nhật, thông báo trong ứng dụng, lịch sử sửa đổi.                                                                                                                    | Cần phạm vi theo chi nhánh/phòng/dự án và khách ngoài có thời hạn.                |
| **Báo cáo**            | In A3/A4 ngang, chọn phạm vi ngày và giai đoạn, mức chi tiết, khung 3 chữ ký; xuất Excel (.xlsx), PDF, bản sao .json.                                                                                                                    | Giữ; chữ ký nhiều bên cấu hình được.                                              |
| **An toàn dữ liệu**    | Hoàn tác sau khi nạp mẫu, thùng rác 30 ngày, lịch sử sửa đổi, hộp xác nhận khi bỏ dở.                                                                                                                                                    | Giữ nguyên.                                                                       |
| **Mở rộng nhỏ**        | Vật tư (bảng/thẻ, trạng thái, hạn tập kết), Phát sinh (duyệt rồi mới vào Gantt), “Lưu làm mẫu riêng”, kho thư viện mẫu theo loại công trình.                                                                                             | Vật tư, phát sinh là tính năng ngành, không đưa vào lõi; “Lưu làm mẫu riêng” giữ. |

**Chưa thấy trên giao diện công khai:** đính kèm ảnh hoặc tệp vào từng việc; việc con; giao cho nhiều người hoặc theo nhóm; bước xác nhận nhận việc, từ chối, xin gia hạn; nhắc tên (@) trong nhận xét; leo thang tự động; thống kê hiệu suất theo người. Đây là các khoảng trống cần thiết kế ở mục 5.

## 2.3. Công nghệ (suy luận)

Xong Việc là ứng dụng một trang (SPA) dạng PWA, có chế độ dữ liệu nằm trên máy rồi đồng bộ lên cloud khi đăng nhập, xuất Excel/PDF phía trình duyệt, tích hợp AI đọc dự toán và chia sẻ qua Zalo. Doanh nghiệp không nên sao chép mô hình dữ liệu nằm trên máy cá nhân; đề xuất ở mục 11.

## 2.4. Đánh giá nhanh

| **Điểm mạnh**                                                                                                                                   | **Hạn chế khi dùng cho doanh nghiệp**                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| • Rào cản vào thấp, ngôn ngữ giản dị<br>• Mobile-first thực dụng<br>• Mẫu và AI giúp khởi tạo nhanh<br>• An toàn thao tác (hoàn tác, thùng rác) | • Cấu trúc hai cấp, thiếu việc con<br>• Giao việc là gán một tên; chưa có xác nhận, duyệt, leo thang<br>• Mời tối đa 10 người, một công trình một không gian<br>• Chưa thấy phân quyền theo chi nhánh/phòng ban, nhật ký bất biến |

# 3. Định hướng và nguyên tắc thiết kế

## 3.1. Nguyên tắc

| **Nguyên tắc**                               | **Nội dung**                                                                                                                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Người dùng làm chủ cấu trúc**           | Mọi cấp (dự án, nhóm việc, việc, việc con, checklist) do người dùng tự tạo, sửa, di chuyển, xóa. Hệ thống không bắt buộc mã WBS, khối lượng hay quy trình riêng của ngành. |
| **2. Khung chung, nghiệp vụ nằm trong mẫu**  | Lõi chỉ biết “dự án – việc – người – hạn – tệp – trao đổi”. Kiến thức ngành nằm trong mẫu, nạp xong là dữ liệu thường.                                                     |
| **3. Kiểm soát là tùy chọn, bật theo dự án** | Ba mức giao việc nhẹ/chuẩn/chặt (mục 5.4); duyệt, cổng, bằng chứng bắt buộc chỉ bật khi cần.                                                                               |
| **4. Nhập nhanh**                            | Tạo việc dưới 30 giây từ điện thoại; gõ tên rồi Enter; dán nhiều dòng thành nhiều việc; ghi giọng nói; chụp ảnh gắn thẳng vào việc.                                        |
| **5. Một việc, một người chịu trách nhiệm**  | Có thể nhiều người phối hợp nhưng chỉ một người nhận chính, để không có việc “của chung”.                                                                                  |
| **6. Dữ liệu tập trung, quyền theo phạm vi** | Dữ liệu thuộc công ty, lưu trên máy chủ; quyền = vai trò × phạm vi (chi nhánh, phòng, dự án, việc).                                                                        |
| **7. Nhập một lần dùng nhiều nơi**           | Cập nhật việc là cập nhật tiến độ, báo cáo, “Việc của tôi”, dashboard.                                                                                                     |
| **8. Mở rộng không sửa lõi**                 | Trường tùy chỉnh, nhãn, liên kết, API/webhook để gắn mô-đun chuyên ngành sau này.                                                                                          |

## 3.2. Phạm vi

| **Trong phạm vi lõi (v2.0)**                                                                                                                                                                                                                                                                                                                                           | **Ngoài phạm vi lõi (mô-đun mở rộng, mục 12)**                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| • Dự án, nhóm việc, việc, việc con, mốc, checklist<br>• Giao việc, nhận việc, duyệt kết quả (tùy chọn)<br>• Ảnh, tệp đính kèm, thư viện tệp dự án<br>• Bình luận, @nhắc tên, thông báo, nhắc việc<br>• Danh sách, Kanban, Timeline, Lịch, Việc của tôi, Tổng hợp<br>• Mẫu dự án, mẫu việc, nhập từ Excel/PDF<br>• Phân quyền, khách ngoài, nhật ký, in và xuất báo cáo | • Khối lượng, BOQ, thanh toán, hợp đồng, EVM<br>• Nghiệm thu chuyên sâu (ITP, NCR, hold point), HSE<br>• Nhật ký thi công, hồ sơ hoàn công, bản vẽ<br>• Quản lý máy, nhân lực, vật tư kho<br>• Bán hàng trạm trộn, doanh thu, công nợ, chỉ tiêu<br>• Vận hành KCN: lô đất, khách thuê, tiện ích, ticket<br>• GPMB theo thửa/hộ và bản đồ |

# 4. Mô hình tổ chức và dữ liệu

## 4.1. Cây tổ chức và cấu trúc công việc

|                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Công ty<br>├─ Chi nhánh / Ban QLDA<br>│ ├─ Phòng ban / Nhóm (Pháp chế, Kỹ thuật, Kế hoạch, Kế toán, Vận hành, Trạm trộn…)<br>│ └─ Dự án (không gian làm việc, thuộc một chi nhánh)<br>│ └─ Nhóm việc / Giai đoạn<br>│ └─ Việc ─ Việc con (nhiều cấp) ─ Checklist<br>│ └─ Đính kèm · Nhận xét · Nhãn · Trường tùy chỉnh<br>└─ Danh mục dùng chung: Mẫu dự án, Mẫu việc, Nhãn chuẩn, Trường tùy chỉnh chuẩn<br>Danh mục (Portfolio): tập hợp nhiều dự án để lãnh đạo xem tổng hợp, không có việc riêng. |

- Một dự án thuộc một chi nhánh và có một chủ dự án; có thể mời người từ nhiều phòng, nhiều chi nhánh.

- Việc con tối đa 5 cấp (đề xuất); việc cha tự tính ngày và % từ việc con.

- Mỗi bản ghi mang ba thuộc tính phân quyền: **chi nhánh – dự án – phòng ban sở hữu**, cộng mức mật (Thường / Hạn chế).

## 4.2. Đối tượng trung tâm: Việc

| **Nhóm thông tin**      | **Trường**                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Định danh**           | Mã việc tự sinh, tiêu đề, loại (Việc / Mốc / Nhóm việc), dự án, nhóm việc, việc cha.                                                                 |
| **Thời gian**           | Ngày bắt đầu, số ngày hoặc hạn hoàn thành, ngày hoàn thành thực tế, ước lượng công (tùy chọn), lịch làm việc của dự án (ngày nghỉ tuần, ngày lễ).    |
| **Con người**           | Người giao, người nhận chính, người phối hợp, người duyệt (tùy mức), người theo dõi; nhóm nhận việc (hàng đợi).                                      |
| **Nội dung**            | Mô tả (định dạng nhẹ), checklist, tệp và ảnh đính kèm, liên kết (việc khác, URL, tài liệu).                                                          |
| **Phân loại**           | Trạng thái, ưu tiên (Khẩn / Cao / Thường / Thấp), nhãn có màu, % hoàn thành, trường tùy chỉnh (văn bản, số, ngày, danh sách chọn, người, đường dẫn). |
| **Phụ thuộc**           | Việc làm trước (3 kiểu nối, độ trễ ± ngày), cảnh báo hoặc chặn khi việc trước chưa xong (tùy chọn).                                                  |
| **Lặp lại**             | Quy tắc lặp (ngày, tuần, tháng, quý); mỗi kỳ sinh một bản việc riêng.                                                                                |
| **Trao đổi và lịch sử** | Nhận xét, @nhắc tên, lịch sử thay đổi (ai, lúc nào, giá trị cũ/mới) không xóa được.                                                                  |

## 4.3. Trạng thái

Trạng thái do từng dự án cấu hình, tên đổi được. Bộ mặc định: **Chưa làm → Đang làm → Chờ duyệt → Đã xong**, cùng **Tạm dừng / Bị chặn** (có lý do). “Chờ duyệt” chỉ xuất hiện khi dự án bật mức Chuẩn hoặc Chặt. “Quá hạn” là cờ cảnh báo chồng lên trạng thái, không phải một trạng thái.

**Tính % việc cha:** chọn theo dự án — theo số việc con đã xong, theo ngày công của việc con (mặc định, như Xong Việc), hoặc nhập tay.

## 4.4. Mô hình dữ liệu rút gọn

|                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dự án ─┬─ Nhóm việc ─ Việc ─┬─ Việc con (đệ quy)<br>│ ├─ Checklist ─ Mục (có thể giao, đính kèm ảnh)<br>│ ├─ Đính kèm (ảnh, tệp; phiên bản)<br>│ ├─ Nhận xét ─ Trả lời, @nhắc tên, đính kèm<br>│ ├─ Phụ thuộc, Lặp lại, Liên kết<br>│ └─ Lịch sử trạng thái (bất biến)<br>├─ Thành viên ─ Vai trò trong dự án<br>├─ Nhãn, Trường tùy chỉnh, Cấu hình trạng thái, Mức giao việc<br>└─ Thư viện tệp (tổng hợp mọi đính kèm)<br>Người dùng ─ Chi nhánh / Phòng ban ─ Vai trò hệ thống ─ Ủy quyền<br>Mẫu (dự án / việc) ─ Phiên bản ─ Cấp sở hữu (cá nhân / phòng / công ty)<br>Quy tắc duyệt (cấu hình) ─ Lịch sử duyệt · Thông báo · Nhật ký truy cập |

# 5. Chức năng cốt lõi

Mục này mô tả các chức năng của lõi quản lý công việc. Mọi chức năng đều dùng chung cho mọi loại dự án; không có chức năng nào dành riêng cho một ngành.

## 5.1. Tạo dự án

| **Cách tạo**                | **Mô tả**                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Dự án trống**             | Đặt tên, chi nhánh, ngày bắt đầu, hạn dự kiến, lịch nghỉ; tự thêm nhóm việc và việc sau.                        |
| **Từ mẫu**                  | Chọn mẫu dự án (mục 6); hệ thống dời ngày theo ngày bắt đầu, cho gán người vào vai trò của mẫu; có hoàn tác.    |
| **Nhân bản dự án**          | Sao chép cấu trúc dự án đang có (tùy chọn kèm người, kèm tệp); các việc nạp về “Chưa làm”.                      |
| **Nhập từ Excel, CSV, PDF** | AI đọc bảng công việc hoặc dự toán, dựng sẵn nhóm việc và việc, **người dùng kiểm tra và chỉnh trước khi nạp**. |
| **Dán danh sách**           | Dán nhiều dòng văn bản thành nhiều việc; dòng thụt đầu thành việc con.                                          |

**Wizard rút gọn (3 bước, cho bỏ qua):** (1) tên, chi nhánh, thời gian; (2) nội dung khởi đầu (trống, mẫu, nhập file); (3) mời thành viên và chọn mức giao việc. Có thể sửa mọi thứ sau.

## 5.2. Việc và việc con

| **Chức năng**                   | **Mô tả**                                                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tạo nhanh**                   | Gõ tên rồi Enter; nút “+” nổi trên điện thoại; “Thêm tiếp việc khác” không đóng biểu mẫu; ghi giọng nói chuyển thành văn bản để kiểm tra.                   |
| **Việc con**                    | Tạo ngay dưới việc cha, nhiều cấp (đề xuất tối đa 5); thụt vào/lùi ra, kéo thả đổi vị trí và đổi cha; chuyển một mục checklist thành việc con và ngược lại. |
| **Loại mục**                    | **Việc** (có thời lượng, hiện thành thanh), **Mốc** (một ngày, hình thoi), **Nhóm việc/Giai đoạn** (gom các việc, ngày và % tự tính).                       |
| **Thông tin cơ bản**            | Tên, mô tả, ngày bắt đầu, số ngày hoặc hạn, người giao, người nhận, ưu tiên, nhãn, trạng thái, %.                                                           |
| **Checklist**                   | Danh sách mục kiểm tra trong việc, hiển thị 0/n; mỗi mục có thể giao riêng cho một người và đính kèm ảnh; mục đã tick tính vào % hoàn thành.                |
| **Tính % và ngày của việc cha** | Theo việc con (mục 4.3); ngày sớm nhất và muộn nhất của việc con thành ngày của việc cha.                                                                   |
| **Sao chép, di chuyển**         | Nhân bản việc (kèm việc con, checklist, tùy chọn kèm tệp); chuyển sang nhóm hoặc dự án khác; thao tác hàng loạt: đổi người, hạn, nhãn, trạng thái.          |
| **Việc lặp lại**                | Lặp theo ngày, tuần, tháng, quý (theo ngày làm việc); mỗi kỳ là một bản việc có checklist riêng.                                                            |
| **Liên kết**                    | Liên kết đến việc hoặc dự án khác, đường dẫn tài liệu; hiển thị “việc này đang chặn việc nào”.                                                              |

## 5.3. Ảnh và tệp đính kèm

Ảnh hiện trường và hồ sơ là bằng chứng chính của công việc nên được coi là chức năng lõi, không phải phần phụ.

| **Yêu cầu**            | **Mô tả**                                                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gắn vào đâu**        | Việc, việc con, mục checklist, nhận xét, kết quả nộp. Ảnh gắn vào mục checklist hiện cùng tiến độ 0/n.                                                                 |
| **Chụp và tải lên**    | Chụp trực tiếp từ điện thoại hoặc chọn từ thư viện; nhiều tệp một lần; kéo thả và dán từ clipboard trên máy tính. Ảnh tự nén cho nhẹ, giữ bản gốc nếu chọn.            |
| **Thông tin tự ghi**   | Người tải, thời gian; vị trí (định vị) nếu người dùng cho phép; ghi chú ngắn cho từng ảnh.                                                                             |
| **Loại tệp**           | Ảnh, PDF, Word/Excel/PowerPoint, văn bản, video ngắn; bản vẽ (CAD) chỉ lưu và tải về, không xem trước. Danh mục loại tệp do quản trị đặt.                              |
| **Giới hạn (tham số)** | Dung lượng tối đa mỗi tệp, số tệp mỗi việc, hạn mức dung lượng theo công ty và theo dự án; giá trị cụ thể do công ty quyết định.                                       |
| **Xem và quản lý**     | Xem trước ảnh và PDF ngay trong ứng dụng; thư viện ảnh dạng lưới của việc; **thư viện tệp của dự án** tổng hợp mọi đính kèm, lọc theo việc, người, loại, ngày.         |
| **Phiên bản**          | Tải bản mới của cùng một tệp thì giữ lịch sử phiên bản; ghi rõ bản hiện hành.                                                                                          |
| **Chú thích ảnh**      | Khoanh vùng, mũi tên, ghi chữ lên ảnh (làm ở giai đoạn sau).                                                                                                           |
| **Quyền và an toàn**   | Quyền xem tệp theo quyền xem việc; quét mã độc khi tải lên; ghi log tải xuống; xóa tệp đi vào thùng rác 30 ngày; tệp thuộc việc “Hạn chế” chỉ người được chỉ định xem. |
| **Ngoại tuyến**        | Ảnh chụp khi mất mạng xếp hàng trên thiết bị và tự tải lên khi có mạng, báo rõ ảnh nào chưa gửi được.                                                                  |

## 5.4. Giao việc – nhận việc

Giao việc – nhận việc nối kế hoạch với con người cụ thể. Xong Việc làm gọn: gán tên người phụ trách khi tạo việc, người nhận tick “Xong?”. Doanh nghiệp nhiều phòng ban cần thêm xác nhận, bằng chứng, duyệt và leo thang, nhưng **không phải dự án nào cũng cần**, nên v2.0 chia ba mức, chọn theo dự án và ghi đè theo từng việc hoặc từng mẫu.

### 5.4.1. Ba mức giao việc

| **Mức**                                               | **Giao**                                                 | **Nhận**                                                             | **Hoàn thành**                                                     | **Nhắc và leo thang**               |
| ----------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------- |
| **Nhẹ** – nhóm nhỏ, việc hằng ngày (như Xong Việc)    | Chọn người phụ trách khi tạo; được phép “Chưa giao”.     | Không cần xác nhận.                                                  | Người nhận tick “Xong” và cập nhật %.                              | Nhắc sắp đến hạn và trễ hạn.        |
| **Chuẩn** – phần lớn dự án                            | Bắt buộc có người nhận và hạn.                           | Nhận / Từ chối / Đề xuất hạn khác (lý do bắt buộc), có hạn phản hồi. | Nộp kết quả (ghi chú, ảnh, tệp); người giao xác nhận.              | Nhắc, báo người giao khi quá hạn.   |
| **Chặt** – hồ sơ pháp lý, nghiệm thu, việc rủi ro cao | Có người nhận, người duyệt; kiểm tra điều kiện sẵn sàng. | Xác nhận bắt buộc; OTP với việc quan trọng.                          | Bằng chứng bắt buộc; người duyệt khác người làm; trả lại có lý do. | Leo thang theo bậc đến cấp quản lý. |

### 5.4.2. Vai trò trong một việc

| **Vai trò**                      | **Trách nhiệm**                                                                              | **Quyền trên việc**                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Người giao**                   | Đặt mục tiêu, người nhận, hạn, tiêu chí; quyết định khi người nhận từ chối hoặc xin đổi hạn. | Tạo, sửa, hủy, giao lại, xem toàn bộ.               |
| **Người nhận chính**             | Một người duy nhất chịu trách nhiệm; xác nhận, thực hiện, cập nhật, nộp kết quả.             | Nhận/từ chối, cập nhật, chia việc con, xin gia hạn. |
| **Người phối hợp**               | Làm phần việc được phân hoặc cung cấp thông tin.                                             | Cập nhật phần của mình, bình luận.                  |
| **Người duyệt (mức Chuẩn/Chặt)** | Kiểm tra kết quả và bằng chứng; mặc định là người giao, đổi được.                            | Duyệt hoặc trả lại có lý do.                        |
| **Người theo dõi**               | Nắm tình trạng, không phải làm (lãnh đạo, phòng liên quan).                                  | Xem, nhận thông báo.                                |

Người nhận có thể chia việc con cho người khác nhưng vẫn chịu trách nhiệm về kết quả. Chuyển trách nhiệm chỉ có hiệu lực khi người giao đồng ý. Người giao không tự duyệt kết quả việc do chính mình thực hiện.

### 5.4.3. Vòng đời trạng thái (mức Chuẩn và Chặt)

|                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Luồng chính: Nháp → Đã giao (chờ nhận) → Đã nhận → Đang thực hiện → Chờ duyệt → Hoàn thành<br>Nhánh rẽ:<br>Đã giao → Từ chối / Đề xuất điều chỉnh (có lý do) → người giao quyết định<br>Đã giao → quá hạn xác nhận → nhắc → báo người giao và quản lý<br>Đang thực hiện → Tạm dừng / Bị chặn (có lý do)<br>Đang thực hiện → Xin gia hạn → người giao duyệt<br>Chờ duyệt → Trả lại (có lý do) → Đang thực hiện<br>Mức Nhẹ: Chưa làm → Đang làm → Đã xong<br>“Quá hạn” là cờ cảnh báo chồng lên trạng thái, không phải một trạng thái riêng. |

### 5.4.4. Điều chỉnh sau khi giao

| **Tình huống**                      | **Cách xử lý**                                                                                                     | **Ai quyết**    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------- |
| **Xin gia hạn**                     | Người nhận nêu lý do và hạn đề xuất. Nếu việc làm lệch mốc quan trọng của dự án thì thành yêu cầu đổi mốc (mục 9). | Người giao      |
| **Chuyển người nhận**               | Người giao chọn người mới, người cũ ghi chú bàn giao; người mới phải xác nhận.                                     | Người giao      |
| **Chia nhỏ việc**                   | Người nhận tạo việc con và giao cho người khác; % việc cha tính từ việc con.                                       | Không cần duyệt |
| **Đổi phạm vi**                     | Sửa mô tả hoặc tiêu chí; người nhận xác nhận lại.                                                                  | Người giao      |
| **Người nhận nghỉ phép, thôi việc** | Việc tự chuyển cho người được ủy quyền hoặc về hàng đợi của trưởng bộ phận.                                        | Trưởng bộ phận  |
| **Hủy việc**                        | Lý do bắt buộc, giữ lịch sử.                                                                                       | Người giao      |

### 5.4.5. Giao cho nhóm, liên phòng và người ngoài

- **Giao cho nhóm (hàng đợi):** thành viên nhấn “Nhận về mình” để thành người nhận chính; chưa ai nhận thì nhắc cả nhóm và báo trưởng nhóm.

- **Giao liên phòng, liên chi nhánh:** người nhận phải có quyền trong dự án; hệ thống đề xuất mời vào dự án nếu chưa có. Yêu cầu phối hợp giữa hai phòng là một việc có người yêu cầu xác nhận kết quả.

- **Giao cho nhà thầu, tư vấn, đối tác:** qua tài khoản khách có thời hạn, chỉ thấy việc của mình; hồ sơ nộp qua cổng được đóng dấu thời gian.

- **Kiểm tra khi giao:** người nhận có quyền? đang nghỉ phép hoặc đã ủy quyền? đang có bao nhiêu việc mở so với công suất? Chỉ cảnh báo, không chặn, trừ quy tắc bắt buộc do dự án bật (ví dụ chứng chỉ an toàn còn hạn cho việc rủi ro cao).

### 5.4.6. Màn hình “Việc của tôi”

Kế thừa “Việc hôm nay” của Xong Việc, gom việc của một người từ **mọi dự án** vào một nơi.

| **Tab**           | **Nội dung**                                                                | **Hành động nhanh**                 |
| ----------------- | --------------------------------------------------------------------------- | ----------------------------------- |
| **Chờ nhận**      | Việc mới giao chưa xác nhận, kèm đồng hồ hạn phản hồi (chỉ mức Chuẩn/Chặt). | Nhận · Từ chối · Đề xuất hạn khác   |
| **Hôm nay**       | Việc có hạn hôm nay hoặc đang thực hiện.                                    | Cập nhật % · Chụp ảnh · Nộp kết quả |
| **Trễ hạn**       | Việc quá hạn, xếp theo mức ảnh hưởng.                                       | Xin gia hạn · Báo vướng mắc         |
| **Sắp đến hạn**   | Việc đến hạn trong vài ngày tới.                                            | Cập nhật · Nhờ người phối hợp       |
| **Chờ tôi duyệt** | Kết quả của người khác chờ tôi duyệt.                                       | Duyệt · Trả lại                     |
| **Tôi đã giao**   | Việc tôi giao, tiến độ từng người.                                          | Nhắc · Đổi hạn · Giao lại           |
| **Tôi theo dõi**  | Việc tôi chỉ cần nắm.                                                       | Xem · Bình luận                     |
| **Mốc rủi ro**    | Mốc có nguy cơ trễ.                                                         | Xem việc liên quan                  |

Thiết kế cho điện thoại: danh sách dạng thẻ, một thao tác cho mỗi hành động chính, hiển thị **vì sao việc này quan trọng** (việc nào đang chờ nó, mốc nào bị ảnh hưởng), làm việc được khi mất mạng và tự đồng bộ.

### 5.4.7. Leo thang và đo lường

- Leo thang theo bậc cấu hình, ví dụ: quá hạn 1 ngày nhắc người nhận, quá 3 ngày báo người giao, quá 5 ngày báo trưởng bộ phận, việc quan trọng báo giám đốc chi nhánh. Số ngày là tham số do công ty đặt.

- Chỉ số theo người và phòng: tỷ lệ việc đúng hạn, thời gian phản hồi nhận việc, tỷ lệ bị trả lại, tỷ lệ từ chối hoặc xin gia hạn, tải công việc (mục 10).

- Các chỉ số phục vụ cải tiến điều hành. Việc dùng chúng để đánh giá, khen thưởng, kỷ luật do công ty quyết định bằng quy chế, minh bạch với người lao động, và không dựa vào số liệu thô khi nguyên nhân trễ nằm ngoài tầm kiểm soát của người nhận.

## 5.5. Trao đổi và nhận xét

- Nhận xét gắn với từng việc, từng việc con, từng mục checklist; hỗ trợ **@nhắc tên**, trả lời theo chuỗi, đính kèm ảnh và tệp.

- Nhận xét có thể đánh dấu là “câu hỏi cần trả lời” kèm hạn; việc có câu hỏi chưa trả lời hiện cờ.

- Nhận xét đã gửi chỉ sửa trong thời gian ngắn và có đánh dấu “đã sửa”; không xóa được nội dung đã gửi để giữ truy vết (người quản trị dự án được ẩn nội dung sai, có ghi log).

- Nhắc tên người chưa có quyền trong dự án thì hệ thống hỏi có mời họ vào không.

## 5.6. Các chế độ xem

| **Chế độ**              | **Nội dung**                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Danh sách / Bảng**    | Cây việc và việc con thu gọn, mở rộng; bật tắt cột: ghi chú, người phụ trách, nhãn, trạng thái, %, tệp, trường tùy chỉnh; sắp xếp, lọc, nhóm theo người hoặc nhãn. |
| **Kanban**              | Cột theo trạng thái, người hoặc nhãn; kéo thả đổi trạng thái; thẻ hiện người, hạn, số tệp, số việc con.                                                            |
| **Timeline (Gantt)**    | Thanh theo ngày công, kéo thả đổi ngày, đường nối phụ thuộc, mốc hình thoi, thu phóng ngày/tuần; baseline và đường găng là tùy chọn.                               |
| **Lịch**                | Việc và mốc theo tháng hoặc tuần, kéo thả đổi hạn; lọc theo người, nhãn.                                                                                           |
| **Việc của tôi**        | Xem mục 5.4.6.                                                                                                                                                     |
| **Tổng hợp dự án**      | Tiến độ chung, dự báo hoàn thành, phân bổ trạng thái, việc trễ, mốc rủi ro, tải theo người.                                                                        |
| **Thẻ trên điện thoại** | “Thẻ thay bảng, không cuộn ngang”.                                                                                                                                 |

Người dùng lưu **bộ lọc và chế độ xem riêng** (ví dụ “Việc của Pháp chế trễ hạn”), có thể chia sẻ cho cả dự án.

## 5.7. Lịch và phụ thuộc

- Tính theo **ngày làm việc**; lịch nghỉ tuần và ngày lễ cấu hình theo dự án.

- Ba kiểu nối việc theo cách gọi của Xong Việc (Cuốn chiếu, Gối đầu, Xong mới làm) kèm độ trễ ± ngày; tùy chọn **tự dời** các việc sau khi đổi ngày việc trước.

- Việc chưa đủ điều kiện (việc trước chưa xong) hiển thị “Bị chặn” kèm lý do; dự án chọn **chỉ cảnh báo** hoặc **không cho chuyển Đang làm**. Mặc định chỉ cảnh báo.

- Dự báo hoàn thành từ tiến độ thực tế; **baseline** (lưu kế hoạch gốc để so sánh) và **đường găng** là tùy chọn bật theo dự án.

- Mốc có thể kèm checklist điều kiện, dùng làm “cổng” giữa các giai đoạn (mục 7.3).

## 5.8. Thông báo và nhắc việc

| **Sự kiện**                                  | **Người nhận thông báo**                 | **Ghi chú**                                       |
| -------------------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| **Được giao việc**                           | Người nhận, người theo dõi               | Kèm nút Nhận/Từ chối (mức Chuẩn/Chặt).            |
| **Sắp đến hạn (T-3, T-1)**                   | Người nhận                               | Gộp thành bản tóm tắt cuối ngày để tránh dồn dập. |
| **Quá hạn**                                  | Người nhận, người giao, quản lý theo bậc | Cho phép ghi lý do.                               |
| **Được nhắc tên, có nhận xét mới**           | Người liên quan                          | Trả lời ngay trong thông báo.                     |
| **Xin gia hạn, từ chối, đề xuất điều chỉnh** | Người giao                               | Cần quyết định trong hạn.                         |
| **Kết quả chờ duyệt, bị trả lại**            | Người duyệt; người nhận                  | Đồng hồ hạn duyệt; kèm lý do khi trả lại.         |
| **Ảnh, tệp mới trên việc tôi theo dõi**      | Người theo dõi                           | Gộp theo việc.                                    |

Kênh: thông báo đẩy trong ứng dụng và email. Kênh nhắn tin ngoài (Zalo/ZNS, SMS) chỉ dùng cho nội dung ngắn như “Bạn có việc mới cần nhận”, không chứa tài liệu hay thông tin nhạy cảm. Người dùng chọn tần suất gộp tin; việc khẩn luôn gửi ngay.

## 5.9. Tìm kiếm, nhãn và trường tùy chỉnh

- **Tìm kiếm toàn văn** trong tên việc, mô tả, nhận xét và tên tệp; lọc nhanh theo người, hạn, trạng thái, nhãn, dự án.

- **Nhãn có màu** dùng chung theo công ty hoặc riêng từng dự án; bộ nhãn chuẩn do quản trị đặt để hạn chế nhãn lộn xộn.

- **Trường tùy chỉnh** (văn bản, số, ngày, danh sách chọn, người, đường dẫn) tạo theo dự án hoặc theo mẫu. Đây là cách để các phòng thêm thông tin riêng (ví dụ “Cơ quan giải quyết”, “Mã thửa”, “Mác bê tông”) mà không cần sửa hệ thống.

## 5.10. Báo cáo, in, xuất và chia sẻ

- **In và xuất hồ sơ tiến độ:** A3/A4 ngang, chọn phạm vi ngày, nhóm việc, mức chi tiết (đầy đủ hoặc chỉ nhóm việc), cột nhãn; đầu trang và **khung chữ ký nhiều bên** cấu hình được (mặc định 3 bên như Xong Việc).

- **Xuất dữ liệu:** Excel, PDF, CSV, JSON; xuất cần quyền riêng và ghi nhật ký.

- **Báo cáo định kỳ:** gửi tuần/tháng qua email cho người theo dõi và lãnh đạo.

- **Chia sẻ ra ngoài:** thay link công khai bằng cổng đối tác — đăng nhập hoặc link xem có hạn, quyền chỉ xem, watermark, log truy cập; không công khai mặc định.

## 5.11. An toàn thao tác

- **Hoàn tác** sau các thao tác lớn (nạp mẫu, nhập file, thao tác hàng loạt).

- **Thùng rác 30 ngày** cho dự án, việc và tệp đã xóa; khôi phục lại được.

- **Lịch sử thay đổi** theo từng việc và từng dự án; không sửa, không xóa được.

- Hộp xác nhận khi bỏ dở biểu mẫu; cảnh báo khi xóa việc có việc con hoặc tệp.

## 5.12. Việc sinh từ cuộc họp và từ cảnh báo

- **Biên bản họp:** mỗi dòng kết luận chuyển thành việc có người nhận và hạn; việc tồn đọng từ biên bản trước hiện đầu danh sách ở cuộc họp sau.

- **Việc tự sinh theo quy tắc** do người dùng cấu hình: mốc sắp tới hạn, việc lặp lại đến kỳ, mẫu “khi xong A thì tạo việc B giao cho C”. Quy tắc mặc định rất ít; hệ thống không tự tạo việc nếu chưa có người bật quy tắc.

- Cổng tích hợp cho mô-đun mở rộng: mô-đun khác (ticket, đơn hàng, nhắc nợ) có thể tạo việc qua API (mục 12).

# 6. Thư viện mẫu và quản lý mẫu

Thay cho các phân hệ nghiệp vụ xây dựng của v1.1, v2.0 chỉ cung cấp **một số mẫu có sẵn** và công cụ để công ty tự tạo thêm mẫu. Cách tiếp cận này giữ được kinh nghiệm ngành mà không buộc người dùng theo một quy trình cố định.

## 6.1. Nguyên tắc

- **Mẫu là gợi ý, không phải ràng buộc.** Nạp mẫu xong, dự án là dữ liệu thường; sửa, thêm, bớt, xóa tự do, không còn liên kết ngược với mẫu.

- **Ít mẫu, chất lượng:** khởi đầu chỉ khoảng 8 mẫu cốt lõi (mục 6.4); phòng chuyên môn tự bổ sung.

- **Một mẫu gồm cấu trúc, không gồm số liệu thật:** không chứa giá, khối lượng hay thông tin hộ dân.

## 6.2. Một mẫu gồm những gì

| **Thành phần**             | **Mô tả**                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Cấu trúc việc**          | Nhóm việc, việc, việc con, mốc, checklist, thời lượng gợi ý, quan hệ phụ thuộc.                                                 |
| **Vai trò**                | Tên vai trò thay cho người cụ thể (ví dụ “Chuyên viên pháp lý”, “Trưởng phòng duyệt”); khi nạp mẫu chọn người cho từng vai trò. |
| **Mức giao việc gợi ý**    | Mức nhẹ/chuẩn/chặt mặc định cho cả mẫu hoặc từng việc (ví dụ việc nộp hồ sơ pháp lý đặt mức Chặt).                              |
| **Tệp mẫu đính kèm**       | Biểu mẫu, hướng dẫn, danh mục thành phần hồ sơ.                                                                                 |
| **Nhãn, trường tùy chỉnh** | Bộ nhãn và trường đi kèm (ví dụ “Cơ quan giải quyết”).                                                                          |
| **Việc lặp lại, cổng**     | Việc định kỳ và mốc cổng tùy chọn (mục 7.3).                                                                                    |

## 6.3. Quản lý mẫu

| **Chức năng**  | **Mô tả**                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Tạo mẫu**    | “Lưu làm mẫu riêng” từ một dự án hoặc một nhóm việc đang có; hệ thống bỏ ngày, người, tệp thật và đề nghị gán vai trò.                     |
| **Cấp sở hữu** | Cá nhân, phòng/chi nhánh, toàn công ty. Mẫu cấp công ty và chi nhánh do người được cấp quyền công bố (có thể qua luồng duyệt, mục 9).      |
| **Phiên bản**  | Sửa mẫu tạo phiên bản mới; dự án đã nạp không bị ảnh hưởng.                                                                                |
| **Nạp mẫu**    | Dời ngày theo ngày khởi công và lịch nghỉ; gán người theo vai trò; nạp vào dự án mới hoặc vào dự án đang mở (thay hoặc thêm); có hoàn tác. |
| **Mẫu việc**   | Mẫu cho một việc đơn lẻ có checklist (ví dụ “Nghiệm thu cốt thép”, “Bổ sung hồ sơ pháp lý”), chèn nhanh vào bất kỳ dự án.                  |
| **Thống kê**   | Số lần dùng, người dùng nhiều, mẫu lâu không dùng để dọn.                                                                                  |
| **Mức mật**    | Mẫu nội bộ hoặc hạn chế người xem.                                                                                                         |

## 6.4. Danh mục mẫu khởi đầu đề xuất

Đây là khung gợi ý để các phòng đối chiếu và chỉnh. Danh mục thủ tục, thành phần hồ sơ và thứ tự bước cần Pháp chế, Kỹ thuật, Kế hoạch xác nhận theo quy định hiện hành.

| **Mẫu**                          | **Cấu trúc gợi ý (nhóm việc)**                                                                                                                                                  | **Ghi chú**                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **1. Triển khai KCN tổng thể**   | A. Nghiên cứu, chủ trương · B. Pháp lý, quy hoạch · C. Giải phóng mặt bằng · D. San lấp · E. Hạ tầng kỹ thuật · F. Nghiệm thu, bàn giao · G. Kinh doanh, cho thuê · H. Vận hành | Có mốc cổng G0–G6 tùy chọn (mục 7).                                                   |
| **2. Thủ tục pháp lý một hồ sơ** | Chuẩn bị hồ sơ · Trình duyệt nội bộ · Nộp cơ quan · Bổ sung theo yêu cầu · Nhận kết quả · Lưu trữ                                                                               | Trường tùy chỉnh: cơ quan, số hồ sơ, ngày hết hạn. Mức giao việc Chặt.                |
| **3. Giải phóng mặt bằng**       | Thông báo thu hồi · Kiểm đếm · Lập phương án · Niêm yết, lấy ý kiến · Phê duyệt · Chi trả · Bàn giao mặt bằng                                                                   | Nhân bản một nhóm việc cho mỗi khu hoặc mỗi hộ; thông tin hộ dân đặt mức mật Hạn chế. |
| **4. San lấp mặt bằng**          | Khảo sát · Chuẩn bị mặt bằng · Đào đắp, vận chuyển · Đầm nén · Nghiệm thu cao độ                                                                                                | Chia theo khu hoặc ô lưới bằng nhóm việc.                                             |
| **5. Hạ tầng cầu đường**         | Nền · Móng · Mặt đường · Cống, rãnh · Hoàn thiện · Nghiệm thu                                                                                                                   | Chia theo đoạn tuyến bằng nhóm việc.                                                  |
| **6. Vận hành định kỳ**          | Kiểm tra an toàn hằng tuần · Bảo trì hạ tầng theo lịch · Chốt chỉ số điện nước hằng tháng · Báo cáo môi trường định kỳ                                                          | Toàn bộ là việc lặp lại.                                                              |
| **7. Trạm trộn: kế hoạch tháng** | Giao chỉ tiêu cho nhân viên · Chăm sóc khách · Nhắc nợ · Bảo trì thiết bị định kỳ                                                                                               | Chỉ tiêu và nhắc nợ giao như việc; số liệu bán hàng thuộc mô-đun mở rộng.             |
| **8. Họp giao ban**              | Chuẩn bị · Họp · Kết luận → việc giao · Theo dõi tồn đọng                                                                                                                       | Mỗi kết luận thành một việc (mục 5.12).                                               |

## 6.5. Nhập từ file

- Nhập từ Excel, CSV hoặc PDF (kể cả dự toán, bảng kế hoạch hiện có); AI đề xuất nhóm việc, việc, thời lượng.

- **Bắt buộc có bước người kiểm tra** (xem trước, sửa, bỏ dòng) trước khi nạp; có hoàn tác.

- Không đưa tài liệu mật lên dịch vụ AI bên ngoài khi chưa có thỏa thuận bảo mật; công ty đặt chính sách theo mức mật.

# 7. Triển khai KCN trên nền quản lý công việc

Mục này giữ lại giá trị của mục 7 trong v1.1 nhưng viết lại theo hướng: đây là **cách dùng hệ thống cho dự án KCN**, không phải tính năng cứng. Toàn bộ dựa trên mẫu “Triển khai KCN” (mục 6.4) và các công cụ lõi.

## 7.1. Ba lớp quản trị

|                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Danh mục (Portfolio): nhiều KCN, nhiều chi nhánh ← lãnh đạo xem tổng hợp<br>└─ Dự án KCN (chủ dự án: Giám đốc dự án)<br>└─ Giai đoạn A–H (nhóm việc; chủ: trưởng bộ phận chủ trì)<br>└─ Phân khu / Gói việc (chủ: Chỉ huy trưởng hoặc QLDA gói)<br>└─ Việc ─ Việc con ← giao hằng ngày cho từng người, tổ đội |

- Mỗi cấp có đúng một người chịu trách nhiệm; % hoàn thành và ngày cộng dồn từ dưới lên; một việc trễ trên đường găng đổi màu lên tận danh mục.

- Một KCN thường làm hạ tầng từng phân khu và cho thuê song song: mỗi phân khu là một nhóm việc riêng, dùng chung hồ sơ pháp lý của dự án.

## 7.2. Giai đoạn, chủ trì và đầu ra gợi ý

| **Giai đoạn**                 | **Đầu ra gợi ý (đính kèm vào mốc)**                | **Chủ trì gợi ý**           | **Cổng tùy chọn** |
| ----------------------------- | -------------------------------------------------- | --------------------------- | ----------------- |
| **A. Nghiên cứu, chủ trương** | Báo cáo nghiên cứu; văn bản chủ trương đầu tư      | Kế hoạch / Phát triển dự án | G0                |
| **B. Pháp lý, quy hoạch**     | Bộ văn bản pháp lý theo danh mục thủ tục của dự án | Pháp chế                    | G1                |
| **C. Giải phóng mặt bằng**    | Biên bản bàn giao mặt bằng theo khu vực            | Ban GPMB / chi nhánh        | G2                |
| **D. San lấp**                | Biên bản nghiệm thu nền, khối lượng                | Chỉ huy trưởng / Kỹ thuật   | G3                |
| **E. Hạ tầng kỹ thuật**       | Biên bản nghiệm thu hạng mục, bản vẽ hoàn công     | Chỉ huy trưởng / Kỹ thuật   | G4                |
| **F. Nghiệm thu, bàn giao**   | Hồ sơ hoàn công, biên bản bàn giao                 | Kỹ thuật / Kế toán          | G5                |
| **G. Kinh doanh, cho thuê**   | Hợp đồng thuê, biên bản bàn giao lô                | Kinh doanh KCN              | G6                |
| **H. Vận hành**               | Báo cáo vận hành định kỳ                           | Vận hành                    | Liên tục          |

_Tên cổng G0–G6 là cách gọi trong tài liệu. Danh mục văn bản, thẩm quyền và điều kiện cụ thể do Pháp chế và Kỹ thuật xác nhận; được cấu hình bằng dữ liệu và checklist trong mẫu, không viết cứng vào hệ thống._

## 7.3. Cổng giữa các giai đoạn (tùy chọn)

- Cổng là một **mốc có checklist điều kiện** (ví dụ “Đủ pháp lý để khởi công”: quyết định giao đất, giấy phép xây dựng…), mỗi điều kiện có thể đính kèm văn bản.

- Dự án chọn **chế độ cổng**: (a) chỉ nhắc nhở và hiển thị trên dashboard; (b) **khóa mềm** — việc phía sau không cho chuyển Đang làm cho đến khi cổng đạt, người có quyền được ngoại lệ và ghi lý do. Mặc định (a).

- Cổng đạt khi toàn bộ điều kiện được tick và người duyệt cổng xác nhận (qua luồng duyệt, mục 9).

## 7.4. Nhịp điều hành và việc sinh từ cuộc họp

| **Nhịp**       | **Chủ trì**           | **Dữ liệu xem trên hệ thống**                                         | **Đầu ra**                                                  |
| -------------- | --------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Hằng ngày**  | Chỉ huy trưởng        | Việc hôm nay, việc trễ, ảnh và nhận xét mới.                          | Việc giao trong ngày cho tổ đội.                            |
| **Hằng tuần**  | Giám đốc dự án / QLDA | Lịch 2–6 tuần tới, việc trễ, việc bị chặn, hồ sơ pháp lý sắp đến hạn. | Biên bản họp, mỗi kết luận thành việc có người nhận và hạn. |
| **Hằng tháng** | Giám đốc chi nhánh    | Tổng hợp tiến độ các dự án, việc quá hạn, tải theo phòng.             | Điều chỉnh nguồn lực, đổi mốc.                              |
| **Hằng quý**   | Tổng giám đốc         | Danh mục xanh/vàng/đỏ, các cổng, KCN đang vận hành.                   | Chỉ đạo cấp công ty.                                        |

## 7.5. Sổ rủi ro và chuyển giao

- **Sổ rủi ro** là một nhóm việc trong dự án với trường tùy chỉnh (nhóm rủi ro, xác suất, tác động, chủ rủi ro, biện pháp, hạn); rủi ro mức cao do người dùng đặt cờ thì có việc giao cho chủ rủi ro và hiện trong cuộc họp tuần.

- **Chuyển giao giữa các bộ phận** (từ thi công sang kinh doanh, sang vận hành) là một việc giao có người nhận xác nhận, để không bỏ sót đầu mối. Việc bàn giao có thể đính kèm bản vẽ hoàn công và hồ sơ bảo hành.

# 8. Phân quyền

## 8.1. Mô hình

Quyền = **vai trò** (làm được gì) × **phạm vi** (trên dữ liệu nào), cộng với mức mật của dự án hoặc việc. Phạm vi: toàn công ty, chi nhánh, phòng ban, dự án, chỉ việc được giao.

## 8.2. Vai trò

| **Cấp**       | **Vai trò**                                             | **Phạm vi và quyền chính**                                                                      |
| ------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Hệ thống**  | Quản trị hệ thống (IT)                                  | Cấu hình, người dùng, hạn mức tệp, nhãn chuẩn; không tự xem nội dung dự án mật.                 |
| **Công ty**   | Lãnh đạo (TGĐ, Phó TGĐ)                                 | Xem tổng hợp toàn công ty theo dashboard; vào dự án khi được mời hoặc theo quyền “xem toàn bộ”. |
| **Chi nhánh** | Giám đốc chi nhánh, Ban QLDA                            | Xem và quản lý các dự án của chi nhánh.                                                         |
| **Phòng ban** | Trưởng phòng/nhóm                                       | Xem việc của phòng mình xuyên dự án; duyệt mẫu cấp phòng.                                       |
| **Dự án**     | Chủ dự án, Quản lý, Thành viên, Hạn chế, Bình luận, Xem | Theo bảng 8.3.                                                                                  |
| **Bên ngoài** | Khách ngoài (nhà thầu, tư vấn, chủ đầu tư, đối tác)     | Chỉ phần được mời, có thời hạn, tự thu hồi khi hết hạn.                                         |

## 8.3. Quyền theo vai trò trong dự án (mẫu khởi đầu)

_“Của mình” nghĩa là chỉ trên việc được giao hoặc do mình tạo._

| **Chức năng**                   | **Chủ DA** | **Quản lý** | **Thành viên**     | **Hạn chế** | **Bình luận** | **Xem** | **Khách ngoài** |
| ------------------------------- | ---------- | ----------- | ------------------ | ----------- | ------------- | ------- | --------------- |
| **Xem dự án**                   | Có         | Có          | Có                 | Của mình    | Có            | Có      | Của mình        |
| **Tạo, sửa việc và việc con**   | Có         | Có          | Có                 | Của mình    | —             | —       | Của mình        |
| **Giao việc, đổi người nhận**   | Có         | Có          | Có                 | —           | —             | —       | —               |
| **Cập nhật tiến độ, checklist** | Có         | Có          | Có                 | Của mình    | —             | —       | Của mình        |
| **Đính kèm ảnh, tệp**           | Có         | Có          | Có                 | Của mình    | Có            | —       | Của mình        |
| **Xóa tệp của người khác**      | Có         | Có          | —                  | —           | —             | —       | —               |
| **Bình luận, @nhắc tên**        | Có         | Có          | Có                 | Có          | Có            | —       | Của mình        |
| **Duyệt kết quả (nếu bật)**     | Có         | Có          | Nếu là người duyệt | —           | —             | —       | —               |
| **Sửa cấu trúc, cài đặt dự án** | Có         | Có          | —                  | —           | —             | —       | —               |
| **Mời, thu hồi thành viên**     | Có         | Có          | —                  | —           | —             | —       | —               |
| **Lưu làm mẫu**                 | Có         | Có          | —                  | —           | —             | —       | —               |
| **Xuất dữ liệu**                | Có         | Có          | Theo cấu hình      | —           | —             | —       | —               |
| **Xóa, lưu trữ dự án**          | Có         | —           | —                  | —           | —             | —       | —               |

Ma trận là mẫu khởi đầu, cần rà soát với quy chế nội bộ. Quản lý chi nhánh và lãnh đạo xem tổng hợp theo phạm vi mà không cần là thành viên; việc đặt mức “Hạn chế” hiển thị cho họ là “Việc hạn chế” kèm tiến độ, không lộ nội dung.

## 8.4. Nguyên tắc an toàn

- **Tách nhiệm vụ khi bật duyệt:** người tạo đề nghị không duyệt chính đề nghị đó; người giao không tự duyệt việc mình làm.

- **Ủy quyền có thời hạn:** người vắng mặt ủy quyền cho người khác với ngày bắt đầu và kết thúc, tự hết hiệu lực, có log.

- **Khách ngoài:** mời theo dự án, có hạn, tự thu hồi; chỉ thấy việc của mình; có thể bắt buộc watermark khi xem tệp.

- **Xác thực:** 2 lớp (2FA) cho người duyệt, người xem dự án mật và quản trị; SSO nếu công ty đang dùng.

- **Nhật ký truy cập bất biến:** ai – làm gì – lúc nào – giá trị cũ/mới – thiết bị; ghi cả lần xem, tải và xuất tệp hoặc dữ liệu ở dự án mật.

- **Mức mật:** “Thường” (mọi thành viên dự án) và “Hạn chế” (chỉ người được chỉ định); áp dụng cho dự án, nhóm việc, việc và tệp.

# 9. Phê duyệt (tùy chọn)

Phê duyệt không phải là trung tâm của hệ thống. Mặc định dự án không có luồng duyệt nào ngoài việc người giao xác nhận kết quả (mức Chuẩn). Khi cần kiểm soát chặt hơn, công ty cấu hình luồng duyệt cho một số loại phiếu.

## 9.1. Mô hình chung

|                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------ |
| Soạn thảo → Gửi duyệt → \[Cấp 1\] → \[Cấp 2\] → \[Cấp N\] → Có hiệu lực<br>└── Trả lại (lý do bắt buộc) → Soạn lại |

Mỗi bước duyệt có: người hoặc vai trò duyệt, thời hạn xử lý (SLA), hành động (Duyệt / Từ chối / Yêu cầu bổ sung / Chuyển tiếp), ghi chú, xác nhận OTP khi cần. Quá hạn thì nhắc, sau đó leo thang lên cấp trên. Luồng được định nghĩa bằng quy tắc cấu hình, không viết cứng trong mã.

## 9.2. Các loại phiếu có thể bật duyệt

| **Loại phiếu**                        | **Khi nào dùng**                         | **Chuỗi duyệt gợi ý**                                                            |
| ------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| **Duyệt kết quả việc**                | Dự án mức Chuẩn hoặc Chặt                | Người nhận → Người duyệt (mặc định là người giao).                               |
| **Xin gia hạn việc**                  | Việc làm lệch mốc quan trọng             | Người nhận → Người giao → Quản lý dự án.                                         |
| **Đổi mốc, đổi hạn dự án**            | Dịch chuyển mốc chính hoặc ngày bàn giao | Chủ dự án → Kế hoạch → Giám đốc chi nhánh → (Tổng giám đốc nếu trễ mốc cam kết). |
| **Cổng giữa giai đoạn**               | Dự án bật cổng (mục 7.3)                 | Người phụ trách điều kiện → Chủ dự án → cấp cao hơn theo quy chế.                |
| **Công bố mẫu cấp công ty/chi nhánh** | Muốn dùng chung                          | Tác giả mẫu → Trưởng phòng liên quan → Quản trị mẫu.                             |
| **Xuất dữ liệu dự án mật**            | Xuất danh sách, tệp hàng loạt            | Người yêu cầu → Chủ dự án.                                                       |
| **Mời khách ngoài vào dự án mật**     | Đối tác cần xem                          | Quản lý dự án → Chủ dự án.                                                       |

_Phát sinh khối lượng, chi phí, thanh toán và các luồng nghiệp vụ khác thuộc mô-đun mở rộng, dùng chung bộ máy duyệt này. Ngưỡng và số cấp do công ty đặt theo quy chế._

# 10. Dashboard và chỉ số KPI

## 10.1. Dashboard theo đối tượng

| **Đối tượng**                    | **Nội dung chính**                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Lãnh đạo**                     | Danh mục dự án xanh/vàng/đỏ, số việc trễ và mốc sắp tới hạn, các cổng chờ duyệt, phiếu chờ duyệt cấp cao, so sánh giữa các chi nhánh. |
| **Giám đốc chi nhánh**           | So sánh dự án trong chi nhánh, việc quá hạn, tải theo phòng, việc chờ duyệt lâu.                                                      |
| **Chủ dự án, quản lý dự án**     | Tiến độ chung, dự báo hoàn thành, phân bổ trạng thái, việc trễ, việc bị chặn, tải theo người, hoạt động gần đây.                      |
| **Trưởng phòng, trưởng bộ phận** | Ma trận người × trạng thái việc, việc chờ nhận quá hạn, việc chờ duyệt, tải công việc từng người, Kanban của phòng.                   |
| **Cá nhân**                      | “Việc của tôi” (mục 5.4.6), việc tôi giao, việc tôi theo dõi.                                                                         |

## 10.2. Bộ KPI quản lý công việc

| **Nhóm**      | **Chỉ số**                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Tiến độ**   | % hoàn thành theo dự án, nhóm việc; số việc và mốc trễ; ngày dự báo hoàn thành; % việc đúng hạn.                                                 |
| **Giao việc** | Tỷ lệ việc đúng hạn, thời gian phản hồi nhận việc, tỷ lệ bị trả lại, tỷ lệ từ chối và xin gia hạn, việc quá hạn theo nguyên nhân, tải công việc. |
| **Cộng tác**  | Việc không cập nhật quá N ngày, số nhận xét chưa trả lời, số tệp và ảnh bổ sung theo tuần.                                                       |
| **Phê duyệt** | Thời gian duyệt trung bình mỗi cấp, số phiếu quá SLA.                                                                                            |
| **Mẫu**       | Số lần dùng mẫu, tỷ lệ việc từ mẫu bị xóa hoặc đổi nhiều (gợi ý chỉnh mẫu).                                                                      |
| **Hệ thống**  | Người dùng hoạt động, dung lượng tệp theo dự án, số thông báo gửi và tỷ lệ mở.                                                                   |

Chỉ số theo từng cá nhân là dữ liệu nhân sự nhạy cảm: chỉ người có thẩm quyền xem, có nhật ký truy cập, và không tự động dẫn tới quyết định lương, thưởng hay kỷ luật. Các KPI chuyên ngành (doanh thu, EVM, chất lượng, an toàn…) thuộc mô-đun mở rộng.

# 11. Kiến trúc công nghệ đề xuất

Doanh nghiệp không nên sao chép mô hình dữ liệu nằm trên máy cá nhân của Xong Việc vì dữ liệu cần tập trung, kiểm soát và truy vết. Đề xuất **server-first**, kèm **bộ nhớ đệm ngoại tuyến có kiểm soát** cho hiện trường (ghi tạm trên thiết bị, đồng bộ khi có mạng, có cơ chế xử lý xung đột).

| **Lớp**                    | **Đề xuất**                                                                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Giao diện**              | Web app đa thiết bị (PWA): Timeline, Kanban, bảng mạnh trên máy tính; thẻ và biểu mẫu nhanh trên điện thoại (tạo việc, chụp ảnh, giọng nói).                                     |
| **Máy chủ**                | API theo module (Dự án và việc, Giao việc, Tệp, Thông báo, Mẫu, Phân quyền, Duyệt); khởi đầu dạng modular monolith, tách dịch vụ khi cần.                                        |
| **Cơ sở dữ liệu**          | CSDL quan hệ (ví dụ PostgreSQL) với cấu trúc cây cho việc con và trường tùy chỉnh (JSON có chỉ mục).                                                                             |
| **Dịch vụ tệp**            | Lưu tệp trên object storage mã hóa; tạo ảnh thu nhỏ và xem trước; nén ảnh; quét mã độc; đường dẫn tải có chữ ký và thời hạn; hạn mức dung lượng; lưu trữ lạnh cho dự án đã đóng. |
| **Đồng bộ và ngoại tuyến** | Hàng đợi thao tác trên thiết bị (kể cả ảnh), đồng bộ có cảnh báo xung đột; cập nhật theo thời gian thực giữa người dùng (nhận xét, trạng thái).                                  |
| **Thông báo**              | Hàng đợi thông báo có gộp tin, lịch nhắc, quy tắc leo thang; kênh đẩy, email; Zalo/ZNS, SMS chỉ cho tin ngắn không nhạy cảm.                                                     |
| **Tìm kiếm**               | Tìm toàn văn việc, nhận xét, tên tệp; OCR cho tệp scan (giai đoạn sau).                                                                                                          |
| **Xác thực và quyền**      | SSO, 2FA, RBAC kết hợp phạm vi dữ liệu (chi nhánh – dự án – phòng ban – mức mật); OTP cho bước duyệt quan trọng.                                                                 |
| **Quy tắc và workflow**    | Bộ máy luồng duyệt và leo thang cấu hình được bằng bảng quy tắc; quy tắc tự sinh việc do người dùng bật.                                                                         |
| **AI**                     | Nhập từ Excel/PDF dựng cấu trúc việc, tóm tắt tiến độ và biên bản; mọi kết quả qua bước người kiểm tra; chính sách dữ liệu mật.                                                  |
| **Mở rộng**                | API và webhook công khai nội bộ cho mô-đun chuyên ngành tạo việc, đọc trạng thái; trường tùy chỉnh để gắn dữ liệu riêng.                                                         |
| **Bảo mật và vận hành**    | Sao lưu và phục hồi thảm họa, mã hóa truyền và lưu, log tập trung, kiểm thử xâm nhập định kỳ, tuân thủ quy định bảo vệ dữ liệu cá nhân.                                          |

## 11.1. Trải nghiệm trên điện thoại

| **Nguyên tắc**                 | **Áp dụng**                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| **Tạo việc dưới 30 giây**      | Nút “+” nổi: gõ tên, chọn người, chọn hạn; ghi giọng nói; chụp ảnh gắn thẳng vào việc. |
| **Một thao tác, một mục đích** | “Việc của tôi” hiện đúng hành động cần làm: nhận, cập nhật, nộp, duyệt.                |
| **Chọn thay vì gõ**            | Danh sách người, nhãn, nhóm việc, mẫu việc.                                            |
| **Ngoại tuyến**                | Soạn việc, nhận xét, chụp ảnh khi mất sóng; tự đồng bộ.                                |
| **Mã QR (tùy chọn)**           | Quét mã dán tại hiện trường để mở nhanh một việc hoặc một dự án.                       |
| **Chữ ký trên màn hình**       | Xác nhận nghiệm thu hoặc biên bản tại chỗ, kèm OTP với bước quan trọng.                |

# 12. Mô-đun mở rộng (ngoài lõi)

Các nội dung dưới đây đã được phân tích ở v1.1 và **vẫn nằm trong bản v1.1 để tham chiếu**. Trong v2.0 chúng không thuộc lõi; chỉ làm khi có nhu cầu rõ và bộ phận sở hữu nghiệp vụ.

| **Mô-đun**                                    | **Phạm vi đã phân tích (mục trong v1.1)**                                                      | **Cách nối với lõi**                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Bán hàng trạm trộn**                        | Khách hàng, báo giá, đơn hàng, phiếu giao, doanh thu, công nợ, chỉ tiêu từng nhân viên (mục 9) | Chỉ tiêu và nhắc nợ sinh việc giao qua API; số liệu hiển thị bằng dashboard riêng; trường tùy chỉnh gắn mã khách, mác. |
| **Vận hành KCN**                              | Lô đất, khách thuê, tiện ích, bảo trì, ticket và SLA (mục 5.4)                                 | Ticket tạo việc có SLA; bảo trì định kỳ là việc lặp lại.                                                               |
| **Chi phí, hợp đồng, thanh toán**             | Ngân sách, hợp đồng, khối lượng nghiệm thu, thanh toán, EVM (mục 5.5, 6.4, 6.10)               | Hợp đồng và đợt thanh toán liên kết với việc hoặc mốc; dùng chung bộ máy duyệt.                                        |
| **Chất lượng và nghiệm thu**                  | ITP, biên bản, NCR, hold point (mục 6.5)                                                       | Hold point thành cổng/khóa mềm trước việc kế; NCR thành việc cần đóng.                                                 |
| **An toàn – môi trường**                      | Giấy phép làm việc, huấn luyện, sự cố (mục 6.6)                                                | Điều kiện chứng chỉ khi giao việc rủi ro; sự cố thành việc khắc phục.                                                  |
| **Nhật ký thi công, hồ sơ hoàn công, bản vẽ** | Nhật ký ngày, thư mục hoàn công, phiên bản bản vẽ (mục 6.9)                                    | Nhật ký là loại việc lặp hằng ngày; hoàn công dùng thư viện tệp có cấu trúc thư mục.                                   |
| **GPMB theo thửa, bản đồ**                    | Danh mục thửa/hộ, trạng thái, GIS (mục 6.11.1)                                                 | Mỗi thửa là một nhóm việc nhân bản từ mẫu; bản đồ là mô-đun hiển thị riêng.                                            |

Quy tắc kết nối: mô-đun **không sửa lõi**. Nó dùng việc, trường tùy chỉnh, nhãn, liên kết và API/webhook của lõi, nhờ đó lõi vẫn gọn, và công ty chỉ trả công cho phần thực sự dùng.

# 13. Lộ trình triển khai

| **Giai đoạn**                         | **Thời gian tham khảo** | **Nội dung**                                                                                                                                                                                                                            | **Kết quả**                                   |
| ------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **0. Khảo sát và chuẩn hóa**          | 3–4 tuần                | Phỏng vấn các phòng và hiện trường; chốt cây tổ chức, vai trò, quy ước nhãn; chọn dự án thí điểm; dùng thử bản có tài khoản của Xong Việc để xác minh các điểm chưa quan sát được.                                                      | Tài liệu yêu cầu chốt, danh sách mẫu ưu tiên. |
| **1. Lõi quản lý việc (MVP)**         | 2–3 tháng               | Tổ chức, chi nhánh, phân quyền; dự án, nhóm việc, việc, việc con, mốc, checklist; giao việc mức Nhẹ và Chuẩn; ảnh và tệp đính kèm; nhận xét; danh sách, Kanban, Timeline; Việc của tôi; thông báo cơ bản; thùng rác, hoàn tác, lịch sử. | Chạy thử 1–2 dự án.                           |
| **2. Giao việc nâng cao và duyệt**    | 1–1,5 tháng             | Xác nhận nhận việc, từ chối và đề xuất hạn, leo thang quá hạn, mức Chặt (bằng chứng, người duyệt), luồng duyệt cấu hình, ủy quyền, việc sinh từ biên bản họp.                                                                           | Điều hành bằng việc giao có kiểm soát.        |
| **3. Mẫu, lịch, nhập AI, báo cáo**    | 1,5–2 tháng             | Thư viện mẫu và quản lý mẫu; nhập từ Excel/PDF bằng AI; chế độ Lịch; việc lặp lại; phụ thuộc, baseline, đường găng; in, xuất, khung chữ ký; trường tùy chỉnh.                                                                           | Khởi tạo dự án nhanh, báo cáo giấy.           |
| **4. Đa chi nhánh và mở rộng**        | 1–2 tháng               | Dashboard danh mục và chi nhánh; KPI giao việc; cổng khách ngoài; tìm kiếm toàn văn; API/webhook; tích hợp email, Zalo/ZNS, SSO.                                                                                                        | Điều hành toàn công ty.                       |
| **5. Mô-đun chuyên ngành (tùy chọn)** | Theo nhu cầu            | Làm từng mô-đun ở mục 12 theo thứ tự ưu tiên do công ty chọn.                                                                                                                                                                           | Mỗi mô-đun một dự án riêng.                   |

**Nguyên tắc triển khai:** thí điểm 1–2 dự án và 1–2 phòng trước; đào tạo theo vai trò; chạy song song với cách làm cũ 1–2 tháng; mỗi chi nhánh có người “đại sứ”; bắt đầu với mức giao việc Nhẹ rồi nâng dần. Thời gian chỉ mang tính tham khảo, cần điều chỉnh theo quy mô và nguồn lực.

# 14. Rủi ro và biện pháp giảm thiểu

| **Rủi ro**                                                             | **Giảm thiểu**                                                                                                                                       |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Người dùng tự do tạo cấu trúc nên mỗi người một kiểu, khó tổng hợp** | Thư viện mẫu, bộ nhãn và trường chuẩn do quản trị đặt, quy ước đặt tên, bộ lọc đã lưu, quản lý mẫu theo cấp.                                         |
| **Người dùng hiện trường ngại nhập liệu**                              | Giao diện điện thoại tối giản, nhập bằng thẻ, ảnh, giọng nói, đào tạo tại chỗ, bắt đầu từ mức Nhẹ.                                                   |
| **Thông báo dồn dập, người dùng tắt hết**                              | Gộp tin, ưu tiên theo mức khẩn, tóm tắt cuối ngày, cảnh báo tải công việc.                                                                           |
| **Người nhận bỏ qua việc được giao**                                   | Hạn xác nhận nhận việc, nhắc và leo thang theo bậc, theo dõi tỷ lệ phản hồi.                                                                         |
| **Dung lượng ảnh và tệp tăng rất nhanh, chi phí lưu trữ phình**        | Nén ảnh, hạn mức theo dự án, lưu trữ lạnh khi đóng dự án, dọn thùng rác định kỳ, giám sát dung lượng.                                                |
| **Lộ tệp hoặc việc nhạy cảm (hộ dân, hợp đồng, giá)**                  | Mức mật, quyền theo việc, 2FA, nhật ký tải xuống, watermark, không chia sẻ qua link công khai.                                                       |
| **Hệ thống phình tính năng, trở lại thành phần mềm nghiệp vụ**         | Giữ ranh giới lõi/mô-đun (mục 3.2); mô-đun chỉ làm khi có chủ nghiệp vụ và dự án riêng.                                                              |
| **Cấu trúc quá tự do làm báo cáo không đồng nhất**                     | Cho phép tự do ở cấp việc nhưng chuẩn hóa ở cấp dự án (nhóm việc, trạng thái, nhãn); dashboard dựa trên trạng thái và hạn, không phụ thuộc cấu trúc. |
| **Dữ liệu cũ phân tán (Excel, giấy, Zalo)**                            | Nhập Excel/PDF có AI và người kiểm tra; di chuyển theo đợt; quy định không giao việc qua kênh ngoài hệ thống.                                        |
| **Mất mạng ở công trường**                                             | Bộ nhớ đệm ngoại tuyến có đồng bộ, hàng đợi ảnh và cảnh báo xung đột.                                                                                |
| **Chỉ số cá nhân gây áp lực hoặc bị dùng sai**                         | Quy chế sử dụng minh bạch, phân biệt nguyên nhân trễ, không tự động gắn với lương thưởng, hạn chế người xem.                                         |
| **Phụ thuộc nhà cung cấp**                                             | Chuẩn dữ liệu xuất mở (Excel/CSV/JSON); quyền sở hữu dữ liệu thuộc công ty ghi rõ trong hợp đồng.                                                    |

# 15. Các điểm cần công ty quyết định sớm

- **Chi nhánh, phòng ban, số người dùng, số dự án đồng thời** dự kiến; dự án có do từng chi nhánh tự tạo hay phải qua duyệt.

- **Mức giao việc mặc định** (Nhẹ, Chuẩn hay Chặt) và loại dự án hoặc việc nào bắt buộc mức Chặt.

- **Thời hạn xác nhận nhận việc, bậc leo thang** theo mức ưu tiên; có dùng chỉ số giao việc trong đánh giá nhân sự hay không.

- **Chính sách ảnh và tệp:** loại tệp cho phép, dung lượng tối đa, hạn mức theo công ty và dự án, thời gian lưu, có yêu cầu định vị ảnh hay không.

- **Danh mục mẫu khởi đầu** và người có quyền công bố mẫu cấp công ty, chi nhánh.

- **Mức tham gia của người ngoài** (nhà thầu, tư vấn, chủ đầu tư): nhập trực tiếp hay chỉ xem; thời hạn tài khoản khách.

- **Quy chế phân cấp duyệt** (ngưỡng, người ký) bằng văn bản chính thức, và loại phiếu nào bật duyệt.

- **Kênh thông báo:** chỉ ứng dụng và email, hay thêm Zalo/ZNS, SMS.

- **Dữ liệu mật:** những dự án hoặc nhóm việc nào đặt mức Hạn chế; có cho dùng AI bên ngoài với tài liệu nội bộ hay không.

- **Dữ liệu hiện có cần chuyển** (Excel kế hoạch, danh sách việc đang chạy) và cách chuẩn hóa.

- **Thứ tự ưu tiên các mô-đun mở rộng** (mục 12) và đơn vị chịu trách nhiệm nghiệp vụ cho từng mô-đun.

- **Tích hợp:** SSO, email, ERP/kế toán (nếu có mô-đun chi phí), phần mềm trạm trộn (nếu có mô-đun bán hàng).

# Phụ lục A. Ba luồng minh họa

_Tên người trong các ví dụ là giả định._

## A.1. Tạo dự án từ mẫu và giao việc

|                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chị Hà (Trưởng phòng Pháp chế) bấm “Dự án mới” → chọn mẫu “Thủ tục pháp lý một hồ sơ”<br>▼ đặt tên “Giấy phép xây dựng KCN A – GĐ1”, ngày bắt đầu 02/11; hệ thống dời ngày các việc<br>▼ gán vai trò “Chuyên viên” cho anh Nam, “Người duyệt” cho chị Hà; mức giao việc Chặt<br>▼ chị Hà thêm 2 việc con, bỏ 1 việc không cần, đính kèm bản scan quyết định<br>▼ mời anh Tuấn (Kỹ thuật) vào dự án quyền Thành viên, giao việc “Cung cấp bản vẽ”<br>▼ anh Nam và anh Tuấn nhận việc trong “Việc của tôi”; việc hiện trên Timeline và Kanban<br>Kết quả: dự án chạy sau vài phút, không phải dựng lại bảng từ đầu. |

## A.2. Việc con, ảnh hiện trường và nhận xét (mức Chuẩn)

|                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chỉ huy trưởng tạo nhanh trên điện thoại việc “Đắp lớp 2 khu B3”<br>▼ thêm 3 việc con (rải vật liệu, lu lèn, kiểm tra độ chặt), giao 3 tổ<br>▼ tổ chụp ảnh gắn vào việc con (có giờ, vị trí), ghi chú bằng giọng nói; mất sóng thì xếp hàng gửi sau<br>▼ giám sát nhận xét @tổ trưởng, kèm ảnh khoanh vùng cần sửa; tổ trả lời và đính kèm ảnh mới<br>▼ khi cả 3 việc con xong, việc cha đạt 100% và chuyển “Chờ duyệt”<br>▼ chỉ huy trưởng duyệt hoặc trả lại có lý do; việc chuyển “Đã xong”<br>Kết quả: ảnh, nhận xét, người làm gắn trọn với từng việc; thư viện tệp dự án tự cập nhật. |

## A.3. Giao việc liên phòng có duyệt và leo thang (mức Chặt)

|                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cơ quan giải quyết yêu cầu bổ sung hồ sơ → chuyên viên pháp lý A tạo việc “Bổ sung hồ sơ”, hạn theo cơ quan<br>▼ A cần số liệu của Kỹ thuật → tạo việc phối hợp cho nhóm Kỹ thuật; một kỹ sư nhấn “Nhận về mình”<br>▼ kỹ sư nộp số liệu kèm tệp → A hoàn thiện, nộp kết quả (hồ sơ bổ sung + ảnh biên nhận) → Chờ duyệt<br>▼ Trưởng Pháp chế duyệt hoặc trả lại có lý do<br>Nếu quá hạn: nhắc A (quá 1 ngày) → báo Trưởng Pháp chế (quá 3 ngày) → báo Giám đốc chi nhánh nếu việc quan trọng<br>Kết quả: mốc “Có giấy phép” cập nhật; chỉ số đúng hạn, thời gian phản hồi của A và nhóm Kỹ thuật được ghi nhận. |

# Phụ lục B. Thuật ngữ

| **Thuật ngữ**             | **Giải thích**                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| **Dự án**                 | Không gian làm việc chứa nhóm việc, việc, thành viên, tệp; thuộc một chi nhánh.                |
| **Nhóm việc / Giai đoạn** | Cấp gom các việc cùng loại; ngày và % tự tính từ việc bên trong.                               |
| **Việc, Việc con**        | Đơn vị công việc; việc con nằm dưới việc cha, nhiều cấp.                                       |
| **Mốc**                   | Một ngày quan trọng (nghiệm thu, bàn giao, nộp hồ sơ), hiển thị hình thoi.                     |
| **Checklist**             | Danh sách mục kiểm tra trong một việc, hiển thị tiến độ 0/n.                                   |
| **Việc giao**             | Việc có người nhận chính, hạn, tiêu chí hoàn thành; tùy mức có xác nhận nhận và duyệt kết quả. |
| **Mức giao việc**         | Nhẹ / Chuẩn / Chặt: mức kiểm soát giao việc, chọn theo dự án hoặc việc.                        |
| **Mẫu**                   | Cấu trúc dự án hoặc việc dựng sẵn để nạp rồi sửa tự do.                                        |
| **Cổng (Gate)**           | Mốc có checklist điều kiện giữa hai giai đoạn; có thể chỉ nhắc hoặc khóa mềm.                  |
| **Trường tùy chỉnh**      | Trường thông tin do người dùng thêm cho dự án hoặc mẫu.                                        |
| **Baseline**              | Bản kế hoạch gốc đã lưu để so sánh với thực tế.                                                |
| **Đường găng**            | Chuỗi việc quyết định ngày hoàn thành dự án.                                                   |
| **Leo thang**             | Tự động báo lên cấp cao hơn khi việc quá hạn hoặc không phản hồi.                              |
| **Thùng rác**             | Nơi giữ mục đã xóa 30 ngày để khôi phục.                                                       |
| **SLA**                   | Thời hạn xử lý cam kết.                                                                        |
| **RBAC**                  | Phân quyền theo vai trò; kết hợp phạm vi dữ liệu để thành quyền theo chi nhánh, phòng, dự án.  |
| **PWA**                   | Ứng dụng web cài được, hỗ trợ ngoại tuyến.                                                     |
| **KCN, GPMB**             | Khu công nghiệp; giải phóng mặt bằng.                                                          |
| **CĐT, TVGS, QLDA**       | Chủ đầu tư; tư vấn giám sát; quản lý dự án.                                                    |
