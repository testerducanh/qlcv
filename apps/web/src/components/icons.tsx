import type { ReactNode } from "react";
import { cx } from "../lib/cx";

export type IconSize = "sm" | "md" | "lg";

const sizeClass: Record<IconSize, string> = {
  sm: "size-12",
  md: "size-16",
  lg: "size-32",
};

interface IconProps {
  className?: string;
  size?: IconSize;
}

function IconBase({
  className,
  size = "md",
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={cx(sizeClass[size], "shrink-0", className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 5v14M5 12h14" />
    </IconBase>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16.5v.01" />
    </IconBase>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v.01M12 11v5" />
    </IconBase>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 12l5 5L20 7" />
    </IconBase>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 12h14" />
    </IconBase>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 9l6 6 6-6" />
    </IconBase>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </IconBase>
  );
}

export function CircleIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
    </IconBase>
  );
}

export function HalfCircleIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
    </IconBase>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </IconBase>
  );
}

export function InboxIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5" />
    </IconBase>
  );
}

export function DotsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </IconBase>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M15 6l-6 6 6 6" />
    </IconBase>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 6l6 6-6 6" />
    </IconBase>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8 3v4M16 3v4" />
    </IconBase>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 16V5M7 10l5-5 5 5M5 19h14" />
    </IconBase>
  );
}

export function FileIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7 3h7l5 5v13H7zM14 3v5h5" />
    </IconBase>
  );
}

export function RetryIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />
    </IconBase>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M3 10h18" />
    </IconBase>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="18" r="1" />
    </IconBase>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2Z" />
    </IconBase>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </IconBase>
  );
}
