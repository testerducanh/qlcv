# Bộ prompt giao AI xây dựng Hệ thống quản lý công việc và dự án

Phiên bản 1.0 · 30/10/2026 · Dựa trên tài liệu phân tích v2.0 và file thiết kế `design-spec` (xongviec.com)

> Các prompt dưới đây chưa được chạy thử trên một công cụ AI cụ thể. Hãy chạy P0.1 trước, xem kết quả, rồi chỉnh lại các prompt sau nếu công cụ của bạn xử lý khác dự kiến.

---

## 0. Cách dùng

1. **Mỗi prompt là một phiên làm việc, một nhánh git, một commit.** Không gộp hai prompt. Không cho AI làm tiếp khi bạn chưa kiểm tra xong.
2. **Luôn dán Khối ngữ cảnh chung (mục 1) ở đầu mỗi prompt.** Với prompt giao diện (P0.3, P0.4, P1.9 đến P1.17, và mọi prompt có chữ "UI"), dán thêm Khối thiết kế (mục 2) và đính kèm file `design-spec`.
3. **Sau mỗi prompt:** chạy lệnh trong phần "Bạn kiểm tra", tick từng mục. Nếu sai, dùng prompt sửa lỗi (mục 3), không viết lại từ đầu.
4. **Cuối mỗi giai đoạn có một cổng kiểm tra.** Chưa qua cổng thì chưa sang giai đoạn sau.
5. Tên sản phẩm chưa chốt nên các prompt dùng tên tạm `qlcv`. Bạn có thể thay bằng tên thật trước khi bắt đầu.

### Tổng quan các giai đoạn

| Giai đoạn                          | Prompt                                         | Kết quả                                                                                |
| ---------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| **0. Nền tảng**                    | P0.1 – P0.4                                    | Repo chạy được, hạ tầng dev, hướng dẫn giao diện, bộ component nền                     |
| **1. MVP lõi**                     | P1.1 – P1.8 (backend), P1.9 – P1.18 (frontend) | Dự án, việc, việc con, ảnh/tệp, bình luận, Kanban, Timeline, Việc của tôi, ngoại tuyến |
| **2. Giao việc nâng cao và duyệt** | P2.1 – P2.8                                    | Ba mức giao việc, nhận/từ chối, nhắc và leo thang, luồng duyệt, ủy quyền               |
| **3. Mẫu, nhập AI, lịch, báo cáo** | P3.1 – P3.8                                    | Trường tùy chỉnh, mẫu, nhập Excel/PDF bằng AI, Lịch, việc lặp lại, đường găng, in/xuất |
| **4. Đa chi nhánh và mở rộng**     | P4.1 – P4.8                                    | Dashboard, khách ngoài, API/webhook, SSO/2FA, vận hành                                 |
| **5. Mô-đun chuyên ngành**         | P5.x                                           | Prompt mẫu cho từng mô-đun, làm khi có nhu cầu                                         |

---

## 1. Khối ngữ cảnh chung (dán vào đầu MỌI prompt)

```text
=== KHỐI NGỮ CẢNH CHUNG ===
SẢN PHẨM
Hệ thống quản lý công việc – quản lý dự án cho doanh nghiệp nhiều chi nhánh (tên tạm: qlcv), tham chiếu xongviec.com. Người dùng TỰ tạo dự án, nhóm việc, việc, việc con, checklist, đính kèm ảnh và tệp, giao việc cho người. Hệ thống KHÔNG chứa nghiệp vụ xây dựng chuyên sâu (khối lượng, BOQ, thanh toán, nghiệm thu, hợp đồng...). Nghiệp vụ ngành chỉ xuất hiện dưới dạng MẪU và TRƯỜNG TÙY CHỈNH.
Tài liệu gốc: docs/phan-tich-v2.0.md (nếu chưa có trong repo, hãy nói rõ và hỏi tôi, đừng tự bịa).

STACK ĐÃ CHỐT
- Monorepo pnpm workspaces: apps/web, apps/api, packages/shared, packages/api-client, services/ai (Python, từ giai đoạn 3), infra/, docs/.
- Frontend: TypeScript strict, React 18, Vite, React Router, TanStack Query, Zustand (chỉ cho state giao diện), Tailwind CSS đọc từ design tokens (CSS variables), Radix UI primitives, dnd-kit, Dexie (IndexedDB), vite-plugin-pwa, react-hook-form + zod.
- Backend: TypeScript strict, NestJS (modular monolith), Prisma + SQL thô khi cần (truy vấn cây đệ quy), zod (nestjs-zod) để kiểm tra dữ liệu, OpenAPI (Swagger), BullMQ (từ giai đoạn 2), Nest Schedule.
- CSDL: PostgreSQL 16. Cache/hàng đợi: Redis 7. Tệp: kho tương thích S3 (MinIO khi dev), tải bằng presigned URL.
- Kiểm thử: Vitest (web, shared), Jest + supertest (api), Playwright (e2e), axe-core (trợ năng).
- Hạ tầng dev: Docker Compose (postgres, redis, minio, mailpit).
- Không thêm thư viện ngoài danh sách này khi chưa hỏi tôi.

QUY ƯỚC
- Tên bảng, cột, biến, endpoint bằng tiếng Anh (DB: snake_case; TypeScript: camelCase). Nhãn giao diện và thông báo lỗi bằng tiếng Việt, đặt trong từ điển i18n (vi mặc định), không viết cứng trong component.
- Giờ lưu UTC, hiển thị Asia/Bangkok, ngày dạng dd/MM/yyyy.
- Id dạng UUID. Xóa mềm (deleted_at) cho dự án, việc, tệp; thùng rác giữ 30 ngày.
- Mọi endpoint phải có: kiểm tra quyền, kiểm tra dữ liệu vào bằng zod, mô tả OpenAPI, test.
- Commit theo conventional commits, nhánh feat/<mã prompt>-<tên ngắn>.
- Không để TODO ẩn, không hard-code bí mật, không dùng dữ liệu thật.

QUY TẮC LÀM VIỆC
1. Đọc code và tài liệu hiện có trước khi viết.
2. Nếu có chỗ mơ hồ làm thay đổi thiết kế, hỏi tối đa 3 câu trước khi code. Chỗ còn lại: chọn phương án mặc định hợp lý và ghi vào mục "Giả định".
3. Chỉ làm đúng phạm vi prompt. Việc ngoài phạm vi ghi vào "Việc để sau", không tự làm.
4. Viết test đi kèm và chạy được trước khi báo xong.
5. Báo cáo cuối gồm: đã làm gì; file chính đã tạo hoặc sửa; giả định; việc để sau và nợ kỹ thuật; lệnh để tôi kiểm tra; kết quả chạy lệnh đó.
6. Làm xong thì DỪNG, không bắt đầu prompt kế tiếp.
=== HẾT KHỐI NGỮ CẢNH ===
```

---

## 2. Khối thiết kế (dán thêm cho prompt giao diện, kèm file design-spec)

```text
=== KHỐI THIẾT KẾ ===
Tuân theo file design-spec đính kèm (docs/design/design-spec.md) và docs/ui-guidelines.md (tạo ở P0.3).
- Bề mặt: dashboard web app cho người dùng đã đăng nhập. Phong cách có cấu trúc, dùng token, ưu tiên nội dung.
- Chỉ dùng semantic token (màu, cỡ chữ, khoảng cách, bo góc, bóng, thời lượng chuyển động). Không dùng mã hex hay số px thô trong component.
- Mọi component phải định nghĩa đủ trạng thái: default, hover, focus-visible, active, disabled, loading, error.
- Mọi thành phần tương tác phải ghi rõ và làm đúng hành vi bàn phím, chuột, cảm ứng.
- Phải xử lý: nội dung dài, tràn, trạng thái rỗng, responsive (điện thoại, máy tính bảng, máy tính).
- Trợ năng: WCAG 2.2 AA; phải có chỉ báo focus nhìn thấy; không dùng chữ tương phản thấp; mọi quy tắc phải kiểm thử được.
- Nhãn nút và liên kết phải rõ nghĩa (ví dụ "Thêm việc con", không dùng "Bấm vào đây").
- Không tạo ngoại lệ riêng về khoảng cách hoặc kiểu chữ; ưu tiên nhất quán hệ thống.
- Mật độ giao diện dày (hàng trăm nút, nhiều ô nhập) nhưng vùng chạm trên điện thoại phải tối thiểu 44x44 px.
=== HẾT KHỐI THIẾT KẾ ===
```

Các điểm bất thường trong file thiết kế và cách xử lý mặc định nằm ở **Phụ lục A**. Hãy đọc trước khi chạy P0.3.

---

## 3. Prompt mẫu để kiểm tra và chỉnh sửa

### R1. Sửa lỗi sau khi kiểm tra

```text
[Dán Khối ngữ cảnh chung]
Tôi vừa kiểm tra prompt <mã prompt> và thấy các vấn đề sau:
1. <mô tả lỗi, kèm lệnh đã chạy và kết quả thực tế so với mong đợi>
2. ...
Hãy chỉ sửa các vấn đề này. Với mỗi vấn đề: nêu nguyên nhân gốc, sửa, thêm hoặc sửa test để lỗi không quay lại, rồi chạy lại toàn bộ test của phần liên quan. Không đổi phạm vi, không refactor ngoài phần cần sửa. Báo cáo theo quy tắc làm việc.
```

### R2. Rà soát độc lập (nên chạy trong một phiên mới)

```text
[Dán Khối ngữ cảnh chung]
Bạn là người rà soát mã độc lập, chưa từng thấy quá trình viết. Hãy rà soát các thay đổi của nhánh <tên nhánh> so với main theo mục tiêu của prompt <mã prompt> (tôi dán mục tiêu bên dưới).
Mục tiêu prompt: <dán>
Kiểm tra: (a) có đúng phạm vi, không thiếu, không thừa; (b) kiểm tra quyền và dữ liệu vào; (c) lỗi logic và trường hợp biên; (d) bảo mật cơ bản; (e) test có thật sự kiểm tra hành vi; (f) với giao diện: trạng thái, bàn phím, trợ năng, responsive.
Chỉ báo lỗi bạn chắc chắn hoặc có bằng chứng; mỗi lỗi ghi file, dòng, kịch bản gây lỗi, mức độ. Không sửa code, không khen chung chung.
```

### R3. Đổi yêu cầu giữa chừng

```text
[Dán Khối ngữ cảnh chung]
Yêu cầu của prompt <mã prompt> thay đổi như sau: <nội dung mới>.
Trước khi sửa, hãy liệt kê các file và test bị ảnh hưởng, rồi đợi tôi xác nhận. Sau khi tôi xác nhận mới sửa.
```

---

# GIAI ĐOẠN 0 – NỀN TẢNG

Mục tiêu: có repo chạy được, hạ tầng dev, hướng dẫn giao diện và bộ component nền. Chưa có nghiệp vụ.

### P0.1 – Khởi tạo monorepo và CI

**Phụ thuộc:** không · **Dán kèm:** Khối ngữ cảnh chung

```text
MỤC TIÊU: Tạo monorepo chạy được với đầy đủ công cụ chất lượng và CI. Chưa viết nghiệp vụ.

VIỆC CẦN LÀM
1. Khởi tạo pnpm workspaces: apps/web (Vite + React + TS), apps/api (NestJS + TS), packages/shared (kiểu và zod schema dùng chung), packages/api-client (để trống, README), services/ai (README), infra/, docs/.
2. TypeScript strict cho mọi package; tsconfig gốc dùng chung; path alias cho packages/shared.
3. ESLint + Prettier dùng chung, husky + lint-staged, commitlint (conventional commits).
4. Script gốc: dev, build, lint, typecheck, test, format.
5. GitHub Actions cho pull request: cài đặt (có cache), lint, typecheck, test, build.
6. apps/api có GET /health trả {status:"ok"}; apps/web có một trang trống hiển thị tên sản phẩm.
7. .env.example, README (cách chạy từ đầu), docs/ADR/0001-stack.md ghi lại stack đã chốt và lý do ngắn gọn.
8. Tạo thư mục docs/ và đặt chỗ cho phan-tich-v2.0.md và design/design-spec.md (tôi sẽ tự chép file vào).

RÀNG BUỘC: Không cài thư viện ngoài danh sách stack. Không viết nghiệp vụ.
ĐẦU RA: Repo chạy được; README đủ để người mới chạy trong 10 phút.
```

**Bạn kiểm tra**

- [ ] `pnpm i && pnpm lint && pnpm typecheck && pnpm test && pnpm build` đều xanh.
- [ ] `pnpm dev` mở được web và `GET /health` trả 200.
- [ ] CI xanh trên một pull request thử.
- [ ] Commit sai quy ước bị commitlint chặn.

### P0.2 – Hạ tầng dev và cấu hình

**Phụ thuộc:** P0.1

```text
MỤC TIÊU: Có môi trường dev đầy đủ bằng một lệnh, và API đọc cấu hình an toàn.

VIỆC CẦN LÀM
1. infra/docker-compose.yml: postgres:16, redis:7, minio (tự tạo bucket qlcv-files), mailpit. Có volume, healthcheck, cổng cấu hình qua .env.
2. Script: pnpm infra:up, infra:down, infra:reset.
3. apps/api: module cấu hình đọc biến môi trường và kiểm tra bằng zod; thiếu hoặc sai biến thì API không khởi động và in lỗi dễ hiểu.
4. Kết nối Prisma với PostgreSQL (chưa có model); kết nối Redis; client S3 (MinIO).
5. /health mở rộng: kiểm tra DB, Redis, S3 và trả trạng thái từng phần; /health/live chỉ báo tiến trình sống.
6. Logger có cấu trúc (JSON), gắn request id; không log mật khẩu hoặc token.
7. Cấu hình bảo mật nền: helmet, CORS theo biến môi trường, giới hạn kích thước body.

RÀNG BUỘC: Không lưu bí mật trong repo; .env.example chỉ có giá trị giả.
ĐẦU RA: pnpm infra:up rồi pnpm dev chạy được toàn bộ; test cho phần đọc cấu hình.
```

**Bạn kiểm tra**

- [ ] `pnpm infra:up` rồi `pnpm dev`; `/health` báo đủ db, redis, s3 đều "ok".
- [ ] Tắt Redis: `/health` báo redis lỗi nhưng `/health/live` vẫn 200.
- [ ] Xóa một biến bắt buộc trong .env: API từ chối chạy kèm thông báo rõ.
- [ ] Mailpit mở được ở cổng đã ghi trong README.

### P0.3 – Hướng dẫn giao diện (UI guideline) từ file thiết kế

**Phụ thuộc:** P0.1 · **Dán kèm:** Khối ngữ cảnh chung + Khối thiết kế + file design-spec

```text
MỤC TIÊU: Biến file design-spec đính kèm thành tài liệu hướng dẫn giao diện triển khai được: docs/ui-guidelines.md. Chưa viết code giao diện.

VIỆC CẦN LÀM
1. Đọc kỹ design-spec. Làm đúng "Guideline Authoring Workflow" và "Required Output Structure" trong đó: bối cảnh và mục tiêu; token và nền tảng; quy tắc từng component (cấu trúc, biến thể, trạng thái, responsive); yêu cầu trợ năng kèm tiêu chí kiểm thử đạt/không đạt; chuẩn nội dung và giọng điệu có ví dụ; phản mẫu (anti-pattern); danh sách kiểm tra QA.
2. Phạm vi component: Button, IconButton, Input, Textarea, Select, Combobox (chọn người, nhãn), DatePicker, Checkbox, Radio, Switch, Tabs, Dialog, Drawer, Toast, Tooltip, Menu/ContextMenu, Badge/Tag, Avatar, ProgressBar, Table/TreeTable, Card, EmptyState, Skeleton, Pagination, FileUploader, CommentThread.
3. Phạm vi màn hình (chỉ mô tả mẫu bố cục, chưa thiết kế chi tiết): danh sách dự án, cây việc, Kanban, Timeline, chi tiết việc (drawer), Việc của tôi, cài đặt.
4. Với mỗi component: ghi rõ hành vi bàn phím, chuột, cảm ứng; token khoảng cách và kiểu chữ; xử lý nội dung dài, tràn, trạng thái rỗng.
5. Mọi quy tắc bắt buộc dùng "must", khuyến nghị dùng "should". Mọi quy tắc trợ năng phải kiểm thử được.
6. CÁC ĐIỂM BẤT THƯỜNG ĐÃ BIẾT trong design-spec (không được tự đoán âm thầm):
   a. font.weight.base = 700 (toàn bộ chữ đậm) có vẻ là sai khi trích xuất.
   b. font.size.base = 12px và thang 10.5 đến 15px là nhỏ; 10.5px thấp hơn ngưỡng dễ đọc.
   c. color.surface.muted = #000000 và color.text.inverse = #4b5b56 có vẻ bị gán nhầm tên.
   d. color.border.default và color.border.muted chứa 4 giá trị (theo 4 cạnh), không dùng trực tiếp được.
   e. Thang khoảng cách chỉ đến 9px, thiếu giá trị cho bố cục lớn.
   f. Không có token màu thương hiệu; màu nền chủ đạo của site là #112723.
   Đối với mỗi điểm: ghi vào mục "Giả định cần xác nhận" của tài liệu, nêu phương án mặc định (tham khảo Phụ lục A) và lý do, để tôi duyệt.

RÀNG BUỘC: Không dùng mã hex trong phần hướng dẫn component (chỉ dùng tên token). Không tự đổi token gốc; mọi đề xuất đổi phải nằm trong mục giả định.
ĐẦU RA: docs/ui-guidelines.md.
```

**Bạn kiểm tra**

- [ ] Tài liệu có đủ 7 mục theo "Required Output Structure".
- [ ] Mỗi component có đủ 7 trạng thái: default, hover, focus-visible, active, disabled, loading, error.
- [ ] Có mục "Giả định cần xác nhận" liệt kê đủ 6 điểm (a đến f). Hãy duyệt từng điểm, ghi quyết định vào đó.
- [ ] Mỗi tiêu chí trợ năng nói được cách kiểm thử (công cụ hoặc thao tác).

### P0.4 – Design tokens và thư viện component nền

**Phụ thuộc:** P0.3 đã được bạn duyệt · **Dán kèm:** Khối ngữ cảnh chung + Khối thiết kế + file design-spec + docs/ui-guidelines.md

