import { useId, type ReactNode } from "react";
import { cx } from "../lib/cx";
import { AlertIcon } from "./icons";

interface FieldRenderProps {
  id: string;
  describedBy?: string;
  invalid: boolean;
}

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: FieldRenderProps) => ReactNode;
}

export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cx("flex flex-col gap-4", className)}>
      <label htmlFor={id} className="text-md font-medium text-text-primary">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-status-danger">
            {" "}
            *
          </span>
        ) : null}
      </label>
      {children({
        id,
        describedBy: describedBy || undefined,
        invalid: Boolean(error),
      })}
      {hint ? (
        <p id={hintId} className="text-sm text-text-secondary">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          className="flex items-start gap-4 text-sm text-status-danger"
        >
          <AlertIcon className="mt-1" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
