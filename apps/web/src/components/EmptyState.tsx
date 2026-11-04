import type { ReactNode } from "react";
import { InboxIcon } from "./icons";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-12 px-16 py-48 text-center">
      <span className="text-text-secondary">
        {icon ?? <InboxIcon size="lg" />}
      </span>
      <p className="text-lg font-medium">{title}</p>
      {description ? (
        <p className="max-w-dialog text-sm text-text-secondary">
          {description}
        </p>
      ) : null}
      {action}
    </div>
  );
}
