import { Tabs as RadixTabs } from "radix-ui";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from "react";
import { cx } from "../lib/cx";

export const Tabs = RadixTabs.Root;

export const TabsList = forwardRef<
  ElementRef<typeof RadixTabs.List>,
  ComponentPropsWithoutRef<typeof RadixTabs.List>
>(function TabsList({ className, ...rest }, ref) {
  return (
    <RadixTabs.List
      {...rest}
      ref={ref}
      className={cx(
        "flex overflow-x-auto border-b border-border-default",
        className,
      )}
    />
  );
});

export const TabsTrigger = forwardRef<
  ElementRef<typeof RadixTabs.Trigger>,
  ComponentPropsWithoutRef<typeof RadixTabs.Trigger>
>(function TabsTrigger({ className, ...rest }, ref) {
  return (
    <RadixTabs.Trigger
      {...rest}
      ref={ref}
      className={cx(
        "-mb-1 inline-flex min-h-32 coarse:min-h-touch shrink-0 items-center whitespace-nowrap border-b-2 border-transparent px-16 text-md font-medium text-text-secondary transition-fast",
        "enabled:hover:text-text-primary st-active:border-brand-primary st-active:font-bold st-active:text-text-primary",
        className,
      )}
    />
  );
});

export const TabsContent = forwardRef<
  ElementRef<typeof RadixTabs.Content>,
  ComponentPropsWithoutRef<typeof RadixTabs.Content>
>(function TabsContent({ className, ...rest }, ref) {
  return (
    <RadixTabs.Content {...rest} ref={ref} className={cx("pt-16", className)} />
  );
});