```text
MỤC TIÊU: Hiện thực design tokens và bộ component nền đúng docs/ui-guidelines.md (đã được duyệt, gồm cả quyết định ở mục "Giả định cần xác nhận").

VIỆC CẦN LÀM
1. Tạo apps/web/src/design/tokens.json là nguồn sự thật duy nhất (màu, chữ, khoảng cách, bo góc, bóng, chuyển động). Viết script sinh ra tokens.css (CSS variables, có chế độ sáng; để sẵn cấu trúc cho chế độ tối nhưng chưa bật) và cấu hình theme Tailwind từ tokens.
2. Hiện thực các component trong phạm vi của guideline bằng Radix UI primitives. Mỗi component phải làm đủ trạng thái: default, hover, focus-visible, active, disabled, loading, error.
3. Trang /dev/components (chỉ có ở môi trường dev) hiển thị mọi component ở mọi trạng thái, ở cả bề rộng điện thoại và máy tính.
4. Quy tắc tự động: ESLint hoặc Stylelint chặn mã hex, px thô, và màu Tailwind ngoài token trong src (trừ thư mục tokens).
5. Test: axe-core cho từng component; test bàn phím (Tab, Shift+Tab, Enter, Space, Esc, phím mũi tên) cho Dialog, Drawer, Menu, Tabs, Combobox, DatePicker; test tương phản màu cho cặp chữ/nền của token.
6. Vùng chạm tối thiểu 44x44 px trên màn hình cảm ứng; 24x24 px ở máy tính (WCAG 2.2 AA).

RÀNG BUỘC: Không tạo token hoặc kiểu chữ ngoài tokens.json. Không viết nghiệp vụ.
ĐẦU RA: Bộ component, tokens.json, script sinh, trang /dev/components, test.
```

**Bạn kiểm tra**

- [ ] Mở `/dev/components`: nhìn và bấm thử từng trạng thái; focus luôn thấy rõ khi dùng Tab.
- [ ] Thử chỉ dùng bàn phím mở và đóng Dialog, Drawer, Menu.
- [ ] Thêm thử một mã hex vào một component: lint phải báo lỗi.
- [ ] `pnpm test` có test axe và test tương phản, đều xanh.
- [ ] Thu nhỏ trình duyệt xuống 375 px: không cuộn ngang, không chữ bị cắt mất nội dung.

### Cổng 0

- [ ] Toàn bộ P0.1 đến P0.4 đã qua kiểm tra, CI xanh.
- [ ] Bạn đã duyệt mục "Giả định cần xác nhận" trong ui-guidelines.md.
- [ ] Một người ngoài nhóm chạy được repo theo README trong 10 phút.

---

# GIAI ĐOẠN 1 – MVP LÕI

Mục tiêu: dự án, nhóm việc, việc, việc con, checklist, ảnh và tệp, bình luận, giao việc mức Nhẹ, Kanban, Timeline, Việc của tôi, ngoại tuyến. Làm backend trước (P1.1 đến P1.8), sau đó frontend (P1.9 đến P1.18).

## 1A. Backend

### P1.1 – Mô hình dữ liệu và migration

**Phụ thuộc:** P0.2

```text
MỤC TIÊU: Thiết kế và tạo schema PostgreSQL (Prisma) cho lõi quản lý công việc.

VIỆC CẦN LÀM
1. Thực thể tổ chức: organization, branch (chi nhánh), department (phòng ban), user (email, tên, mật khẩu băm, trạng thái, branch, department, vai trò hệ thống), user_department.
2. Dự án: project (branch_id, owner_id, tên, mô tả, trạng thái, ngày bắt đầu, hạn dự kiến, work_calendar JSONB gồm ngày nghỉ trong tuần và ngày lễ, progress_mode: by_count | by_workdays | manual, confidentiality: normal | restricted, status_labels JSONB cho tên trạng thái đổi được), project_member (project_id, user_id, role: owner | manager | member | restricted | commenter | viewer).
3. Việc: một bảng task cho cả Nhóm việc, Việc, Mốc (type: group | task | milestone), parent_id tự tham chiếu, position (chỉ mục phân số, dạng chuỗi), depth tối đa 5, title, description, status, priority, start_date, duration_days, due_date, completed_at, progress 0 đến 100, assignee_id, creator_id, custom_fields JSONB, version (khóa lạc quan), deleted_at. task_collaborator (task_id, user_id, role: collaborator | follower | approver).
4. Phụ trợ: checklist_item (task_id, title, done, assignee_id, position), label và task_label (nhãn theo dự án hoặc theo tổ chức, có màu), task_dependency (predecessor_id, successor_id, type: finish_start | overlap | blocking_finish, lag_days).
5. Tệp: attachment (project_id, task_id?, checklist_item_id?, comment_id?, uploader_id, file_name, mime, size, storage_key, thumb_key, version_group_id, version_no, note, taken_at, lat, lng, deleted_at).
6. Trao đổi: comment (task_id, author_id, parent_id, body, is_question, edited_at, hidden_at), mention (comment_id, user_id), notification (user_id, type, payload JSONB, read_at).
7. activity_log chỉ ghi thêm (entity_type, entity_id, actor_id, action, before JSONB, after JSONB, at). Chặn UPDATE và DELETE bằng trigger hoặc phân quyền DB.
8. saved_view (user_id hoặc project_id, tên, bộ lọc JSONB, chế độ xem, chia sẻ hay không).
9. Index: (project_id, status), (assignee_id, due_date), (parent_id, position), GIN cho custom_fields, index cho deleted_at.
10. Ràng buộc DB: depth <= 5; không cho việc là cha của chính mình; CHECK cho progress; unique hợp lý.
11. Viết ADR ngắn giải thích: vì sao dùng một bảng task, vì sao chỉ mục phân số, vì sao dùng truy vấn đệ quy thay vì ltree.

RÀNG BUỘC: Chưa tạo bảng cho giao việc nâng cao, duyệt, mẫu (để giai đoạn sau). Migration phải chạy được từ DB trống và rollback được.
ĐẦU RA: schema.prisma, migration SQL, ADR, test kiểm tra ràng buộc DB.
```

**Bạn kiểm tra**

- [ ] `pnpm prisma migrate reset` chạy sạch từ DB trống.
- [ ] Thử UPDATE vào activity_log trực tiếp bằng SQL: phải bị từ chối.
- [ ] Thử chèn việc có depth = 6: bị từ chối.
- [ ] Đọc ADR: có đủ lý do cho 3 quyết định thiết kế.

### P1.2 – Xác thực và phân quyền theo phạm vi

**Phụ thuộc:** P1.1

```text
MỤC TIÊU: Đăng nhập an toàn và bộ máy phân quyền = vai trò x phạm vi (công ty, chi nhánh, phòng ban, dự án, việc được giao).

VIỆC CẦN LÀM
1. Xác thực: đăng nhập email + mật khẩu (argon2); access token JWT 15 phút; refresh token xoay vòng, lưu trong cookie httpOnly + SameSite; đăng xuất; đổi mật khẩu; quên mật khẩu qua email (Mailpit khi dev); khóa tạm sau nhiều lần sai; giới hạn tần suất.
2. Người dùng do quản trị tạo hoặc mời qua email (liên kết có hạn), chưa có tự đăng ký công khai.
3. Bộ máy phân quyền: hàm can(user, action, resource) và decorator @RequirePermission. Ma trận quyền đặt trong một file cấu hình (permissions.ts) theo bảng quyền của tài liệu phân tích v2.0 mục 8.3 (chủ dự án, quản lý, thành viên, hạn chế, bình luận, xem). Quy tắc "của mình" = việc được giao hoặc do mình tạo.
4. Phạm vi: lãnh đạo xem tổng hợp toàn công ty; giám đốc chi nhánh xem dự án của chi nhánh; trưởng phòng xem việc của phòng xuyên dự án; mức mật "restricted" ẩn nội dung với người ngoài danh sách, chỉ hiện "Việc hạn chế" kèm tiến độ cho người có phạm vi quản lý.
5. Ghi activity_log cho đăng nhập, đăng nhập sai, đổi vai trò.
6. Test theo bảng: mọi vai trò x mọi hành động chính x (của mình / không phải của mình) x (dự án thường / mật).

RÀNG BUỘC: Không viết cứng kiểm tra vai trò rải rác trong controller; mọi kiểm tra phải đi qua bộ máy phân quyền. Không trả về thông tin cho thấy tài nguyên có tồn tại khi người dùng không có quyền (trả 404 thay vì 403 ở nơi cần).
ĐẦU RA: module auth, module permissions, test dạng bảng.
```

**Quy ước triển khai xác thực P1.2:** API dùng `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/password/forgot`, `/auth/password/reset`; `PATCH /auth/password` và `GET /auth/me` yêu cầu Bearer access token. Access token sống 15 phút; refresh token ngẫu nhiên, chỉ lưu SHA-256 trong DB, xoay vòng và gửi bằng cookie `httpOnly`, `SameSite=Lax`, `Secure` trong production. Sau 5 lần đăng nhập sai theo tài khoản, khóa 15 phút; giới hạn 30 yêu cầu xác thực mỗi IP trong 15 phút. Mật khẩu mới tối thiểu 12 ký tự; liên kết đặt lại mật khẩu sống 1 giờ. SMTP mặc định trỏ Mailpit ở `127.0.0.1:1025`; production phải cấu hình `JWT_ACCESS_SECRET` riêng.

**Bạn kiểm tra**

- [x] Đăng nhập, làm mới token, đăng xuất qua HTTP e2e; refresh cookie có `httpOnly` và `SameSite=Lax`.
- [x] Sai mật khẩu 5 lần: bị khóa tạm.
- [x] Mở file `permissions.ts`, đối chiếu từng dòng với ma trận quyền ở tài liệu v2.0 mục 8.3.
- [x] Người ngoài dự án mật gọi API xem việc: nhận 404.

HTTP e2e xác nhận login, refresh xoay cookie, logout và việc ẩn tài nguyên dự án mật trả 404 cho người không phải thành viên. Unit/DB tests tiếp tục bao phủ ma trận vai trò, phạm vi và placeholder cho quản lý có phạm vi.

### P1.3 – API tổ chức, dự án, thành viên

**Phụ thuộc:** P1.2

```text
MỤC TIÊU: API quản lý chi nhánh, phòng ban, người dùng (quản trị), dự án và thành viên dự án.

VIỆC CẦN LÀM
1. CRUD branch, department, user (quản trị); mời người dùng; vô hiệu hóa người dùng (giữ lịch sử).
2. CRUD project: tạo dự án trống; sửa thông tin, lịch làm việc (ngày nghỉ tuần, ngày lễ), progress_mode, tên trạng thái; lưu trữ; nhân bản dự án (tùy chọn kèm thành viên, kèm tệp; việc nạp về "Chưa làm"); xóa mềm vào thùng rác.
3. Thành viên: mời, đổi vai trò, gỡ; không cho gỡ chủ dự án cuối cùng; kiểm tra người được mời có tồn tại và đang hoạt động.
4. Danh sách dự án có phân trang, lọc (chi nhánh, trạng thái, của tôi), tìm theo tên, sắp xếp.
5. Thống kê nhanh mỗi dự án (số việc, số việc trễ, % hoàn thành) trong danh sách, tính hiệu quả (không N+1).
6. Mọi thao tác ghi activity_log.

RÀNG BUỘC: Chưa có mẫu và nhập từ file (giai đoạn 3). Phản hồi lỗi theo một định dạng thống nhất (mã lỗi, thông báo tiếng Việt, chi tiết trường).
ĐẦU RA: các module, OpenAPI, test tích hợp cho luồng chính và quyền.
```

**Bạn kiểm tra**

- [ ] Tạo dự án, mời thành viên, đổi vai trò, nhân bản dự án: kiểm tra qua Swagger.
- [x] Gỡ chủ dự án cuối cùng: bị từ chối với thông báo rõ.
- [x] Danh sách 200 dự án: số truy vấn SQL không tăng theo số dự án (xem log).

Đã kiểm thử tạo dự án, thêm thành viên, đổi vai trò và nhân bản bằng DB integration test; Swagger UI/OpenAPI đã smoke test trả 200. Mục đầu để trống vì chưa thực hiện thao tác CRUD trực tiếp trên Swagger UI.

**Quy ước triển khai P1.3:** Swagger UI tại `/docs`, OpenAPI JSON tại `/openapi.json`. API quản trị chi nhánh/phòng ban/người dùng yêu cầu `system_admin`; dự án bị giới hạn theo thành viên hoặc phạm vi chi nhánh. Xóa chi nhánh/phòng ban là vô hiệu hóa; xóa dự án là xóa mềm. Lời mời tài khoản có hạn 72 giờ; bản sao dự án luôn đặt việc về `todo`, mặc định không sao chép thành viên/tệp. Thống kê danh sách được tính theo lô, không truy vấn riêng từng dự án.

### P1.4 – API việc, việc con, checklist, phụ thuộc

**Phụ thuộc:** P1.3

```text
MỤC TIÊU: Lõi quản lý công việc: cây việc nhiều cấp, nhập nhanh, di chuyển, tính tiến độ, checklist, phụ thuộc.

VIỆC CẦN LÀM
1. Tạo việc tối thiểu chỉ cần tiêu đề (nhập nhanh); thêm việc con tới 5 cấp; loại: group | task | milestone; chuyển đổi giữa task và milestone.
2. Dán danh sách: nhận văn bản nhiều dòng, dòng thụt đầu thành việc con, trả về cây việc đã tạo (có chế độ chỉ xem trước, không lưu).
3. Di chuyển (đổi cha, đổi vị trí) bằng chỉ mục phân số, kiểm tra chu trình và độ sâu; nhân bản (kèm việc con, checklist; tùy chọn kèm tệp).
4. Trạng thái mặc định: Chưa làm, Đang làm, Đã xong, Tạm dừng/Bị chặn (bắt buộc lý do). Tên hiển thị lấy từ cấu hình dự án. Cờ "quá hạn" tính động, không phải trạng thái.
5. Tính cho việc cha: ngày bắt đầu/kết thúc từ việc con; % theo progress_mode của dự án (theo số việc xong, theo ngày công, hoặc nhập tay).
6. Hàm tính ngày làm việc (lịch nghỉ tuần, ngày lễ) trong packages/shared, có test nhiều tình huống.
7. Checklist: CRUD, sắp xếp, giao riêng cho người, chuyển mục checklist thành việc con và ngược lại; tick mục tính vào % việc.
8. Phụ thuộc: tạo, sửa, xóa 3 kiểu nối; chặn chu trình; có tùy chọn tự dời việc sau (mặc định tắt); cảnh báo "bị chặn" khi việc trước chưa xong (chỉ cảnh báo).
9. Thao tác hàng loạt: đổi người nhận, hạn, nhãn, trạng thái; trả về undoToken hợp lệ 60 giây để hoàn tác.
10. Khóa lạc quan: cập nhật gửi kèm version; xung đột trả 409 kèm bản hiện tại.
11. Hàng nghìn việc: danh sách việc dự án phải trả về nhanh (dùng truy vấn đệ quy và phân trang theo cây hoặc theo nhóm).

RÀNG BUỘC: Chưa có giao việc nâng cao (nhận/từ chối, duyệt). Người nhận chính chỉ một người; có thể gán hoặc để trống.
ĐẦU RA: module tasks, checklist, dependencies; test đơn vị cho tính ngày và tính %; test tích hợp.
```

**Bạn kiểm tra**

- [x] Dán 20 dòng có thụt đầu: cây việc đúng cấp.
- [x] Thử tạo cấp thứ 6: bị từ chối. Thử kéo việc cha vào việc con của nó: bị từ chối.
- [x] Tạo chu trình phụ thuộc A→B→A: bị chặn.
- [x] Cập nhật với version cũ: nhận 409 kèm bản hiện tại.
- [x] Tạo dự án 2.000 việc bằng script seed: lấy danh sách dưới 500 ms (tham số, chỉnh được).
- [x] Tự dời lịch `finish_start` tùy chọn: tính ngày bắt đầu theo lịch ngày công và `lagDays`, giữ nguyên thời lượng; mặc định tắt và từ chối các kiểu phụ thuộc khác.

Đã thêm `TasksModule`, API CRUD việc/cây việc/checklist/phụ thuộc, dán xem trước, di chuyển/nhân bản (kèm checklist và tùy chọn sao chép tệp), cập nhật hàng loạt với undo token 60 giây và kiểm tra version. DB integration tests bao phủ cây 20 dòng, giới hạn độ sâu/chu trình, checklist, nhân bản, phân quyền việc mật, undo và truy vấn 2.000 việc dưới 500 ms. Build, lint, 134 unit tests và 35 DB tests đạt. HTTP smoke test xác nhận Swagger/OpenAPI trả 200, công bố 14 route Tasks và API yêu cầu đăng nhập trả 401 khi thiếu token.

Đã triển khai tự dời lịch theo lựa chọn `finish_start_only`: chỉ khi bật `autoReschedule`, việc sau được dời tới ngày làm việc sau hạn việc trước cộng `lagDays`; ngày kết thúc được tính lại để giữ nguyên `durationDays`. Mặc định không thay đổi lịch, và bật tùy chọn với kiểu phụ thuộc khác trả lỗi 400. DB test xác nhận lịch cuối tuần, `lagDays`, thời lượng, mặc định tắt và từ chối kiểu không hỗ trợ. Typecheck, lint, 11 unit tests mục Tasks/lịch và 8 DB tests của Tasks đạt sau thay đổi. HTTP smoke chưa chạy workflow có token.

### P1.5 – API ảnh và tệp đính kèm

**Phụ thuộc:** P1.4

