import { Select as RadixSelect } from "radix-ui";
import { cx } from "../lib/cx";
import { controlBase, controlBorder } from "./control-styles";
import { Field } from "./Field";
import { CheckIcon, ChevronDownIcon } from "./icons";
import { Spinner } from "./Spinner";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  label: string;
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  loading?: boolean;
  wrapperClassName?: string;
}

export function Select({
  label,
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  hint,
  error,
  required,
  disabled,
  loading,
  wrapperClassName,
}: SelectProps) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={wrapperClassName}
    >
      {({ id, describedBy, invalid }) => (
        <RadixSelect.Root
          value={value}
          defaultValue={defaultValue}
          onValueChange={onValueChange}
          disabled={disabled}
          required={required}
        >
          <RadixSelect.Trigger
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            aria-busy={loading || undefined}
            className={cx(
              controlBase,
              controlBorder(invalid),
              "inline-flex items-center justify-between gap-8 text-left",
            )}
          >
            <RadixSelect.Value placeholder={placeholder} />
            <RadixSelect.Icon>
              {loading ? (
                <Spinner className="text-text-secondary" />
              ) : (
                <ChevronDownIcon />
              )}
            </RadixSelect.Icon>
          </RadixSelect.Trigger>
          <RadixSelect.Portal>
            <RadixSelect.Content
              position="popper"
              sideOffset={4}
              className="z-50 overflow-hidden rounded-md border border-border-strong bg-surface-raised shadow-2"
              style={{
                minWidth: "var(--radix-select-trigger-width)",
                maxHeight: "var(--radix-select-content-available-height)",
              }}
            >
              <RadixSelect.Viewport className="p-4">
                {options.map((option) => (
                  <RadixSelect.Item
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    className="relative flex min-h-32 coarse:min-h-touch cursor-pointer select-none items-center rounded-sm py-6 pl-32 pr-12 text-md text-text-primary data-highlighted:bg-surface-muted data-disabled:cursor-not-allowed data-disabled:opacity-60"
                  >
                    <RadixSelect.ItemIndicator className="absolute left-8">
                      <CheckIcon />
                    </RadixSelect.ItemIndicator>
                    <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                  </RadixSelect.Item>
                ))}
              </RadixSelect.Viewport>
            </RadixSelect.Content>
          </RadixSelect.Portal>
        </RadixSelect.Root>
      )}
    </Field>
  );
}
