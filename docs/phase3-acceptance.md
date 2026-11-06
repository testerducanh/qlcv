# Giai đoạn 3 — bằng chứng và hạng mục còn mở

**Trạng thái: Chưa nghiệm thu.** P3.4–P3.7 còn thiếu yêu cầu được liệt kê bên dưới. P3.8 đã có thêm e2e cho yêu cầu duyệt công bố mẫu và kiểm tra quyền, nhưng chưa có UI thao tác của người duyệt; rà trợ năng/hiệu năng toàn diện và chấp thuận người dùng vẫn còn mở. Tài liệu này ghi nhận bằng chứng kỹ thuật hiện có, không thay thế UAT hoặc chấp thuận của đơn vị nghiệp vụ.

## Bằng chứng kỹ thuật đã chạy

| Phạm vi              | Bằng chứng                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P3.2–P3.3 mẫu        | `pnpm --filter @qlcv/api run test:db -- src/templates/templates.db-spec.ts` — 2 test đạt; xác nhận 8 seed là nháp, có cấu trúc hợp lệ, nạp vào dự án thử, giữ phiên bản cũ khi chỉnh mẫu và rà soát nội dung mẫu pháp lý bằng quy tắc kiểm tra.                                                                                                                                                                                                                                          |
| P3.6 CPM             | `pnpm --filter @qlcv/api exec jest --runInBand src/tasks/critical-path.spec.ts` — 2 test đạt; mạng 6 việc với FS/SS/FF, độ trễ âm, ngày nghỉ và kiểm tra chu trình. DB tests xác nhận dự báo tiến độ và tự dời; Playwright kiểm tra preview/apply/undo.                                                                                                                                                                                                                                  |
| Cấu hình dự án       | `pnpm --filter @qlcv/api run test:db -- src/management/management.db-spec.ts` — 3 test đạt; xác nhận đường găng mặc định tắt và quản lý dự án có thể bật.                                                                                                                                                                                                                                                                                                                                |
| Quan hệ phụ thuộc    | `pnpm --filter @qlcv/api run test:db -- src/tasks/tasks.db-spec.ts src/reports/reports.db-spec.ts` — 20 test đạt; gồm tự dời/hoàn tác, nhập cây việc/hoàn tác, từ chối import với vai trò viewer, baseline và chặn xuất dự án mật khi chưa duyệt.                                                                                                                                                                                                                                        |
| Duyệt mẫu            | `pnpm --filter @qlcv/api run test:db -- src/approvals/approvals.db-spec.ts` — 3 test đạt; gửi yêu cầu đưa mẫu chi nhánh về `pending_approval`, cấm người tạo tự duyệt và chỉ chuyển mẫu sang `published` sau khi đúng approver duyệt.                                                                                                                                                                                                                                                    |
| P3.4 nhập tệp        | `import-rows.test.ts` — XLSX tạo thực bằng ExcelJS, CSV, PDF text, nhận diện cột/ngày; Playwright nhập CSV/XLSX/PDF text qua xem trước và hoàn tác. `tasks.db-spec.ts` xác nhận nhập cây và hoàn tác.                                                                                                                                                                                                                                                                                    |
| P3.5 lặp/Lịch        | `task-recurrence.spec.ts` — 5 test đạt; `tasks.db-spec.ts` xác nhận 4 kỳ thứ Hai, dịch ngày lễ và cập nhật kỳ chọn/các kỳ sau mà không đổi kỳ trước.                                                                                                                                                                                                                                                                                                                                     |
| Playwright P3        | `pnpm --filter @qlcv/web run test:e2e -- e2e/phase3-reports.spec.ts e2e/phase3-templates.spec.ts` — 6 test đạt; toàn bộ web e2e `pnpm --filter @qlcv/web run test:e2e` đạt 9/9. Gồm gửi mẫu chi nhánh chờ duyệt, ẩn điều khiển với người không sở hữu, viewer không nhập/xuất, 300 dòng/PDF A3 và đối chiếu workbook. E2E xác nhận không lỗi console/trang; axe không có lỗi critical/serious ở thư viện mẫu, critical ở báo cáo in; DOMContentLoaded thư viện mẫu <5 giây trên máy dev. |
| Web                  | `pnpm --filter @qlcv/web exec vitest run --maxWorkers=1` — 125/125 test đạt khi chạy lại toàn bộ suite. JSDOM in cảnh báo không hỗ trợ `HTMLCanvasElement.getContext()`; đây là cảnh báo môi trường test, không phải lỗi console trình duyệt trong e2e.                                                                                                                                                                                                                                  |
| Typecheck/lint/build | API/web `typecheck` và `lint` đều đạt; API build và web production build đạt. Web build còn cảnh báo chunk pdf.worker (1.27 MB) và ExcelJS (929 kB) vượt 500 kB.                                                                                                                                                                                                                                                                                                                         |
| Migration            | Các migration P3 gồm `20261105150000_project_critical_path`, `20261105160000_task_recurrence` và `20261106100000_phase3_reports_baselines` đã áp dụng thành công vào DB phát triển.                                                                                                                                                                                                                                                                                                      |