```text
MỤC TIÊU: Tải, lưu, xem, quản lý ảnh và tệp gắn vào việc, mục checklist, nhận xét.

VIỆC CẦN LÀM
1. Luồng tải: client xin presigned PUT URL (kiểm tra quyền, loại tệp, kích thước), tải thẳng lên kho S3, rồi gọi xác nhận. Ghi metadata: người tải, thời gian, ghi chú, vị trí nếu client gửi.
2. Cấu hình (biến môi trường hoặc bảng cấu hình): danh sách loại MIME cho phép, dung lượng tối đa mỗi tệp, số tệp tối đa mỗi việc, hạn mức dung lượng theo dự án và theo công ty; trả lỗi rõ khi vượt.
3. Xử lý ảnh bằng sharp: sửa hướng EXIF, tạo ảnh thu nhỏ (320 px) và ảnh xem (1280 px); giữ bản gốc; ghi rõ kích thước.
4. Móc quét mã độc (interface), mặc định không làm gì; có hướng dẫn gắn ClamAV sau.
5. Tải xuống bằng presigned GET ngắn hạn sau khi kiểm tra quyền xem việc; ghi log truy cập tải xuống.
6. Phiên bản: tải bản mới của cùng tệp (version_group_id), đánh dấu bản hiện hành, xem lịch sử.
7. Thư viện tệp của dự án: danh sách tổng hợp mọi đính kèm, lọc theo việc, người tải, loại, ngày; phân trang.
8. Xóa mềm vào thùng rác 30 ngày; khôi phục; dọn kho thật sự khi quá hạn (job định kỳ).
9. Tệp thuộc việc "restricted" chỉ người có quyền xem việc mới tải được.

RÀNG BUỘC: Không đưa nội dung tệp qua máy chủ API khi tải lên hoặc xuống (chỉ metadata). Không tin MIME do client khai; kiểm tra lại bằng nội dung tệp.
ĐẦU RA: module attachments, test (kể cả loại tệp không cho phép, vượt hạn mức, không có quyền).
```

**Bạn kiểm tra**

- [ ] Tải ảnh chụp trực tiếp từ điện thoại (chụp ngang/dọc): ảnh thu nhỏ đúng hướng. DB test dùng JPEG EXIF orientation 6; cần xác nhận thêm trên thiết bị thật.
- [x] Đổi nội dung .exe thành .jpg rồi xác nhận tải: bị từ chối theo chữ ký nội dung.
- [x] Tải vượt hạn mức dự án: nhận thông báo rõ.
- [x] Người không có quyền xin link tải: nhận 404; log ghi lại lần tải của người có quyền.

Đã thêm `AttachmentsModule` với presigned PUT/GET để truyền tệp trực tiếp giữa client và S3; bản tải lên được xác minh nội dung, quét qua `VirusScanner`, rồi promote từ khóa tạm có hạn URL sang khóa lưu trữ không thể ghi đè bằng URL cũ. Hỗ trợ ảnh xoay theo EXIF, thumbnail 320 px, preview 1280 px, metadata, giới hạn MIME/dung lượng/số lượng/quota, phiên bản, thư viện lọc-phân trang, thùng rác 30 ngày/khôi phục và job dọn S3 định kỳ. Restricted task chỉ cấp link cho người có quyền xem đầy đủ; cấp link tải được ghi vào `activity_log`. DB tests bao phủ nội dung giả mạo, quota, quyền 404, orientation, phiên bản, thùng rác/khôi phục và nhật ký tải.

Mặc định `NoopVirusScanner` không quét mã độc. Để bật ClamAV, triển khai `VirusScanner.scan` bằng clamd trong mạng nội bộ, thay provider `VIRUS_SCANNER` tại `AttachmentsModule` và kiểm thử fail-closed khi scanner không sẵn sàng; không mở clamd ra Internet. CORS cho presigned URL local nằm ở [infra/s3-cors.json](../infra/s3-cors.json); môi trường triển khai phải đặt origin của web app vào CORS rule của bucket.

### P1.6 – Nhận xét, thông báo, nhật ký hoạt động, thùng rác

**Phụ thuộc:** P1.4

```text
MỤC TIÊU: Trao đổi trên việc, thông báo trong ứng dụng, lịch sử thay đổi và thùng rác.

VIỆC CẦN LÀM
1. Nhận xét: tạo, trả lời theo chuỗi, đính kèm tệp; @nhắc tên (lưu bảng mention); cho sửa trong 15 phút kèm dấu "đã sửa"; không xóa cứng (quản trị dự án được ẩn kèm log); đánh dấu "câu hỏi cần trả lời".
2. Nhắc tên người chưa có quyền trong dự án: trả cảnh báo để giao diện hỏi có mời vào không.
3. Thông báo trong ứng dụng cho: được giao việc, được nhắc tên, có nhận xét mới trên việc tôi theo dõi, đổi trạng thái việc tôi giao, việc sắp đến hạn và quá hạn (tạm tính khi truy vấn, chưa làm hàng đợi). API: danh sách, đánh dấu đã đọc, đọc tất cả.
4. Bộ phát sự kiện nội bộ (EventEmitter) để các module sau (giai đoạn 2) gắn thêm xử lý.
5. Nhật ký hoạt động: endpoint xem theo việc và theo dự án, có phân trang; ghi ai, lúc nào, giá trị cũ và mới.
6. Thùng rác: liệt kê, khôi phục, xóa hẳn cho dự án, việc, tệp; job hằng ngày xóa vĩnh viễn mục quá 30 ngày; khôi phục việc cha thì khôi phục cả việc con đã xóa cùng lượt.
7. Hoàn tác: endpoint nhận undoToken (từ P1.4) và đảo ngược thao tác hàng loạt nếu còn hạn.

RÀNG BUỘC: Không gửi email hoặc Zalo ở prompt này. Thông báo không chứa nội dung nhạy cảm của việc mật.
ĐẦU RA: các module, test.
```

**Bạn kiểm tra**

- [x] @nhắc tên: thành viên dự án được nhắc nhận notification; người ngoài dự án nhận cảnh báo mời tham gia (unit test).
- [x] Sửa nhận xét quá 15 phút: bị từ chối (unit test thử sau 16 phút).
- [x] Khôi phục việc cha đã xóa: việc con đã xóa cùng lượt cũng trở lại (DB test).
- [x] Hoàn tác thao tác hàng loạt với token còn hạn: dữ liệu về như cũ; token đúng actor và chỉ dùng một lần (DB test).
- [x] Hoàn tác bằng token đã hết hạn: bị từ chối (DB test rút ngắn TTL Redis xuống 1 giây).

**P1.6 backend (2026-11-05):** `P16Module` đã được đăng ký trong `AppModule`; tích hợp được xác nhận bằng build/typecheck/lint, app boot, OpenAPI liệt kê các route P1.6 và các route bảo vệ trả 401 khi thiếu xác thực. Tổng kiểm thử báo cáo: 13 unit suites/137 tests và 6 DB suites/41 tests đều đạt. Những kết quả tổng thể này không thay thế các acceptance test chuyên biệt còn bỏ trống ở trên.

**Phạm vi đã có trong mã:** API nhận xét/trả lời, sửa trong 15 phút, ẩn nhận xét kèm audit, mention và cảnh báo người ngoài dự án, thông báo trong ứng dụng, activity, trash/restore/permanent delete cho dự án/việc/tệp, purge 30 ngày, EventEmitter nội bộ và gọi lại undo endpoint P1.4. `AttachmentsModule` restore được tái sử dụng để giữ kiểm tra hạn mức; không thêm migration. EventEmitter phát sự kiện khi giao việc/đổi trạng thái (kể cả bulk update). Unit test P1.6 xác nhận từ chối sửa nhận xét quá hạn và không ghi tiêu đề việc vào notification. Các hành vi API còn lại nêu trên chưa có kiểm thử P1.6 chuyên biệt được liệt kê; cần kiểm tra trước khi coi checklist hoàn tất.

**API mới chính:** `POST/GET /projects/:projectId/tasks/:taskId/comments`, `PATCH .../comments/:commentId`, `POST .../comments/:commentId/hide`; `GET /notifications`, `POST /notifications/:notificationId/read`, `POST /notifications/read-all`; activity theo việc/dự án; `GET /projects/:projectId/trash`, restore/delete vĩnh viễn theo loại `task|attachment`; xóa dự án mềm và danh sách/khôi phục/xóa vĩnh viễn dự án đã xóa.

### P1.7 – "Việc của tôi", bộ lọc, tìm kiếm

**Phụ thuộc:** P1.6

```text
MỤC TIÊU: API cho màn hình "Việc của tôi", bộ lọc đã lưu và tìm kiếm cơ bản.

VIỆC CẦN LÀM
1. GET /me/tasks với các tab: hôm nay, trễ hạn, sắp đến hạn (tham số số ngày), tất cả, tôi theo dõi, tôi đã giao; gom từ mọi dự án người dùng có quyền; sắp xếp theo hạn và ưu tiên; phân trang.
2. Mỗi dòng trả về: tên việc, dự án, hạn, trạng thái, lý do quan trọng (việc nào đang chờ nó, mốc nào bị ảnh hưởng nếu có).
3. Bộ lọc: người, hạn, trạng thái, nhãn, dự án, ưu tiên, có tệp hay không; saved_view CRUD (cá nhân hoặc chia sẻ cho dự án).
4. Tìm kiếm toàn văn bằng PostgreSQL (tsvector, cấu hình unaccent để gõ không dấu vẫn tìm được tiếng Việt có dấu) trên tên việc, mô tả, nhận xét, tên tệp; kết quả chỉ gồm thứ người dùng có quyền xem; xếp hạng và làm nổi bật từ khóa.
5. Đo hiệu năng và ghi kết quả vào docs (số bản ghi thử, thời gian).

RÀNG BUỘC: Không dùng công cụ tìm kiếm ngoài (OpenSearch) ở giai đoạn này.
ĐẦU RA: endpoint, index, test, ghi chú hiệu năng.
```

**Bạn kiểm tra**

- [x] Gõ "bao cao" tìm ra việc "Báo cáo tuần".
- [x] Người không có quyền không thấy việc mật trong kết quả tìm kiếm.
- [x] Với dữ liệu seed 2.000 việc, tìm kiếm dưới 300 ms (đo DB test: 20,1 ms).

Đã thêm `/me/tasks` với các tab hôm nay, trễ hạn, sắp đến hạn, tất cả việc được giao, theo dõi và việc đã giao; hỗ trợ bộ lọc người nhận, ngày hạn, trạng thái, nhãn, dự án, ưu tiên, tệp đính kèm và phân trang theo kết quả người dùng thực sự có quyền xem. Dòng việc bao gồm dự án, hạn, trạng thái, lý do bị chặn, việc tiền nhiệm chưa xong và mốc bị ảnh hưởng. Saved view hỗ trợ CRUD cá nhân/chia sẻ theo dự án; chỉ chủ sở hữu/quản lý mới được thay đổi saved view chia sẻ.

Tìm kiếm dùng `unaccent` + `tsvector` GIN trên tên/mô tả việc, nhận xét và tên tệp; trigger cập nhật chỉ mục theo các thay đổi liên quan. Kết quả được lọc theo quyền trước khi tính tổng và phân trang, có xếp hạng và highlight từ khóa. DB test với 2.000 việc đo 20,1 ms cho từ khóa “bao cao” (máy local; thời gian thực tế phụ thuộc hạ tầng).

### P1.8 – Dữ liệu mẫu, tài liệu API, client sinh tự động, cổng backend

**Phụ thuộc:** P1.3 đến P1.7

```text
MỤC TIÊU: Hoàn thiện backend MVP để frontend dùng được.

VIỆC CẦN LÀM
1. Seed dữ liệu demo giả: 1 công ty, 2 chi nhánh, 3 phòng ban, 8 người dùng đủ các vai trò, 2 dự án (một thường, một mật) với khoảng 60 việc có việc con, checklist, nhãn, vài ảnh giả, vài nhận xét. Mật khẩu demo ghi trong README, chỉ dùng ở dev.
2. Swagger tại /docs cho toàn bộ API; mô tả tiếng Việt cho các endpoint chính.
3. Sinh packages/api-client (TypeScript, có kiểu) từ OpenAPI bằng orval hoặc openapi-typescript; script pnpm gen:api; CI kiểm tra client không lệch OpenAPI.
4. Bộ test e2e API (supertest) chạy luồng chính: đăng nhập, tạo dự án, mời thành viên, tạo việc và việc con, tải tệp, nhận xét, @nhắc tên, thông báo, thùng rác.
5. Rà soát bảo mật cơ bản: danh sách endpoint chưa có kiểm tra quyền (phải bằng 0), giới hạn tần suất, kích thước body, CORS.
6. Viết docs/backend-overview.md: sơ đồ module, luồng dữ liệu, cách thêm endpoint mới.

ĐẦU RA: seed, client, test e2e, tài liệu.
```

**Bạn kiểm tra**

- [x] `pnpm seed` rồi đăng nhập được bằng các tài khoản demo (được xác nhận trong HTTP e2e).
- [x] Mở `/docs` và `/openapi.json`; xác nhận các route và metadata security.
- [x] CI chạy lại `gen:api` và so sánh generated diff để phát hiện client lệch OpenAPI.
- [x] `pnpm test:e2e` xanh.

### Cổng 1A (backend)

- [ ] P1.1 đến P1.8 đã qua kiểm tra.
- [ ] Bạn (hoặc một phiên AI mới, dùng R2) rà soát độc lập phần phân quyền và tải tệp.
- [x] Danh sách "Việc để sau" và nợ kỹ thuật đã được đọc và chấp nhận cho dev/staging (không production).

**Trạng thái:** cổng 1A chưa hoàn tất. Nợ kỹ thuật được chấp nhận cho dev/staging, không cho production. Còn các kiểm tra thủ công ở P1.1 (CI/commitlint), P1.3 (CRUD trực tiếp qua Swagger), P1.5 (ảnh trên thiết bị thật) và các luồng P1.6 chưa có acceptance test chuyên biệt. Rà soát trong phiên này không thay thế yêu cầu rà soát độc lập.

## 1B. Frontend

Mọi prompt trong phần này dán kèm **Khối ngữ cảnh chung + Khối thiết kế + file design-spec + docs/ui-guidelines.md**.

**Kết quả rà soát 1B (05/11/2026):** `pnpm --filter @qlcv/web test` đạt 119/119; `test:e2e` đạt 3/3; `lint`, `typecheck` và `build` đều đạt. Các bài Playwright hiện dùng API giả lập, không thay thế nghiệm thu với API/seed thật. P1.9 và P1.10 đã có triển khai nhưng còn mục nghiệm thu thủ công chưa xác minh; P1.11–P1.18 chưa hoàn tất. Vì vậy không đánh dấu các kiểm tra đó là xong và **cổng 1 / MVP chưa đạt**. P1.14a chưa có bảng so sánh/POC; sau khi hoàn tất, cần người dùng xem và tự quyết định thư viện trước khi làm P1.14b.

### P1.9 – Khung ứng dụng, đăng nhập, điều hướng

**Phụ thuộc:** P0.4, P1.8

```text
MỤC TIÊU: Khung ứng dụng web dùng được: đăng nhập, điều hướng, xử lý lỗi, i18n tiếng Việt.

VIỆC CẦN LÀM
1. React Router: các route /dang-nhap, /du-an, /du-an/:id, /viec-cua-toi, /cai-dat, trang 403, 404, mất kết nối.
2. Bố cục: thanh bên (máy tính) và thanh điều hướng dưới (điện thoại); thanh trên có tìm kiếm, chuông thông báo, menu người dùng. Điều hướng chỉ hiện mục người dùng có quyền.
3. Đăng nhập, làm mới token tự động, đăng xuất, quên mật khẩu; xử lý hết phiên (giữ lại việc đang soạn nếu có thể).
4. TanStack Query: cấu hình thử lại, thông báo lỗi chung, trạng thái tải; lớp gọi API dùng packages/api-client.
5. i18n: từ điển vi (mặc định) trong một nơi duy nhất; hàm định dạng ngày dd/MM/yyyy và giờ Asia/Bangkok.
6. Error boundary toàn cục, toast chung, trang trạng thái rỗng dùng EmptyState.
7. Bố cục phản hồi tốt ở 375, 768, 1280 px; vùng chạm 44x44 px trên cảm ứng.

RÀNG BUỘC: Không viết màn hình nghiệp vụ (danh sách dự án, việc...) ở prompt này. Chỉ dùng component và token đã có.
ĐẦU RA: khung ứng dụng, test (đăng nhập, bảo vệ route, hết phiên), test axe cho các trang.
```

**Bạn kiểm tra**

- [ ] Đăng nhập bằng tài khoản seed; tải lại trang vẫn còn phiên; đăng xuất đúng.
- [ ] Vai trò "Xem" không thấy mục cài đặt dự án.
- [x] Ngắt mạng: có thanh báo mất kết nối, ứng dụng không trắng trang.
- [ ] Chỉ dùng bàn phím: đi qua toàn bộ thanh điều hướng được, focus nhìn thấy.

Khung P1.9 đã có routing, đăng nhập/đặt lại mật khẩu, refresh access token qua cookie và tự làm mới trước hạn, đăng xuất, query provider, lỗi/toast chung, điều hướng desktop/mobile, trang lỗi và cảnh báo offline. Unit test UI hiện giả lập API; chưa chạy nghiệm thu trực quan với tài khoản seed, kiểm thử đầy đủ bằng bàn phím/trình đọc màn hình hoặc vai trò thành viên dự án "Xem". Màn hình P1.10 đã triển khai; các kiểm tra tích hợp thủ công được ghi riêng bên dưới.

### P1.10 – Danh sách dự án, tạo dự án, cài đặt dự án

**Phụ thuộc:** P1.9

```text
MỤC TIÊU: Người dùng xem, tạo và cài đặt dự án.

VIỆC CẦN LÀM
1. Màn hình danh sách dự án: chuyển giữa thẻ và bảng; lọc theo chi nhánh, trạng thái, "của tôi"; tìm theo tên; hiển thị % hoàn thành, số việc trễ; trạng thái rỗng có nút "Tạo dự án".
2. Wizard tạo dự án 3 bước, cho bỏ qua và quay lại: (1) tên, chi nhánh, ngày bắt đầu, hạn dự kiến, lịch nghỉ tuần; (2) nội dung khởi đầu: "Dự án trống" (các lựa chọn "Từ mẫu" và "Nhập từ Excel/PDF" hiện nhưng bị khóa với nhãn "Sắp có"); (3) mời thành viên và chọn vai trò.
3. Trang cài đặt dự án: thông tin chung, lịch làm việc và ngày lễ, tên trạng thái, cách tính %, thành viên (mời, đổi vai trò, gỡ), nhân bản, lưu trữ, xóa vào thùng rác.
4. Xác nhận trước thao tác nguy hiểm (xóa, gỡ thành viên), có hoàn tác khi có thể.
5. Biểu mẫu dùng react-hook-form + zod dùng chung với backend; lỗi hiển thị cạnh trường, thông báo rõ nghĩa.

RÀNG BUỘC: Chưa có màn hình việc (P1.11).
ĐẦU RA: màn hình, test Playwright cho luồng tạo dự án và mời thành viên.
```

