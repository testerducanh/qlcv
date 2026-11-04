// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../test/axe';
import { CommentThread, type CommentData } from './CommentThread';
import { FileUploader, type UploadFn } from './FileUploader';

afterEach(cleanup);

const png = (name = 'a.png') => new File(['x'], name, { type: 'image/png' });
const input = () => screen.getByTestId('file-input') as HTMLInputElement;
const setup = () => userEvent.setup({ applyAccept: false });

describe('FileUploader', () => {
  it('tải tệp hợp lệ và báo đã tải lên', async () => {
    const upload: UploadFn = vi.fn(async (_file, { onProgress }) => onProgress(50));
    render(<FileUploader upload={upload} accept="image/*" />);
    await setup().upload(input(), png());
    expect(await screen.findByText('Đã tải lên')).toBeTruthy();
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('tệp quá lớn bị loại, không gọi tải lên', async () => {
    const upload = vi.fn(async () => undefined);
    render(<FileUploader upload={upload} maxSizeBytes={1024} />);
    const big = png('lon.png');
    Object.defineProperty(big, 'size', { value: 5000 });
    await setup().upload(input(), big);
    const row = (await screen.findByText('lon.png')).closest('li') as HTMLElement;
    expect(within(row).getByText(/Tệp quá lớn/)).toBeTruthy();
    expect(upload).not.toHaveBeenCalled();
  });

  it('sai loại tệp bị loại', async () => {
    const upload = vi.fn(async () => undefined);
    render(<FileUploader upload={upload} accept="image/*" />);
    await setup().upload(input(), new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText('Loại tệp không được phép.')).toBeTruthy();
    expect(upload).not.toHaveBeenCalled();
  });

  it('vượt số tệp tối đa', async () => {
    const upload = vi.fn(async () => undefined);
    render(<FileUploader upload={upload} maxFiles={1} />);
    await setup().upload(input(), [png('a.png'), png('b.png')]);
    expect(await screen.findByText('Chỉ được tải tối đa 1 tệp.')).toBeTruthy();
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('thất bại thì hiện lý do, Thử lại tải lại được', async () => {
    const upload = vi.fn<UploadFn>().mockRejectedValueOnce(new Error('Mất kết nối')).mockResolvedValue(undefined);
    const user = setup();
    render(<FileUploader upload={upload} />);
    await user.upload(input(), png());
    expect(await screen.findByText('Mất kết nối')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Thử lại: a.png' }));
    expect(await screen.findByText('Đã tải lên')).toBeTruthy();
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it('hủy tải thì tệp biến khỏi danh sách', async () => {
    const upload: UploadFn = (_file, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const user = setup();
    render(<FileUploader upload={upload} />);
    await user.upload(input(), png());
    await user.click(await screen.findByRole('button', { name: 'Hủy tải: a.png' }));
    await waitFor(() => expect(screen.queryByText('a.png')).toBeNull());
  });

  it('không lỗi trợ năng', async () => {
    const upload: UploadFn = vi.fn(async () => undefined);
    const { container } = render(<FileUploader upload={upload} allowCamera />);
    await setup().upload(input(), png());
    await screen.findByText('Đã tải lên');
    await expectNoA11yViolations(container);
  });
});

const now = new Date('2026-10-31T10:00:00Z');
const comments: CommentData[] = [
  {
    id: 'c1',
    author: { name: 'Trần Thị Hà' },
    createdAt: '2026-10-31T09:55:00Z',
    body: 'Hồ sơ đã đủ chưa?',
    isQuestion: true,
    edited: true,
    replies: [{ id: 'r1', author: { name: 'Lê Tuấn' }, createdAt: '2026-10-31T07:00:00Z', body: 'Đã đủ.' }],
  },
];
const people = [
  { id: '1', name: 'Lê Tuấn' },
  { id: '2', name: 'Trần Thị Hà' },
];

describe('CommentThread', () => {
  it('hiện tác giả, thời gian tương đối, dấu đã sửa, nhãn câu hỏi và trả lời', () => {
    render(<CommentThread comments={comments} onSubmit={async () => undefined} now={now} />);
    expect(screen.getByRole('article', { name: 'Nhận xét của Trần Thị Hà' })).toBeTruthy();
    expect(screen.getByText('5 phút trước')).toBeTruthy();
    expect(screen.getByText('(đã sửa)')).toBeTruthy();
    expect(screen.getByText('Câu hỏi')).toBeTruthy();
    expect(screen.getByText('Đã đủ.')).toBeTruthy();
  });

  it('danh sách rỗng có câu mời viết nhận xét', () => {
    render(<CommentThread comments={[]} onSubmit={async () => undefined} />);
    expect(screen.getByText('Chưa có nhận xét')).toBeTruthy();
    expect(screen.getByText('Hãy là người đầu tiên.')).toBeTruthy();
  });

  it('Ctrl+Enter gửi nhận xét và xóa ô nhập', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CommentThread comments={[]} onSubmit={onSubmit} />);
    const box = screen.getByLabelText('Viết nhận xét') as HTMLTextAreaElement;
    await user.type(box, '  Xin chào  ');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onSubmit).toHaveBeenCalledWith({ body: 'Xin chào' });
    await waitFor(() => expect(box.value).toBe(''));
  });

  it('nút Gửi bị vô hiệu khi ô nhập trống', () => {
    render(<CommentThread comments={[]} onSubmit={async () => undefined} />);
    expect((screen.getByRole('button', { name: 'Gửi nhận xét' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('gửi thất bại thì giữ nội dung và báo lỗi', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error('x'));
    render(<CommentThread comments={[]} onSubmit={onSubmit} />);
    const box = screen.getByLabelText('Viết nhận xét') as HTMLTextAreaElement;
    await user.type(box, 'Nội dung');
    await user.click(screen.getByRole('button', { name: 'Gửi nhận xét' }));
    expect(await screen.findByText('Không gửi được nhận xét. Hãy thử lại.')).toBeTruthy();
    expect(box.value).toBe('Nội dung');
  });

  it('trả lời một nhận xét gửi kèm parentId', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CommentThread comments={comments} onSubmit={onSubmit} now={now} />);
    await user.click(screen.getByRole('button', { name: 'Trả lời Trần Thị Hà' }));
    const box = await screen.findByRole('textbox', { name: 'Trả lời Trần Thị Hà' });
    await user.type(box, 'Đã nhận');
    await user.click(screen.getByRole('button', { name: 'Gửi trả lời' }));
    expect(onSubmit).toHaveBeenCalledWith({ body: 'Đã nhận', parentId: 'c1' });
  });

  it('nút Nhắc tên chèn @Tên vào ô nhập', async () => {
    const user = userEvent.setup();
    render(<CommentThread comments={[]} onSubmit={async () => undefined} people={people} />);
    const box = screen.getByLabelText('Viết nhận xét') as HTMLTextAreaElement;
    await user.type(box, 'Nhờ ');
    await user.click(screen.getByRole('button', { name: /Nhắc tên/ }));
    await screen.findByRole('combobox', { name: 'Chọn người để nhắc tên' });
    await user.click(await screen.findByRole('option', { name: /Lê Tuấn/ }));
    await waitFor(() => expect(box.value).toBe('Nhờ @Lê Tuấn '));
  });

  it('không lỗi trợ năng', async () => {
    const { container } = render(<CommentThread comments={comments} onSubmit={async () => undefined} now={now} people={people} />);
    await expectNoA11yViolations(container);
  });
});