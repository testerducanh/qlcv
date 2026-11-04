import { Checkbox as RadixCheckbox } from "radix-ui";
import type { ComponentPropsWithoutRef } from "react";
import { cx } from "../lib/cx";
import { CheckIcon, MinusIcon } from "./icons";

export interface CheckboxProps extends Omit<
  ComponentPropsWithoutRef<typeof RadixCheckbox.Root>,
  "children"
> {
  label: string;
  /** Ẩn nhãn nhưng vẫn giữ cho trình đọc màn hình (dùng trong bảng). */
  hideLabel?: boolean;
}

const boxClass =
  "inline-flex size-20 shrink-0 items-center justify-center rounded-sm border border-border-strong " +
  "bg-surface-raised text-text-inverse transition-fast enabled:hover:bg-surface-muted " +
  "st-checked:border-brand-primary st-checked:bg-brand-primary " +
  "st-checked:enabled:hover:bg-brand-primary-hover " +
  "st-indeterminate:border-brand-primary st-indeterminate:bg-brand-primary " +
  "st-indeterminate:enabled:hover:bg-brand-primary-hover " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export function Checkbox({
  label,
  hideLabel,
  className,
  ...rest
}: CheckboxProps) {
  return (
    <label
      className={cx(
        "flex min-h-32 coarse:min-h-touch items-center gap-8 text-md",
        hideLabel && "min-w-32 coarse:min-w-touch justify-center",
        rest.disabled
          ? "cursor-not-allowed text-text-secondary"
          : "cursor-pointer",
        className,
      )}
    >
      <RadixCheckbox.Root {...rest} className={boxClass}>
        <RadixCheckbox.Indicator>
          {rest.checked === "indeterminate" ? <MinusIcon /> : <CheckIcon />}
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      <span className={hideLabel ? "sr-only" : undefined}>{label}</span>
    </label>
  );
}
