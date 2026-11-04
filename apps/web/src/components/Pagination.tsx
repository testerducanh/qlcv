import { viMessages } from '../i18n/vi';
import { cx } from '../lib/cx';
import { Button } from './Button';
import { Select } from './Select';

/** Dãy số trang hiển thị: trang đầu, trang cuối, trang hiện tại và hai bên, chỗ hở là 'gap'. */
export function pageWindow(page: number, count: number): Array<number | 'gap'> {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const wanted = new Set<number>([1, count, page - 1, page, page + 1]);
  const sorted = [...wanted].filter((p) => p >= 1 && p <= count).sort((a, b) => a - b);
  const out: Array<number | 'gap'> = [];
  sorted.forEach((p, index) => {
    if (index > 0) {
      const gap = p - sorted[index - 1];
      if (gap === 2) out.push(p - 1);
      else if (gap > 2) out.push('gap');
    }
    out.push(p);
  });
  return out;
}

export interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
  className?: string;
}

export function Pagination({
  page,
  pageCount,
  onPageChange,
  totalItems,
  pageSize,
  pageSizeOptions = [10, 20, 50],
  onPageSizeChange,
  className,
}: PaginationProps) {
  const text = viMessages.pagination;
  return (
    <nav aria-label={text.label} className={cx('flex flex-wrap items-center justify-between gap-12', className)}>
      <p aria-live="polite" className="text-sm text-text-secondary">
        {text.page(page, pageCount)}
        {totalItems !== undefined ? ` · ${text.totalItems(totalItems)}` : ''}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Button disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          {text.previous}
        </Button>
        <ul className="hidden items-center gap-4 md:flex">
          {pageWindow(page, pageCount).map((item, index) =>
            item === 'gap' ? (
              <li key={`gap-${index}`} aria-hidden="true" className="px-4 text-text-secondary">
                …
              </li>
            ) : (
              <li key={item}>
                <Button
                  variant={item === page ? 'primary' : 'ghost'}
                  aria-current={item === page ? 'page' : undefined}
                  className="min-w-32 coarse:min-w-touch px-8"
                  onClick={() => onPageChange(item)}
                >
                  {item}
                </Button>
              </li>
            ),
          )}
        </ul>
        <Button disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          {text.next}
        </Button>
      </div>
      {pageSize !== undefined && onPageSizeChange ? (
        <Select
          label={text.pageSize}
          wrapperClassName="w-160"
          options={pageSizeOptions.map((n) => ({ value: String(n), label: String(n) }))}
          value={String(pageSize)}
          onValueChange={(v) => onPageSizeChange(Number(v))}
        />
      ) : null}
    </nav>
  );
}