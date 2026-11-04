import { Toast as RadixToast } from "radix-ui";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { viMessages } from "../i18n/vi";
import { Button } from "./Button";
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from "./icons";
import { IconButton } from "./IconButton";

export type ToastTone = "info" | "success" | "warning" | "danger";

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  show: (options: ToastOptions) => void;
}

const MAX_TOASTS = 3;
const AUTO_CLOSE_MS = 6000;

const ToastContext = createContext<ToastContextValue | null>(null);

const toneStyle: Record<
  ToastTone,
  { border: string; text: string; icon: ReactNode }
> = {
  info: {
    border: "border-l-status-info",
    text: "text-status-info",
    icon: <InfoIcon />,
  },
  success: {
    border: "border-l-status-success",
    text: "text-status-success",
    icon: <CheckIcon />,
  },
  warning: {
    border: "border-l-status-warning",
    text: "text-status-warning",
    icon: <AlertIcon />,
  },
  danger: {
    border: "border-l-status-danger",
    text: "text-status-danger",
    icon: <AlertIcon />,
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const show = useCallback((options: ToastOptions) => {
    setItems((prev) =>
      [...prev, { ...options, id: nextId.current++ }].slice(-MAX_TOASTS),
    );
  }, []);

  const remove = (id: number) =>
    setItems((prev) => prev.filter((item) => item.id !== id));
  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      <RadixToast.Provider
        label={viMessages.toast.region}
        swipeDirection="right"
      >
        {children}
        {items.map((item) => {
          const style = toneStyle[item.tone ?? "info"];
          return (
            <RadixToast.Root
              key={item.id}
              data-qlcv-toast=""
              type={item.tone === "danger" ? "foreground" : "background"}
              duration={item.actionLabel ? Infinity : AUTO_CLOSE_MS}
              onOpenChange={(open) => {
                if (!open) remove(item.id);
              }}
              className={`flex items-start gap-12 rounded-lg border border-l-4 border-border-strong bg-surface-raised p-12 shadow-3 ${style.border}`}
            >
              <span className={`mt-2 ${style.text}`}>{style.icon}</span>
              <div className="flex flex-1 flex-col gap-2">
                <RadixToast.Title className="text-md font-medium text-text-primary">
                  {item.title}
                </RadixToast.Title>
                {item.description ? (
                  <RadixToast.Description className="text-sm text-text-secondary">
                    {item.description}
                  </RadixToast.Description>
                ) : null}
              </div>
              {item.actionLabel ? (
                <RadixToast.Action
                  altText={item.actionLabel}
                  asChild
                  onClick={item.onAction}
                >
                  <Button>{item.actionLabel}</Button>
                </RadixToast.Action>
              ) : null}
              <RadixToast.Close asChild>
                <IconButton
                  variant="ghost"
                  label={viMessages.common.close}
                  icon={<CloseIcon />}
                />
              </RadixToast.Close>
            </RadixToast.Root>
          );
        })}
        <RadixToast.Viewport className="fixed bottom-0 left-0 right-0 z-50 flex flex-col gap-8 p-16 md:left-auto md:w-full md:max-w-dialog" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context)
    throw new Error("useToast phải được dùng bên trong ToastProvider");
  return context;
}
