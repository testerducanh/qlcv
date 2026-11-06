import { addWorkingDays, type WorkCalendar } from "@qlcv/shared";

export type CriticalPathLinkType =
  "finish_start" | "overlap" | "blocking_finish";

export interface CriticalPathTask {
  id: string;
  durationDays: number;
  startDate: string | null;
}

export interface CriticalPathLink {
  predecessorId: string;
  successorId: string;
  type: CriticalPathLinkType;
  lagDays: number;
}

export interface CriticalPathEntry {
  taskId: string;
  earliestStart: number;
  earliestFinish: number;
  latestStart: number;
  latestFinish: number;
  totalFloat: number;
  critical: boolean;
}

function isWorkingDay(date: string, calendar: WorkCalendar) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return (
    !calendar.weeklyOff.includes(parsed.getUTCDay()) &&
    !calendar.holidays.includes(date)
  );
}

function moveToWorkingDay(
  date: string,
  direction: 1 | -1,
  calendar: WorkCalendar,
) {
  const cursor = new Date(`${date}T00:00:00.000Z`);
  while (!isWorkingDay(cursor.toISOString().slice(0, 10), calendar)) {
    cursor.setUTCDate(cursor.getUTCDate() + direction);
  }
  return cursor.toISOString().slice(0, 10);
}

function workingDayOffset(
  anchor: string,
  target: string,
  calendar: WorkCalendar,
) {
  const normalizedAnchor = moveToWorkingDay(anchor, 1, calendar);
  const cursor = new Date(`${normalizedAnchor}T00:00:00.000Z`);
  const targetDate = new Date(`${target}T00:00:00.000Z`);
  let offset = 0;
  while (cursor.toISOString().slice(0, 10) !== target) {
    const direction = cursor < targetDate ? 1 : -1;
    cursor.setUTCDate(cursor.getUTCDate() + direction);
    if (isWorkingDay(cursor.toISOString().slice(0, 10), calendar)) {
      offset += direction;
    }
  }
  return offset;
}

function dateAtOffset(anchor: string, offset: number, calendar: WorkCalendar) {
  const start = moveToWorkingDay(anchor, 1, calendar);
  if (offset >= 0) return addWorkingDays(start, offset, calendar);
  let remaining = -offset;
  const cursor = new Date(`${start}T00:00:00.000Z`);
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const date = cursor.toISOString().slice(0, 10);
    if (isWorkingDay(date, calendar)) remaining -= 1;
  }
  return cursor.toISOString().slice(0, 10);
}

function startConstraint(
  link: CriticalPathLink,
  predecessorStart: number,
  predecessorDuration: number,
  successorDuration: number,
) {
  switch (link.type) {
    case "finish_start":
      return predecessorStart + predecessorDuration + link.lagDays;
    case "overlap":
      return predecessorStart + link.lagDays;
    case "blocking_finish":
      return (
        predecessorStart +
        predecessorDuration +
        link.lagDays -
        successorDuration
      );
  }
}

