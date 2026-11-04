import { Progress } from "radix-ui";
import { cx } from "../lib/cx";

export interface ProgressBarProps {
  value: number;
  /** Tên truy cập, ví dụ "Tiến độ dự án". */
  label: string;
  className?: string;
}

export function ProgressBar({ value, label, className }: ProgressBarProps) {
  const percent = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div className={cx("flex items-center gap-8", className)}>
      <Progress.Root
        value={percent}
        aria-label={label}
        className="relative h-8 flex-1 overflow-hidden rounded-full border border-border-strong bg-surface-muted"
      >
        <Progress.Indicator
          className="h-full w-full bg-brand-primary"
          style={{ transform: `translateX(-${100 - percent}%)` }}
        />
      </Progress.Root>
      <span className="w-40 text-right text-sm tabular-nums">{percent}%</span>
    </div>
  );
}
