import type { ReactNode } from "react";
import { viMessages } from "../i18n/vi";
import { cx } from "../lib/cx";
import {
  AlertIcon,
  CheckIcon,
  CircleIcon,
  ClockIcon,
  HalfCircleIcon,
} from "./icons";

export type BadgeTone = "neutral" | "info" | "warning" | "success" | "danger";

const toneClass: Record<BadgeTone, string> = {
  neutral: "border-border-strong bg-surface-muted text-text-primary",
  info: "border-status-info bg-surface-raised text-status-info",
  warning: "border-status-warning bg-surface-raised text-status-warning",
  success: "border-status-success bg-surface-raised text-status-success",
  danger: "border-status-danger bg-surface-raised text-status-danger",
};

export interface BadgeProps {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Badge({
  tone = "neutral",
  icon,
  children,
  className,
}: BadgeProps) {
  return (
    <span
      title={typeof children === "string" ? children : undefined}
      className={cx(
        "inline-flex max-w-full items-center gap-4 rounded-full border px-8 py-2 text-xs font-medium",
        toneClass[tone],
        className,
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

export type TaskStatus =
  "todo" | "doing" | "review" | "done" | "blocked" | "overdue";

const statusMap: Record<TaskStatus, { tone: BadgeTone; icon: ReactNode }> = {
  todo: { tone: "neutral", icon: <CircleIcon /> },
  doing: { tone: "info", icon: <HalfCircleIcon /> },
  review: { tone: "warning", icon: <ClockIcon /> },
  done: { tone: "success", icon: <CheckIcon /> },
  blocked: { tone: "danger", icon: <AlertIcon /> },
  overdue: { tone: "danger", icon: <AlertIcon /> },
};

export function TaskStatusBadge({
  status,
  daysLate,
}: {
  status: TaskStatus;
  daysLate?: number;
}) {
  const { tone, icon } = statusMap[status];
  const text =
    status === "overdue" && daysLate !== undefined
      ? viMessages.overdueBy(daysLate)
      : viMessages.status[status];
  return (
    <Badge tone={tone} icon={icon}>
      {text}
    </Badge>
  );
}
