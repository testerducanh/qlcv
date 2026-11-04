import { useState } from 'react';
import { Avatar } from '../components/Avatar';
import { TaskStatusBadge, type TaskStatus } from '../components/Badge';
import { Combobox } from '../components/Combobox';
import { CommentThread, type CommentData } from '../components/CommentThread';
import { DataTable } from '../components/DataTable';
import { DatePicker } from '../components/DatePicker';
import { FileUploader, type UploadFn } from '../components/FileUploader';
import { Pagination } from '../components/Pagination';
import { ProgressBar } from '../components/ProgressBar';
import { TreeTable, type TreeNode } from '../components/TreeTable';
import { formatDisplayDate, parseIso, weekdayMonFirst } from '../lib/date';
import { Row, Section } from './layout';

const people = [
  { value: '1', label: 'Nguyễn Văn Nam', description: 'Kỹ thuật' },
  { value: '2', label: 'Trần Thị Hà', description: 'Pháp chế' },
  { value: '3', label: 'Lê Tuấn', description: 'Kế hoạch' },
  { value: '4', label: 'Phạm Minh Đức', description: 'Chỉ huy trưởng' },
  { value: '5', label: 'Hoàng Lan', description: 'Kế toán', disabled: true },
];

const labels = ['Pháp lý', 'Khẩn', 'Cần ảnh', 'Chờ khách ngoài', 'Hiện trường'].map((name) => ({
  value: name,
  label: name,
}));

const isSunday = (iso: string) => {
  const p = parseIso(iso);
  return p ? weekdayMonFirst(p.y, p.m, p.d) === 6 : false;
};

interface TaskRow {
  id: string;
  title: string;
  assignee: string;
  status: TaskStatus;
  progress: number;
  due: string;
}

const statuses: TaskStatus[] = ['todo', 'doing', 'review', 'done', 'blocked'];
const allTasks: TaskRow[] = Array.from({ length: 45 }, (_, index) => ({
  id: String(index + 1),
  title: `Việc số ${index + 1}: nghiệm thu hạng mục`,
  assignee: people[index % 4].label,
  status: statuses[index % statuses.length],
  progress: (index * 7) % 101,
  due: `2026-11-${String((index % 28) + 1).padStart(2, '0')}`,
}));

const tree: Array<TreeNode<{ name: string; owner: string; progress: number }>> = [
  {
    id: 'a',
    data: { name: 'Giải phóng mặt bằng', owner: 'Trần Thị Hà', progress: 60 },
    children: [
      {
        id: 'a1',
        data: { name: 'Kiểm đếm', owner: 'Lê Tuấn', progress: 100 },
        children: [
          { id: 'a1a', data: { name: 'Khu B1', owner: 'Lê Tuấn', progress: 100 } },
          { id: 'a1b', data: { name: 'Khu B2', owner: 'Lê Tuấn', progress: 100 } },
        ],
      },
      { id: 'a2', data: { name: 'Lập phương án', owner: 'Trần Thị Hà', progress: 40 } },
    ],
  },
  {
    id: 'b',
    data: { name: 'San lấp mặt bằng', owner: 'Phạm Minh Đức', progress: 20 },
    children: [{ id: 'b1', data: { name: 'Đắp lớp 2 khu B3', owner: 'Phạm Minh Đức', progress: 20 } }],
  },
  { id: 'c', data: { name: 'Hạ tầng cầu đường', owner: 'Nguyễn Văn Nam', progress: 0 } },
];

const fakeUpload: UploadFn = (file, { signal, onProgress }) =>
  new Promise((resolve, reject) => {
    let percent = 0;
    const timer = window.setInterval(() => {
      percent += 20;
      onProgress(percent);
      if (file.name.includes('loi') && percent >= 60) {
        window.clearInterval(timer);
        reject(new Error('Máy chủ từ chối tệp (giả lập).'));
      } else if (percent >= 100) {
        window.clearInterval(timer);
        resolve();
      }
    }, 400);
    signal.addEventListener('abort', () => {
      window.clearInterval(timer);
      reject(new Error('aborted'));
    });
  });

