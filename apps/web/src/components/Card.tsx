import type { ReactNode } from "react";
import { cx } from "../lib/cx";

export interface CardProps {
  children: ReactNode;
  className?: string;
  /** Có onClick thì cả thẻ là một nút duy nhất (không lồng nút khác bên trong). */
  onClick?: () => void;
}

const cardClass =
  "rounded-lg border border-border-default bg-surface-raised p-16 text-left shadow-1";

export function Card({ children, className, onClick }: CardProps) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cx(
          cardClass,
          "block w-full transition-fast enabled:hover:bg-surface-base enabled:active:bg-surface-muted",
          className,
        )}
      >
        {children}
      </button>
    );
  }
  return <div className={cx(cardClass, className)}>{children}</div>;
}

export function CardTitle({
  as: Tag = "p",
  children,
}: {
  as?: "h2" | "h3" | "p";
  children: ReactNode;
}) {
  return <Tag className="line-clamp-2 text-lg font-bold">{children}</Tag>;
}
