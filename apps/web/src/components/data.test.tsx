// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../test/axe';
import { DataTable } from './DataTable';
import { Pagination, pageWindow } from './Pagination';
import { TreeTable, type TreeNode } from './TreeTable';

afterEach(cleanup);

describe('pageWindow', () => {
  it('ít trang thì hiện hết', () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it('nhiều trang thì có chỗ hở', () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 'gap', 20]);
    expect(pageWindow(10, 20)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20]);
    expect(pageWindow(20, 20)).toEqual([1, 'gap', 19, 20]);
    expect(pageWindow(4, 20)).toEqual([1, 2, 3, 4, 5, 'gap', 20]);
  });
});

describe('Pagination', () => {
  it('trang đầu thì nút Trang trước bị vô hiệu, Trang sau chuyển trang', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={1} pageCount={5} onPageChange={onPageChange} />);
    expect((screen.getByRole('button', { name: 'Trang trước' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('trang hiện tại có aria-current và có chữ "Trang X / Y"', async () => {
    const { container } = render(<Pagination page={3} pageCount={5} onPageChange={() => undefined} totalItems={45} />);
    expect(screen.getByRole('button', { name: '3' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByText(/Trang 3 \/ 5/)).toBeTruthy();
    await expectNoA11yViolations(container);
  });
});

interface Row {
  id: string;
  name: string;
}
const rows: Row[] = ['A', 'B', 'C', 'D'].map((name) => ({ id: name, name: `Việc ${name}` }));
const columns = [{ id: 'name', header: 'Tên việc', cell: (row: Row) => row.name }];

function TableHarness() {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <>
      <p data-testid="selected">{selected.join(',')}</p>
      <DataTable
        caption="Danh sách việc"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        getRowLabel={(r) => r.name}
        selectable
        selectedIds={selected}
        onSelectedIdsChange={setSelected}
      />
    </>
  );
}

describe('DataTable', () => {
  it('hiện tiêu đề cột và các dòng', () => {
    render(<TableHarness />);
    expect(screen.getByRole('columnheader', { name: 'Tên việc' })).toBeTruthy();
    expect(screen.getByText('Việc C')).toBeTruthy();
  });

  it('chọn một dòng, chọn tất cả và bỏ chọn', async () => {
    const user = userEvent.setup();
    render(<TableHarness />);
    await user.click(screen.getByRole('checkbox', { name: 'Chọn Việc B' }));
    expect(screen.getByTestId('selected').textContent).toBe('B');
    await user.click(screen.getByRole('checkbox', { name: 'Chọn tất cả' }));
    expect(screen.getByTestId('selected').textContent).toBe('A,B,C,D');
    await user.click(screen.getByRole('checkbox', { name: 'Chọn tất cả' }));
    expect(screen.getByTestId('selected').textContent).toBe('');
  });

  it('giữ Shift để chọn cả dải', async () => {
    const user = userEvent.setup();
    render(<TableHarness />);
    await user.click(screen.getByRole('checkbox', { name: 'Chọn Việc A' }));
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('checkbox', { name: 'Chọn Việc C' }));
    await user.keyboard('{/Shift}');
    expect(screen.getByTestId('selected').textContent).toBe('A,B,C');
  });

  it('rỗng và đang tải có thông báo', () => {
    const { rerender } = render(
      <DataTable caption="Bảng" rows={[]} columns={columns} getRowId={() => ''} getRowLabel={() => ''} />,
    );
    expect(screen.getByText('Chưa có dữ liệu')).toBeTruthy();
    rerender(
      <DataTable caption="Bảng" rows={[]} columns={columns} getRowId={() => ''} getRowLabel={() => ''} loading />,
    );
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
  });

  it('không lỗi trợ năng', async () => {
    const { container } = render(<TableHarness />);
    await expectNoA11yViolations(container);
  });
});

interface Item {
  name: string;
}
const tree: Array<TreeNode<Item>> = [
  {
    id: 'r1',
    data: { name: 'Cha 1' },
    children: [
      { id: 'c1', data: { name: 'Con A' } },
      { id: 'c2', data: { name: 'Con B' } },
    ],
  },
  { id: 'r2', data: { name: 'Cha 2' } },
];
const treeColumns = [{ id: 'name', header: 'Tên việc', cell: (d: Item) => d.name }];

describe('TreeTable', () => {
  function setup(onOpen = vi.fn()) {
    const utils = render(
      <TreeTable caption="Cây việc" nodes={tree} columns={treeColumns} getRowLabel={(d) => d.name} onOpen={onOpen} />,
    );
    const bodyRows = () => Array.from(utils.container.querySelectorAll<HTMLTableRowElement>('tbody tr'));
    return { ...utils, bodyRows, onOpen };
  }

  it('ban đầu chỉ hiện các dòng gốc', () => {
    const { bodyRows } = setup();
    expect(bodyRows()).toHaveLength(2);
    expect(bodyRows()[0].getAttribute('aria-expanded')).toBe('false');
  });

  it('mũi tên phải mở nhánh, xuống xuống dòng con, trái về dòng cha, trái lần nữa thu gọn', async () => {
    const user = userEvent.setup();
    const { bodyRows } = setup();
    bodyRows()[0].focus();

    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(bodyRows()).toHaveLength(4));
    expect(bodyRows()[0].getAttribute('aria-expanded')).toBe('true');

    await user.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toContain('Con A');
    expect(document.activeElement?.getAttribute('aria-level')).toBe('2');

    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement?.textContent).toContain('Cha 1');

    await user.keyboard('{ArrowLeft}');
    await waitFor(() => expect(bodyRows()).toHaveLength(2));
  });

  it('Enter gọi onOpen với đúng dòng', async () => {
    const user = userEvent.setup();
    const { bodyRows, onOpen } = setup();
    bodyRows()[1].focus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].id).toBe('r2');
  });

  it('Home và End nhảy về đầu và cuối', async () => {
    const user = userEvent.setup();
    const { bodyRows } = setup();
    bodyRows()[0].focus();
    await user.keyboard('{End}');
    expect(document.activeElement?.textContent).toContain('Cha 2');
    await user.keyboard('{Home}');
    expect(document.activeElement?.textContent).toContain('Cha 1');
  });

  it('không lỗi trợ năng', async () => {
    const { container } = render(
      <TreeTable
        caption="Cây việc"
        nodes={tree}
        columns={treeColumns}
        getRowLabel={(d) => d.name}
        defaultExpandedIds={['r1']}
        selectable
      />,
    );
    await expectNoA11yViolations(container);
  });
});