**Bạn kiểm tra**

- [x] Luồng wizard tự động: tạo dự án, bỏ qua bước thành viên, quay lại bước cài đặt và tiếp tục.
- [x] Playwright: tạo dự án và mời thành viên với vai trò đã chọn.
- [ ] Đo thời gian hoàn thành wizard dưới một phút với người dùng thật.
- [x] Playwright: lọc/tìm trên 100 dự án mô phỏng, phân trang 20 dòng và chỉ render trang hiện tại.
- [ ] Đo độ mượt với 100 dự án từ API/seed thật.
- [x] Tên dự án rỗng bị chặn; lỗi hiển thị cạnh trường và được liên kết qua `aria-describedby`.

P1.10 đã có danh sách dự án dạng thẻ/bảng, tìm kiếm và lọc phân trang; wizard ba bước với lịch nghỉ, lựa chọn khởi tạo, mời thành viên và vai trò; trang cài đặt dùng react-hook-form cùng schema Zod trong `@qlcv/shared`; quản lý thành viên, nhân bản, lưu trữ/khôi phục và xóa mềm với xác nhận. API bổ sung danh sách chi nhánh/thành viên trong phạm vi. Đã chạy kiểm thử Vitest, Playwright với API giả lập và unit test API. Đo thời gian người dùng thật, độ mượt với API/seed thật và nghiệm thu tích hợp vẫn còn mở.

### P1.11 – Cây việc: nhập nhanh, việc con, kéo thả

**Phụ thuộc:** P1.10

```text
MỤC TIÊU: Màn hình chính của dự án ở chế độ Danh sách/Bảng dạng cây, tạo và sắp xếp việc nhanh.

VIỆC CẦN LÀM
1. Bảng dạng cây: mở/thu gọn việc cha; cột bật/tắt được (ghi chú, người phụ trách, nhãn, bắt đầu, số ngày, kết thúc, trạng thái, %, số tệp); lưu lựa chọn cột theo người dùng và dự án.
2. Nhập nhanh: dòng nhập ở cuối; gõ tên rồi Enter tạo việc và giữ con trỏ để gõ tiếp; Tab thụt vào thành việc con, Shift+Tab lùi ra; dán nhiều dòng thành nhiều việc (có xem trước).
3. Sửa ngay trên dòng (tên, ngày, người, trạng thái, %); phím tắt rõ ràng, có danh sách phím tắt.
4. Kéo thả đổi vị trí và đổi cha bằng dnd-kit, kèm cách thay thế bằng bàn phím (chọn dòng, Alt+mũi tên) cho người không dùng chuột.
5. Menu chuột phải (và nút "..." cho cảm ứng): chèn việc phía dưới, tạo việc con, nhân bản, chuyển thành Mốc, chuyển sang nhóm khác, xóa.
6. Chọn nhiều dòng và thao tác hàng loạt (đổi người, hạn, nhãn, trạng thái); toast có nút "Hoàn tác" dùng undoToken.
7. Cập nhật lạc quan, tự lùi lại khi lỗi; xử lý 409 bằng hộp thoại so sánh phiên bản.
8. Hiệu năng: ảo hóa danh sách (virtualization) cho từ 1.000 dòng.
9. Điện thoại: "Thẻ thay bảng", không cuộn ngang; mỗi thẻ hiện tên, người, hạn, trạng thái, số việc con và tệp.
10. Trạng thái rỗng, tên việc rất dài, nhiều việc con, mất mạng giữa chừng.

RÀNG BUỘC: Chi tiết việc (drawer) làm ở P1.12; ở đây bấm vào tên việc chỉ cần mở được drawer rỗng.
ĐẦU RA: màn hình, test Playwright (nhập nhanh, thụt cấp, kéo thả, hoàn tác).
```

**Bạn kiểm tra**

- [ ] Gõ 10 việc liên tiếp chỉ bằng bàn phím trong dưới 1 phút.
- [ ] Dán 20 dòng có thụt đầu, xem trước rồi lưu: cây đúng.
- [ ] Kéo việc con sang việc khác; làm lại bằng bàn phím; cả hai đều được.
- [ ] Dữ liệu seed 2.000 việc: cuộn mượt, không giật.
- [ ] Điện thoại 375 px: không cuộn ngang, chạm dễ.

### P1.12 – Chi tiết việc: checklist, ảnh/tệp, nhận xét

**Phụ thuộc:** P1.11

```text
MỤC TIÊU: Drawer chi tiết việc (toàn màn hình trên điện thoại) với mọi thông tin chính.

VIỆC CẦN LÀM
1. Phần đầu: tên (sửa ngay), trạng thái, người nhận chính, người phối hợp, người theo dõi, ngày bắt đầu, số ngày hoặc hạn, ưu tiên, nhãn.
2. Mô tả: soạn thảo văn bản nhẹ (đậm, nghiêng, danh sách, liên kết) dùng Tiptap bản tối thiểu; lưu tự động có chỉ báo "Đã lưu".
3. Việc con: danh sách rút gọn và nút "Thêm việc con".
4. Checklist: thêm, sửa, sắp xếp, tick, giao riêng cho người, đính kèm ảnh vào mục; hiển thị tiến độ 0/n; chuyển mục thành việc con.
5. Ảnh và tệp: kéo thả, dán từ clipboard, chọn tệp, và chụp ảnh trực tiếp trên điện thoại (input capture); nhiều tệp một lần; thanh tiến độ, hủy, thử lại; thư viện ảnh dạng lưới với lightbox (điều khiển bằng bàn phím, có mô tả thay thế); tải bản mới của tệp; xem lịch sử phiên bản; hiển thị rõ lỗi (sai loại, quá dung lượng, vượt hạn mức).
6. Nhận xét: soạn, trả lời theo chuỗi, @nhắc tên (hộp chọn người, hỏi mời nếu chưa có quyền), đính kèm ảnh, đánh dấu câu hỏi, dấu "đã sửa".
7. Tab Lịch sử: nhật ký hoạt động của việc.
8. Đồng bộ: nhận xét và trạng thái mới của người khác hiện lên sau tối đa 30 giây (làm mới định kỳ; thời gian thực làm ở giai đoạn 2).

RÀNG BUỘC: Chưa có nhận/từ chối/duyệt việc (giai đoạn 2).
ĐẦU RA: drawer, test Playwright (tải ảnh, nhận xét, @nhắc tên, checklist), test axe và bàn phím.
```

**Bạn kiểm tra**

- [ ] Trên điện thoại thật: chụp một ảnh gắn vào mục checklist; ảnh hiện ngay với thanh tiến độ.
- [ ] Tải thử tệp sai loại và quá dung lượng: thông báo rõ, không treo.
- [ ] @nhắc tên người chưa trong dự án: có hộp hỏi mời.
- [ ] Mở lightbox, đóng bằng Esc, focus trở về đúng chỗ.
- [ ] Việc có 50 ảnh: vẫn mượt (tải ảnh thu nhỏ, không tải ảnh gốc).

### P1.13 – Kanban

**Phụ thuộc:** P1.12

```text
MỤC TIÊU: Chế độ Kanban của dự án.

VIỆC CẦN LÀM
1. Cột theo trạng thái; chuyển nhóm cột theo người hoặc nhãn.
2. Thẻ hiện: tên, người nhận (avatar), hạn (tô màu khi trễ), nhãn, số việc con, số tệp, tiến độ checklist.
3. Kéo thả thẻ giữa các cột (đổi trạng thái) và trong cột (đổi thứ tự) bằng dnd-kit; thay thế bằng bàn phím (chọn thẻ, phím mũi tên để chuyển cột, thông báo cho trình đọc màn hình); cảm ứng dùng nhấn giữ.
4. Thêm thẻ nhanh ở đầu mỗi cột; bộ lọc dùng chung với chế độ Danh sách; lưu chế độ xem gần nhất.
5. Ảo hóa cột dài; cột rỗng có trạng thái rỗng; thẻ rất nhiều nhãn hoặc tên dài không vỡ bố cục.
6. Cập nhật lạc quan và hoàn tác khi lỗi.

ĐẦU RA: màn hình, test Playwright (kéo thả, bàn phím).
```

**Bạn kiểm tra**

- [ ] Chuyển trạng thái một thẻ bằng chuột, bằng bàn phím, bằng cảm ứng: đều được.
- [ ] Trình đọc màn hình đọc "đã chuyển sang cột Đang làm".
- [ ] 300 thẻ trong một cột: cuộn mượt.

### P1.14a – Chọn thư viện Gantt (làm thử, chưa tích hợp)

**Phụ thuộc:** P1.11

```text
MỤC TIÊU: Giúp tôi chọn cách làm Timeline (Gantt). KHÔNG tích hợp vào ứng dụng chính; dừng lại để tôi quyết định.

VIỆC CẦN LÀM
1. Đánh giá 4 phương án: gantt-task-react, frappe-gantt, một thư viện thương mại (nêu 2 ví dụ), và tự vẽ bằng SVG/Canvas.
2. Tiêu chí (cho điểm và ghi bằng chứng): giấy phép và chi phí; hỗ trợ lịch ngày làm việc và ngày nghỉ; phụ thuộc và mũi tên nối; kéo thả đổi ngày; mốc hình thoi; nhóm việc thu gọn; hiệu năng 500 và 2.000 thanh; hỗ trợ điện thoại; điều khiển bằng bàn phím và trợ năng; tùy biến theo design tokens; tiếng Việt; mức độ bảo trì của thư viện.
3. Làm một bản thử nhỏ (trang riêng /dev/gantt-poc) với 2 phương án khả thi nhất, dùng dữ liệu seed thật.
4. Kết luận: bảng so sánh, khuyến nghị kèm rủi ro, ước lượng công việc tích hợp.

RÀNG BUỘC: Không thêm thư viện vào ứng dụng chính ngoài bản thử trong trang /dev.
ĐẦU RA: docs/adr/gantt-selection.md, trang thử.
```

**Bạn kiểm tra**

- [ ] Đọc bảng so sánh; thử hai bản thử trên máy tính và điện thoại.
- [ ] Tự quyết định phương án rồi ghi vào ADR (đây là quyết định của bạn, không để AI tự chốt).

### P1.14b – Tích hợp Timeline

**Phụ thuộc:** P1.14a đã có quyết định

```text
MỤC TIÊU: Chế độ Timeline (Gantt) trong dự án theo phương án đã chọn tại docs/adr/gantt-selection.md.

VIỆC CẦN LÀM
1. Thanh việc theo ngày công, mốc hình thoi, nhóm việc thu gọn, đường "Hôm nay", tô nền ngày nghỉ theo lịch dự án.
2. Thu phóng ngày và tuần (Ctrl+cuộn trên máy tính, nút +/- cho mọi thiết bị); chọn số ngày hiển thị.
3. Kéo thả thanh để đổi ngày bắt đầu và độ dài; thay thế bằng bàn phím và hộp nhập ngày; cập nhật lạc quan.
4. Mũi tên phụ thuộc; hộp thoại nối việc với 3 kiểu: "Cuốn chiếu", "Gối đầu", "Xong mới làm", độ trễ ± ngày; tùy chọn tự dời việc sau (mặc định tắt).
5. Màu thanh theo trạng thái (Đang làm, Đã xong, Chậm tiến độ, Chưa làm/Tạm dừng) kèm họa tiết hoặc nhãn, không chỉ dựa vào màu.
6. Cột danh sách bên trái đồng bộ cuộn với biểu đồ; chọn thanh mở drawer chi tiết (P1.12).
7. Điện thoại: chế độ ngang, hoặc xem rút gọn; không làm hỏng cuộn trang.
8. Hiệu năng cho 500 việc (mục tiêu) và 2.000 việc (chấp nhận được, có ảo hóa).

ĐẦU RA: màn hình, test Playwright (đổi ngày, nối việc), test hiệu năng.
```

**Bạn kiểm tra**

- [ ] Kéo đổi ngày một việc: ngày ở bảng và Kanban cập nhật theo.
- [ ] Ngày nghỉ được tô; việc không bắt đầu vào ngày nghỉ khi đổi bằng kéo.
- [ ] Nối A→B kiểu "Xong mới làm": B hiện cảnh báo khi A chưa xong.
- [ ] Chỉ dùng bàn phím vẫn đổi được ngày một việc.

### P1.15 – Việc của tôi, thông báo, tìm kiếm

**Phụ thuộc:** P1.12

```text
MỤC TIÊU: Màn hình cá nhân, chuông thông báo và tìm kiếm.

VIỆC CẦN LÀM
1. "Việc của tôi": các tab Hôm nay, Trễ hạn, Sắp đến hạn, Tất cả, Tôi theo dõi, Tôi đã giao; gom từ mọi dự án; mỗi dòng có tên, dự án, hạn, lý do quan trọng; hành động nhanh một chạm: đánh dấu xong, cập nhật %, chụp ảnh, mở chi tiết.
2. Chuông thông báo: danh sách, chưa đọc, đánh dấu đã đọc, đọc tất cả, bấm vào thì mở đúng việc; làm mới 30 giây một lần.
3. Tìm kiếm toàn cục (Ctrl+K hoặc ô trên thanh): gõ không dấu vẫn ra kết quả có dấu; nhóm kết quả theo dự án, việc, nhận xét, tệp; điều hướng bằng bàn phím.
4. Bộ lọc đã lưu: tạo, đặt tên, chia sẻ cho dự án; dùng được ở cây việc và Kanban.
5. Trạng thái rỗng thân thiện ("Hôm nay bạn chưa có việc nào"), tải khung xương, lỗi mạng.

ĐẦU RA: màn hình, test Playwright.
```

**Bạn kiểm tra**

- [ ] Tick "xong" một việc từ "Việc của tôi": biến mất khỏi tab và cập nhật ở dự án.
- [ ] Gõ "bao cao" ra "Báo cáo tuần".
- [ ] Ctrl+K dùng hoàn toàn bằng bàn phím.

### P1.16 – PWA, ngoại tuyến, hàng đợi ảnh

**Phụ thuộc:** P1.12, P1.15

```text
MỤC TIÊU: Ứng dụng cài được và dùng được khi mất mạng ở hiện trường.

VIỆC CẦN LÀM
1. PWA: manifest, biểu tượng, vite-plugin-pwa, hướng dẫn cài (máy tính, iPhone, Android), hiển thị khi có phiên bản mới.
2. Bộ nhớ đệm bằng Dexie: "Việc của tôi" và dự án đang mở ở chế độ đọc khi ngoại tuyến.
3. Hàng đợi thao tác: tạo và sửa việc, tick checklist, nhận xét; chạy lại theo thứ tự khi có mạng; thử lại có giãn cách; có chỉ báo "chưa gửi".
4. Hàng đợi ảnh: nén ảnh phía trình duyệt, lưu tạm trong IndexedDB, tải lên khi có mạng, hiển thị ảnh nào chưa gửi được và nút thử lại; không mất ảnh khi đóng tab.
5. Xung đột: dùng version của việc; khi xung đột hiện hộp thoại chọn giữ bản của tôi, bản trên máy chủ, hoặc gộp trường khác nhau.
6. Giới hạn rõ: thao tác nào không dùng được ngoại tuyến (mời thành viên, xóa dự án) thì vô hiệu hóa kèm giải thích.
7. Test Playwright giả lập mất mạng: tạo việc, chụp ảnh, bật lại mạng, kiểm tra đồng bộ.

RÀNG BUỘC: Không lưu mật khẩu hay token dài hạn trong IndexedDB. Có nút "Xóa dữ liệu ngoại tuyến" khi đăng xuất.
ĐẦU RA: PWA, hàng đợi, test, docs/offline.md mô tả hành vi và giới hạn.
```

**Bạn kiểm tra**

- [ ] Cài lên điện thoại; bật chế độ máy bay; tạo việc, chụp 3 ảnh; bật mạng lại: mọi thứ tự lên.
- [ ] Hai thiết bị cùng sửa một việc khi một bên ngoại tuyến: hiện hộp thoại xung đột.
- [ ] Đăng xuất: dữ liệu ngoại tuyến bị xóa.

### P1.17 – Thùng rác, lịch sử, hoàn tác (giao diện)

**Phụ thuộc:** P1.12

```text
MỤC TIÊU: Giao diện an toàn thao tác.

VIỆC CẦN LÀM
1. Trang Thùng rác (trong dự án và toàn cục cho quản trị): danh sách mục đã xóa còn bao nhiêu ngày, khôi phục, xóa hẳn có xác nhận.
2. Lịch sử thay đổi của dự án và của việc: ai, lúc nào, giá trị cũ và mới, đọc được bằng tiếng Việt (ví dụ "Nam đổi hạn từ 12/11 sang 15/11").
3. Hoàn tác bằng toast sau thao tác hàng loạt, xóa, di chuyển; Ctrl+Z cho thao tác gần nhất trong màn hình cây việc.
4. Hộp xác nhận khi bỏ dở biểu mẫu chưa lưu; cảnh báo khi xóa việc có việc con hoặc tệp.

ĐẦU RA: màn hình, test Playwright.
```

**Bạn kiểm tra**

- [ ] Xóa việc cha, khôi phục từ thùng rác: cả cây trở lại.
- [ ] Đổi hạn một việc: lịch sử hiện câu đọc được.
- [ ] Xóa nhầm 5 việc, bấm "Hoàn tác" trong toast: trở lại đủ.

### P1.18 – Kiểm thử toàn diện và cổng nghiệm thu MVP

**Phụ thuộc:** P1.9 đến P1.17

