import { useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { viMessages } from '../i18n/vi';
import { cx } from '../lib/cx';
import { Checkbox } from './Checkbox';
import { EmptyState } from './EmptyState';
import { ChevronRightIcon } from './icons';

export interface TreeNode<T> {
  id: string;
  data: T;
  children?: TreeNode<T>[];
}

export interface TreeTableColumn<T> {
  id: string;
  header: string;
  cell: (data: T) => ReactNode;
  className?: string;
}

export interface TreeTableProps<T> {
  caption: string;
  columns: TreeTableColumn<T>[];
  nodes: TreeNode<T>[];
  getRowLabel: (data: T) => string;
  expandedIds?: string[];
  defaultExpandedIds?: string[];
  onExpandedIdsChange?: (ids: string[]) => void;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectedIdsChange?: (ids: string[]) => void;
  /** Nhấn Enter trên dòng: thường để mở chi tiết việc. */
  onOpen?: (node: TreeNode<T>) => void;
  className?: string;
}

interface FlatRow<T> {
  node: TreeNode<T>;
  level: number;
  parentId: string | null;
  posInSet: number;
  setSize: number;
  hasChildren: boolean;
  expanded: boolean;
}

function flatten<T>(
  nodes: TreeNode<T>[],
  expanded: Set<string>,
  level = 0,
  parentId: string | null = null,
  out: FlatRow<T>[] = [],
): FlatRow<T>[] {
  nodes.forEach((node, index) => {
    const hasChildren = Boolean(node.children && node.children.length > 0);
    const isExpanded = hasChildren && expanded.has(node.id);
    out.push({
      node,
      level,
      parentId,
      posInSet: index + 1,
      setSize: nodes.length,
      hasChildren,
      expanded: isExpanded,
    });
    if (isExpanded && node.children) flatten(node.children, expanded, level + 1, node.id, out);
  });
  return out;
}

export function TreeTable<T>({
  caption,
  columns,
  nodes,
  getRowLabel,
  expandedIds,
  defaultExpandedIds,
  onExpandedIdsChange,
  selectable = false,
  selectedIds = [],
  onSelectedIdsChange,
  onOpen,
  className,
}: TreeTableProps<T>) {
  const text = viMessages.table;
  const [innerExpanded, setInnerExpanded] = useState<string[]>(defaultExpandedIds ?? []);
  const expandedList = expandedIds ?? innerExpanded;
  const rows = flatten(nodes, new Set(expandedList));
  const selectedSet = new Set(selectedIds);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const tabId = rows.some((r) => r.node.id === focusedId) ? focusedId : (rows[0]?.node.id ?? null);

  const setExpanded = (id: string, open: boolean) => {
    const next = open ? [...expandedList, id] : expandedList.filter((x) => x !== id);
    if (expandedIds === undefined) setInnerExpanded(next);
    onExpandedIdsChange?.(next);
  };

  const toggleSelected = (id: string) => {
    onSelectedIdsChange?.(selectedSet.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  const focusRow = (id: string) => {
    setFocusedId(id);
    rowRefs.current.get(id)?.focus();
  };

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, index: number) => {
    // Chỉ xử lý khi chính dòng đang giữ focus, để không cản phím trong ô bấm bên trong.
    if (event.target !== event.currentTarget) return;
    const row = rows[index];
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (rows[index + 1]) focusRow(rows[index + 1].node.id);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (rows[index - 1]) focusRow(rows[index - 1].node.id);
        break;
      case 'Home':
        event.preventDefault();
        focusRow(rows[0].node.id);
        break;
      case 'End':
        event.preventDefault();
        focusRow(rows[rows.length - 1].node.id);
        break;
      case 'ArrowRight':
        event.preventDefault();
        if (row.hasChildren && !row.expanded) setExpanded(row.node.id, true);
        else if (row.hasChildren && row.node.children) focusRow(row.node.children[0].id);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (row.hasChildren && row.expanded) setExpanded(row.node.id, false);
        else if (row.parentId) focusRow(row.parentId);
        break;
      case 'Enter':
        event.preventDefault();
        onOpen?.(row.node);
        break;
      case ' ':
        if (selectable) {
          event.preventDefault();
          toggleSelected(row.node.id);
        }
        break;
      default:
        break;
    }
  };

  if (nodes.length === 0) {
    return <EmptyState title={text.empty} description={text.emptyHint} />;
  }

  return (
    <div className={cx('overflow-auto rounded-lg border border-border-default bg-surface-raised p-4', className)}>
      <table role="treegrid" aria-label={caption} className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-surface-muted">
          <tr>
            {selectable ? (
              <th scope="col" className="w-48 px-8">
                <span className="sr-only">{text.selectColumn}</span>
              </th>
            ) : null}
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className={cx('px-12 py-8 text-left text-sm font-medium', column.className)}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const id = row.node.id;
            const label = getRowLabel(row.node.data);
            const isSelected = selectedSet.has(id);
            return (
              <tr
                key={id}
                ref={(element) => {
                  if (element) rowRefs.current.set(id, element);
                  else rowRefs.current.delete(id);
                }}
                role="row"
                tabIndex={id === tabId ? 0 : -1}
                aria-level={row.level + 1}
                aria-posinset={row.posInSet}
                aria-setsize={row.setSize}
                aria-expanded={row.hasChildren ? row.expanded : undefined}
                aria-selected={selectable ? isSelected : undefined}
                onFocus={() => setFocusedId(id)}
                onKeyDown={(event) => handleRowKeyDown(event, index)}
                className="h-36 coarse:h-48 border-t border-border-default aria-selected:bg-surface-muted"
              >
                {selectable ? (
                  <td role="gridcell" className="w-48 px-8">
                    <Checkbox
                      hideLabel
                      tabIndex={-1}
                      label={text.selectRow(label)}
                      checked={isSelected}
                      onClick={(event: MouseEvent<HTMLButtonElement>) => {
                        event.stopPropagation();
                        toggleSelected(id);
                      }}
                    />
                  </td>
                ) : null}
                {columns.map((column, columnIndex) => (
                  <td key={column.id} role="gridcell" className={cx('px-12 py-4 align-middle', column.className)}>
                    {columnIndex === 0 ? (
                      <div
                        className="flex items-center gap-4"
                        style={{ paddingLeft: `calc(var(--spacing-24) * ${row.level})` }}
                      >
                        {row.hasChildren ? (
                          <button
                            type="button"
                            tabIndex={-1}
                            aria-label={`${row.expanded ? text.collapse : text.expand}: ${label}`}
                            onClick={() => setExpanded(id, !row.expanded)}
                            className="inline-flex size-24 coarse:size-touch shrink-0 items-center justify-center rounded-sm transition-fast hover:bg-surface-muted"
                          >
                            <ChevronRightIcon className={cx('transition-fast', row.expanded && 'rotate-90')} />
                          </button>
                        ) : (
                          <span aria-hidden="true" className="size-24 shrink-0" />
                        )}
                        <div className="min-w-0">{column.cell(row.node.data)}</div>
                      </div>
                    ) : (
                      column.cell(row.node.data)
                    )}
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