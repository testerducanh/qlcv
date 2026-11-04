import { viMessages } from "../i18n/vi";
import { cx } from "../lib/cx";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cx("animate-skeleton rounded-md bg-surface-muted", className)}
    />
  );
}

export interface SkeletonTextProps {
  lines?: number;
  label?: string;
}

export function SkeletonText({
  lines = 3,
  label = viMessages.common.loading,
}: SkeletonTextProps) {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-8">
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={cx("h-12", index === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}
