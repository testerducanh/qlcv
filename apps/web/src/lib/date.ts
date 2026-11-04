import { viMessages } from "../i18n/vi";

export interface YMD {
  y: number;
  m: number; // 0 đến 11
  d: number;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

export function isRealDate(y: number, m: number, d: number): boolean {
  if (y < 1900 || y > 2999 || m < 0 || m > 11 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

export function toIso({ y, m, d }: YMD): string {
  return `${pad(y, 4)}-${pad(m + 1)}-${pad(d)}`;
}

export function parseIso(iso: string): YMD | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);
  return isRealDate(y, m, d) ? { y, m, d } : null;
}

/** Thứ trong tuần, thứ Hai là 0 và Chủ nhật là 6. */
export function weekdayMonFirst(y: number, m: number, d: number): number {
  return (new Date(Date.UTC(y, m, d)).getUTCDay() + 6) % 7;
}

export function addDays(iso: string, n: number): string {
  const p = parseIso(iso);
  if (!p) return iso;
  const date = new Date(Date.UTC(p.y, p.m, p.d + n));
  return toIso({
    y: date.getUTCFullYear(),
    m: date.getUTCMonth(),
    d: date.getUTCDate(),
  });
}

export function addMonths(iso: string, n: number): string {
  const p = parseIso(iso);
  if (!p) return iso;
  const total = p.y * 12 + p.m + n;
  const y = Math.floor(total / 12);
  const m = total - y * 12;
  return toIso({ y, m, d: Math.min(p.d, daysInMonth(y, m)) });
}

export function startOfWeek(iso: string): string {
  const p = parseIso(iso);
  return p ? addDays(iso, -weekdayMonFirst(p.y, p.m, p.d)) : iso;
}

export function endOfWeek(iso: string): string {
  return addDays(startOfWeek(iso), 6);
}

/** Lưới 6 tuần x 7 ngày (thứ Hai là cột đầu), gồm cả ngày của tháng kề bên. */
export function buildMonthGrid(y: number, m: number): string[][] {
  const start = startOfWeek(toIso({ y, m, d: 1 }));
  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => addDays(start, week * 7 + day)),
  );
}

export function formatDisplayDate(iso: string | null | undefined): string {
  const p = iso ? parseIso(iso) : null;
  return p ? `${pad(p.d)}/${pad(p.m + 1)}/${p.y}` : "";
}

/** "05/11/2026" hoặc "5/11/2026" thành "2026-11-05"; sai thì trả về null. */
export function parseDisplayDate(text: string): string | null {
  const match = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(text);
  if (!match) return null;
  const d = Number(match[1]);
  const m = Number(match[2]) - 1;
  const y = Number(match[3]);
  return isRealDate(y, m, d) ? toIso({ y, m, d }) : null;
}

/** Ngày hôm nay theo múi giờ Asia/Bangkok, dạng yyyy-MM-dd. */
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function formatRelativeTime(
  iso: string,
  now: Date = new Date(),
): string {
  const then = new Date(iso);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60000);
  const text = viMessages.comments;
  if (minutes < 1) return text.justNow;
  if (minutes < 60) return text.minutesAgo(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return text.hoursAgo(hours);
  const days = Math.floor(hours / 24);
  if (days < 7) return text.daysAgo(days);
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(then);
}
