import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { Card, CardTitle } from "../../components/Card";
import { todayIso } from "../../lib/date";

type Frequency = "daily" | "weekly" | "monthly" | "quarterly" | "working_day";

interface CalendarTask {
  id: string;
  version: number;
  title: string;
  type: "group" | "task" | "milestone";
  startDate: string | null;
  dueDate: string | null;
  assigneeId: string | null;
  recurrenceSeriesId: string | null;
  recurrenceIndex: number | null;
  labelIds: string[];
}

interface ScheduleChange {
  id: string;
  title: string;
  previousStartDate: string | null;
  previousDueDate: string | null;
  startDate: string | null;
  dueDate: string | null;
}

interface SchedulePreview {
  previewToken: string;
  changes: ScheduleChange[];
}

interface Member {
  userId: string;
  user: { name: string };
}

interface ProjectLabel {
  id: string;
  name: string;
}

function addDays(date: string, count: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}

function startOfWeek(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  const mondayOffset = (value.getUTCDay() + 6) % 7;
  return addDays(date, -mondayOffset);
}

function buildDates(anchor: string, mode: "month" | "week"): string[] {
  if (mode === "week") {
    const first = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, index) => addDays(first, index));
  }
  const firstOfMonth = `${anchor.slice(0, 7)}-01`;
  const first = startOfWeek(firstOfMonth);
  return Array.from({ length: 42 }, (_, index) => addDays(first, index));
}

