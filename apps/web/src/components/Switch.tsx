import { Switch as RadixSwitch } from "radix-ui";
import type { ComponentPropsWithoutRef } from "react";
import { cx } from "../lib/cx";

export interface SwitchProps extends Omit<
  ComponentPropsWithoutRef<typeof RadixSwitch.Root>,
  "children"
> {
  label: string;
}

export function Switch({ label, className, ...rest }: SwitchProps) {
  return (
    <label
      className={cx(
        "flex min-h-32 coarse:min-h-touch items-center gap-12 text-md",
        rest.disabled
          ? "cursor-not-allowed text-text-secondary"
          : "cursor-pointer",
        className,
      )}
    >
      <RadixSwitch.Root
        {...rest}
        className="inline-flex h-24 w-40 shrink-0 items-center rounded-full border border-border-strong bg-surface-muted transition-fast st-checked:border-brand-primary st-checked:bg-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RadixSwitch.Thumb className="block size-16 translate-x-4 rounded-full border border-border-strong bg-surface-raised transition-fast st-checked:translate-x-18" />
      </RadixSwitch.Root>
      <span>{label}</span>
    </label>
  );
}
