import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "../lib/cx";
import { Button, type ButtonVariant } from "./Button";

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "children"
> {
  /** Tên truy cập bằng tiếng Việt, bắt buộc vì nút không có chữ. */
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
  loading?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ label, icon, className, ...rest }, ref) {
    return (
      <Button
        {...rest}
        ref={ref}
        aria-label={label}
        title={label}
        loadingText={label}
        className={cx("size-32 coarse:size-touch px-0", className)}
      >
        {icon}
      </Button>
    );
  },
);