```text
MỤC TIÊU: Chứng minh MVP đạt chất lượng; không thêm tính năng.

VIỆC CẦN LÀM
1. Playwright e2e các luồng: đăng nhập, tạo dự án, nhập nhanh việc và việc con, đính kèm ảnh, nhận xét có @nhắc tên, Kanban, Timeline đổi ngày, Việc của tôi, ngoại tuyến, thùng rác.
2. Trợ năng: axe-core trên mọi màn hình; một lượt chỉ dùng bàn phím cho luồng chính; ghi kết quả và lỗi còn lại vào docs/a11y-report.md.
3. Hiệu năng: Lighthouse (PWA, hiệu năng) với giả lập điện thoại tầm trung, mạng 4G; đặt ngân sách (tham số, chỉnh được): tải đầu dưới 2,5 giây, JS ban đầu dưới 300 KB gzip; thêm kiểm tra ngân sách vào CI.
4. Tải API: k6 mô phỏng 100 người dùng đồng thời trên luồng "Việc của tôi" và xem dự án; ghi p95 và tỷ lệ lỗi.
5. Bảo mật: kiểm tra danh sách OWASP cơ bản (xác thực, phân quyền, CORS, tải tệp, XSS ở nhận xét và mô tả, giới hạn tần suất, tiêu đề bảo mật); ghi kết quả.
6. Viết docs/MVP-acceptance.md: bảng tiêu chí, kết quả, lỗi còn lại và mức độ; hướng dẫn cho người thử nghiệm (UAT).

ĐẦU RA: test, các báo cáo, MVP-acceptance.md.
```

**Bạn kiểm tra**

- [ ] Xem từng báo cáo, không chỉ nghe "đã xanh". Mở file và đọc các lỗi còn lại.
- [ ] Tự thử trên điện thoại thật, kể cả khi mất mạng.
- [ ] Nhờ 2 đến 3 người thật (một chỉ huy trưởng, một nhân viên văn phòng) làm thử 3 việc và ghi lại chỗ vướng.

### Cổng 1 – Nghiệm thu MVP

- [ ] Tất cả luồng chính chạy trên điện thoại thật và máy tính.
- [ ] Không còn lỗi mức nghiêm trọng về phân quyền, tải tệp, mất dữ liệu.
- [ ] Người dùng thử thật hoàn thành được: tạo dự án, giao việc, chụp ảnh, bình luận.
- [ ] Bạn đã đọc danh sách "Việc để sau" và quyết định cái nào đưa vào giai đoạn 2.

---

# GIAI ĐOẠN 2 – GIAO VIỆC NÂNG CAO VÀ DUYỆT

Mục tiêu: ba mức giao việc (Nhẹ, Chuẩn, Chặt), nhận hoặc từ chối việc, nhắc và leo thang, luồng duyệt cấu hình được, ủy quyền, việc sinh từ biên bản họp. Tham chiếu tài liệu phân tích v2.0 mục 5.4, 5.8, 9.

**Lưu ý (05/11/2026):** Cổng 1 vẫn chưa được nghiệm thu. P2.1 đang được triển khai theo yêu cầu tiếp tục giai đoạn 2; việc này không đánh dấu cổng 1 là đạt.

### P2.1 – Mức giao việc và máy trạng thái

**Phụ thuộc:** Cổng 1 · **Dán kèm:** Khối ngữ cảnh chung

```text
MỤC TIÊU: Thêm ba mức giao việc và máy trạng thái chặt chẽ cho việc được giao (backend).

VIỆC CẦN LÀM
1. Migration: project.assignment_level (light | standard | strict) và ghi đè theo việc (task.assignment_level, rỗng = theo dự án); trạng thái giao việc cho mức standard và strict: draft, assigned (chờ nhận), accepted, in_progress, pending_review (chờ duyệt), done, rejected, on_hold; bảng task_assignment_event (lịch sử chuyển trạng thái, người, lý do).
2. Máy trạng thái theo tài liệu v2.0 mục 5.4.3: luồng chính Nháp → Đã giao → Đã nhận → Đang thực hiện → Chờ duyệt → Hoàn thành; nhánh từ chối, đề xuất điều chỉnh, tạm dừng/bị chặn, xin gia hạn, trả lại. Mức light vẫn giữ luồng đơn giản Chưa làm → Đang làm → Đã xong như P1.4.
3. Quy tắc: mức standard trở lên bắt buộc có người nhận chính và hạn; chỉ một người nhận chính; người duyệt mặc định là người giao, đổi được; người giao không tự duyệt việc do chính mình thực hiện; mức strict bắt buộc có bằng chứng (ít nhất một ảnh hoặc tệp, hoặc ghi chú, tùy cấu hình) khi nộp kết quả; mọi chuyển trạng thái xấu (từ chối, trả lại, tạm dừng, hủy) bắt buộc có lý do.
4. Máy trạng thái là một lớp riêng, dạng bảng chuyển trạng thái, có test theo bảng cho mọi cặp (trạng thái, hành động, vai trò) hợp lệ và không hợp lệ.
5. Đổi mức giao việc của dự án không làm hỏng việc đang chạy: việc hiện có giữ trạng thái tương đương; viết quy tắc ánh xạ và test.

RÀNG BUỘC: Chưa làm hàng đợi, nhắc việc, duyệt cấu hình được (P2.3, P2.4).
ĐẦU RA: migration, module assignment, test.
```

**Bạn kiểm tra**

- [x] Mở bảng chuyển trạng thái trong code, đối chiếu từng mũi tên với sơ đồ ở tài liệu v2.0 mục 5.4.3.
- [x] Test máy trạng thái: nộp kết quả mức Chặt không có bằng chứng bị từ chối.
- [x] Test máy trạng thái: người nhận không thể tự duyệt kết quả.
- [x] Đổi dự án từ Nhẹ lên Chuẩn: việc cũ không bị lỗi.

P2.1 đã bổ sung mức giao việc và yêu cầu bằng chứng trên dự án, ghi đè mức theo việc, người giao/người duyệt, trạng thái và lịch sử chuyển trạng thái; API chuyển trạng thái kiểm tra vai trò, lý do, hạn, bằng chứng mức Chặt, tự duyệt và version. Bảng chuyển trạng thái được test đầy đủ theo mọi bộ ba trạng thái/hành động/vai trò; quy tắc bằng chứng, tự duyệt và ánh xạ trạng thái cũ cũng có unit test. Migration đã được áp dụng lên database tích hợp; kiểm thử xác nhận việc hiện có giữ nguyên trạng thái khi nâng mức dự án từ Nhẹ lên Chuẩn.

### P2.2 – Nhận, từ chối, gia hạn, chuyển người nhận

**Phụ thuộc:** P2.1

```text
MỤC TIÊU: API cho các tình huống sau khi giao việc (tài liệu v2.0 mục 5.4.4, 5.4.5).

VIỆC CẦN LÀM
1. Người nhận: nhận, từ chối (lý do), đề xuất hạn khác; hạn phản hồi nhận việc cấu hình được.
2. Xin gia hạn (lý do, hạn đề xuất): người giao đồng ý hoặc từ chối; nếu việc làm lệch mốc quan trọng của dự án thì tạo yêu cầu đổi mốc chờ duyệt (nối với P2.4 sau; hiện tạo bản ghi yêu cầu ở trạng thái chờ).
3. Chuyển người nhận: người giao chọn người mới, người cũ ghi chú bàn giao, người mới phải xác nhận.
4. Chia việc con cho người khác: người nhận vẫn chịu trách nhiệm kết quả; % cha tính từ việc con.
5. Đổi phạm vi (sửa mô tả hoặc tiêu chí): người nhận phải xác nhận lại.
6. Hủy việc với lý do, giữ lịch sử.
7. Giao cho nhóm (hàng đợi): thành viên bấm "Nhận về mình" để thành người nhận chính; ai nhận trước thì được, xử lý hai người bấm cùng lúc.
8. Kiểm tra khi giao: người nhận có quyền trong dự án; đang nghỉ phép hoặc có người được ủy quyền; số việc đang mở so với ngưỡng; chỉ trả cảnh báo, không chặn (trừ quy tắc bắt buộc do dự án bật).
9. Người nhận nghỉ phép hoặc thôi việc: việc tự chuyển cho người được ủy quyền hoặc về hàng đợi của trưởng bộ phận.
10. Ghi mọi hành động vào task_assignment_event và activity_log.

ĐẦU RA: endpoint, test (kể cả tranh chấp khi nhiều người cùng "Nhận về mình").
```

**Bạn kiểm tra**

- [x] Từ chối không kèm lý do: bị từ chối.
- [x] Hai người cùng bấm "Nhận về mình": chỉ một người thành công, người kia nhận thông báo rõ.
- [x] Chuyển người nhận: người mới chưa xác nhận thì việc chưa chuyển hẳn.

P2.2 hiện mới xác minh ba tình huống trên và các endpoint nhận việc nhóm/chuyển người nhận/gia hạn. Hạn phản hồi cấu hình, tạo việc con và tính trách nhiệm cha, xác nhận đổi phạm vi, hủy có lý do, cảnh báo tải/nghỉ phép và tự chuyển khi người nhận vắng mặt chưa hoàn thiện; không đánh dấu các yêu cầu này hoàn tất.

### P2.3 – Hàng đợi, thời gian thực, nhắc việc và leo thang

**Phụ thuộc:** P2.2

```text
MỤC TIÊU: Nhắc việc, leo thang và thông báo thời gian thực (tài liệu v2.0 mục 5.4.7, 5.8).

VIỆC CẦN LÀM
1. BullMQ + Redis: worker tách khỏi tiến trình API; job idempotent (chạy lại không gửi trùng); thử lại có giãn cách; bảng theo dõi job lỗi.
2. Nhắc: sắp đến hạn (T-3, T-1), quá hạn, chờ nhận quá hạn phản hồi, chờ duyệt quá SLA. Giờ nhắc theo múi giờ người dùng (mặc định Asia/Bangkok), có giờ yên lặng.
3. Leo thang theo bậc cấu hình ở cấp công ty (mặc định minh họa: quá 1 ngày nhắc người nhận, quá 3 ngày báo người giao, quá 5 ngày báo trưởng bộ phận, việc quan trọng báo giám đốc chi nhánh); số ngày là tham số cấu hình được. Ghi lại từng lần leo thang.
4. Tổng hợp cuối ngày: gộp nhiều thông báo thành một bản tóm tắt; việc khẩn gửi ngay.
5. Tùy chọn thông báo từng người: bật/tắt theo loại, tần suất gộp.
6. Thông báo thời gian thực qua SSE (Server-Sent Events) kèm cơ chế kết nối lại; chỉ gửi cho người có quyền; thay cho làm mới 30 giây ở frontend.
7. Giao diện cấu hình leo thang không làm ở đây (P2.6); dùng API và seed.

RÀNG BUỘC: Không gửi email hoặc Zalo ở prompt này (chỉ trong ứng dụng); email để P4.6.
ĐẦU RA: workers, API cấu hình, SSE, test (dùng giả lập thời gian).
```

**Bạn kiểm tra**

- [ ] Tăng tốc đồng hồ giả: việc quá hạn 1, 3, 5 ngày sinh đúng thông báo cho đúng người.
- [ ] Chạy một job hai lần: không có thông báo trùng.
- [ ] Tắt worker rồi bật lại: job tồn đọng được xử lý, không mất.

Đã bổ sung worker BullMQ chạy riêng bằng `pnpm worker:reminders`, nhắc hạn T-3/T-1 và quá hạn, leo thang theo các mốc mặc định, chống gửi trùng bằng khóa duy nhất, thử lại có giãn cách, lưu job lỗi; có API tùy chọn thông báo/SSE. Các ô vẫn mở vì chưa có kiểm thử đồng hồ giả cho đủ mốc, kiểm thử chạy lặp/khôi phục worker và leo thang hiện chưa cấu hình được ở cấp công ty; luồng nhận việc quá hạn và SLA duyệt cũng còn thiếu.

### P2.4 – Bộ máy luồng duyệt và ủy quyền

**Phụ thuộc:** P2.2

```text
MỤC TIÊU: Luồng duyệt cấu hình được và ủy quyền có thời hạn (tài liệu v2.0 mục 9, 8.4).

VIỆC CẦN LÀM
1. Mô hình: approval_flow (loại phiếu, các bước: vai trò hoặc người, SLA, được phép chuyển tiếp), approval_request, approval_step_result (duyệt, từ chối, yêu cầu bổ sung, chuyển tiếp, ghi chú), lịch sử bất biến.
2. Loại phiếu hỗ trợ: duyệt kết quả việc, xin gia hạn lệch mốc, đổi mốc dự án, cổng giữa giai đoạn, công bố mẫu cấp công ty hoặc chi nhánh (dùng ở P3.2), xuất dữ liệu dự án mật, mời khách ngoài vào dự án mật.
3. Quy tắc: người tạo phiếu không duyệt phiếu của mình; quá SLA thì nhắc rồi leo thang theo cấu hình; yêu cầu bổ sung đưa phiếu về người đề nghị.
4. Xác nhận bổ sung bằng mã OTP qua email cho bước được đánh dấu quan trọng.
5. Ủy quyền: người vắng mặt ủy quyền cho người khác với ngày bắt đầu và kết thúc, phạm vi (tất cả hoặc theo dự án), tự hết hiệu lực; mọi duyệt thay ghi rõ "duyệt thay bởi".
6. API quản trị luồng duyệt; kiểm tra luồng cấu hình hợp lệ (không vòng, mọi bước có người duyệt).
7. Test theo kịch bản: duyệt đủ cấp, từ chối giữa chừng, quá SLA, ủy quyền hết hạn.

RÀNG BUỘC: Ngưỡng và số cấp là cấu hình, không viết cứng. Không tạo luồng nghiệp vụ xây dựng (thanh toán, phát sinh...).
ĐẦU RA: module approvals, delegation, test.
```

**Bạn kiểm tra**

- [x] Cấu hình luồng 2 cấp, chạy trọn: đúng thứ tự, đúng người nhận thông báo.
- [x] Ủy quyền hết hạn rồi người được ủy quyền vẫn thử duyệt: bị từ chối.
- [x] Tạo luồng có bước không có người duyệt: bị từ chối khi lưu.

P2.4 đã có API cấu hình luồng, tạo và liệt kê phiếu, xử lý theo thứ tự, chuyển tiếp, yêu cầu bổ sung, từ chối và ủy quyền có thời hạn; test database xác nhận luồng 2 cấp, danh sách người nhận thông báo, delegation hết hạn bị trả 403 và bước thiếu người duyệt bị từ chối. OTP cho bước quan trọng và nhắc/leo thang theo SLA chưa triển khai; không đánh dấu các yêu cầu này hoàn tất.

### P2.5 – UI: Việc của tôi mở rộng, nhận việc, nộp kết quả

**Phụ thuộc:** P2.2, P2.3 · **Dán kèm:** Khối ngữ cảnh chung + Khối thiết kế + design-spec + ui-guidelines

```text
MỤC TIÊU: Giao diện cho người nhận và người giao việc (tài liệu v2.0 mục 5.4.6).

VIỆC CẦN LÀM
1. "Việc của tôi" thêm các tab: Chờ nhận (kèm đồng hồ hạn phản hồi), Chờ tôi duyệt, Mốc rủi ro; mỗi tab có hành động nhanh một chạm: Nhận, Từ chối (hộp lý do), Đề xuất hạn khác, Xin gia hạn, Báo vướng mắc.
2. Hộp thoại "Nộp kết quả": ghi chú, ảnh, tệp (dùng lại uploader P1.12), cảnh báo khi mức Chặt thiếu bằng chứng.
3. Trong drawer việc: khung "Giao việc" hiện mức giao việc, người giao, người nhận, người duyệt, trạng thái, lịch sử chuyển trạng thái; nút hành động đúng theo vai trò và trạng thái (ẩn hoặc vô hiệu hóa kèm giải thích khi không được phép).
4. Giao nhiều việc cùng lúc cho một nhóm; hàng đợi nhóm với nút "Nhận về mình".
5. Cảnh báo khi giao cho người đang quá tải hoặc đang nghỉ phép (không chặn).
6. Thông báo thời gian thực qua SSE; chuông cập nhật tức thì.
7. Mọi màn hình: trạng thái tải, lỗi, rỗng; bàn phím; điện thoại.

ĐẦU RA: màn hình, test Playwright cho mức Chuẩn và mức Chặt.
```

**Bạn kiểm tra**

- [ ] Người A giao, người B nhận, nộp kết quả, A duyệt: chạy trọn trên hai trình duyệt, thông báo hiện tức thì.
- [ ] Mức Chặt thiếu bằng chứng: không nộp được, thông báo rõ.
- [x] Người ở vai trò "Xem" không thấy nút hành động nào.

Đã thêm giao diện danh sách việc và hàng đợi nhóm để nhận việc bằng version, cùng trang thông báo có SSE và hành động đọc; test giao diện xác nhận nhận việc và cập nhật thông báo trực tiếp. API và UI đều ẩn thao tác nhận việc với người chỉ có quyền xem. Hai ô còn lại vẫn mở do chưa có luồng nộp/duyệt hoàn chỉnh trên giao diện, kiểm thử E2E hai trình duyệt và cảnh báo tải/nghỉ phép.

### P2.6 – UI: duyệt, cấu hình luồng, ủy quyền, leo thang

**Phụ thuộc:** P2.4, P2.5 · **Dán kèm:** Khối ngữ cảnh chung + Khối thiết kế + design-spec + ui-guidelines

```text
MỤC TIÊU: Giao diện duyệt và cấu hình cho quản trị.

VIỆC CẦN LÀM
1. Trang "Chờ tôi duyệt": danh sách phiếu, chi tiết phiếu (nội dung, ảnh, tệp, lịch sử các cấp trước), nút Duyệt / Từ chối (lý do) / Yêu cầu bổ sung / Chuyển tiếp; nhập OTP khi bước yêu cầu.
2. Trang cấu hình luồng duyệt (quản trị): thêm, sắp xếp, sửa bước; chọn loại phiếu; SLA; kiểm tra hợp lệ trước khi lưu; xem trước luồng dưới dạng sơ đồ đơn giản.
3. Trang ủy quyền: tạo, xem, thu hồi ủy quyền.
4. Trang cấu hình leo thang và nhắc việc của công ty (các tham số ở P2.3) kèm mô tả cho từng tham số.
5. Dự án: chọn mức giao việc (Nhẹ, Chuẩn, Chặt), kèm giải thích ngắn bằng ví dụ; hộp xác nhận khi đổi mức.
6. Mọi biểu mẫu có kiểm tra rõ ràng; trợ năng và bàn phím.

ĐẦU RA: màn hình, test Playwright.
```

**Bạn kiểm tra**

