import { forwardRef, type InputHTMLAttributes } from "react";
import { cx } from "../lib/cx";
import { controlBase, controlBorder } from "./control-styles";
import { Field } from "./Field";
import { Spinner } from "./Spinner";

export interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id"
> {
  label: string;
  hint?: string;
  error?: string;
  loading?: boolean;
  wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    hint,
    error,
    loading,
    wrapperClassName,
    className,
    required,
    ...rest
  },
  ref,
) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={wrapperClassName}
    >
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <input
            {...rest}
            ref={ref}
            id={id}
            required={required}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            aria-busy={loading || undefined}
            className={cx(
              controlBase,
              controlBorder(invalid),
              loading && "pr-32",
              className,
            )}
          />
          {loading ? (
            <Spinner className="absolute right-12 top-1/2 -translate-y-1/2 text-text-secondary" />
          ) : null}
        </div>
      )}
    </Field>
  );
});