export function calculateCriticalPath(
  tasks: CriticalPathTask[],
  links: CriticalPathLink[],
  calendar: WorkCalendar,
  projectStartDate: string | null,
) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  if (taskById.size !== tasks.length) {
    throw new RangeError("Critical-path input contains duplicate task IDs");
  }
  for (const task of tasks) {
    if (!Number.isSafeInteger(task.durationDays) || task.durationDays < 0) {
      throw new RangeError(`Invalid duration for task ${task.id}`);
    }
  }

  const validLinks = links.filter(
    (link) =>
      taskById.has(link.predecessorId) && taskById.has(link.successorId),
  );
  const successors = new Map<string, CriticalPathLink[]>();
  const predecessors = new Map<string, CriticalPathLink[]>();
  const inDegree = new Map(tasks.map((task) => [task.id, 0]));
  for (const link of validLinks) {
    if (link.predecessorId === link.successorId) {
      throw new RangeError("Critical-path dependency cannot point to itself");
    }
    successors.set(link.predecessorId, [
      ...(successors.get(link.predecessorId) ?? []),
      link,
    ]);
    predecessors.set(link.successorId, [
      ...(predecessors.get(link.successorId) ?? []),
      link,
    ]);
    inDegree.set(link.successorId, (inDegree.get(link.successorId) ?? 0) + 1);
  }

  const queue = tasks.filter((task) => inDegree.get(task.id) === 0);
  const order: CriticalPathTask[] = [];
  while (queue.length) {
    const task = queue.shift();
    if (!task) continue;
    order.push(task);
    for (const link of successors.get(task.id) ?? []) {
      const degree = (inDegree.get(link.successorId) ?? 1) - 1;
      inDegree.set(link.successorId, degree);
      if (degree === 0) {
        const successor = taskById.get(link.successorId);
        if (successor) queue.push(successor);
      }
    }
  }
  if (order.length !== tasks.length) {
    throw new RangeError("Critical-path dependency graph contains a cycle");
  }

  const datedStarts = tasks
    .map((task) => task.startDate)
    .filter((date): date is string => date !== null)
    .sort();
  const anchor = moveToWorkingDay(
    projectStartDate ?? datedStarts[0] ?? new Date().toISOString().slice(0, 10),
    1,
    calendar,
  );
  const earliestStart = new Map<string, number>();
  const earliestFinish = new Map<string, number>();
  for (const task of order) {
    const release = task.startDate
      ? workingDayOffset(anchor, task.startDate, calendar)
      : 0;
    const constrained = (predecessors.get(task.id) ?? []).reduce(
      (start, link) => {
        const predecessor = taskById.get(link.predecessorId);
        if (!predecessor) return start;
        return Math.max(
          start,
          startConstraint(
            link,
            earliestStart.get(predecessor.id) ?? 0,
            predecessor.durationDays,
            task.durationDays,
          ),
        );
      },
      release,
    );
    earliestStart.set(task.id, constrained);
    earliestFinish.set(task.id, constrained + task.durationDays);
  }

  const projectDuration = Math.max(0, ...earliestFinish.values());
  const latestStart = new Map<string, number>();
  const latestFinish = new Map<string, number>();
  for (const task of [...order].reverse()) {
    const following = successors.get(task.id) ?? [];
    const latest =
      following.length === 0
        ? projectDuration - task.durationDays
        : Math.min(
            ...following.map((link) => {
              const successor = taskById.get(link.successorId);
              if (!successor) return projectDuration - task.durationDays;
              const successorLatestStart =
                latestStart.get(successor.id) ?? projectDuration;
              switch (link.type) {
                case "finish_start":
                  return (
                    successorLatestStart - task.durationDays - link.lagDays
                  );
                case "overlap":
                  return successorLatestStart - link.lagDays;
                case "blocking_finish":
                  return (
                    successorLatestStart +
                    successor.durationDays -
                    link.lagDays -
                    task.durationDays
                  );
              }
            }),
          );
    const release = task.startDate
      ? workingDayOffset(anchor, task.startDate, calendar)
      : Number.NEGATIVE_INFINITY;
    latestStart.set(task.id, Math.max(release, latest));
    latestFinish.set(task.id, Math.max(release, latest) + task.durationDays);
  }

  const entries = tasks.map((task): CriticalPathEntry => {
    const early = earliestStart.get(task.id) ?? 0;
    const late = latestStart.get(task.id) ?? early;
    const totalFloat = late - early;
    return {
      taskId: task.id,
      earliestStart: early,
      earliestFinish: earliestFinish.get(task.id) ?? early,
      latestStart: late,
      latestFinish: latestFinish.get(task.id) ?? late,
      totalFloat,
      critical: totalFloat === 0,
    };
  });
  return {
    anchorDate: anchor,
    projectDurationWorkdays: projectDuration,
    forecastFinishDate:
      projectDuration === 0
        ? anchor
        : dateAtOffset(anchor, projectDuration - 1, calendar),
    entries,
  };
}