- [ ] Quản trị tạo luồng 2 cấp bằng giao diện, không cần sửa code.
- [ ] Duyệt một phiếu bằng điện thoại.
- [ ] Đổi mức giao việc của dự án: có hộp xác nhận và giải thích.

### P2.7 – Biên bản họp và quy tắc tự sinh việc

**Phụ thuộc:** P2.5 · **Dán kèm:** Khối ngữ cảnh chung + Khối thiết kế (phần giao diện)

```text
MỤC TIÊU: Biến kết luận cuộc họp thành việc có người nhận (tài liệu v2.0 mục 5.12).

VIỆC CẦN LÀM
1. Backend: meeting (dự án, tiêu đề, thời gian, người tham dự, nội dung), meeting_item (kết luận, người nhận, hạn); từ mỗi dòng kết luận tạo một việc đúng mức giao việc của dự án; việc tồn đọng từ biên bản trước hiện đầu danh sách ở biên bản sau.
2. Quy tắc tự sinh việc do người dùng tự bật: "khi việc A xong thì tạo việc B giao cho C", "khi mốc sắp đến hạn N ngày thì tạo việc nhắc". Mặc định hệ thống không có quy tắc nào; mỗi quy tắc có tên, người tạo, bật/tắt, lịch sử chạy; giới hạn chống vòng lặp tạo việc vô hạn.
3. Frontend: màn hình Họp trong dự án; soạn kết luận, bấm "Tạo việc từ kết luận"; xem việc tồn đọng; màn hình quản lý quy tắc.
4. Cổng cho mô-đun ngoài tạo việc qua API (chỉ định nghĩa hợp đồng API, chưa mở công khai).

ĐẦU RA: backend + giao diện + test.
```

**Bạn kiểm tra**

- [ ] Nhập biên bản 5 kết luận, tạo 5 việc đúng người, đúng hạn.
- [ ] Tạo quy tắc tự gọi lại chính nó: bị chặn bởi giới hạn chống vòng lặp.
- [ ] Biên bản sau hiện việc tồn đọng chưa xong của biên bản trước.

### P2.8 – Kiểm thử và cổng nghiệm thu giai đoạn 2

**Phụ thuộc:** P2.1 đến P2.7

```text
MỤC TIÊU: Chứng minh giai đoạn 2 đạt chất lượng; không thêm tính năng.

VIỆC CẦN LÀM
1. Playwright e2e: giao việc mức Chuẩn và Chặt từ giao đến duyệt; từ chối; xin gia hạn; leo thang (dùng đồng hồ giả); luồng duyệt 2 cấp; ủy quyền; biên bản họp.
2. Test an toàn dữ liệu: người không có quyền không đọc được phiếu duyệt hay việc mật; không bỏ qua bước duyệt bằng cách gọi API trực tiếp.
3. axe và bàn phím cho mọi màn hình mới; cập nhật docs/a11y-report.md.
4. Tải: 100 người dùng đồng thời kèm SSE; ghi kết nối đồng thời, độ trễ thông báo.
5. docs/phase2-acceptance.md: bảng tiêu chí, kết quả, lỗi còn lại.

ĐẦU RA: test, báo cáo.
```

### Cổng 2

- [ ] Một dự án thật chạy thử mức Chuẩn ít nhất 2 tuần với 5 đến 10 người; ghi lại việc quá hạn, tỷ lệ phản hồi nhận việc, ý kiến người dùng.
- [ ] Tham số leo thang đã được lãnh đạo chốt (không dùng giá trị minh họa).
- [ ] Không còn lỗi nghiêm trọng về quyền và bỏ qua bước duyệt.

---

# GIAI ĐOẠN 3 – MẪU, NHẬP AI, LỊCH, BÁO CÁO

Mục tiêu: trường tùy chỉnh, thư viện mẫu, nhập Excel/PDF bằng AI, Lịch, việc lặp lại, baseline và đường găng, in và xuất. Tham chiếu tài liệu v2.0 mục 5.7, 5.9, 5.10, 6.

### P3.1 – Trường tùy chỉnh và nhãn chuẩn

**Phụ thuộc:** Cổng 2

```text
MỤC TIÊU: Cho phép mỗi phòng thêm thông tin riêng mà không sửa hệ thống.

VIỆC CẦN LÀM
1. Backend: custom_field_definition (phạm vi công ty / dự án / mẫu; loại: văn bản, số, ngày, danh sách chọn, người, đường dẫn; bắt buộc hay không; thứ tự); giá trị lưu trong task.custom_fields JSONB, kiểm tra đúng loại; thay đổi định nghĩa không làm mất dữ liệu cũ (đổi loại bị chặn nếu đã có dữ liệu, ẩn thay vì xóa).
2. Nhãn chuẩn cấp công ty do quản trị đặt, nhãn riêng của dự án; hợp nhất nhãn trùng.
3. Giao diện: trang quản lý trường và nhãn; trường hiện trong drawer việc, thêm thành cột trong bảng, dùng làm điều kiện lọc và nhóm; nhập và xuất giá trị.
4. Index GIN và hiệu năng lọc theo trường tùy chỉnh trên 10.000 việc.

ĐẦU RA: backend, giao diện, test.
```

**Bạn kiểm tra**

- [x] Tạo trường "Cơ quan giải quyết" (danh sách chọn), nhập cho 10 việc, lọc theo giá trị.
- [x] Xóa một lựa chọn đang được dùng: hệ thống cảnh báo và không mất dữ liệu.

### P3.2 – Mẫu dự án và mẫu việc

**Phụ thuộc:** P3.1, P2.4

```text
MỤC TIÊU: Quản lý mẫu (tài liệu v2.0 mục 6.1 đến 6.3).

VIỆC CẦN LÀM
1. Backend: template (loại: dự án hoặc việc; cấp sở hữu: cá nhân, phòng/chi nhánh, công ty; trạng thái: nháp, đã công bố), template_version, nội dung dạng cây việc kèm checklist, thời lượng gợi ý, phụ thuộc, vai trò thay cho người cụ thể, mức giao việc gợi ý, nhãn, trường tùy chỉnh, tệp mẫu.
2. "Lưu làm mẫu" từ dự án hoặc nhóm việc: loại bỏ ngày, người, tệp thật, số liệu; đề xuất ánh xạ người thành vai trò.
3. Công bố mẫu cấp công ty/chi nhánh qua luồng duyệt (P2.4); sửa mẫu tạo phiên bản mới; dự án đã nạp không bị ảnh hưởng.
4. Nạp mẫu: vào dự án mới hoặc dự án đang mở (thêm hoặc thay); dời ngày theo ngày khởi công và lịch nghỉ; chọn người cho từng vai trò; có hoàn tác.
5. Mẫu việc: chèn nhanh vào bất kỳ dự án.
6. Thống kê: số lần dùng, người dùng nhiều, mẫu lâu không dùng.
7. Giao diện: thư viện mẫu (lọc, tìm, xem trước cây việc), trình tạo mẫu, hộp thoại nạp mẫu; kích hoạt hai lựa chọn "Từ mẫu" ở wizard tạo dự án (P1.10).

RÀNG BUỘC: Mẫu không chứa số liệu thật; sau khi nạp, dự án là dữ liệu thường, không liên kết ngược với mẫu.
ĐẦU RA: backend, giao diện, test (nạp, dời ngày qua ngày lễ, hoàn tác, phiên bản).
```

**Bạn kiểm tra**

- [ ] Lưu một dự án làm mẫu: mẫu không chứa tên người, ngày thật, tệp.
- [x] Nạp mẫu với ngày khởi công vào thứ Sáu trước kỳ nghỉ lễ: ngày được dời đúng.
- [x] Sửa mẫu: dự án đã nạp trước đó không đổi.

### P3.3 – Tám mẫu khởi đầu

**Phụ thuộc:** P3.2

```text
MỤC TIÊU: Nạp 8 mẫu khởi đầu (tài liệu v2.0 mục 6.4) làm dữ liệu, không phải mã.

VIỆC CẦN LÀM
1. Tạo thư mục seed/templates/ gồm 8 file JSON sửa được bằng tay: Triển khai KCN tổng thể; Thủ tục pháp lý một hồ sơ; Giải phóng mặt bằng; San lấp mặt bằng; Hạ tầng cầu đường; Vận hành định kỳ; Trạm trộn: kế hoạch tháng; Họp giao ban.
2. Mỗi mẫu: nhóm việc, việc, việc con, checklist gợi ý, thời lượng gợi ý, vai trò, mức giao việc gợi ý, trường tùy chỉnh (ví dụ cơ quan giải quyết, số hồ sơ, ngày hết hạn).
3. Mẫu KCN có mốc cổng G0 đến G6 là mốc kèm checklist điều kiện (cấu hình dữ liệu, chưa khóa việc).
4. Mẫu có tag "Gợi ý, cần phòng chuyên môn rà soát" và ghi rõ không phải biểu mẫu hay quy trình pháp lý chuẩn.
5. Script nạp mẫu vào cấp công ty ở trạng thái "nháp" để phòng chuyên môn chỉnh rồi công bố.
6. Tài liệu hướng dẫn cho phòng chuyên môn cách sửa mẫu bằng giao diện.

RÀNG BUỘC: Không tự bịa danh mục thủ tục pháp lý, căn cứ pháp luật hay thời hạn; dùng tên bước chung và để trống trường pháp lý cho Pháp chế điền. Không có số liệu thật.
ĐẦU RA: 8 file mẫu, script nạp, tài liệu.
```

**Bạn kiểm tra**

- [x] Nạp từng mẫu vào một dự án thử: cây việc, vai trò, thời lượng gợi ý, mức giao việc và các mốc G0–G6 hợp lệ; không lỗi.
- [ ] Đưa từng mẫu cho phòng chuyên môn liên quan xem và sửa; ghi nhận ý kiến.
- [x] Rà soát mẫu pháp lý khởi đầu: không có trích dẫn điều luật hay thời hạn do AI tự thêm.

Hướng dẫn rà soát và chỉnh mẫu trong giao diện: [template-authoring.md](./template-authoring.md).

### P3.4 – Dịch vụ AI nhập từ Excel/PDF

**Phụ thuộc:** P3.2 · **Dán kèm:** Khối ngữ cảnh chung (+ Khối thiết kế cho phần giao diện)

```text
MỤC TIÊU: Nhập bảng kế hoạch hoặc dự toán từ Excel, CSV, PDF thành cây việc để người dùng kiểm tra rồi nạp (tài liệu v2.0 mục 6.5).

VIỆC CẦN LÀM
1. services/ai bằng Python + FastAPI: nhận tệp, trích bảng (openpyxl, pandas, pdfplumber), nhận diện cột tên việc, thời lượng, ngày, người, ghi chú; dùng mô hình ngôn ngữ để đề xuất nhóm việc và việc con. Nhà cung cấp mô hình đặt sau một interface, đổi bằng biến môi trường; có chế độ "không AI" (chỉ ánh xạ cột và thụt cấp theo quy tắc) cho dữ liệu mật.
2. Chính sách dữ liệu: cấu hình công ty "cho phép gửi ra dịch vụ AI bên ngoài: có/không"; dự án mật mặc định không; ghi log mỗi lần gọi (không ghi nội dung).
3. API nội bộ giữa apps/api và services/ai có xác thực dịch vụ; giới hạn kích thước tệp, thời gian xử lý; xử lý bất đồng bộ qua BullMQ, trả tiến độ.
4. Kết quả: JSON cây việc kèm độ tin cậy từng dòng và cảnh báo (ví dụ ngày không hiểu được).
5. Giao diện: màn hình "Nhập từ file": tải tệp, xem tiến độ, xem trước cây việc có thể sửa (đổi tên, thụt cấp, bỏ dòng, sửa ngày), chọn nạp vào dự án mới hoặc đang mở, hoàn tác sau khi nạp. Kích hoạt lựa chọn "Nhập từ Excel/PDF" ở wizard tạo dự án.
6. Bộ tệp thử (ít nhất 6 tệp mẫu giả: bảng gọn, bảng nhiều cấp, bảng lộn xộn, PDF có chữ, PDF scan nếu hỗ trợ) và test đo tỷ lệ dòng nhận đúng.

RÀNG BUỘC: Không lưu tệp gốc lâu hơn thời gian cần (xóa sau khi xử lý hoặc theo cấu hình). Không nạp vào dự án khi chưa qua bước người kiểm tra.
ĐẦU RA: dịch vụ, API, giao diện, tệp thử, báo cáo độ chính xác.
```

**Bạn kiểm tra**

- [ ] Thử với 3 bảng kế hoạch thật của công ty (đã xóa thông tin nhạy cảm): xem tỷ lệ dòng đúng.
- [ ] Bật chế độ "không AI": vẫn nhập được bảng đơn giản.
- [ ] Dự án mật: hệ thống không gửi gì ra ngoài.
- [x] Nạp xong bấm hoàn tác: dự án về như cũ (test DB nhập cây việc rồi hoàn tác thành công).

Đã triển khai luồng nhập XLSX/CSV/PDF có văn bản theo hướng xử lý cục bộ không dùng AI: xem trước trước khi gửi dữ liệu việc lên API, sửa tên/cấp/ngày, bỏ dòng và hoàn tác trong 10 phút. Người phụ trách trong tệp chỉ hiện để đối chiếu, chưa được ánh xạ thành thành viên dự án. PDF scan/OCR, dịch vụ AI, cấu hình chính sách dữ liệu, 6 tệp mẫu và đánh giá độ chính xác chưa triển khai; vì vậy P3.4 chưa hoàn tất. Tệp gốc không được gửi lên API.

### P3.5 – Chế độ Lịch và việc lặp lại

**Phụ thuộc:** Cổng 2 · **Dán kèm:** Khối ngữ cảnh chung + Khối thiết kế

```text
MỤC TIÊU: Chế độ xem Lịch và việc lặp lại.

VIỆC CẦN LÀM
1. Backend: quy tắc lặp (ngày, tuần, tháng, quý, theo ngày làm việc của dự án, thứ trong tuần, ngày trong tháng), điều kiện dừng; mỗi kỳ sinh một bản việc riêng có checklist riêng; tạo trước tối đa N kỳ (tham số); sửa "chỉ kỳ này" hoặc "từ kỳ này trở đi"; xử lý ngày lễ và kỳ rơi vào ngày nghỉ.
2. Frontend: chế độ Lịch (tháng, tuần) trong dự án và trong "Việc của tôi"; kéo thả để đổi hạn; lọc theo người, nhãn; bàn phím và điện thoại.
3. Test: bao phủ các quy tắc lặp phức tạp, múi giờ, chuyển giờ, ngày cuối tháng.

ĐẦU RA: backend, giao diện, test.
```

**Bạn kiểm tra**

- [x] Tạo việc "Kiểm tra an toàn" lặp mỗi thứ Hai: 4 kỳ tới có ngày đúng, bỏ qua ngày lễ đúng như cấu hình (test DB kiểm tra ngày 02, 10, 16, 23/11/2026).
- [x] Sửa "từ kỳ này trở đi": kỳ trước không đổi (test DB xác nhận kỳ đầu giữ nguyên, kỳ chọn và kỳ sau được cập nhật).

Đã triển khai lịch tháng/tuần dự án và "Việc của tôi", lọc, đổi hạn bằng kéo thả hoặc điều khiển ngày, cùng lặp ngày/tuần/tháng/quý/ngày làm việc và chỉnh kỳ hiện tại hoặc các kỳ đã sinh về sau. Mỗi kỳ có checklist riêng; mỗi lần tạo tối đa 52 kỳ. Playwright đã kiểm tra tạo chuỗi lặp và đổi hạn; chưa kiểm tra đầy đủ điều hướng lịch tháng/tuần, lọc lịch và giao diện điện thoại. Ngày được xử lý dạng date-only theo UTC vì mô hình chưa lưu giờ hoặc múi giờ; không hỗ trợ lịch theo giờ hay xác nhận DST.

### P3.6 – Lập lịch nâng cao: tự dời, baseline, đường găng

**Phụ thuộc:** P1.14b

```text
MỤC TIÊU: Các tính năng lập lịch nâng cao, đều là tùy chọn bật theo dự án (tài liệu v2.0 mục 5.7).

VIỆC CẦN LÀM
1. Tự dời các việc sau khi đổi ngày việc trước, theo 3 kiểu nối và độ trễ, tính theo ngày làm việc; có bản xem trước các việc sẽ bị dời trước khi áp dụng; có hoàn tác.
2. Baseline: lưu kế hoạch gốc (nhiều bản, đặt tên); so sánh với thực tế (độ lệch ngày bắt đầu, kết thúc); hiển thị thanh baseline trên Timeline.
3. Đường găng (CPM) tính theo lịch dự án; đánh dấu việc găng và độ trễ cho phép; kiểm thử bằng các mạng việc có đáp án đã biết, kể cả hai kiểu nối khác nhau và độ trễ âm.
4. Dự báo ngày hoàn thành dự án từ tiến độ thực tế (ghi rõ cách tính và giới hạn).
5. Giao diện: nút bật/tắt từng tính năng trong cài đặt dự án; chú giải rõ trên Timeline.

RÀNG BUỘC: Mặc định tất cả tắt. Không dùng thuật toán chưa có test với đáp án đối chiếu.
ĐẦU RA: dịch vụ lập lịch, giao diện, test.
```

**Bạn kiểm tra**

- [x] Dựng tay một mạng 6 việc, tính đường găng bằng tay, so với kết quả hệ thống (FS/SS/FF, độ trễ âm, ngày nghỉ).
- [x] Đổi ngày một việc đầu chuỗi: bản xem trước hiện đúng các việc bị dời, hoàn tác được (Playwright kiểm tra preview/apply/undo; DB test kiểm tra lan truyền theo quan hệ tự dời).

Đã thêm CPM tùy chọn theo dự án (mặc định tắt), với thời lượng ngày làm việc, quan hệ FS/SS/FF, độ trễ âm, ngày nghỉ và kiểm tra chu trình; baseline có lưu và so sánh sai khác; tự dời có preview/apply/undo; dự báo tiến độ là heuristic được kiểm tra bằng DB test. Chưa có giao diện Timeline để xem thanh baseline, chưa có giao diện quản lý quan hệ tự dời, và dự báo chưa được nghiệp vụ phê duyệt; vì vậy P3.6 chưa hoàn tất.

