import { z } from "zod";

export const APP_NAME = "qlcv";

const projectUuid = z.string().uuid();
const projectName = z
  .string()
  .trim()
  .min(1, "Vui lòng nhập tên dự án.")
  .max(200, "Tên dự án tối đa 200 ký tự.");
const workCalendarSchema = z.object({
  weeklyOff: z
    .array(z.number().int().min(0).max(6))
    .max(7)
    .refine((days) => new Set(days).size === days.length),
  holidays: z.array(z.string().date()).max(500),
});
const statusLabelsSchema = z
  .record(
    z.enum(["todo", "doing", "done", "blocked"]),
    z.string().trim().min(1).max(80),
  )
  .refine((value) => Object.keys(value).length <= 20);
export const assignmentLevelSchema = z.enum(["light", "standard", "strict"]);
export const assignmentEvidenceRequirementSchema = z.enum([
  "attachment",
  "note",
  "either",
]);
const projectShape = z.object({
  branchId: projectUuid,
  name: projectName,
  description: z.string().max(10000).optional(),
  startDate: z.string().date().optional(),
  dueDate: z.string().date().optional(),
  workCalendar: workCalendarSchema.optional(),
  progressMode: z.enum(["by_count", "by_workdays", "manual"]).optional(),
  confidentiality: z.enum(["normal", "restricted"]).optional(),
  statusLabels: statusLabelsSchema.optional(),
  assignmentLevel: assignmentLevelSchema.optional(),
  strictEvidenceRequirement: assignmentEvidenceRequirementSchema.optional(),
});
const validProjectDates = (project: {
  startDate?: string | null;
  dueDate?: string | null;
}) =>
  !project.startDate ||
  !project.dueDate ||
  project.startDate <= project.dueDate;

export const projectCreateSchema = projectShape.refine(validProjectDates, {
  path: ["dueDate"],
  message: "Ngày kết thúc phải từ ngày bắt đầu trở đi",
});

export const projectUpdateSchema = projectShape
  .partial()
  .omit({ branchId: true })
  .extend({
    branchId: projectUuid.optional(),
    description: z.string().max(10000).nullable().optional(),
    startDate: z.string().date().nullable().optional(),
    dueDate: z.string().date().nullable().optional(),
    status: z.enum(["active", "on_hold", "completed", "archived"]).optional(),
    assignmentLevel: assignmentLevelSchema.optional(),
    strictEvidenceRequirement: assignmentEvidenceRequirementSchema.optional(),
  })
  .refine(validProjectDates, {
    path: ["dueDate"],
    message: "Ngày kết thúc phải từ ngày bắt đầu trở đi",
  });

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;

export interface WorkCalendar {
  weeklyOff: number[];
  holidays: string[];
}

export type ProgressMode = "by_count" | "by_workdays" | "manual";

function asDateOnly(value: Date | string): string {
  if (typeof value === "string") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new RangeError("Ngày phải có định dạng YYYY-MM-DD");
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    ) {
      throw new RangeError("Ngày không hợp lệ");
    }
    return value;
  }
  if (Number.isNaN(value.getTime())) throw new RangeError("Ngày không hợp lệ");
  return value.toISOString().slice(0, 10);
}

function calendarDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isWorkingDay(date: Date, calendar: WorkCalendar): boolean {
  const dateOnly = date.toISOString().slice(0, 10);
  return (
    !calendar.weeklyOff.includes(date.getUTCDay()) &&
    !calendar.holidays.includes(dateOnly)
  );
}

export function countWorkingDays(
  start: Date | string,
  end: Date | string,
  calendar: WorkCalendar,
): number {
  const first = calendarDate(asDateOnly(start));
  const last = calendarDate(asDateOnly(end));
  if (first > last) return 0;

  const holidays = new Set(calendar.holidays);
  let count = 0;
  for (
    const cursor = new Date(first);
    cursor <= last;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const dateOnly = cursor.toISOString().slice(0, 10);
    if (
      !calendar.weeklyOff.includes(cursor.getUTCDay()) &&
      !holidays.has(dateOnly)
    ) {
      count += 1;
    }
  }
  return count;
}

export function addWorkingDays(
  start: Date | string,
  days: number,
  calendar: WorkCalendar,
): string {
  if (!Number.isInteger(days) || days < 0) {
    throw new RangeError("Số ngày làm việc phải là số nguyên không âm");
  }
  const cursor = calendarDate(asDateOnly(start));
  let remaining = days;
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isWorkingDay(cursor, calendar)) remaining -= 1;
  }
  return cursor.toISOString().slice(0, 10);
}

export function calculateWorkdayProgress(
  start: Date | string,
  end: Date | string,
  today: Date | string,
  calendar: WorkCalendar,
): number {
  const first = asDateOnly(start);
  const last = asDateOnly(end);
  const current = asDateOnly(today);
  const total = countWorkingDays(first, last, calendar);
  if (total === 0) return current >= last ? 100 : 0;
  if (current < first) return 0;
  if (current >= last) return 100;
  return Math.round((countWorkingDays(first, current, calendar) / total) * 100);
}

export function calculateCountProgress(
  items: ReadonlyArray<{
    status: string;
    checklistDone?: number;
    checklistTotal?: number;
  }>,
): number {
  if (items.length === 0) return 0;
  const progressTotal = items.reduce((total, item) => {
    if (item.checklistTotal) {
      return (
        total +
        Math.round(((item.checklistDone ?? 0) / item.checklistTotal) * 100)
      );
    }
    return total + (item.status === "done" ? 100 : 0);
  }, 0);
  return Math.round(progressTotal / items.length);
}
