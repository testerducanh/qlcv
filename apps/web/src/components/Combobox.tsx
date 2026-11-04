import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import { viMessages } from '../i18n/vi';
import { cx } from '../lib/cx';
import { normalizeSearch } from '../lib/text';
import { controlBase, controlBorder } from './control-styles';
import { Field } from './Field';
import { CheckIcon, CloseIcon } from './icons';
import { Spinner } from './Spinner';

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface ComboboxProps {
  label: string;
  options: ComboboxOption[];
  /** Chọn nhiều: hiện các thẻ nhỏ có nút bỏ. Mặc định chọn một. */
  multiple?: boolean;
  /** Luôn là mảng; chế độ chọn một thì có tối đa 1 phần tử. */
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  loading?: boolean;
  /** Chế độ chọn một: hiện nút bỏ lựa chọn (ví dụ "Chưa giao"). */
  clearable?: boolean;
  autoFocus?: boolean;
  defaultOpen?: boolean;
  noResultsText?: string;
  /** Số kết quả hiện tối đa; nhiều hơn thì nhắc người dùng gõ thêm. */
  maxVisible?: number;
  wrapperClassName?: string;
}

const iconButtonClass =
  'inline-flex min-h-24 min-w-24 coarse:min-h-touch coarse:min-w-touch items-center justify-center ' +
  'rounded-full text-text-secondary enabled:hover:text-text-primary';