const startComments: CommentData[] = [
  {
    id: 'c1',
    author: { name: 'Trần Thị Hà' },
    createdAt: new Date(Date.now() - 25 * 60000).toISOString(),
    body: 'Hồ sơ bổ sung đã đủ chưa?\nCần xác nhận trước thứ Sáu.',
    isQuestion: true,
    replies: [
      {
        id: 'c1r1',
        author: { name: 'Lê Tuấn' },
        createdAt: new Date(Date.now() - 5 * 60000).toISOString(),
        body: 'Đã đủ, tôi vừa đính kèm bản scan.',
        edited: true,
      },
    ],
  },
  {
    id: 'c2',
    author: { name: 'Nguyễn Văn Nam' },
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    body: 'Nhận xét có tên người rất dài và một đoạn văn bản dài để thử xuống dòng trong khung hẹp trên điện thoại.',
  },
];

export function ComponentsPart3() {
  const [assignee, setAssignee] = useState<string[]>(['2']);
  const [due, setDue] = useState<string | null>('2026-11-05');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [treeSelected, setTreeSelected] = useState<string[]>([]);
  const [opened, setOpened] = useState('(chưa mở)');
  const [comments, setComments] = useState<CommentData[]>(startComments);

  const pageCount = Math.ceil(allTasks.length / pageSize);
  const pageRows = allTasks.slice((page - 1) * pageSize, page * pageSize);

  const submitComment = async ({ body, parentId }: { body: string; parentId?: string }) => {
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    const created: CommentData = {
      id: `n${Date.now()}`,
      author: { name: 'Bạn' },
      createdAt: new Date().toISOString(),
      body,
    };
    setComments((prev) =>
      parentId
        ? prev.map((c) => (c.id === parentId ? { ...c, replies: [...(c.replies ?? []), created] } : c))
        : [...prev, created],
    );
  };

  return (
    <>
      <Section title="Combobox" note="Gõ không dấu vẫn ra kết quả có dấu (thử gõ: duc, ha). Mũi tên chọn, Enter xác nhận, Esc đóng.">
        <Combobox
          label="Người nhận chính"
          options={people}
          value={assignee}
          onValueChange={setAssignee}
          placeholder="Chọn người"
          clearable
          hint="Có thể để trống (chưa giao)."
        />
        <Combobox label="Nhãn" multiple options={labels} placeholder="Chọn nhãn" hint="Backspace xóa nhãn cuối." />
        <Combobox label="Người theo dõi" options={people} error="Hãy chọn ít nhất một người." />
        <Combobox label="Người nhận" options={people} disabled defaultValue={['1']} />
        <Combobox label="Đang tải danh sách" options={people} loading />
      </Section>

      <Section title="DatePicker" note="Gõ dd/MM/yyyy rồi Enter, hoặc bấm biểu tượng lịch. Trong lịch: mũi tên, Home, End, PageUp, PageDown. Chủ nhật được đánh dấu là ngày nghỉ.">
        <DatePicker label="Hạn hoàn thành" value={due} onValueChange={setDue} isNonWorking={isSunday} />
        <p className="text-sm text-text-secondary">Giá trị lưu: {due ?? '(trống)'} · Hiển thị: {formatDisplayDate(due) || '(trống)'}</p>
        <DatePicker label="Ngày bắt đầu" required hint="Theo lịch làm việc của dự án." />
        <DatePicker label="Ngày bàn giao" error="Ngày bàn giao phải sau ngày bắt đầu." defaultValue="2026-10-01" />
        <DatePicker label="Ngày nghiệm thu" disabled defaultValue="2026-12-01" />
      </Section>

      <Section title="Table, Pagination" note="Chọn dòng bằng ô tick; giữ Shift và bấm để chọn cả dải. Thu hẹp xuống 375 px để thấy dạng thẻ.">
        <p className="text-sm text-text-secondary">Đã chọn: {selectedIds.length} việc</p>
        <DataTable
          caption="Danh sách việc"
          rows={pageRows}
          getRowId={(row) => row.id}
          getRowLabel={(row) => row.title}
          selectable
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          columns={[
            { id: 'title', header: 'Tên việc', cell: (row) => <span className="line-clamp-2">{row.title}</span> },
            {
              id: 'assignee',
              header: 'Người nhận',
              cell: (row) => (
                <span className="inline-flex items-center gap-8">
                  <Avatar name={row.assignee} size="sm" />
                  {row.assignee}
                </span>
              ),
            },
            { id: 'status', header: 'Trạng thái', cell: (row) => <TaskStatusBadge status={row.status} /> },
            {
              id: 'progress',
              header: 'Tiến độ',
              className: 'w-160',
              cell: (row) => <ProgressBar label={`Tiến độ ${row.title}`} value={row.progress} />,
            },
            { id: 'due', header: 'Hạn', cell: (row) => formatDisplayDate(row.due) },
          ]}
        />
        <Pagination
          page={page}
          pageCount={pageCount}
          onPageChange={setPage}
          totalItems={allTasks.length}
          pageSize={pageSize}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
        <DataTable caption="Bảng đang tải" rows={[]} columns={[]} getRowId={() => ''} getRowLabel={() => ''} loading />
        <DataTable caption="Bảng rỗng" rows={[]} columns={[]} getRowId={() => ''} getRowLabel={() => ''} />
      </Section>

      <Section
        title="TreeTable"
        note="Nhấn Tab vào một dòng. Mũi tên lên xuống đổi dòng, phải mở nhánh, trái thu gọn hoặc về dòng cha, Home và End, Enter mở chi tiết, Space chọn dòng."
      >
        <p className="text-sm text-text-secondary">
          Đã mở: {opened} · Đã chọn: {treeSelected.length}
        </p>
        <TreeTable
          caption="Cây việc"
          nodes={tree}
          defaultExpandedIds={['a']}
          selectable
          selectedIds={treeSelected}
          onSelectedIdsChange={setTreeSelected}
          getRowLabel={(data) => data.name}
          onOpen={(node) => setOpened(node.data.name)}
          columns={[
            { id: 'name', header: 'Tên việc', cell: (data) => data.name },
            { id: 'owner', header: 'Người nhận', cell: (data) => data.owner },
            {
              id: 'progress',
              header: 'Tiến độ',
              className: 'w-160',
              cell: (data) => <ProgressBar label={`Tiến độ ${data.name}`} value={data.progress} />,
            },
          ]}
        />
      </Section>

      <Section
        title="FileUploader"
        note="Chọn nhiều tệp, kéo thả, hoặc bấm vào vùng rồi dán ảnh. Tên tệp có chữ “loi” sẽ thất bại để thử nút Thử lại. Tối đa 3 tệp, mỗi tệp 5 MB, chỉ ảnh và PDF."
      >
        <FileUploader upload={fakeUpload} accept="image/*,.pdf" maxSizeBytes={5 * 1024 * 1024} maxFiles={3} allowCamera />
      </Section>

      <Section
        title="CommentThread"
        note="Ctrl+Enter để gửi. Gõ @ hoặc bấm “Nhắc tên” để chọn người. Bấm “Trả lời” để trả lời một nhận xét."
      >
        <Row label="Thử với danh sách rỗng và đang tải ở dưới cùng">
          <span className="text-sm text-text-secondary">{comments.length} nhận xét</span>
        </Row>
        <CommentThread
          comments={comments}
          onSubmit={submitComment}
          people={people.filter((p) => !p.disabled).map((p) => ({ id: p.value, name: p.label }))}
        />
        <CommentThread comments={[]} onSubmit={async () => undefined} />
        <CommentThread comments={[]} onSubmit={async () => undefined} loading />
      </Section>
    </>
  );
}