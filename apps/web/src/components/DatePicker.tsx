import { Popover } from "radix-ui";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { viMessages } from "../i18n/vi";
import { cx } from "../lib/cx";
import {
  addDays,
  addMonths,
  buildMonthGrid,
  endOfWeek,
  formatDisplayDate,
  parseDisplayDate,
  parseIso,
  startOfWeek,
  todayIso,
} from "../lib/date";
import { Button } from "./Button";
import { controlBase, controlBorder } from "./control-styles";
import { Field } from "./Field";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { IconButton } from "./IconButton";
import { Spinner } from "./Spinner";

export interface CalendarProps {
  value: string | null;
  onSelect: (iso: string) => void;
  /** Ngày nghỉ theo lịch dự án: được đánh dấu bằng chấm và nhãn chữ, không chỉ bằng màu. */
  isNonWorking?: (iso: string) => boolean;
  autoFocus?: boolean;
  today?: string;
}

export function Calendar({
  value,
  onSelect,
  isNonWorking,
  autoFocus,
  today = todayIso(),
}: CalendarProps) {
  const headingId = useId();
  const gridRef = useRef<HTMLTableElement>(null);
  const shouldFocus = useRef(Boolean(autoFocus));
  const [focusIso, setFocusIso] = useState(
    value && parseIso(value) ? value : today,
  );
  const focus = parseIso(focusIso) ?? parseIso(today)!;
  const weeks = useMemo(
    () => buildMonthGrid(focus.y, focus.m),
    [focus.y, focus.m],
  );
  const text = viMessages.datePicker;

  useEffect(() => {
    if (!shouldFocus.current) return;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-iso="${focusIso}"]`)
      ?.focus();
  }, [focusIso]);

  const moveFocus = (iso: string, keepFocusOnGrid: boolean) => {
    shouldFocus.current = keepFocusOnGrid;
    setFocusIso(iso);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    let next: string;
    switch (event.key) {
      case "ArrowLeft":
        next = addDays(focusIso, -1);
        break;
      case "ArrowRight":
        next = addDays(focusIso, 1);
        break;
      case "ArrowUp":
        next = addDays(focusIso, -7);
        break;
      case "ArrowDown":
        next = addDays(focusIso, 7);
        break;
      case "Home":
        next = startOfWeek(focusIso);
        break;
      case "End":
        next = endOfWeek(focusIso);
        break;
      case "PageUp":
        next = addMonths(focusIso, event.shiftKey ? -12 : -1);
        break;
      case "PageDown":
        next = addMonths(focusIso, event.shiftKey ? 12 : 1);
        break;
      default:
        return;
    }
    event.preventDefault();
    moveFocus(next, true);
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-8">
        <IconButton
          variant="ghost"
          label={text.previousMonth}
          icon={<ChevronLeftIcon />}
          onClick={() => moveFocus(addMonths(focusIso, -1), false)}
        />
        <div id={headingId} aria-live="polite" className="text-md font-bold">
          {text.monthYear(focus.m, focus.y)}
        </div>
        <IconButton
          variant="ghost"
          label={text.nextMonth}
          icon={<ChevronRightIcon />}
          onClick={() => moveFocus(addMonths(focusIso, 1), false)}
        />
      </div>
      <table
        ref={gridRef}
        role="grid"
        aria-labelledby={headingId}
        className="border-collapse"
      >
        <thead>
          <tr>
            {text.weekdaysShort.map((short, index) => (
              <th
                key={short}
                scope="col"
                className="size-32 coarse:size-touch text-xs font-medium text-text-secondary"
              >
                <span aria-hidden="true">{short}</span>
                <span className="sr-only">{text.weekdaysLong[index]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((iso, column) => {
                const p = parseIso(iso)!;
                const isSelected = iso === value;
                const nonWorking = isNonWorking?.(iso) ?? false;
                const isToday = iso === today;
                const inMonth = p.m === focus.m;
                return (
                  <td
                    key={iso}
                    role="gridcell"
                    aria-selected={isSelected}
                    className="p-0 text-center"
                  >
                    <button
                      type="button"
                      data-iso={iso}
                      tabIndex={iso === focusIso ? 0 : -1}
                      aria-label={text.dayLabel(
                        text.weekdaysLong[column],
                        p.d,
                        p.m,
                        p.y,
                        nonWorking,
                      )}
                      aria-current={isToday ? "date" : undefined}
                      onClick={() => onSelect(iso)}
                      onKeyDown={handleKeyDown}
                      className={cx(
                        "relative inline-flex size-32 coarse:size-touch items-center justify-center rounded-md text-sm transition-fast",
                        isSelected
                          ? "bg-brand-primary text-text-inverse"
                          : "text-text-primary enabled:hover:bg-surface-muted",
                        !inMonth && !isSelected && "text-text-secondary",
                        isToday &&
                          !isSelected &&
                          "border border-border-strong font-bold",
                      )}
                    >
                      <span aria-hidden="true">{p.d}</span>
                      {nonWorking ? (
                        <span
                          aria-hidden="true"
                          className={cx(
                            "absolute bottom-3 size-4 rounded-full",
                            isSelected
                              ? "bg-text-inverse"
                              : "bg-text-secondary",
                          )}
                        />
                      ) : null}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <Button variant="ghost" onClick={() => onSelect(today)}>
        {text.today}
      </Button>
    </div>
  );
}

export interface DatePickerProps {
  label: string;
  /** Ngày dạng yyyy-MM-dd (hoặc null khi chưa chọn). */
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string | null) => void;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  loading?: boolean;
  isNonWorking?: (iso: string) => boolean;
  wrapperClassName?: string;
}

export function DatePicker({
  label,
  value,
  defaultValue,
  onValueChange,
  hint,
  error,
  required,
  disabled,
  loading,
  isNonWorking,
  wrapperClassName,
}: DatePickerProps) {
  const [inner, setInner] = useState<string | null>(defaultValue ?? null);
  const current = value === undefined ? inner : value;
  const [text, setText] = useState(formatDisplayDate(current));
  const [invalidText, setInvalidText] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setText(formatDisplayDate(current));
    setInvalidText(false);
  }, [current]);

  const commit = (next: string | null) => {
    if (value === undefined) setInner(next);
    onValueChange?.(next);
  };

  const applyText = () => {
    if (text.trim() === "") {
      setInvalidText(false);
      if (current !== null) commit(null);
      return;
    }
    const parsed = parseDisplayDate(text);
    if (!parsed) {
      setInvalidText(true);
      return;
    }
    setInvalidText(false);
    setText(formatDisplayDate(parsed));
    if (parsed !== current) commit(parsed);
  };

  return (
    <Field
      label={label}
      hint={hint}
      error={error ?? (invalidText ? viMessages.datePicker.invalid : undefined)}
      required={required}
      className={wrapperClassName}
    >
      {({ id, describedBy, invalid }) => (
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Anchor asChild>
            <div className="relative">
              <input
                id={id}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder={viMessages.datePicker.placeholder}
                value={text}
                disabled={disabled}
                aria-required={required || undefined}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                aria-busy={loading || undefined}
                onChange={(event) => {
                  setText(event.target.value);
                  setInvalidText(false);
                }}
                onBlur={applyText}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applyText();
                  if (event.key === "ArrowDown" && event.altKey) {
                    event.preventDefault();
                    setOpen(true);
                  }
                }}
                className={cx(controlBase, controlBorder(invalid), "pr-48")}
              />
              {loading ? (
                <Spinner className="absolute right-48 top-1/2 -translate-y-1/2 text-text-secondary" />
              ) : null}
              <span className="absolute right-4 top-1/2 -translate-y-1/2">
                <Popover.Trigger asChild>
                  <IconButton
                    variant="ghost"
                    label={viMessages.datePicker.open}
                    icon={<CalendarIcon />}
                    disabled={disabled}
                  />
                </Popover.Trigger>
              </span>
            </div>
          </Popover.Anchor>
          <Popover.Portal>
            <Popover.Content
              align="end"
              sideOffset={4}
              collisionPadding={8}
              aria-label={viMessages.datePicker.calendar}
              onOpenAutoFocus={(event) => event.preventDefault()}
              className="z-50 rounded-lg border border-border-strong bg-surface-raised p-12 shadow-4"
            >
              <Calendar
                autoFocus
                value={current}
                isNonWorking={isNonWorking}
                onSelect={(iso) => {
                  commit(iso);
                  setOpen(false);
                }}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </Field>
  );
}