## Hạng mục bắt buộc trước cổng nghiệm thu

- [ ] P3.1: hoàn thiện cột/nhóm trường tùy chỉnh, nhập/xuất và benchmark với 10.000 việc.
- [ ] P3.2: hỗ trợ lưu dự án/nhóm việc thành mẫu, hoàn tác nạp mẫu, cùng các luồng thay thế/ánh xạ còn thiếu.
- [ ] P3.3: Pháp chế, Kỹ thuật, Kế hoạch rà soát và chỉnh mẫu; lưu người rà soát và phiên bản được chấp thuận.
- [ ] P3.4: còn thiếu dịch vụ AI/chính sách và kiểm soát dữ liệu mật, OCR PDF scan, ánh xạ người phụ trách, 6 tệp mẫu, đánh giá độ chính xác và thử với 3 bảng thật. Đã có xử lý cục bộ không AI, xem trước/chỉnh sửa và hoàn tác; chi tiết ở `design-spec.md`.
- [ ] P3.5: còn thiếu ngày/giờ và múi giờ (DST), kiểm thử e2e/điện thoại; đã có quy tắc lặp, chỉnh kỳ hiện tại/tương lai, lịch tháng/tuần, lọc và đổi hạn. Ngày hiện là date-only theo UTC; chi tiết ở `design-spec.md`.
- [ ] P3.6: đã có tự dời preview/apply/undo, baseline, CPM và heuristic dự báo; còn thiếu Timeline baseline, UI quản lý quan hệ tự dời, duyệt heuristic và đánh giá nghiệp vụ.
- [ ] P3.7: đã có xuất Excel/CSV/JSON, quyền/audit, bản in phía trình duyệt, workbook được mở và đối chiếu cột, test 300 dòng tạo PDF A3; còn thiếu PDF máy chủ/queue, kiểm chứng trực quan không cắt chữ và báo cáo định kỳ.
- [ ] P3.8: e2e đã kiểm tra mẫu cá nhân, gửi mẫu tổ chức chờ duyệt, nhập tệp, lịch/lặp, tự dời, xuất/in và quyền viewer/không sở hữu; DB xác nhận người tạo không tự duyệt, người không sở hữu không thể gửi công bố, người xem không thể import và mẫu chỉ được công bố sau khi luồng duyệt chấp thuận. Còn thiếu UI của người duyệt, rà accessibility/performance toàn diện, cùng chấp thuận người dùng.
- [ ] Cổng 3: lãnh đạo chấp thuận độ chính xác nhập liệu; người dùng hiện trường chấp thuận bản in.

## Chạy lại các kiểm tra trọng tâm

```powershell
pnpm --filter @qlcv/api run typecheck
pnpm --filter @qlcv/api run lint
pnpm --filter @qlcv/api run test:db -- src/templates/templates.db-spec.ts src/management/management.db-spec.ts
pnpm --filter @qlcv/api run test:db -- src/tasks/tasks.db-spec.ts
pnpm --filter @qlcv/api run test:db -- src/reports/reports.db-spec.ts
pnpm --filter @qlcv/api run test:db -- src/approvals/approvals.db-spec.ts
pnpm --filter @qlcv/api exec jest --runInBand src/tasks/critical-path.spec.ts
pnpm --filter @qlcv/web run typecheck
pnpm --filter @qlcv/web run lint
pnpm --filter @qlcv/web exec vitest run --maxWorkers=1
pnpm --filter @qlcv/web run test:e2e -- e2e/phase3-reports.spec.ts e2e/phase3-templates.spec.ts
pnpm --filter @qlcv/web run build
```
