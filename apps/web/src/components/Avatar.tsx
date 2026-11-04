import { Avatar as RadixAvatar } from "radix-ui";
import { viMessages } from "../i18n/vi";
import { cx } from "../lib/cx";

export type AvatarSize = "sm" | "md" | "lg";

const sizeClass: Record<AvatarSize, string> = {
  sm: "size-24 text-xs",
  md: "size-32 text-sm",
  lg: "size-40 text-md",
};

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export interface AvatarProps {
  name: string;
  src?: string;
  size?: AvatarSize;
  className?: string;
}

export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  return (
    <RadixAvatar.Root
      role="img"
      aria-label={name}
      title={name}
      className={cx(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full border border-border-strong bg-surface-muted font-medium text-text-primary",
        sizeClass[size],
        className,
      )}
    >
      {src ? (
        <RadixAvatar.Image
          src={src}
          alt=""
          className="size-full object-cover"
        />
      ) : null}
      <RadixAvatar.Fallback>{initials(name)}</RadixAvatar.Fallback>
    </RadixAvatar.Root>
  );
}

export interface AvatarGroupProps {
  label: string;
  people: Array<{ name: string; src?: string }>;
  max?: number;
  size?: AvatarSize;
}

export function AvatarGroup({
  label,
  people,
  max = 3,
  size = "md",
}: AvatarGroupProps) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div role="group" aria-label={label} className="flex items-center">
      {shown.map((person, index) => (
        <Avatar
          key={person.name}
          name={person.name}
          src={person.src}
          size={size}
          className={cx("border-surface-raised", index > 0 && "-ml-8")}
        />
      ))}
      {extra > 0 ? (
        <span
          role="img"
          aria-label={viMessages.avatar.more(extra)}
          className={cx(
            "-ml-8 inline-flex shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface-muted font-medium text-text-primary",
            sizeClass[size],
          )}
        >
          +{extra}
        </span>
      ) : null}
    </div>
  );
}