### P3.7 – In và xuất báo cáo

**Phụ thuộc:** P1.14b, P2.4 · **Dán kèm:** Khối ngữ cảnh chung + Khối thiết kế

```text
MỤC TIÊU: In bảng tiến độ và xuất dữ liệu (tài liệu v2.0 mục 5.10).

VIỆC CẦN LÀM
1. In và xuất PDF khổ A3 và A4 ngang: chọn phạm vi ngày (cả dự án, đoạn đang xem, 2 tuần tới, 1 tháng tới, tùy chọn), nhóm việc cần in, mức chi tiết (đầy đủ hoặc chỉ nhóm việc), cột nhãn; đầu trang cấu hình được (logo, mã và tên dự án, ngày khởi công và bàn giao, tiến độ, ngày cập nhật, chú giải); chân trang có khung chữ ký nhiều bên, mặc định 3 bên, tên bên cấu hình được; số trang.
2. Sinh PDF phía máy chủ bằng Playwright/Chromium từ một route in riêng; hàng đợi và tải về khi xong; vector sắc nét.
3. Xuất Excel (exceljs) đầy đủ việc và cột đang xem, xuất CSV và JSON sao lưu.
4. Quyền xuất riêng; xuất dữ liệu dự án mật cần duyệt (P2.4); ghi nhật ký mỗi lần xuất.
5. Báo cáo định kỳ: lịch gửi hằng tuần hoặc tháng cho người theo dõi (gửi trong ứng dụng; email ở P4.6).
6. Xem trước bản in; xử lý tên việc dài, nhiều việc nhiều trang, tiếng Việt có dấu đúng phông.

ĐẦU RA: dịch vụ in, giao diện tùy chọn, test (so sánh ảnh chụp trang PDF).
```

**Bạn kiểm tra**

- [ ] In dự án 300 việc ra A3 ngang: đọc được, không cắt chữ, chữ ký đúng 3 bên.
- [x] Mở file Excel: đúng cột đang xem (Playwright tải, mở lại workbook và đối chiếu hàng tiêu đề sau khi bỏ một cột).
- [x] Xuất dự án mật khi chưa được duyệt: bị chặn (DB test xác nhận trả 403 và ghi audit; sau khi duyệt mới cho xuất).

Đã có chọn phạm vi/cột/khổ giấy, xem trước in, CSV/XLSX/JSON, phân quyền và audit log. Playwright đã dựng PDF A3 từ báo cáo giả lập 300 việc, xác nhận PDF hợp lệ, đủ 300 dòng trong nội dung in và có 3 ô chữ ký; chưa so sánh hình ảnh PDF để chứng minh chữ không bị cắt. PDF hiện được tạo tại trình duyệt, chưa có route/queue PDF phía máy chủ; báo cáo định kỳ chưa triển khai. P3.7 vẫn chưa hoàn tất.

### P3.8 – Kiểm thử và cổng nghiệm thu giai đoạn 3

**Phụ thuộc:** P3.1 đến P3.7

Trạng thái và bằng chứng hiện có: [phase3-acceptance.md](./phase3-acceptance.md). Tài liệu đang ghi nhận giai đoạn chưa nghiệm thu; không thay thế các cổng kiểm tra bên dưới.

```text
MỤC TIÊU: Chứng minh giai đoạn 3 đạt chất lượng; không thêm tính năng.

VIỆC CẦN LÀM
1. Playwright e2e: tạo mẫu, công bố qua duyệt, nạp mẫu, nhập Excel và PDF có xem trước, việc lặp lại, Lịch, bật đường găng, in PDF, xuất Excel.
2. Rà trợ năng và hiệu năng các màn hình mới; cập nhật báo cáo.
3. Kiểm tra quyền: người không có quyền xuất, công bố mẫu, hoặc nhập từ file.
4. docs/phase3-acceptance.md.

ĐẦU RA: test, báo cáo.
```

**Bạn kiểm tra**

- [x] Playwright kiểm tra tạo mẫu cá nhân, gửi mẫu cấp chi nhánh qua duyệt (trạng thái chờ duyệt), nhập CSV/XLSX/PDF qua xem trước, lặp việc, tự dời có hoàn tác, xuất XLSX và xem/in báo cáo 300 dòng.
- [x] Kiểm tra quyền mẫu: người không sở hữu bản nháp không có điều khiển sửa/công bố; người chỉ xem không có thao tác nhập hoặc xuất. DB test xác nhận API từ chối import của viewer, từ chối người không sở hữu gửi công bố, cấm người tạo tự duyệt và chỉ công bố sau khi luồng duyệt chấp thuận.
- [x] Kiểm tra axe mức nghiêm trọng/cực kỳ nghiêm trọng trên thư viện mẫu, mức cực kỳ nghiêm trọng trên báo cáo in; thời gian DOMContentLoaded của thư viện mẫu dưới 5 giây trong e2e cục bộ.
- [ ] Rà trợ năng và hiệu năng toàn diện trên mọi màn hình/trạng thái mới, gồm điện thoại; hoàn tất phê duyệt công bố mẫu qua giao diện người duyệt và nghiệm thu người dùng.

### Cổng 3

- [ ] Phòng Pháp chế, Kỹ thuật, Kế hoạch đã xem và chỉnh mẫu của mình.
- [ ] Độ chính xác nhập AI trên bảng thật được lãnh đạo chấp nhận.
- [ ] Bản in A3/A4 được người dùng hiện trường chấp nhận.

---

# GIAI ĐOẠN 4 – ĐA CHI NHÁNH VÀ MỞ RỘNG

Mục tiêu: dashboard, KPI, khách ngoài, API công khai và webhook, SSO, 2FA, kênh thông báo ngoài, vận hành. Tham chiếu tài liệu v2.0 mục 8, 10, 11.

### P4.1 – Dashboard và KPI

**Phụ thuộc:** Cổng 3 · **Dán kèm:** Khối ngữ cảnh chung + Khối thiết kế

```text
MỤC TIÊU: Dashboard theo đối tượng và bộ KPI quản lý công việc (tài liệu v2.0 mục 10).

VIỆC CẦN LÀM
1. Backend: các truy vấn hoặc view tổng hợp (materialized view làm mới định kỳ nếu cần) cho: danh mục dự án xanh/vàng/đỏ, so sánh chi nhánh, tải theo phòng và theo người, việc quá hạn, việc chờ duyệt lâu, KPI giao việc (đúng hạn, thời gian phản hồi nhận việc, tỷ lệ bị trả lại, tỷ lệ từ chối và xin gia hạn), KPI cộng tác, KPI mẫu, KPI hệ thống. Định nghĩa từng chỉ số trong docs/kpi-definitions.md.
2. Quyền: chỉ số theo từng cá nhân là dữ liệu nhạy cảm, chỉ người có thẩm quyền xem và ghi nhật ký truy cập; không hiển thị xếp hạng cá nhân mặc định.
3. Giao diện: dashboard cho lãnh đạo, giám đốc chi nhánh, chủ dự án, trưởng phòng, cá nhân; bộ lọc thời gian, chi nhánh, phòng; bấm vào số liệu để xem danh sách việc; biểu đồ dùng bảng màu có thể phân biệt không chỉ bằng màu, có bảng dữ liệu thay thế cho trình đọc màn hình.
4. Hiệu năng: truy vấn dưới mức đặt ra với 100.000 việc seed (tham số).

RÀNG BUỘC: Không đưa KPI chuyên ngành (doanh thu, EVM, chất lượng...).
ĐẦU RA: backend, giao diện, kpi-definitions.md, test.
```

**Bạn kiểm tra**

- [x] Đọc `kpi-definitions.md`, tự tính tay 2 chỉ số trên dữ liệu nhỏ, so với dashboard. DB test xác nhận quá hạn 1, hoàn thành đúng hạn 1/2 = 50%, tỷ lệ trả lại 1/2 = 50%, thời gian phản hồi 30 phút.
- [x] Trưởng phòng không xem được chỉ số cá nhân của phòng khác. DB test xác nhận trưởng phòng phòng A chỉ nhận dữ liệu phòng A và API từ chối lọc sang phòng B; kiểm tra thêm bộ lọc chi nhánh.
- [x] Chuyển biểu đồ sang chế độ bảng: số liệu giống nhau. Web test đối chiếu từng hàng trạng thái giữa hai chế độ.
- [x] Benchmark dashboard với 100.000 việc: 638 ms, dưới ngưỡng cấu hình 5.000 ms; DB benchmark và các test dashboard đều đạt.

Benchmark thử nghiệm mới nhất: 100.000 việc, 638 ms trên PostgreSQL cục bộ với ngưỡng cấu hình 5.000 ms; đây không phải cam kết SLA production.

### P4.2 – Cổng khách ngoài

**Phụ thuộc:** P2.4

```text
MỤC TIÊU: Nhà thầu, tư vấn, chủ đầu tư làm việc an toàn trong phạm vi hẹp (tài liệu v2.0 mục 5.4.5, 8.4).

VIỆC CẦN LÀM
1. Tài khoản khách: mời theo dự án, có hạn, tự thu hồi khi hết hạn; mời vào dự án mật cần duyệt (P2.4).
2. Khách chỉ thấy việc được giao hoặc được chia sẻ; chỉ nộp kết quả, nhận xét, tải tệp của mình; không thấy thành viên khác ngoài người liên quan.
3. Hồ sơ nộp qua cổng được đóng dấu thời gian và không sửa được sau khi nộp (chỉ nộp bản mới).
4. Xem tệp có watermark (tên người xem, thời gian) khi dự án yêu cầu; ghi nhật ký xem và tải.
5. Link xem có hạn, chỉ xem, thay cho link công khai; có thể thu hồi ngay.
6. Giao diện cổng gọn cho điện thoại.
7. Test thâm nhập logic: khách không thể thấy việc ngoài phạm vi qua đổi ID, qua tìm kiếm, qua thông báo, qua thư viện tệp.

ĐẦU RA: backend, giao diện, test.
```

**Bạn kiểm tra**

- [x] Thử đổi ID qua API để xem việc khác: task/file ngoài whitelist bị từ chối (404) và có nhật ký; giao diện chỉ liệt kê công việc được chia sẻ, không định tuyến theo ID tùy ý. Đã kiểm tra bằng guest portal unit, DB và UI tests.
- [x] Hết hạn tài khoản: khách không đăng nhập được; DB test xác nhận trạng thái hết hạn và nội dung đã nộp vẫn còn nguyên.

### P4.3 – Đo và tối ưu tìm kiếm

**Phụ thuộc:** P1.7

```text
MỤC TIÊU: Quyết định dựa trên số đo xem có cần công cụ tìm kiếm riêng hay không.

VIỆC CẦN LÀM
1. Tạo dữ liệu thử lớn (ví dụ 500.000 việc, 2 triệu nhận xét); đo thời gian tìm kiếm PostgreSQL hiện tại, p50 và p95.
2. Tối ưu trước: index, cấu hình từ điển, phân vùng, bộ nhớ đệm, truy vấn.
3. Nếu sau tối ưu vẫn không đạt ngưỡng đặt ra (tham số), đề xuất OpenSearch (kèm chi phí vận hành, cách đồng bộ, rủi ro) nhưng CHƯA cài; chờ tôi quyết.
4. Tùy chọn OCR cho tệp scan: chỉ đánh giá khả thi và chi phí, không làm.

ĐẦU RA: docs/search-benchmark.md, các tối ưu đã áp dụng.
```

**Bạn kiểm tra**

- [x] Đã ghi nhận phép đo sơ bộ trước/sau trên 10.000 việc khớp từ khóa: p50 2.283,3 → 124,7 ms và p95 4.914,8 → 137,5 ms; thêm phép đo sau tối ưu trên 100.000 việc: p50 379,3 ms, p95 465,2 ms. Chi tiết và giới hạn ở [search-benchmark.md](./search-benchmark.md).
- [ ] Đo đủ quy mô production-like (đặc tả gợi ý 500.000 việc và 2 triệu nhận xét); phép đo 100.000 việc hiện chưa có nhận xét.
- [ ] Bạn quyết định có dùng OpenSearch hay không. Hiện chưa cài; khuyến nghị giữ PostgreSQL dựa trên số đo cục bộ.

### P4.4 – API công khai, API key, webhook

**Phụ thuộc:** Cổng 3

```text
MỤC TIÊU: Cho phép mô-đun và hệ thống khác tích hợp (tài liệu v2.0 mục 12).

VIỆC CẦN LÀM
1. API v1 có phiên bản: tạo việc, đọc trạng thái, cập nhật việc, gắn liên kết ngoài, tạo trường tùy chỉnh; tài liệu OpenAPI công khai nội bộ kèm ví dụ.
2. API key theo tổ chức hoặc theo dự án, có phạm vi quyền (scope), hạn dùng, thu hồi; lưu băm; ghi log sử dụng; giới hạn tần suất theo key.
3. Webhook: đăng ký theo sự kiện (việc được tạo, đổi trạng thái, quá hạn, duyệt xong...), ký HMAC, thử lại có giãn cách, hàng đợi thư chết, màn hình xem lịch sử gửi.
4. Ví dụ tích hợp: một script nhỏ "tạo việc từ hệ thống bên ngoài" và "nhận webhook".
5. Giao diện quản lý API key và webhook cho quản trị.

RÀNG BUỘC: API key không bao giờ hiện lại sau khi tạo. Phạm vi quyền không vượt quyền người tạo key.
ĐẦU RA: backend, giao diện quản trị, tài liệu, test.
```

**Bạn kiểm tra**

- [x] Dùng key phạm vi `task:read` để tạo việc: API từ chối HTTP 403; DB test xác nhận key chỉ lưu SHA-256, list không trả lại token và mọi thao tác đọc thành công được ghi nhật ký.
- [ ] Webhook gặp lỗi tạm thời: thử lại; gặp lỗi lâu: vào hàng đợi thư chết và hiện trên màn hình.
- [x] API key theo dự án có scope, hạn dùng, thu hồi tức thì, giới hạn 60 yêu cầu/phút và nhật ký sử dụng; tài liệu phần đã hỗ trợ ở [api-v1.md](./api-v1.md).
- [ ] Hoàn thiện API v1 (cập nhật việc, liên kết ngoài), key theo tổ chức, giao diện quản trị key/webhook, OpenAPI đầy đủ và ví dụ tích hợp.

### P4.5 – SSO, 2FA, nhật ký truy cập bất biến

**Phụ thuộc:** P1.2

```text
MỤC TIÊU: Nâng cấp xác thực và truy vết (tài liệu v2.0 mục 8.4).

VIỆC CẦN LÀM
1. SSO bằng OIDC theo nhà cung cấp công ty đang dùng (Microsoft Entra, Google Workspace hoặc khác; tôi sẽ cho biết); ánh xạ nhóm sang chi nhánh và phòng ban; tắt đăng nhập mật khẩu theo cấu hình.
2. 2FA TOTP (kèm mã khôi phục); có thể bắt buộc cho người duyệt, người xem dự án mật, quản trị.
3. Quản lý phiên: xem và đăng xuất từng thiết bị; hết hạn theo cấu hình.
4. Nhật ký truy cập bất biến: ai, làm gì, lúc nào, giá trị cũ và mới, thiết bị; ghi cả lần xem, tải, xuất ở dự án mật; liên kết băm giữa các bản ghi để phát hiện sửa; công cụ kiểm tra tính toàn vẹn.
5. Màn hình tra cứu nhật ký cho quản trị bảo mật, có lọc; xuất nhật ký cần duyệt.

ĐẦU RA: backend, giao diện, test.
```

**Bạn kiểm tra**

- [ ] Đăng nhập SSO bằng tài khoản Google Workspace; người nghỉ việc bị vô hiệu hóa không đăng nhập được. Đã chọn domain `congty.com` và ánh xạ qua tài khoản QLCV tạo sẵn; chưa triển khai hoặc cấu hình OAuth client.
- [ ] Sửa tay một dòng nhật ký trong DB: công cụ kiểm tra phát hiện.

### P4.6 – Kênh thông báo ngoài: email, Zalo, SMS

**Phụ thuộc:** P2.3

```text
MỤC TIÊU: Gửi thông báo ra ngoài ứng dụng, an toàn và có kiểm soát.

VIỆC CẦN LÀM
1. Email: mẫu thư tiếng Việt cho các sự kiện chính, bản tóm tắt hằng ngày và tuần, liên kết mở đúng việc, chống gửi trùng; dùng nhà cung cấp cấu hình được (SMTP hoặc dịch vụ API).
2. Zalo (ZNS/OA) và SMS: viết dưới dạng adapter có interface chung; chỉ gửi tin ngắn như "Bạn có việc mới cần nhận", không chứa tài liệu hay nội dung nhạy cảm.
3. Tùy chọn từng người: kênh nào cho loại thông báo nào; giờ yên lặng; việc khẩn luôn gửi.
4. Theo dõi: gửi thành công, thất bại, lý do; giới hạn chi phí theo công ty.

LƯU Ý NGOÀI MÃ NGUỒN: Zalo/ZNS và SMS thường cần tài khoản doanh nghiệp, mẫu tin được nhà cung cấp duyệt và có chi phí; hãy dừng ở phần adapter và chạy được với nhà cung cấp giả (mock) cho tới khi tôi có tài khoản thật.
ĐẦU RA: các adapter, mẫu thư, test với nhà cung cấp giả.
```

**Bạn kiểm tra**

- [x] Gửi thử email qua Mailpit: nội dung tiếng Việt và liên kết mở đúng việc; xác nhận delivery thành công.
- [x] Việc thuộc dự án mật: email thử nghiệm không lộ tiêu đề việc; liên kết chỉ chứa mã dự án/việc và trang đích kiểm tra quyền truy cập.

Ghi nhận triển khai: tùy chọn kênh theo sự kiện, giờ yên lặng, digest ngày/tuần, retry có giãn cách, lịch sử gửi và hạn mức theo ngày đã được nối vào worker. Zalo/SMS mới chạy adapter mô phỏng; kiểm thử worker/DB xác nhận hai kênh này không gửi tin thật. Chưa cấu hình tài khoản hoặc nhà cung cấp thật.

### P4.7 – Vận hành, sao lưu, giám sát

**Phụ thuộc:** P4.4

