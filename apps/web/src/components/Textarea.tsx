import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cx } from "../lib/cx";
import { controlBase, controlBorder } from "./control-styles";
import { Field } from "./Field";

export interface TextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "id"
> {
  label: string;
  hint?: string;
  error?: string;
  loading?: boolean;
  wrapperClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    {
      label,
      hint,
      error,
      loading,
      wrapperClassName,
      className,
      required,
      rows = 3,
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
          <textarea
            {...rest}
            ref={ref}
            id={id}
            rows={rows}
            required={required}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            aria-busy={loading || undefined}
            className={cx(
              controlBase,
              controlBorder(invalid),
              "min-h-64 max-h-192 field-sizing-content resize-y overflow-y-auto",
              className,
            )}
          />
        )}
      </Field>
    );
  },
);
