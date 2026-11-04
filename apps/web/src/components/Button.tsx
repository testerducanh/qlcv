import {
  forwardRef,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";
import { viMessages } from "../i18n/vi";
import { cx } from "../lib/cx";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const base =
  "relative inline-flex items-center justify-center rounded-md border font-medium text-md leading-tight " +
  "min-h-32 coarse:min-h-touch px-16 select-none transition-fast " +
  "disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-surface-muted " +
  "disabled:text-text-secondary disabled:border-border-default aria-disabled:cursor-not-allowed";

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-primary border-brand-primary text-text-inverse " +
    "enabled:hover:bg-brand-primary-hover enabled:active:bg-brand-primary-active",
  secondary:
    "bg-surface-raised border-border-strong text-text-primary " +
    "enabled:hover:bg-surface-muted enabled:active:bg-border-default",
  ghost:
    "border-transparent text-text-primary enabled:hover:bg-surface-muted enabled:active:bg-border-default",
  danger:
    "bg-status-danger border-status-danger text-text-inverse " +
    "enabled:hover:brightness-90 enabled:active:brightness-75",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  loadingText?: string;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      loading = false,
      loadingText = viMessages.common.loading,
      icon,
      type = "button",
      className,
      children,
      onClick,
      ...rest
    },
    ref,
  ) {
    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
      if (loading) {
        event.preventDefault();
        return;
      }
      onClick?.(event);
    };

    return (
      <button
        {...rest}
        ref={ref}
        type={type}
        aria-busy={loading || undefined}
        aria-disabled={loading || undefined}
        onClick={handleClick}
        className={cx(base, variantClass[variant], className)}
      >
        <span
          className={cx(
            "inline-flex items-center justify-center gap-8",
            loading && "opacity-0",
          )}
        >
          {icon}
          {children}
        </span>
        {loading ? (
          <>
            <Spinner className="absolute" />
            <span className="sr-only">{loadingText}</span>
          </>
        ) : null}
      </button>
    );
  },
);
