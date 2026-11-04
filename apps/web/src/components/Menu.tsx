import {
  ContextMenu as RadixContextMenu,
  DropdownMenu as RadixDropdownMenu,
} from "radix-ui";
import { Fragment, type ReactElement, type ReactNode } from "react";
import { cx } from "../lib/cx";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  /** Lệnh nguy hiểm: đặt ở cuối menu, ngăn bằng đường kẻ. */
  danger?: boolean;
  separatorBefore?: boolean;
}

const contentClass =
  "z-50 min-w-192 rounded-md border border-border-strong bg-surface-raised p-4 shadow-3";
const separatorClass = "my-4 h-1 bg-border-default";
const itemClass = (danger?: boolean) =>
  cx(
    "flex min-h-32 coarse:min-h-touch cursor-pointer select-none items-center gap-8 rounded-sm px-12 py-6 text-md",
    "data-highlighted:bg-surface-muted data-disabled:cursor-not-allowed data-disabled:opacity-60",
    danger ? "text-status-danger" : "text-text-primary",
  );

export interface MenuProps {
  trigger: ReactElement;
  items: MenuItem[];
  align?: "start" | "center" | "end";
}

export function Menu({ trigger, items, align = "end" }: MenuProps) {
  return (
    <RadixDropdownMenu.Root>
      <RadixDropdownMenu.Trigger asChild>{trigger}</RadixDropdownMenu.Trigger>
      <RadixDropdownMenu.Portal>
        <RadixDropdownMenu.Content
          align={align}
          sideOffset={4}
          className={contentClass}
        >
          {items.map((item) => (
            <Fragment key={item.label}>
              {item.separatorBefore ? (
                <RadixDropdownMenu.Separator className={separatorClass} />
              ) : null}
              <RadixDropdownMenu.Item
                disabled={item.disabled}
                onSelect={item.onSelect}
                className={itemClass(item.danger)}
              >
                {item.icon}
                {item.label}
              </RadixDropdownMenu.Item>
            </Fragment>
          ))}
        </RadixDropdownMenu.Content>
      </RadixDropdownMenu.Portal>
    </RadixDropdownMenu.Root>
  );
}

export interface ContextMenuAreaProps {
  items: MenuItem[];
  children: ReactNode;
  className?: string;
}

/** Vùng nhấn chuột phải (nhấn giữ trên cảm ứng). Mọi lệnh PHẢI có thêm đường vào bằng nút. */
export function ContextMenuArea({
  items,
  children,
  className,
}: ContextMenuAreaProps) {
  return (
    <RadixContextMenu.Root>
      <RadixContextMenu.Trigger asChild>
        <div className={className}>{children}</div>
      </RadixContextMenu.Trigger>
      <RadixContextMenu.Portal>
        <RadixContextMenu.Content className={contentClass}>
          {items.map((item) => (
            <Fragment key={item.label}>
              {item.separatorBefore ? (
                <RadixContextMenu.Separator className={separatorClass} />
              ) : null}
              <RadixContextMenu.Item
                disabled={item.disabled}
                onSelect={item.onSelect}
                className={itemClass(item.danger)}
              >
                {item.icon}
                {item.label}
              </RadixContextMenu.Item>
            </Fragment>
          ))}
        </RadixContextMenu.Content>
      </RadixContextMenu.Portal>
    </RadixContextMenu.Root>
  );
}
