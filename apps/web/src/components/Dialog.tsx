import { Dialog as RadixDialog } from "radix-ui";
import type { ReactNode } from "react";
import { viMessages } from "../i18n/vi";
import { Button } from "./Button";
import { CloseIcon } from "./icons";
import { IconButton } from "./IconButton";

export const DialogClose = RadixDialog.Close;

export interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}

export function Dialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? (
        <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>
      ) : null}
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-text-primary/50" />
        <RadixDialog.Content
          {...(description ? {} : { "aria-describedby": undefined })}
          className="fixed left-1/2 top-1/2 z-50 flex max-w-dialog -translate-x-1/2 -translate-y-1/2 flex-col gap-16 overflow-y-auto rounded-lg bg-surface-raised p-24 shadow-4"
          style={{
            width: "calc(100% - var(--spacing-32))",
            maxHeight: "calc(100% - var(--spacing-32))",
          }}
        >
          <div className="flex items-start justify-between gap-12">
            <RadixDialog.Title className="text-xl font-bold">
              {title}
            </RadixDialog.Title>
            <RadixDialog.Close asChild>
              <IconButton
                variant="ghost"
                label={viMessages.common.close}
                icon={<CloseIcon />}
              />
            </RadixDialog.Close>
          </div>
          {description ? (
            <RadixDialog.Description className="text-md text-text-secondary">
              {description}
            </RadixDialog.Description>
          ) : null}
          {children}
          {footer ? (
            <div className="flex flex-wrap justify-end gap-8">{footer}</div>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  danger,
  loading,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <DialogClose asChild>
            <Button>{cancelLabel ?? viMessages.common.cancel}</Button>
          </DialogClose>
          <Button
            variant={danger ? "danger" : "primary"}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
