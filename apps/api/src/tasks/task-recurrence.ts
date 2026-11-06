import type { WorkCalendar } from "@qlcv/shared";

export type RecurrenceFrequency =
  "daily" | "weekly" | "monthly" | "quarterly" | "working_day";

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
  weekdays?: number[];
  dayOfMonth?: number;
}

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Ngày lặp không hợp lệ");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Ngày lặp không hợp lệ");
  }
  return date;
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isWorkingDay(date: Date, calendar: WorkCalendar): boolean {
  return (
    !calendar.weeklyOff.includes(date.getUTCDay()) &&
    !calendar.holidays.includes(dateOnly(date))
  );
}

function monthDays(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function matchesRule(
  date: Date,
  start: Date,
  rule: RecurrenceRule,
  calendar: WorkCalendar,
  workingDayIndex: number,
): boolean {
  const dayOffset = Math.round(
    (date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
  );
  const startWeek = new Date(start);
  startWeek.setUTCDate(
    startWeek.getUTCDate() - ((startWeek.getUTCDay() + 6) % 7),
  );
  const dateWeek = new Date(date);
  dateWeek.setUTCDate(dateWeek.getUTCDate() - ((dateWeek.getUTCDay() + 6) % 7));
  const weekOffset = Math.round(
    (dateWeek.getTime() - startWeek.getTime()) / (7 * 24 * 60 * 60 * 1000),
  );
  const monthOffset =
    (date.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    date.getUTCMonth() -
    start.getUTCMonth();

  switch (rule.frequency) {
    case "daily":
      return dayOffset % rule.interval === 0;
    case "weekly":
      return (
        weekOffset % rule.interval === 0 &&
        (rule.weekdays ?? [start.getUTCDay()]).includes(date.getUTCDay())
      );
    case "monthly":
      return (
        monthOffset % rule.interval === 0 &&
        date.getUTCDate() ===
          Math.min(
            rule.dayOfMonth ?? start.getUTCDate(),
            monthDays(date.getUTCFullYear(), date.getUTCMonth()),
          )
      );
    case "quarterly":
      return (
        monthOffset % (rule.interval * 3) === 0 &&
        date.getUTCDate() ===
          Math.min(
            rule.dayOfMonth ?? start.getUTCDate(),
            monthDays(date.getUTCFullYear(), date.getUTCMonth()),
          )
      );
    case "working_day":
      return (
        dayOffset >= 0 &&
        isWorkingDay(date, calendar) &&
        workingDayIndex % rule.interval === 0
      );
  }
}

function nextWorkingDay(date: Date, calendar: WorkCalendar): Date {
  const result = new Date(date);
  for (let checked = 0; checked < 8; checked += 1) {
    if (isWorkingDay(result, calendar)) return result;
    result.setUTCDate(result.getUTCDate() + 1);
  }
  throw new Error("Không tìm được ngày làm việc trong lịch dự án");
}

export function generateRecurrenceDates(
  startDate: string,
  rule: RecurrenceRule,
  calendar: WorkCalendar,
  count: number,
  until?: string,
): string[] {
  const start = parseDate(startDate);
  if (
    !Number.isInteger(rule.interval) ||
    rule.interval < 1 ||
    rule.interval > 365
  ) {
    throw new Error("Chu kỳ lặp phải từ 1 đến 365");
  }
  if (!Number.isInteger(count) || count < 1 || count > 52) {
    throw new Error("Số kỳ lặp phải từ 1 đến 52");
  }
  if (until) parseDate(until);
  if (
    rule.dayOfMonth !== undefined &&
    (rule.dayOfMonth < 1 || rule.dayOfMonth > 31)
  ) {
    throw new Error("Ngày trong tháng phải từ 1 đến 31");
  }
  if (
    rule.weekdays &&
    (rule.weekdays.length === 0 ||
      rule.weekdays.some(
        (day) => !Number.isInteger(day) || day < 0 || day > 6,
      ) ||
      new Set(rule.weekdays).size !== rule.weekdays.length)
  ) {
    throw new Error("Thứ trong tuần không hợp lệ");
  }

  const dates: string[] = [];
  const seen = new Set<string>();
  const cursor = new Date(start);
  let workingDayIndex = -1;
  const maxDaysPerOccurrence = {
    daily: 1,
    weekly: 7,
    monthly: 31,
    quarterly: 93,
    working_day: 7,
  }[rule.frequency];
  const searchLimit = Math.max(
    36525,
    rule.interval * maxDaysPerOccurrence * count + 370,
  );
  for (
    let checked = 0;
    checked < searchLimit && dates.length < count;
    checked += 1
  ) {
    if (isWorkingDay(cursor, calendar)) workingDayIndex += 1;
    if (matchesRule(cursor, start, rule, calendar, workingDayIndex)) {
      const scheduled =
        rule.frequency === "working_day"
          ? cursor
          : nextWorkingDay(cursor, calendar);
      const value = dateOnly(scheduled);
      if ((!until || value <= until) && !seen.has(value)) {
        dates.push(value);
        seen.add(value);
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (until && dateOnly(cursor) > until) break;
  }
  if (dates.length === 0) {
    throw new Error("Không có kỳ lặp phù hợp trong phạm vi đã chọn");
  }
  return dates;
}
