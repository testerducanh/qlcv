export const controlBase =
  "w-full min-h-32 coarse:min-h-touch rounded-md border bg-surface-raised px-12 py-6 " +
  "text-md coarse:text-lg text-text-primary placeholder:text-text-secondary transition-fast " +
  "enabled:hover:bg-surface-base disabled:cursor-not-allowed disabled:bg-surface-muted " +
  "disabled:text-text-secondary disabled:opacity-60";

export const controlBorder = (invalid: boolean) =>
  invalid ? "border-status-danger" : "border-border-strong";