function displayDate(date: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

export function ProjectCalendar({
  projectId,
  canManage,
}: {
  projectId: string;
  canManage: boolean;
}) {
  const { apiFetch } = useAuth();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"month" | "week">("month");
  const [anchor, setAnchor] = useState(todayIso());
  const [assigneeId, setAssigneeId] = useState("");
  const [labelId, setLabelId] = useState("");
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [until, setUntil] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [weekdays, setWeekdays] = useState<number[]>([1]);
  const [count, setCount] = useState(4);
  const [feedback, setFeedback] = useState("");
  const [editingOccurrence, setEditingOccurrence] =
    useState<CalendarTask | null>(null);
  const [seriesTitle, setSeriesTitle] = useState("");
  const [editingSingleOccurrence, setEditingSingleOccurrence] =
    useState<CalendarTask | null>(null);
  const [singleTitle, setSingleTitle] = useState("");
  const [schedulePreview, setSchedulePreview] =
    useState<SchedulePreview | null>(null);
  const [scheduleUndoToken, setScheduleUndoToken] = useState("");

  const tasksQuery = useQuery({
    queryKey: ["projects", projectId, "tasks", "calendar"],
    queryFn: () =>
      apiFetch<{ items: CalendarTask[] }>(
        `/projects/${projectId}/tasks?page=1&pageSize=200`,
      ),
  });
  const membersQuery = useQuery({
    queryKey: ["projects", projectId, "members"],
    queryFn: () => apiFetch<Member[]>(`/projects/${projectId}/members`),
  });
  const labelsQuery = useQuery({
    queryKey: ["projects", projectId, "labels"],
    queryFn: () => apiFetch<ProjectLabel[]>(`/projects/${projectId}/labels`),
  });
  const refreshTasks = async () =>
    queryClient.invalidateQueries({
      queryKey: ["projects", projectId, "tasks"],
    });
  const moveTaskMutation = useMutation({
    mutationFn: ({ task, date }: { task: CalendarTask; date: string }) =>
      apiFetch<SchedulePreview>(
        `/projects/${projectId}/tasks/schedule/preview/${task.id}`,
        {
          method: "POST",
          body: JSON.stringify({ version: task.version, dueDate: date }),
        },
      ),
    onSuccess: (preview) => {
      setSchedulePreview(preview);
      setScheduleUndoToken("");
      setFeedback(
        `Xem trước ${preview.changes.length} việc sẽ thay đổi. Chưa áp dụng lịch.`,
      );
    },
    onError: (error: Error) => setFeedback(error.message),
  });
  const applyScheduleMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ updated: number; undoToken: string }>(
        `/projects/${projectId}/tasks/schedule/apply`,
        {
          method: "POST",
          body: JSON.stringify({ undoToken: schedulePreview?.previewToken }),
        },
      ),
    onSuccess: async (result) => {
      setSchedulePreview(null);
      setScheduleUndoToken(result.undoToken);
      setFeedback(
        `Đã dời ${result.updated} việc. Có thể hoàn tác trong 10 phút.`,
      );
      await refreshTasks();
    },
    onError: (error: Error) => setFeedback(error.message),
  });
  const undoScheduleMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ restored: number }>(
        `/projects/${projectId}/tasks/schedule/undo`,
        {
          method: "POST",
          body: JSON.stringify({ undoToken: scheduleUndoToken }),
        },
      ),
    onSuccess: async (result) => {
      setScheduleUndoToken("");
      setFeedback(`Đã hoàn tác lịch cho ${result.restored} việc.`);
      await refreshTasks();
    },
    onError: (error: Error) => setFeedback(error.message),
  });
  const createRecurrenceMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ created: number }>(`/projects/${projectId}/tasks/recurring`, {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          startDate,
          ...(until ? { until } : {}),
          count,
          checklist: [],
          rule: {
            frequency,
            interval: 1,
            ...(frequency === "weekly" ? { weekdays } : {}),
          },
        }),
      }),
    onSuccess: async (result) => {
      setTitle("");
      setFeedback(`Đã tạo ${result.created} kỳ việc.`);
      await refreshTasks();
    },
    onError: (error: Error) => setFeedback(error.message),
  });
  const updateFutureMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ updated: number }>(
        `/projects/${projectId}/tasks/${editingOccurrence?.id}/recurrence/future`,
        {
          method: "PATCH",
          body: JSON.stringify({ title: seriesTitle.trim() }),
        },
      ),
    onSuccess: async (result: { updated: number }) => {
      setEditingOccurrence(null);
      setFeedback(`Đã sửa ${result.updated} kỳ từ kỳ đang chọn trở đi.`);
      await refreshTasks();
    },
    onError: (error: Error) => setFeedback(error.message),
  });
  const updateSingleMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/projects/${projectId}/tasks/${editingSingleOccurrence?.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          version: editingSingleOccurrence?.version,
          title: singleTitle.trim(),
        }),
      }),
    onSuccess: async () => {
      setEditingSingleOccurrence(null);
      setFeedback("Đã sửa riêng kỳ việc này.");
      await refreshTasks();
    },
    onError: (error: Error) => setFeedback(error.message),
  });

  const dates = useMemo(() => buildDates(anchor, mode), [anchor, mode]);
  const tasksByDate = useMemo(() => {
    const grouped = new Map<string, CalendarTask[]>();
    for (const task of tasksQuery.data?.items ?? []) {
      if (
        task.type === "group" ||
        !task.dueDate ||
        (assigneeId && task.assigneeId !== assigneeId) ||
        (labelId && !task.labelIds.includes(labelId))
      ) {
        continue;
      }
      const date = task.dueDate.slice(0, 10);
      grouped.set(date, [...(grouped.get(date) ?? []), task]);
    }
    return grouped;
  }, [assigneeId, labelId, tasksQuery.data]);

  const shift = (direction: -1 | 1) => {
    const next = new Date(`${anchor}T00:00:00.000Z`);
    if (mode === "month") {
      next.setUTCDate(1);
      next.setUTCMonth(next.getUTCMonth() + direction);
    } else {
      next.setUTCDate(next.getUTCDate() + direction * 7);
    }
    setAnchor(next.toISOString().slice(0, 10));
  };

  const submitRecurrence = (event: React.FormEvent) => {
    event.preventDefault();
    setFeedback("");
    createRecurrenceMutation.mutate();
  };

  return (
    <Card>
      <CardTitle as="h2">Lịch dự án</CardTitle>
      <div className="mt-12 flex flex-wrap items-center gap-8">
        <Button onClick={() => shift(-1)} aria-label="Khoảng thời gian trước">
          Trước
        </Button>
        <Button onClick={() => setAnchor(todayIso())}>Hôm nay</Button>
        <Button onClick={() => shift(1)} aria-label="Khoảng thời gian sau">
          Sau
        </Button>
        <div role="group" aria-label="Kiểu lịch" className="flex gap-4">
          {(["month", "week"] as const).map((value) => (
            <Button
              key={value}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {value === "month" ? "Tháng" : "Tuần"}
            </Button>
          ))}
        </div>
        <label className="flex items-center gap-8 text-sm">
          Lọc theo người
          <select
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.currentTarget.value)}
            className="min-h-touch rounded-md border border-border-default bg-surface-base px-8"
          >
            <option value="">Tất cả</option>
            {membersQuery.data?.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.user.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-8 text-sm">
          Lọc theo nhãn
          <select
            value={labelId}
            onChange={(event) => setLabelId(event.currentTarget.value)}
            className="min-h-touch rounded-md border border-border-default bg-surface-base px-8"
          >
            <option value="">Tất cả</option>
            {labelsQuery.data?.map((label) => (
              <option key={label.id} value={label.id}>
                {label.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {tasksQuery.isError ? (
        <p role="alert" className="mt-8">
          {tasksQuery.error.message}
        </p>
      ) : null}
      {tasksQuery.isLoading ? (
        <p role="status" className="mt-8">
          Đang tải lịch…
        </p>
      ) : (
        <ol
          aria-label="Các ngày trong lịch"
          className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-7"
        >
          {dates.map((date) => (
            <li
              key={date}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const taskId = event.dataTransfer.getData("text/plain");
                const task = tasksQuery.data?.items.find(
                  (item) => item.id === taskId,
                );
                if (task && canManage) {
                  moveTaskMutation.mutate({ task, date });
                }
              }}
              className="min-h-28 rounded-md border border-border-default p-8"
            >
              <h3 className="font-semibold">{displayDate(date)}</h3>
              <ul className="mt-4 space-y-4">
                {(tasksByDate.get(date) ?? []).map((task) => (
                  <li
                    key={task.id}
                    draggable={canManage}
                    onDragStart={(event) =>
                      event.dataTransfer.setData("text/plain", task.id)
                    }
                    className="rounded border border-border-default bg-surface-muted p-8"
                  >
                    <p className="wrap-break-word text-sm">{task.title}</p>
                    {canManage ? (
                      <label className="mt-4 flex flex-wrap items-center gap-4 text-xs">
                        Hạn
                        <input
                          aria-label={`Đổi hạn: ${task.title}`}
                          type="date"
                          value={task.dueDate?.slice(0, 10) ?? ""}
                          onChange={(event) => {
                            if (event.currentTarget.value) {
                              moveTaskMutation.mutate({
                                task,
                                date: event.currentTarget.value,
                              });
                            }
                          }}
                          className="min-h-touch rounded border border-border-default bg-surface-base px-4"
                        />
                      </label>
                    ) : null}
                    {task.recurrenceSeriesId !== null && canManage ? (
                      <div className="mt-4 flex flex-col gap-4">
                        <Button
                          className="w-full text-xs"
                          onClick={() => {
                            setEditingSingleOccurrence(task);
                            setSingleTitle(task.title);
                          }}
                        >
                          Sửa riêng kỳ này
                        </Button>
                        <Button
                          className="w-full text-xs"
                          onClick={() => {
                            setEditingOccurrence(task);
                            setSeriesTitle(task.title);
                          }}
                        >
                          Sửa từ kỳ này trở đi
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
      {editingOccurrence ? (
        <form
          className="mt-12 flex flex-wrap items-end gap-8"
          onSubmit={(event) => {
            event.preventDefault();
            updateFutureMutation.mutate();
          }}
        >
          <label className="flex min-w-56 flex-col gap-4 text-sm font-medium">
            Tên việc cho kỳ đã chọn và các kỳ sau
            <input
              required
              maxLength={500}
              value={seriesTitle}
              onChange={(event) => setSeriesTitle(event.currentTarget.value)}
              className="min-h-touch rounded-md border border-border-default bg-surface-base px-8"
            />
          </label>
          <Button
            type="submit"
            variant="primary"
            loading={updateFutureMutation.isPending}
          >
            Áp dụng từ kỳ này
          </Button>
          <Button onClick={() => setEditingOccurrence(null)}>Hủy</Button>
        </form>
      ) : null}
      {editingSingleOccurrence ? (
        <form
          className="mt-12 flex flex-wrap items-end gap-8"
          onSubmit={(event) => {
            event.preventDefault();
            updateSingleMutation.mutate();
          }}
        >
          <label className="flex min-w-56 flex-col gap-4 text-sm font-medium">
            Tên riêng cho kỳ đã chọn
            <input
              required
              maxLength={500}
              value={singleTitle}
              onChange={(event) => setSingleTitle(event.currentTarget.value)}
              className="min-h-touch rounded-md border border-border-default bg-surface-base px-8"
            />
          </label>
          <Button
            type="submit"
            variant="primary"
            loading={updateSingleMutation.isPending}
          >
            Lưu riêng kỳ này
          </Button>
          <Button onClick={() => setEditingSingleOccurrence(null)}>Hủy</Button>
        </form>
      ) : null}
      {canManage ? (
        <form
          className="mt-16 grid gap-8 border-t border-border-default pt-12 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={submitRecurrence}
        >
          <label className="flex flex-col gap-4 text-sm font-medium">
            Việc lặp
            <input
              required
              maxLength={500}
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              className="min-h-touch rounded-md border border-border-default bg-surface-base px-8"
            />
          </label>
          <label className="flex flex-col gap-4 text-sm font-medium">
            Kỳ đầu
            <input
              required
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.currentTarget.value)}
              className="min-h-touch rounded-md border border-border-default bg-surface-base px-8"
            />
          </label>
          <label className="flex flex-col gap-4 text-sm font-medium">
            Lặp theo
            <select
              value={frequency}
              onChange={(event) =>
                setFrequency(event.currentTarget.value as Frequency)
              }
              className="min-h-touch rounded-md border border-border-default bg-surface-base px-8"
            >
              <option value="daily">Ngày</option>
              <option value="weekly">Tuần</option>
              <option value="monthly">Tháng</option>
              <option value="quarterly">Quý</option>
              <option value="working_day">Ngày làm việc</option>
            </select>
          </label>
          <label className="flex flex-col gap-4 text-sm font-medium">
            Số kỳ (tối đa 52)
            <input
              required
              type="number"
              min={1}
              max={52}
              value={count}
              onChange={(event) => setCount(Number(event.currentTarget.value))}
              className="min-h-touch rounded-md border border-border-default bg-surface-base px-8"
            />
          </label>
          <label className="flex flex-col gap-4 text-sm font-medium">
            Dừng trước ngày (không bắt buộc)
            <input
              type="date"
              min={startDate}
              value={until}
              onChange={(event) => setUntil(event.currentTarget.value)}
              className="min-h-touch rounded-md border border-border-default bg-surface-base px-8"
            />
          </label>
          {frequency === "weekly" ? (
            <fieldset className="sm:col-span-2 lg:col-span-4">
              <legend className="text-sm font-medium">Thứ trong tuần</legend>
              <div className="mt-4 flex flex-wrap gap-8">
                {["CN", "T2", "T3", "T4", "T5", "T6", "T7"].map(
                  (label, day) => (
                    <label
                      key={day}
                      className="flex min-h-touch items-center gap-4"
                    >
                      <input
                        type="checkbox"
                        checked={weekdays.includes(day)}
                        onChange={(event) =>
                          setWeekdays((current) =>
                            event.currentTarget.checked
                              ? [...current, day].sort()
                              : current.filter((value) => value !== day),
                          )
                        }
                      />
                      {label}
                    </label>
                  ),
                )}
              </div>
            </fieldset>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            disabled={
              !title.trim() ||
              !startDate ||
              !count ||
              (frequency === "weekly" && !weekdays.length)
            }
            loading={createRecurrenceMutation.isPending}
            className="sm:col-span-2 lg:col-span-4"
          >
            Tạo các kỳ lặp
          </Button>
        </form>
      ) : null}
      {feedback ? (
        <p role="status" className="mt-8">
          {feedback}
        </p>
      ) : null}
      {schedulePreview ? (
        <section
          aria-label="Xem trước thay đổi lịch"
          className="mt-12 rounded-md border border-border-default p-12"
        >
          <h3 className="font-semibold">Xem trước tự dời lịch</h3>
          <ul className="mt-8 space-y-4 text-sm">
            {schedulePreview.changes.map((change) => (
              <li key={change.id}>
                {change.title}: {change.previousStartDate ?? "—"} –{" "}
                {change.previousDueDate ?? "—"} → {change.startDate ?? "—"} –{" "}
                {change.dueDate ?? "—"}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex gap-8">
            <Button
              variant="primary"
              loading={applyScheduleMutation.isPending}
              onClick={() => applyScheduleMutation.mutate()}
            >
              Áp dụng lịch
            </Button>
            <Button onClick={() => setSchedulePreview(null)}>Hủy</Button>
          </div>
        </section>
      ) : null}
      {scheduleUndoToken ? (
        <Button
          className="mt-8"
          loading={undoScheduleMutation.isPending}
          onClick={() => undoScheduleMutation.mutate()}
        >
          Hoàn tác tự dời lịch
        </Button>
      ) : null}
    </Card>
  );
}
