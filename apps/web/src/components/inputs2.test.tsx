// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../test/axe';
import { Combobox } from './Combobox';
import { Calendar, DatePicker } from './DatePicker';

afterEach(cleanup);

const tasks = [
  { value: '1', label: 'Báo cáo tuần' },
  { value: '2', label: 'Nghiệm thu cốt thép' },
  { value: '3', label: 'Đổ bê tông móng' },
];

describe('Combobox', () => {
  it('gõ không dấu vẫn ra kết quả có dấu', async () => {
    const user = userEvent.setup();
    render(<Combobox label="Việc" options={tasks} />);
    await user.type(screen.getByRole('combobox', { name: 'Việc' }), 'bao cao');
    expect(await screen.findByRole('option', { name: /Báo cáo tuần/ })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Nghiệm thu/ })).toBeNull();
  });

  it('chữ đ khớp với d', async () => {
    const user = userEvent.setup();
    render(<Combobox label="Việc" options={tasks} />);
    await user.type(screen.getByRole('combobox', { name: 'Việc' }), 'do be');
    expect(await screen.findByRole('option', { name: /Đổ bê tông móng/ })).toBeTruthy();
  });

  it('mũi tên xuống rồi Enter chọn đúng mục', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Combobox label="Việc" options={tasks} onValueChange={onValueChange} />);
    screen.getByRole('combobox', { name: 'Việc' }).focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onValueChange).toHaveBeenLastCalledWith(['2']);
    expect((screen.getByRole('combobox', { name: 'Việc' }) as HTMLInputElement).value).toBe('Nghiệm thu cốt thép');
  });

  it('Esc đóng danh sách', async () => {
    const user = userEvent.setup();
    render(<Combobox label="Việc" options={tasks} />);
    await user.type(screen.getByRole('combobox', { name: 'Việc' }), 'b');
    expect(await screen.findByRole('listbox')).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  });

  it('không có kết quả thì báo rõ', async () => {
    const user = userEvent.setup();
    render(<Combobox label="Việc" options={tasks} />);
    await user.type(screen.getByRole('combobox', { name: 'Việc' }), 'zzz');
    expect(await screen.findByText('Không tìm thấy kết quả')).toBeTruthy();
  });

  it('chọn nhiều: hiện thẻ, Backspace xóa thẻ cuối', async () => {
    const user = userEvent.setup();
    render(<Combobox label="Nhãn" multiple options={tasks} />);
    await user.click(screen.getByRole('combobox', { name: 'Nhãn' }));
    await user.click(await screen.findByRole('option', { name: /Báo cáo tuần/ }));
    await user.click(screen.getByRole('option', { name: /Nghiệm thu/ }));
    expect(screen.getByRole('button', { name: 'Bỏ Báo cáo tuần' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bỏ Nghiệm thu cốt thép' })).toBeTruthy();
    await user.keyboard('{Backspace}');
    expect(screen.queryByRole('button', { name: 'Bỏ Nghiệm thu cốt thép' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Bỏ Báo cáo tuần' })).toBeTruthy();
  });

  it('không lỗi trợ năng', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div>
        <Combobox label="Một" options={tasks} defaultValue={['1']} clearable />
        <Combobox label="Nhiều" multiple options={tasks} defaultValue={['1', '2']} error="Chọn ít nhất một nhãn." />
        <Combobox label="Vô hiệu" options={tasks} disabled />
        <Combobox label="Đang tải" options={tasks} loading />
      </div>,
    );
    await expectNoA11yViolations(container);
    await user.type(screen.getByRole('combobox', { name: 'Một' }), 'b');
    await screen.findByRole('listbox');
    await expectNoA11yViolations(container);
  });
});

describe('DatePicker', () => {
  it('gõ ngày hợp lệ rồi rời ô thì lưu dạng yyyy-MM-dd', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<DatePicker label="Hạn" onValueChange={onValueChange} />);
    await user.type(screen.getByLabelText('Hạn'), '15/11/2026');
    await user.tab();
    expect(onValueChange).toHaveBeenLastCalledWith('2026-11-15');
  });

  it('ngày không có thật thì báo lỗi và đặt aria-invalid', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<DatePicker label="Hạn" onValueChange={onValueChange} />);
    await user.type(screen.getByLabelText('Hạn'), '31/02/2026');
    await user.tab();
    expect(await screen.findByText(/Ngày không hợp lệ/)).toBeTruthy();
    expect(screen.getByLabelText('Hạn').getAttribute('aria-invalid')).toBe('true');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('mở lịch bằng nút, mũi tên đổi ngày, Enter chọn và đóng', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<DatePicker label="Hạn" defaultValue="2026-10-31" onValueChange={onValueChange} />);
    await user.click(screen.getByRole('button', { name: 'Chọn ngày' }));
    await screen.findByRole('grid');
    await waitFor(() => expect(document.activeElement?.getAttribute('data-iso')).toBe('2026-10-31'));
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(document.activeElement?.getAttribute('data-iso')).toBe('2026-11-01'));
    await user.keyboard('{Enter}');
    expect(onValueChange).toHaveBeenLastCalledWith('2026-11-01');
    await waitFor(() => expect(screen.queryByRole('grid')).toBeNull());
  });

  it('Esc đóng lịch mà không đổi giá trị', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<DatePicker label="Hạn" defaultValue="2026-10-31" onValueChange={onValueChange} />);
    await user.click(screen.getByRole('button', { name: 'Chọn ngày' }));
    await screen.findByRole('grid');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('grid')).toBeNull());
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('không lỗi trợ năng (ô nhập và lịch)', async () => {
    const { container } = render(
      <div>
        <DatePicker label="Mặc định" />
        <DatePicker label="Có lỗi" error="Ngày không hợp lệ." />
        <DatePicker label="Vô hiệu" disabled defaultValue="2026-10-31" />
        <Calendar value="2026-10-31" today="2026-10-31" onSelect={() => undefined} isNonWorking={(iso) => iso === '2026-11-01'} />
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});