export function Combobox({
  label,
  options,
  multiple = false,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  hint,
  error,
  required,
  disabled,
  loading,
  clearable,
  autoFocus,
  defaultOpen = false,
  noResultsText,
  maxVisible = 100,
  wrapperClassName,
}: ComboboxProps) {
  const listboxId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inner, setInner] = useState<string[]>(defaultValue ?? []);
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState('');
  const [typed, setTyped] = useState(false);
  const [activeValue, setActiveValue] = useState<string | null>(null);

  const selected = value ?? inner;
  const selectedOptions = selected
    .map((v) => options.find((o) => o.value === v))
    .filter((o): o is ComboboxOption => Boolean(o));
  const singleLabel = !multiple && selectedOptions[0] ? selectedOptions[0].label : '';
  const inputValue = typed ? query : singleLabel;

  const filtered = useMemo(() => {
    const q = typed ? normalizeSearch(query) : '';
    if (!q) return options;
    return options.filter((o) => normalizeSearch(`${o.label} ${o.description ?? ''}`).includes(q));
  }, [options, query, typed]);
  const visible = filtered.slice(0, maxVisible);
  const enabled = visible.filter((o) => !o.disabled);
  const activeOption = enabled.find((o) => o.value === activeValue);
  const effectiveActive = activeOption ?? (typed ? enabled[0] : undefined);

  const optionId = (index: number) => `${listboxId}-option-${index}`;
  const activeIndex = effectiveActive ? visible.findIndex((o) => o.value === effectiveActive.value) : -1;
  const activeId = activeIndex >= 0 ? optionId(activeIndex) : undefined;

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (open && activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, activeId]);

  const commit = (next: string[]) => {
    if (value === undefined) setInner(next);
    onValueChange?.(next);
  };

  const close = () => {
    setOpen(false);
    setTyped(false);
    setQuery('');
  };

  const choose = (option: ComboboxOption) => {
    if (option.disabled) return;
    if (multiple) {
      commit(
        selected.includes(option.value)
          ? selected.filter((v) => v !== option.value)
          : [...selected, option.value],
      );
      setQuery('');
      setTyped(false);
      setActiveValue(option.value);
      inputRef.current?.focus();
    } else {
      commit([option.value]);
      close();
    }
  };

  const move = (delta: 1 | -1) => {
    if (!open) {
      setOpen(true);
      const start = enabled.find((o) => selected.includes(o.value)) ?? enabled[0];
      setActiveValue(start ? start.value : null);
      return;
    }
    if (enabled.length === 0) return;
    const index = effectiveActive ? enabled.findIndex((o) => o.value === effectiveActive.value) : -1;
    const next =
      index === -1
        ? delta === 1
          ? 0
          : enabled.length - 1
        : (index + delta + enabled.length) % enabled.length;
    setActiveValue(enabled[next].value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Enter':
        if (open && effectiveActive) {
          event.preventDefault();
          choose(effectiveActive);
        }
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        break;
      case 'Backspace':
        if (multiple && query === '' && selected.length > 0) commit(selected.slice(0, -1));
        break;
      case 'Tab':
        close();
        break;
      default:
        break;
    }
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.relatedTarget instanceof Node && wrapperRef.current?.contains(event.relatedTarget)) return;
    close();
  };

  const showClear = !loading && clearable && !multiple && selected.length > 0 && !disabled;

  return (
    <Field label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      {({ id, describedBy, invalid }) => (
        <div ref={wrapperRef} className="relative flex flex-col gap-4" onBlur={handleBlur}>
          {multiple && selectedOptions.length > 0 ? (
            <ul className="flex flex-wrap gap-4">
              {selectedOptions.map((option) => (
                <li
                  key={option.value}
                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-border-strong bg-surface-muted pl-8 text-sm"
                >
                  <span className="truncate" title={option.label}>
                    {option.label}
                  </span>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={viMessages.combobox.removeItem(option.label)}
                    onClick={() => {
                      commit(selected.filter((v) => v !== option.value));
                      inputRef.current?.focus();
                    }}
                    className={iconButtonClass}
                  >
                    <CloseIcon size="sm" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="relative">
            <input
              ref={inputRef}
              id={id}
              type="text"
              role="combobox"
              autoComplete="off"
              value={inputValue}
              placeholder={placeholder}
              disabled={disabled}
              aria-expanded={open}
              aria-controls={open ? listboxId : undefined}
              aria-autocomplete="list"
              aria-activedescendant={open ? activeId : undefined}
              aria-required={required || undefined}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              aria-busy={loading || undefined}
              onChange={(event) => {
                setQuery(event.target.value);
                setTyped(true);
                setOpen(true);
                setActiveValue(null);
              }}
              onClick={() => setOpen(true)}
              onKeyDown={handleKeyDown}
              className={cx(controlBase, controlBorder(invalid), (loading || showClear) && 'pr-40')}
            />
            {loading ? (
              <Spinner className="absolute right-12 top-1/2 -translate-y-1/2 text-text-secondary" />
            ) : null}
            {showClear ? (
              <button
                type="button"
                aria-label={viMessages.combobox.clear}
                onClick={() => {
                  commit([]);
                  close();
                  inputRef.current?.focus();
                }}
                className={cx(iconButtonClass, 'absolute right-4 top-1/2 -translate-y-1/2')}
              >
                <CloseIcon size="sm" />
              </button>
            ) : null}
          </div>
          {open ? (
            <ul
              id={listboxId}
              role="listbox"
              aria-label={label}
              aria-multiselectable={multiple || undefined}
              className="absolute left-0 right-0 top-full z-30 mt-4 max-h-192 overflow-y-auto rounded-md border border-border-strong bg-surface-raised p-4 shadow-3"
            >
              {visible.length === 0 ? (
                <li
                  id={optionId(0)}
                  role="option"
                  aria-selected="false"
                  aria-disabled="true"
                  className="px-12 py-8 text-sm text-text-secondary"
                >
                  {noResultsText ?? viMessages.combobox.noResults}
                </li>
              ) : (
                visible.map((option, index) => {
                  const isSelected = selected.includes(option.value);
                  return (
                    <li
                      key={option.value}
                      id={optionId(index)}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={option.disabled || undefined}
                      data-active={effectiveActive?.value === option.value || undefined}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choose(option)}
                      onMouseMove={() => {
                        if (!option.disabled) setActiveValue(option.value);
                      }}
                      className="flex min-h-32 coarse:min-h-touch cursor-pointer flex-col justify-center rounded-sm px-12 py-4 text-md text-text-primary data-active:bg-surface-muted aria-selected:font-medium aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                    >
                      <span className="flex items-center gap-8">
                        {isSelected ? <CheckIcon /> : <span className="size-16 shrink-0" />}
                        <span className="truncate">{option.label}</span>
                      </span>
                      {option.description ? (
                        <span className="truncate pl-24 text-xs text-text-secondary">
                          {option.description}
                        </span>
                      ) : null}
                    </li>
                  );
                })
              )}
              {filtered.length > visible.length ? (
                <li role="presentation" className="px-12 py-8 text-xs text-text-secondary">
                  {viMessages.combobox.tooMany}
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      )}
    </Field>
  );
}