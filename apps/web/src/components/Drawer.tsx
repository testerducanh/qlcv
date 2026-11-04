import { Dialog as RadixDialog } from "radix-ui";
import { useState, type ReactNode } from "react";
import { viMessages } from "../i18n/vi";
import { CloseIcon } from "./icons";
import { ConfirmDialog } from "./Dialog";
import { IconButton } from "./IconButton";

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** Có thay đổi chưa lưu: đóng drawer sẽ hỏi xác nhận trước. */
  dirty?: boolean;
}

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  dirty,
}: DrawerProps) {
  const [confirming, setConfirming] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (!next && dirty) {
      setConfirming(true);
      return;
    }
    onOpenChange(next);
  };

  return (
    <>
      <RadixDialog.Root open={open} onOpenChange={handleOpenChange}>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="fixed inset-0 z-40 bg-text-primary/50" />
          <RadixDialog.Content
            {...(description ? {} : { "aria-describedby": undefined })}
            className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-surface-raised shadow-4 md:w-1/2 md:min-w-drawer"
          >
            <header className="flex items-start justify-between gap-12 border-b border-border-default p-16">
              <div className="flex flex-col gap-4">
                <RadixDialog.Title className="text-xl font-bold">
                  {title}
                </RadixDialog.Title>
                {description ? (
                  <RadixDialog.Description className="text-sm text-text-secondary">
                    {description}
                  </RadixDialog.Description>
                ) : null}
              </div>
              <RadixDialog.Close asChild>
                <IconButton
                  variant="ghost"
                  label={viMessages.common.close}
                  icon={<CloseIcon />}
                />
              </RadixDialog.Close>
            </header>
            <div className="flex-1 overflow-y-auto p-16">{children}</div>
            {footer ? (
              <footer className="flex flex-wrap justify-end gap-8 border-t border-border-default p-16">
                {footer}
              </footer>
            ) : null}
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={viMessages.drawer.unsavedTitle}
        description={viMessages.drawer.unsavedDescription}
        cancelLabel={viMessages.drawer.keepEditing}
        confirmLabel={viMessages.drawer.discard}
        danger
        onConfirm={() => {
          setConfirming(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