```text
MỤC TIÊU: Sẵn sàng chạy thật.

VIỆC CẦN LÀM
1. Triển khai: Docker image cho web, api, worker, ai; docker-compose production kèm reverse proxy (Caddy hoặc Nginx) và HTTPS; CI/CD (build, kiểm thử, triển khai, quay lui bản trước); quản lý bí mật qua biến môi trường hoặc kho bí mật (không để trong repo).
2. Sao lưu: PostgreSQL (sao lưu định kỳ và lưu liên tục nếu có thể), kho tệp; mã hóa bản sao lưu; kiểm tra khôi phục tự động hằng tuần và ghi kết quả.
3. Giám sát: số liệu hệ thống (Prometheus/Grafana hoặc OpenTelemetry), log tập trung, cảnh báo (API lỗi, hàng đợi tồn đọng, đầy ổ đĩa, hết hạn chứng chỉ, sao lưu thất bại).
4. Chính sách: lưu giữ dữ liệu, dung lượng tệp và lưu trữ lạnh khi đóng dự án, dọn thùng rác.
5. Tải và bền bỉ: k6 theo số người dùng mục tiêu của công ty; thử tắt từng thành phần; ghi kết quả.
6. Tài liệu: sổ tay vận hành, kế hoạch khôi phục thảm họa (RTO/RPO đặt tham số), danh sách kiểm tra bảo mật trước khi mở thật.

ĐẦU RA: hạ tầng dưới dạng mã, tài liệu, báo cáo thử.
```

**Bạn kiểm tra**

- [ ] Thực hiện một lần khôi phục thật từ bản sao lưu sang môi trường trống: dữ liệu và tệp đầy đủ.
- [ ] Tắt worker: có cảnh báo đến người phụ trách.
- [ ] Quay lui một bản triển khai lỗi trong vài phút.

Tiến độ kỹ thuật: đã bổ sung endpoint giám sát worker/hàng đợi có token, script gửi cảnh báo email, backup PostgreSQL AES-256-GCM và lệnh kiểm tra khôi phục vào database tạm; thử nghiệm cục bộ đã khôi phục 45 bảng và xác nhận 22 migration. Chưa đánh dấu các mục trên vì chưa hoàn tất khôi phục cả kho tệp, xác nhận cảnh báo qua lần dừng worker thực tế, hoặc diễn tập rollback production; các giới hạn và hướng dẫn ở [operations-runbook.md](./operations-runbook.md).

### P4.8 – Nghiệm thu giai đoạn 4 và thử nghiệm thực tế (UAT)

**Phụ thuộc:** P4.1 đến P4.7

```text
MỤC TIÊU: Chứng minh sẵn sàng triển khai toàn công ty; không thêm tính năng.

VIỆC CẦN LÀM
1. Playwright e2e các luồng mới: SSO, 2FA, dashboard, khách ngoài, API key, webhook.
2. Rà soát bảo mật độc lập (R2) cho phân quyền, khách ngoài, tải tệp, API công khai; liệt kê lỗi theo mức độ.
3. Kế hoạch UAT: kịch bản theo vai trò (lãnh đạo, giám đốc chi nhánh, chỉ huy trưởng, nhân viên, khách ngoài), mẫu ghi nhận lỗi và góp ý.
4. docs/phase4-acceptance.md và docs/go-live-checklist.md.

ĐẦU RA: test, báo cáo, kế hoạch UAT.
```

**Bạn kiểm tra**

- [x] Rà soát bảo mật độc lập ban đầu trên xác thực, phân quyền và cổng khách: không có phát hiện. Rà soát này chưa bao gồm các API key vừa bổ sung; cần rà soát lại sau thay đổi.
- [x] Rà soát độc lập lát cắt API key P4.4: không có phát hiện bảo mật trong phần được xem xét.
- [ ] Rà soát bảo mật độc lập sau cùng trên API công khai, webhook, xác thực, tệp và phân quyền.
- [ ] Hoàn thành e2e luồng SSO, 2FA, dashboard, khách ngoài, API key và webhook.
- [ ] Tổ chức UAT 2–4 tuần tại ít nhất hai chi nhánh và xử lý góp ý.
- [x] Tạo khung kế hoạch UAT/nghiệm thu và checklist go-live; các bước thực nghiệm, ký duyệt còn mở tại [phase4-acceptance.md](./phase4-acceptance.md) và [go-live-checklist.md](./go-live-checklist.md).

### Cổng 4

- [ ] Rà soát bảo mật độc lập: không còn lỗi mức cao.
- [ ] Đã thử khôi phục sao lưu thật.
- [ ] UAT 2 đến 4 tuần ở ít nhất 2 chi nhánh; ý kiến được xử lý.
- [ ] Lãnh đạo ký duyệt các tham số: leo thang, hạn mức tệp, chính sách dữ liệu, chỉ số cá nhân.

---

# GIAI ĐOẠN 5 – MÔ-ĐUN CHUYÊN NGÀNH (TÙY CHỌN)

Chỉ làm khi một bộ phận có nhu cầu rõ và có người sở hữu nghiệp vụ. Mô-đun không sửa lõi; chỉ tích hợp qua các điểm mở rộng đã được xác nhận trong mã nguồn và tài liệu. Theo `docs/api-v1.md`, API key hiện giới hạn theo dự án, hỗ trợ đọc/tạo việc; webhook, cập nhật việc và một số khả năng tích hợp P4.4 chưa được triển khai. Không coi các khả năng còn thiếu là sẵn có. Danh sách mô-đun ứng viên ở `docs/phan-tich-v2.md`, mục 12.

### P5.0 – Prompt mẫu cho một mô-đun

**Dán kèm:** Khối ngữ cảnh chung; `docs/phan-tich-v2.md`; mô tả nghiệp vụ đã được bộ phận sở hữu rà soát; Khối thiết kế và `docs/design-spec.md` nếu có giao diện.

```text
MỤC TIÊU
Chuẩn bị và, chỉ sau khi có phê duyệt rõ ràng, xây mô-đun <TÊN MÔ-ĐUN> cho <ĐƠN VỊ SỞ HỮU NGHIỆP VỤ>. Đây là phần mở rộng tùy chọn; không bắt đầu code chỉ vì đã nhận prompt này.

THÔNG TIN ĐẦU VÀO (điền phần đã biết; ghi "chưa xác định" nếu chưa có)
- Người chịu trách nhiệm nghiệp vụ và người phê duyệt:
- Vấn đề cần giải quyết, đối tượng sử dụng, chi nhánh/phạm vi áp dụng:
- Quy trình hiện tại và kết quả mong muốn:
- Biểu mẫu, dữ liệu đầu vào/đầu ra và nguồn dữ liệu:
- Quy tắc, công thức, ngưỡng, căn cứ nghiệp vụ/pháp lý đã được chủ sở hữu xác nhận:
- Báo cáo/chỉ số cần có và định nghĩa:
- Dữ liệu nhạy cảm, phân loại, thời hạn lưu/xóa:
- Tích hợp ngoài, tải dự kiến và điều kiện nghiệm thu/pilot:
- Ngoài phạm vi:

BƯỚC 1 – KHẢO SÁT VÀ LÀM RÕ (CHƯA THIẾT KẾ CHI TIẾT, CHƯA CODE)
1. Đọc `docs/phan-tich-v2.md` mục 12, prompt này, tài liệu nghiệp vụ đính kèm và các module tương tự trong repo.
2. Tách rõ sự kiện đã xác minh trong tài liệu/mã nguồn, giả định, quyết định còn thiếu và đề xuất; không trình bày đề xuất như tính năng đã có.
3. Tóm tắt người dùng, vai trò/quyền, thực thể, luồng chính/ngoại lệ, đầu vào/đầu ra, báo cáo, dữ liệu nhạy cảm, phụ thuộc lõi và ngoài phạm vi.
4. Hỏi tối đa 5 câu chỉ về quyết định có thể làm thay đổi thiết kế hoặc rủi ro. Nếu đã đủ thông tin, nêu rõ không còn câu hỏi.
DỪNG và chờ câu trả lời; không tạo/sửa mã, migration hay cấu hình.

BƯỚC 2 – ĐỀ XUẤT THIẾT KẾ (CHƯA CODE)
Sau khi nhận câu trả lời, đề xuất:
- Phạm vi, vai trò, ma trận quyền/phạm vi tổ chức-chi nhánh-dự án và cách kiểm tra quyền ở API; không chỉ ẩn nút trên giao diện.
- Mô hình dữ liệu riêng của mô-đun, quan hệ tới lõi, quy tắc tenant/isolation, lưu vết, xóa/lưu trữ và xử lý tệp. Dùng tiền tố `mod_<ten_module>_` cho bảng SQL riêng nếu phù hợp với quy ước Prisma hiện có; không sửa bảng lõi.
- Cách nối với lõi. Trước khi dựa vào API, custom field, nhãn, liên kết hoặc webhook, kiểm tra mã nguồn, OpenAPI và `docs/api-v1.md`; liệt kê endpoint/phạm vi đã có và phần còn thiếu. API key hiện chỉ hỗ trợ đọc/tạo việc theo dự án; webhook và cập nhật việc chưa có. Không giả định có thể gọi API nội bộ để bỏ qua phân quyền.
- Giao diện/luồng chính, trạng thái rỗng/lỗi/loading, trợ năng nếu có UI; báo cáo và định nghĩa/chủ sở hữu số liệu.
- Rủi ro, lựa chọn đã chốt/chưa chốt, migration/triển khai, kế hoạch test, dữ liệu giả lập và tiêu chí nghiệm thu/pilot đo được.
Nếu cần sửa lõi hoặc bổ sung điểm tích hợp chưa tồn tại, trình bày lựa chọn và hệ quả như một đề xuất riêng; không đưa vào phạm vi thực hiện khi chưa được duyệt.
DỪNG và chờ người dùng cùng chủ sở hữu nghiệp vụ duyệt thiết kế/phạm vi. Không code.

BƯỚC 3 – HIỆN THỰC (CHỈ SAU KHI DUYỆT RÕ)
1. Đối chiếu thiết kế đã duyệt với repo hiện tại; báo lại trước khi code nếu phải đổi phạm vi hoặc phát hiện điểm mở rộng không tồn tại.
2. Tạo module NestJS và nhóm route/UI riêng theo pattern trong repo. Chỉ thêm migration/tables riêng; không sửa schema, bảng hay hành vi lõi. Nếu thiết kế cần thay đổi lõi, dừng và xin duyệt thành phạm vi riêng trước khi thực hiện.
3. Bảo vệ mọi route bằng xác thực, phân quyền theo tài nguyên và kiểm tra phạm vi tổ chức/chi nhánh/dự án ở phía server; xác thực đầu vào bằng Zod theo quy ước, ghi activity/audit khi phù hợp. Không để lộ dữ liệu nhạy cảm trong log, thông báo hoặc tích hợp ngoài.
4. Chỉ dùng điểm tích hợp đã xác minh. Không tự tạo webhook/API giả; nếu còn thiếu, dừng phần phụ thuộc đó và nêu rõ phần việc/chấp thuận cần có.
5. Viết unit, DB/integration, API và UI/e2e tests phù hợp, gồm quyền bị từ chối, cô lập tenant, dữ liệu không hợp lệ và luồng lỗi. Cập nhật tài liệu/API client cần thiết; chạy lint, typecheck, test và build liên quan.

BƯỚC 4 – BÁO CÁO VÀ DỪNG
Tóm tắt thay đổi/file chính, quyết định được áp dụng, giả định, kết quả từng lệnh kiểm tra, nghiệm thu còn mở, rủi ro/nợ kỹ thuật và việc để sau. Chỉ đánh dấu checklist có bằng chứng; không tuyên bố UAT/production-ready nếu chưa thực hiện. Dừng, không tự bắt đầu mô-đun khác.

RÀNG BUỘC
- Bộ phận sở hữu nghiệp vụ chịu trách nhiệm cung cấp và phê duyệt công thức, ngưỡng, quy định, biểu mẫu và tiêu chí nghiệm thu. Không tự bịa hoặc diễn giải thay họ.
- Không dùng dữ liệu cá nhân/thật trong kiểm thử nếu chưa được phê duyệt; dùng dữ liệu giả.
- Không thêm dependency, bí mật, tích hợp trả phí hoặc thay đổi lõi ngoài phạm vi đã duyệt.

ĐẦU RA: tóm tắt khảo sát; thiết kế được duyệt; mô-đun và test chỉ khi đã được duyệt thực hiện; báo cáo kiểm tra và nghiệm thu.
```

**Bạn kiểm tra**

- [x] Prompt nêu rõ chủ sở hữu nghiệp vụ và các thông tin cần cung cấp trước khi thiết kế; xác nhận ở bước 1, hỏi tối đa 5 câu.
- [x] Có cổng dừng sau khảo sát, trước code và sau nghiệm thu; không yêu cầu xây module cụ thể khi chưa chọn nghiệp vụ.
- [x] Ràng buộc module riêng, phân quyền/cô lập dữ liệu, test và nguyên tắc không tự bịa nghiệp vụ đã được đưa vào prompt.
- [x] Phần kết nối lõi đối chiếu `docs/api-v1.md`: API key hiện chỉ đọc/tạo việc theo dự án; webhook và cập nhật việc chưa triển khai.

---

# PHỤ LỤC

## Phụ lục A. Điểm bất thường trong file thiết kế và cách xử lý mặc định

File `design-spec` được trích tự động từ giao diện xongviec.com nên có vài giá trị trông như lỗi trích xuất. Đây là phương án mặc định tôi đề xuất để bạn duyệt ở P0.3; bạn có thể đổi.

| #   | Điểm trong file                                                 | Vấn đề                                           | Phương án mặc định đề xuất                                                                                                                                         |
| --- | --------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| a   | `font.weight.base = 700`                                        | Cả đoạn chữ đều đậm, khó đọc                     | Nội dung thường 400; nhãn và nút 600; tiêu đề 700. Ghi thành token riêng                                                                                           |
| b   | `font.size.base = 12px`, thang 10.5 đến 15px                    | Nhỏ, đặc biệt trên điện thoại; 10.5px khó đọc    | Giữ thang token cho bảng dày trên máy tính; chữ nội dung chính trên điện thoại tối thiểu 14px (token riêng cho điện thoại); không dùng 10.5px cho nội dung cần đọc |
| c   | `color.surface.muted = #000000`, `color.text.inverse = #4b5b56` | Có vẻ gán nhầm tên                               | `surface.muted` = `#eef1f5` (giá trị xuất hiện ở token viền); `text.inverse` = `#ffffff`                                                                           |
| d   | `color.border.default` và `color.border.muted` có 4 giá trị     | Là giá trị 4 cạnh, không dùng trực tiếp          | `border.default` = `#eef1f5` (đường kẻ phân cách); `border.strong` = `#64748b` (viền ô nhập, nút; phải đạt tương phản 3:1 theo WCAG 1.4.11)                        |
| e   | Thang khoảng cách 1 đến 9px                                     | Thiếu giá trị cho bố cục lớn                     | Thêm 12, 16, 24, 32, 48px làm token bố cục                                                                                                                         |
| f   | Không có màu thương hiệu                                        | Thiếu màu chủ đạo cho nút chính, liên kết, focus | Dùng `#112723` (màu theme của site) làm `color.brand.primary` và rút bóng `shadow.4` cùng gốc màu này                                                              |
| g   | Chế độ tối                                                      | Không có trong file                              | Chưa làm; chỉ chừa cấu trúc token                                                                                                                                  |

Hai việc cần đo bằng công cụ chứ không kết luận bằng mắt: tương phản của `color.text.secondary` (`#64748b`) trên nền `surface.base` (`#f8fafc`) có thể sát ngưỡng 4,5:1, và `color.border.default` không đủ để làm viền ô nhập. P0.4 đã có test tương phản để bắt các trường hợp này.

## Phụ lục B. Các quyết định bạn cần chốt (AI không nên tự quyết)

| Quyết định                                                       | Khi nào cần             | Ghi chú                                          |
| ---------------------------------------------------------------- | ----------------------- | ------------------------------------------------ |
| Tên sản phẩm (thay `qlcv`)                                       | Trước P0.1              | Đổi sau tốn công                                 |
| Thư viện Gantt                                                   | P1.14a                  | Ảnh hưởng chi phí giấy phép và công tích hợp     |
| Prisma hay công cụ truy cập CSDL khác                            | Trước P1.1              | Mặc định Prisma + SQL thô cho truy vấn cây       |
| Nơi triển khai (cloud hay máy chủ riêng)                         | Trước P4.7              | Ảnh hưởng sao lưu, kho tệp, giám sát             |
| Nhà cung cấp AI và chính sách dữ liệu mật                        | Trước P3.4              | Có cho gửi tài liệu ra ngoài không               |
| Nhà cung cấp SSO                                                 | Trước P4.5              | Microsoft, Google hoặc khác                      |
| Tài khoản và mẫu tin Zalo/ZNS, SMS                               | Trước P4.6              | Thường cần đăng ký doanh nghiệp và duyệt mẫu tin |
| Tham số: hạn mức tệp, bậc leo thang, SLA duyệt, ngưỡng hiệu năng | P1.5, P2.3, P2.4, P1.18 | Các giá trị trong prompt chỉ là minh họa         |
| Người sở hữu nội dung 8 mẫu khởi đầu                             | P3.3                    | Pháp chế, Kỹ thuật, Kế hoạch rà soát             |

## Phụ lục C. Gợi ý khi làm việc với công cụ AI viết mã

- Nếu công cụ có giới hạn độ dài, chia prompt thành "Bước 1 làm rõ và lập kế hoạch" rồi "Bước 2 hiện thực sau khi tôi duyệt". Với prompt dài như P1.4, P1.11, P1.12, hãy làm theo cách này.
- Giữ một file `docs/PROGRESS.md` trong repo: mỗi prompt xong thì ghi mã prompt, ngày, giả định, việc để sau. Dán file này vào đầu phiên mới để AI nắm tình hình thay vì kể lại.
- Khi AI báo "đã xong", đừng chỉ tin báo cáo: chạy lại lệnh ở mục "Bạn kiểm tra".
- Với phần phân quyền, tải tệp, khách ngoài, SSO, hãy dùng R2 trong một phiên mới để có cái nhìn độc lập.
- Nếu thay đổi yêu cầu giữa chừng, dùng R3 thay vì sửa lẫn vào prompt đang chạy.
