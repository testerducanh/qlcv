import { useRef, type MouseEvent, type ReactNode } from "react";
import { viMessages } from "../i18n/vi";
import { cx } from "../lib/cx";
import { useMediaQuery, wideQuery } from "../lib/useMediaQuery";
import { Card } from "./Card";
import { Checkbox } from "./Checkbox";
import { EmptyState } from "./EmptyState";
import { Skeleton } from "./Skeleton";

export interface DataTableColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  /** Tên bảng cho trình đọc màn hình. */
  caption: string;
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  /** Tên ngắn của dòng, dùng làm nhãn cho ô chọn. */
  getRowLabel: (row: T) => string;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectedIdsChange?: (ids: string[]) => void;
  loading?: boolean;
  emptyState?: ReactNode;
  className?: string;
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  getRowId,
  getRowLabel,
  selectable = false,
  selectedIds = [],
  onSelectedIdsChange,
  loading = false,
  emptyState,
  className,
}: DataTableProps<T>) {
  const wide = useMediaQuery(wideQuery);
  const lastIndex = useRef<number | null>(null);
  const selectedSet = new Set(selectedIds);
  const text = viMessages.table;

  const toggleRow = (index: number, shift: boolean) => {
    const id = getRowId(rows[index]);
    const willSelect = !selectedSet.has(id);
    let next: string[];
    if (shift && lastIndex.current !== null) {
      const from = Math.min(lastIndex.current, index);
      const to = Math.max(lastIndex.current, index);
      const range = rows.slice(from, to + 1).map((row) => getRowId(row));
      next = willSelect
        ? Array.from(new Set([...selectedIds, ...range]))
        : selectedIds.filter((x) => !range.includes(x));
    } else {
      next = willSelect
        ? [...selectedIds, id]
        : selectedIds.filter((x) => x !== id);
    }
    lastIndex.current = index;
    onSelectedIdsChange?.(next);
  };

  const allSelected =
    rows.length > 0 && rows.every((row) => selectedSet.has(getRowId(row)));
  const someSelected = rows.some((row) => selectedSet.has(getRowId(row)));
  const toggleAll = () =>
    onSelectedIdsChange?.(allSelected ? [] : rows.map((row) => getRowId(row)));

  if (loading) {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-8">
        <span className="sr-only">{viMessages.common.loading}</span>
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-36 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <>
        {emptyState ?? (
          <EmptyState title={text.empty} description={text.emptyHint} />
        )}
      </>
    );
  }

  if (!wide) {
    return (
      <ul aria-label={caption} className={cx("flex flex-col gap-8", className)}>
        {rows.map((row, index) => {
          const id = getRowId(row);
          return (
            <li key={id}>
              <Card>
                {selectable ? (
                  <Checkbox
                    hideLabel
                    label={text.selectRow(getRowLabel(row))}
                    checked={selectedSet.has(id)}
                    onClick={(event: MouseEvent<HTMLButtonElement>) =>
                      toggleRow(index, event.shiftKey)
                    }
                  />
                ) : null}
                <dl className="flex flex-col gap-4">
                  {columns.map((column) => (
                    <div
                      key={column.id}
                      className="flex items-start justify-between gap-12"
                    >
                      <dt className="text-xs font-medium text-text-secondary">
                        {column.header}
                      </dt>
                      <dd className="min-w-0 wrap-break-word text-right text-sm">
                        {column.cell(row)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Card>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div
      className={cx(
        "overflow-auto rounded-lg border border-border-default bg-surface-raised p-4",
        className,
      )}
    >
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-10 bg-surface-muted">
          <tr>
            {selectable ? (
              <th scope="col" className="w-48 px-8 text-left">
                <Checkbox
                  hideLabel
                  label={text.selectAll}
                  checked={
                    allSelected ? true : someSelected ? "indeterminate" : false
                  }
                  onClick={toggleAll}
                />
              </th>
            ) : null}
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className={cx(
                  "px-12 py-8 text-left text-sm font-medium",
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const id = getRowId(row);
            const isSelected = selectedSet.has(id);
            return (
              <tr
                key={id}
                data-selected={isSelected || undefined}
                className="h-36 coarse:h-48 border-t border-border-default data-selected:bg-surface-muted"
              >
                {selectable ? (
                  <td className="w-48 px-8">
                    <Checkbox
                      hideLabel
                      label={text.selectRow(getRowLabel(row))}
                      checked={isSelected}
                      onClick={(event: MouseEvent<HTMLButtonElement>) =>
                        toggleRow(index, event.shiftKey)
                      }
                    />
                  </td>
                ) : null}
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={cx("px-12 py-4 align-middle", column.className)}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
