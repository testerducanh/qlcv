import { RadioGroup as RadixRadioGroup } from "radix-ui";
import { useId, useState, type KeyboardEvent } from "react";
import { cx } from "../lib/cx";

export interface RadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface RadioGroupProps {
  label: string;
  options: RadioOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

/** Phím mũi tên, Home, End: đổi lựa chọn trong nhóm, theo WAI-ARIA. */
const NEXT_KEYS = ["ArrowDown", "ArrowRight"];
const PREVIOUS_KEYS = ["ArrowUp", "ArrowLeft"];

export function RadioGroup({
  label,
  options,
  value,
  defaultValue,
  onValueChange,
  disabled,
  className,
  ...rest
}: RadioGroupProps) {
  const labelId = useId();
  const [innerValue, setInnerValue] = useState(defaultValue);
  const current = value ?? innerValue;
  const enabled = options.filter((option) => !option.disabled);

  const change = (next: string) => {
    if (next === current) return;
    if (value === undefined) setInnerValue(next);
    onValueChange?.(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || enabled.length === 0) return;
    const isNext = NEXT_KEYS.includes(event.key);
    const isPrevious = PREVIOUS_KEYS.includes(event.key);
    if (!isNext && !isPrevious && event.key !== "Home" && event.key !== "End")
      return;

    // Tính từ ô đang có focus để khớp với hướng focus do Radix di chuyển.
    const focused = (event.target as HTMLElement).closest('[role="radio"]');
    const focusedValue = focused?.getAttribute("value") ?? current;
    const index = enabled.findIndex((option) => option.value === focusedValue);

    let nextIndex: number;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = enabled.length - 1;
    else if (isNext) nextIndex = index < 0 ? 0 : (index + 1) % enabled.length;
    else
      nextIndex =
        index < 0
          ? enabled.length - 1
          : (index - 1 + enabled.length) % enabled.length;

    change(enabled[nextIndex].value);
  };

  return (
    <div
      className={cx("flex flex-col gap-4", className)}
      onKeyDown={handleKeyDown}
    >
      <span id={labelId} className="text-md font-medium text-text-primary">
        {label}
      </span>
      <RadixRadioGroup.Root
        {...rest}
        value={current}
        onValueChange={change}
        disabled={disabled}
        aria-labelledby={labelId}
        className="flex flex-col gap-2"
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={cx(
              "flex min-h-32 coarse:min-h-touch items-center gap-8 text-md",
              option.disabled || disabled
                ? "cursor-not-allowed text-text-secondary"
                : "cursor-pointer",
            )}
          >
            <RadixRadioGroup.Item
              value={option.value}
              disabled={option.disabled}
              className="inline-flex size-20 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface-raised transition-fast enabled:hover:bg-surface-muted st-checked:border-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RadixRadioGroup.Indicator className="block size-8 rounded-full bg-brand-primary" />
            </RadixRadioGroup.Item>
            <span>{option.label}</span>
          </label>
        ))}
      </RadixRadioGroup.Root>
    </div>
  );
}
