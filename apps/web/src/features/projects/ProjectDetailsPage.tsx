import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import {
  projectUpdateSchema,
  type CustomFieldDefinition,
  type ProjectUpdateInput,
} from "@qlcv/shared";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { Card, CardTitle } from "../../components/Card";
import { ConfirmDialog } from "../../components/Dialog";
import { EmptyState } from "../../components/EmptyState";
import { Input } from "../../components/Input";
import { Spinner } from "../../components/Spinner";
import { viMessages } from "../../i18n/vi";
import { ProjectTasksPanel } from "./ProjectTasksPanel";
import { ProjectLabelsPanel } from "./ProjectLabelsPanel";
import { ProjectCalendar } from "./ProjectCalendar";
import { TaskImportPanel } from "./TaskImportPanel";
import { ProjectReportsPanel } from "./ProjectReportsPanel";
import { GuestAccessPanel } from "./GuestAccessPanel";

const t = viMessages.app.projects;

interface ProjectDetails {
  id: string;
  name: string;
  description: string | null;
  branchId: string;
  status: "active" | "on_hold" | "completed" | "archived";
  startDate: string | null;
  dueDate: string | null;
  criticalPathEnabled: boolean;
  autoRescheduleEnabled: boolean;
  baselineEnabled: boolean;
  membersMayExport: boolean;
  workCalendar: { weeklyOff: number[]; holidays: string[] };
  progressMode: "by_count" | "by_workdays" | "manual";
  confidentiality: "normal" | "restricted";
  statusLabels: Record<string, string>;
  customFieldDefinitions: CustomFieldDefinition[];
  branch: { id: string; name: string };
  owner: { id: string; name: string };
  members: Array<{ role: string }>;
}

interface ProjectMember {
  userId: string;
  role: "owner" | "manager" | "member" | "restricted" | "commenter" | "viewer";
  user: { id: string; name: string; email: string; status: string };
}

interface MemberCandidate {
  id: string;
  name: string;
  email: string;
}

interface BranchOption {
  id: string;
  name: string;
}

const weekdays = t.weekdays;
const weekdayIndexes = [1, 2, 3, 4, 5, 6, 0];
const workflowStatuses = ["todo", "doing", "done", "blocked"] as const;
const statusNames: Record<(typeof workflowStatuses)[number], string> = {
  todo: viMessages.status.todo,
  doing: viMessages.status.doing,
  done: viMessages.status.done,
  blocked: viMessages.status.blocked,
};
const projectRoles: ProjectMember["role"][] = [
  "owner",
  "manager",
  "member",
  "restricted",
  "commenter",
  "viewer",
];

function isProjectRole(value: string): value is ProjectMember["role"] {
  return projectRoles.some((role) => role === value);
}

function toDateInput(value: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}

export function ProjectDetailsPage() {
  const { projectId = "" } = useParams();
  const { user, apiFetch } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<"archive" | "delete" | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<ProjectMember | null>(
    null,
  );
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState("");
  const [selectedRole, setSelectedRole] =
    useState<ProjectMember["role"]>("member");
  const [feedback, setFeedback] = useState("");

  const projectQuery = useQuery({
    queryKey: ["projects", projectId],
    queryFn: () => apiFetch<ProjectDetails>(`/projects/${projectId}`),
    enabled: Boolean(projectId),
  });
  const membersQuery = useQuery({
    queryKey: ["projects", projectId, "members"],
    queryFn: () => apiFetch<ProjectMember[]>(`/projects/${projectId}/members`),
    enabled: Boolean(projectId),
  });
  const branchesQuery = useQuery({
    queryKey: ["branches", "available"],
    queryFn: () => apiFetch<BranchOption[]>("/branches/available"),
    enabled: Boolean(projectQuery.data),
  });
  const projectRole = projectQuery.data?.members[0]?.role;
  const canManageProject =
    projectQuery.data?.owner.id === user?.id ||
    projectRole === "owner" ||
    projectRole === "manager" ||
    (user?.systemRole === "branch_director" &&
      projectQuery.data?.confidentiality === "normal" &&
      branchesQuery.data?.some(
        (branch) => branch.id === projectQuery.data?.branchId,
      ));
  const canManageGuests =
    projectQuery.data?.owner.id === user?.id ||
    projectRole === "owner" ||
    projectRole === "manager";
  const canExportProject =
    projectRole === "owner" ||
    projectRole === "manager" ||
    (projectRole === "member" && projectQuery.data?.membersMayExport === true);
  const candidatesQuery = useQuery({
    queryKey: ["projects", projectId, "available-members", memberSearch],
    queryFn: () => {
      const params = new URLSearchParams();
      if (memberSearch.trim()) params.set("search", memberSearch.trim());
      const suffix = params.size ? `?${params.toString()}` : "";
      return apiFetch<MemberCandidate[]>(
        `/projects/${projectId}/available-members${suffix}`,
      );
    },
    enabled: Boolean(projectQuery.data) && Boolean(canManageProject),
  });

  const project = projectQuery.data;
  const criticalPathQuery = useQuery({
    queryKey: ["projects", projectId, "critical-path"],
    queryFn: () =>
      apiFetch<{
        forecastFinishDate: string;
        projectDurationWorkdays: number;
        actualProgressPercent: number | null;
        progressForecastFinishDate: string | null;
        progressForecastMethod: string;
        entries: Array<{
          taskId: string;
          title: string;
          totalFloat: number;
          critical: boolean;
        }>;
      }>(`/projects/${projectId}/tasks/critical-path`),
    enabled: project?.criticalPathEnabled === true,
  });
  const form = useForm<ProjectUpdateInput>({
    resolver: zodResolver(projectUpdateSchema),
    values: project
      ? {
          name: project.name,
          description: project.description ?? "",
          branchId: project.branchId,
          status: project.status,
          startDate: toDateInput(project.startDate),
          dueDate: toDateInput(project.dueDate),
          criticalPathEnabled: project.criticalPathEnabled,
          autoRescheduleEnabled: project.autoRescheduleEnabled,
          baselineEnabled: project.baselineEnabled,
          membersMayExport: project.membersMayExport,
          workCalendar: project.workCalendar,
          progressMode: project.progressMode,
          confidentiality: project.confidentiality,
          statusLabels: {
            todo: project.statusLabels?.todo ?? statusNames.todo,
            doing: project.statusLabels?.doing ?? statusNames.doing,
            done: project.statusLabels?.done ?? statusNames.done,
            blocked: project.statusLabels?.blocked ?? statusNames.blocked,
          },
          customFieldDefinitions: project.customFieldDefinitions ?? [],
        }
      : undefined,
  });

  const invalidateProject = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["projects", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "members"],
      }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: (input: ProjectUpdateInput) =>
      apiFetch(`/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      setFeedback(t.saved);
      void invalidateProject();
    },
    onError: (error: Error) => setFeedback(error.message),
  });
  const addMemberMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/projects/${projectId}/members`, {
        method: "POST",
        body: JSON.stringify({
          userId: selectedCandidate,
          role: selectedRole,
        }),
      }),
    onSuccess: async () => {
      setSelectedCandidate("");
      setFeedback(t.memberAdded);
      await invalidateProject();
      await queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "available-members"],
      });
    },
    onError: (error: Error) => setFeedback(error.message),
  });
  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      apiFetch(`/projects/${projectId}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      setFeedback(t.roleUpdated);
      void invalidateProject();
    },
    onError: (error: Error) => setFeedback(error.message),
  });
  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/projects/${projectId}/members/${userId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      setMemberToRemove(null);
      setFeedback(t.memberRemoved);
      void invalidateProject();
    },
    onError: (error: Error) => {
      setMemberToRemove(null);
      setFeedback(error.message);
    },
  });
  const archiveMutation = useMutation({
    mutationFn: (status: "active" | "archived") =>
      status === "active"
        ? apiFetch(`/projects/${projectId}`, {
            method: "PATCH",
            body: JSON.stringify({ status }),
          })
        : apiFetch(`/projects/${projectId}/archive`, { method: "POST" }),
    onSuccess: () => {
      setDialog(null);
      setFeedback(t.archiveUpdated);
      void invalidateProject();
    },
    onError: (error: Error) => {
      setDialog(null);
      setFeedback(error.message);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/projects/${projectId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      navigate("/du-an", { replace: true });
    },
    onError: (error: Error) => {
      setDialog(null);
      setFeedback(error.message);
    },
  });
  const cloneMutation = useMutation({
    mutationFn: () =>
      apiFetch<ProjectDetails>(`/projects/${projectId}/clone`, {
        method: "POST",
        body: JSON.stringify({ includeMembers: false, includeFiles: false }),
      }),
    onSuccess: (clone) => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      navigate(`/du-an/${clone.id}`);
    },
    onError: (error: Error) => setFeedback(error.message),
  });

  if (projectQuery.isLoading) {
    return (
      <div className="flex min-h-128 items-center justify-center gap-8">
        <Spinner />
        <span role="status">{t.loading}</span>
      </div>
    );
  }
  if (projectQuery.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-12">
        <h1 className="text-2xl font-bold">{t.loadFailed}</h1>
        <p>{projectQuery.error.message}</p>
        <Button onClick={() => void projectQuery.refetch()}>{t.retry}</Button>
      </div>
    );
  }
  if (!project) {
    return <EmptyState title={t.notFound} />;
  }

  const canManage = canManageProject;
  const successMessages: string[] = [
    t.saved,
    t.memberAdded,
    t.roleUpdated,
    t.memberRemoved,
    t.archiveUpdated,
  ];
  const successFeedback = successMessages.includes(feedback);
  const savedInput = form.handleSubmit((value) => {
    setFeedback("");
    saveMutation.mutate(value);
  });
  const setWeekday = (day: number, checked: boolean) => {
    const days = form.getValues("workCalendar.weeklyOff") ?? [];
    form.setValue(
      "workCalendar.weeklyOff",
      checked ? [...days, day].sort() : days.filter((value) => value !== day),
      { shouldDirty: true, shouldValidate: true },
    );
  };
  const customFieldDefinitions = form.watch("customFieldDefinitions") ?? [];
  const setCustomFieldDefinitions = (fields: CustomFieldDefinition[]) => {
    form.setValue("customFieldDefinitions", fields, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  return (
    <section className="flex flex-col gap-16">
      <header className="flex flex-wrap items-start justify-between gap-12">
        <div>
          <p className="text-sm text-text-secondary">
            {project.branch.name} · {project.owner.name}
          </p>
          <h1 className="text-2xl font-bold">{project.name}</h1>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-8">
            <Button
              onClick={() => cloneMutation.mutate()}
              loading={cloneMutation.isPending}
            >
              {t.clone}
            </Button>
            {project.status === "archived" ? (
              <Button
                onClick={() => archiveMutation.mutate("active")}
                loading={archiveMutation.isPending}
              >
                {t.restore}
              </Button>
            ) : (
              <Button onClick={() => setDialog("archive")}>{t.archive}</Button>
            )}
            <Button variant="danger" onClick={() => setDialog("delete")}>
              {t.delete}
            </Button>
          </div>
        ) : null}
      </header>
      {feedback ? (
        <p role={successFeedback ? "status" : "alert"} className="text-sm">
          {feedback}
        </p>
      ) : null}
      <form onSubmit={savedInput} className="flex flex-col gap-16">
        <Card>
          <CardTitle as="h2">{t.generalSettings}</CardTitle>
          <div className="mt-16 grid gap-16 md:grid-cols-2">
            <Input
              label={t.projectName}
              required
              disabled={!canManage}
              {...form.register("name")}
              error={form.formState.errors.name?.message}
            />
            <label className="flex flex-col gap-4 text-sm font-medium">
              {t.branch}
              <select
                {...form.register("branchId")}
                disabled={!canManage}
                className="min-h-touch rounded-md border border-border-default bg-surface-base px-12 disabled:opacity-60"
              >
                {branchesQuery.data?.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
                {!branchesQuery.data?.some(
                  (branch) => branch.id === project.branchId,
                ) ? (
                  <option value={project.branchId}>
                    {project.branch.name}
                  </option>
                ) : null}
              </select>
              {branchesQuery.isError ? (
                <span role="alert" className="text-sm text-status-danger">
                  {t.loadBranchesFailed}{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => void branchesQuery.refetch()}
                  >
                    {t.retry}
                  </button>
                </span>
              ) : null}
            </label>
            <label className="flex flex-col gap-4 text-sm font-medium md:col-span-2">
              {t.description}
              <textarea
                {...form.register("description")}
                disabled={!canManage}
                rows={3}
                className="rounded-md border border-border-default bg-surface-base p-12 text-md disabled:opacity-60"
              />
            </label>
            <Input
              label={t.startDate}
              type="date"
              disabled={!canManage}
              {...form.register("startDate", {
                setValueAs: (value: string) => value || null,
              })}
            />
            <Input
              label={t.dueDate}
              type="date"
              disabled={!canManage}
              {...form.register("dueDate", {
                setValueAs: (value: string) => value || null,
              })}
              error={form.formState.errors.dueDate?.message}
            />
            <label className="flex flex-col gap-4 text-sm font-medium">
              {t.projectStatus}
              {project.status === "archived" ? (
                <span className="min-h-touch content-center rounded-md border border-border-default bg-surface-muted px-12">
                  {t.status.archived}
                </span>
              ) : (
                <select
                  {...form.register("status")}
                  disabled={!canManage}
                  className="min-h-touch rounded-md border border-border-default bg-surface-base px-12 disabled:opacity-60"
                >
                  <option value="active">{t.status.active}</option>
                  <option value="on_hold">{t.status.onHold}</option>
                  <option value="completed">{t.status.completed}</option>
                </select>
              )}
            </label>
            <label className="flex flex-col gap-4 text-sm font-medium">
              {t.progressMode}
              <select
                {...form.register("progressMode")}
                disabled={!canManage}
                className="min-h-touch rounded-md border border-border-default bg-surface-base px-12 disabled:opacity-60"
              >
                <option value="by_workdays">{t.byWorkdays}</option>
                <option value="by_count">{t.byCount}</option>
                <option value="manual">{t.manual}</option>
              </select>
            </label>
            <label className="flex items-start gap-8 text-sm md:col-span-2">
              <input
                type="checkbox"
                {...form.register("criticalPathEnabled")}
                disabled={!canManage}
              />
              <span>
                <span className="block font-medium">Bật tính đường găng</span>
                <span className="mt-4 block text-text-secondary">
                  Mặc định tắt. Ước tính theo thời lượng, quan hệ phụ thuộc và
                  lịch ngày làm việc; các việc thiếu thời lượng được tính là 0.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-8 text-sm md:col-span-2">
              <input
                type="checkbox"
                {...form.register("autoRescheduleEnabled")}
                disabled={!canManage}
              />
              <span>
                <span className="block font-medium">Bật tự dời lịch</span>
                <span className="mt-4 block text-text-secondary">
                  Mặc định tắt. Chỉ các quan hệ finish-to-start được đánh dấu tự
                  dời mới tham gia; luôn xem trước trước khi áp dụng.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-8 text-sm md:col-span-2">
              <input
                type="checkbox"
                {...form.register("baselineEnabled")}
                disabled={!canManage}
              />
              <span>
                <span className="block font-medium">Bật lưu baseline</span>
                <span className="mt-4 block text-text-secondary">
                  Mặc định tắt. Lưu nhiều ảnh chụp kế hoạch để so sánh ngày và
                  tiến độ.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-8 text-sm md:col-span-2">
              <input
                type="checkbox"
                {...form.register("membersMayExport")}
                disabled={!canManage}
              />
              <span>
                <span className="block font-medium">
                  Cho phép thành viên xuất dữ liệu
                </span>
                <span className="mt-4 block text-text-secondary">
                  Mặc định tắt. Dự án mật vẫn cần phiếu xuất dữ liệu được duyệt.
                </span>
              </span>
            </label>
            <label className="flex flex-col gap-4 text-sm font-medium">
              {t.confidentiality}
              <select
                {...form.register("confidentiality")}
                disabled={!canManage}
                className="min-h-touch rounded-md border border-border-default bg-surface-base px-12 disabled:opacity-60"
              >
                <option value="normal">{t.normal}</option>
                <option value="restricted">{t.restricted}</option>
              </select>
            </label>
            <fieldset className="flex flex-col gap-8">
              <legend className="text-sm font-medium">{t.statusLabel}</legend>
              {workflowStatuses.map((status) => (
                <label key={status} className="grid grid-cols-2 gap-4">
                  <span className="self-center text-text-secondary">
                    {statusNames[status]}
                  </span>
                  <input
                    {...form.register(`statusLabels.${status}`)}
                    disabled={!canManage}
                    className="min-h-touch rounded-md border border-border-default bg-surface-base px-12 disabled:opacity-60"
                  />
                  {form.formState.errors.statusLabels?.[status]?.message ? (
                    <span className="col-span-2 text-sm text-status-danger">
                      {form.formState.errors.statusLabels[status].message}
                    </span>
                  ) : null}
                </label>
              ))}
            </fieldset>
            <fieldset className="flex flex-col gap-8">
              <legend className="text-sm font-medium">{t.weeklyOff}</legend>
              <div className="flex flex-wrap gap-x-12 gap-y-4">
                {weekdayIndexes.map((day, index) => (
                  <label
                    key={day}
                    className="inline-flex min-h-touch items-center gap-8"
                  >
                    <input
                      type="checkbox"
                      disabled={!canManage}
                      checked={
                        form.watch("workCalendar.weeklyOff")?.includes(day) ??
                        false
                      }
                      onChange={(event) =>
                        setWeekday(day, event.currentTarget.checked)
                      }
                    />
                    {weekdays[index]}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex flex-col gap-4 text-sm font-medium">
              {t.holidays}
              <textarea
                value={(form.watch("workCalendar.holidays") ?? []).join("\n")}
                disabled={!canManage}
                onChange={(event) =>
                  form.setValue(
                    "workCalendar.holidays",
                    event.currentTarget.value
                      .split(/\r?\n/)
                      .map((value) => value.trim())
                      .filter(Boolean),
                    { shouldDirty: true, shouldValidate: true },
                  )
                }
                rows={3}
                aria-label={t.holidays}
                className="rounded-md border border-border-default bg-surface-base p-12 text-md disabled:opacity-60"
              />
              {form.formState.errors.workCalendar?.holidays ? (
                <span className="text-status-danger">{t.invalidHoliday}</span>
              ) : null}
            </label>
          </div>
          {canManage ? (
            <Button
              type="submit"
              variant="primary"
              loading={saveMutation.isPending}
              className="mt-16"
            >
              {t.save}
            </Button>
          ) : (
            <p className="mt-16 text-sm text-text-secondary">{t.viewOnly}</p>
          )}
        </Card>
        <Card>
          <CardTitle as="h2">Trường tùy chỉnh</CardTitle>
          <p className="mt-8 text-sm text-text-secondary">
            Định nghĩa trường áp dụng cho việc trong dự án. Trường và tùy chọn
            đang được sử dụng không thể bị xóa.
          </p>
          <div className="mt-12 flex flex-col gap-12">
            {customFieldDefinitions.map((field, index) => (
              <fieldset
                key={`${field.key}-${index}`}
                className="grid gap-8 rounded-md border border-border-default p-12 md:grid-cols-2"
              >
                <legend className="px-4 text-sm font-medium">
                  Trường {index + 1}
                </legend>
                <Input
                  label="Mã trường"
                  value={field.key}
                  disabled={!canManage}
                  onChange={(event) => {
                    const next = [...customFieldDefinitions];
                    next[index] = {
                      ...field,
                      key: event.currentTarget.value,
                    };
                    setCustomFieldDefinitions(next);
                  }}
                  error={
                    form.formState.errors.customFieldDefinitions?.[index]?.key
                      ?.message
                  }
                />
                <Input
                  label="Tên hiển thị"
                  value={field.label}
                  disabled={!canManage}
                  onChange={(event) => {
                    const next = [...customFieldDefinitions];
                    next[index] = {
                      ...field,
                      label: event.currentTarget.value,
                    };
                    setCustomFieldDefinitions(next);
                  }}
                  error={
                    form.formState.errors.customFieldDefinitions?.[index]?.label
                      ?.message
                  }
                />
                <label className="flex flex-col gap-4 text-sm font-medium">
                  Kiểu dữ liệu
                  <select
                    value={field.type}
                    disabled={!canManage}
                    onChange={(event) => {
                      const type = event.currentTarget
                        .value as CustomFieldDefinition["type"];
                      const next = [...customFieldDefinitions];
                      next[index] = {
                        ...field,
                        type,
                        ...(type === "select" ? { options: [] } : {}),
                      };
                      if (type !== "select") delete next[index].options;
                      setCustomFieldDefinitions(next);
                    }}
                    className="min-h-touch rounded-md border border-border-default bg-surface-base px-12 disabled:opacity-60"
                  >
                    <option value="text">Văn bản</option>
                    <option value="number">Số</option>
                    <option value="date">Ngày</option>
                    <option value="select">Danh sách lựa chọn</option>
                    <option value="boolean">Đúng/Sai</option>
                    <option value="user">Thành viên</option>
                    <option value="url">Đường dẫn</option>
                  </select>
                </label>
                {field.type === "select" ? (
                  <Input
                    label="Các lựa chọn (phân cách bằng dấu phẩy)"
                    value={field.options?.join(", ") ?? ""}
                    disabled={!canManage}
                    onChange={(event) => {
                      const next = [...customFieldDefinitions];
                      next[index] = {
                        ...field,
                        options: event.currentTarget.value
                          .split(",")
                          .map((option) => option.trim())
                          .filter(Boolean),
                      };
                      setCustomFieldDefinitions(next);
                    }}
                    error={
                      form.formState.errors.customFieldDefinitions?.[index]
                        ?.options?.message
                    }
                  />
                ) : null}
                <label className="inline-flex min-h-touch items-center gap-8 text-sm">
                  <input
                    type="checkbox"
                    checked={field.required ?? false}
                    disabled={!canManage}
                    onChange={(event) => {
                      const next = [...customFieldDefinitions];
                      next[index] = {
                        ...field,
                        required: event.currentTarget.checked,
                      };
                      setCustomFieldDefinitions(next);
                    }}
                  />
                  Bắt buộc nhập
                </label>
                <p className="self-center text-sm text-text-secondary">
                  {field.hidden ? "Ẩn — giá trị hiện có được giữ lại" : "Hiện"}
                </p>
                {canManage ? (
                  <Button
                    type="button"
                    onClick={() => {
                      const next = [...customFieldDefinitions];
                      next[index] = { ...field, hidden: !field.hidden };
                      setCustomFieldDefinitions(next);
                    }}
                  >
                    {field.hidden ? "Hiện trường" : "Ẩn trường"}
                  </Button>
                ) : null}
              </fieldset>
            ))}
          </div>
          {canManage ? (
            <Button
              type="button"
              className="mt-12"
              disabled={customFieldDefinitions.length >= 50}
              onClick={() =>
                setCustomFieldDefinitions([
                  ...customFieldDefinitions,
                  {
                    key: `field_${customFieldDefinitions.length + 1}`,
                    label: "",
                    type: "text",
                    required: false,
                  },
                ])
              }
            >
              Thêm trường
            </Button>
          ) : null}
        </Card>
      </form>

      <ProjectTasksPanel
        projectId={projectId}
        canManage={Boolean(canManage)}
        definitions={project.customFieldDefinitions ?? []}
      />
      <TaskImportPanel projectId={projectId} canManage={Boolean(canManage)} />
      {canManageGuests ? (
        <GuestAccessPanel
          projectId={projectId}
          restricted={project.confidentiality === "restricted"}
        />
      ) : null}
      <ProjectCalendar projectId={projectId} canManage={Boolean(canManage)} />
      <ProjectReportsPanel
        projectId={projectId}
        canManage={Boolean(canManage)}
        canExport={Boolean(canExportProject)}
        isRestricted={project.confidentiality === "restricted"}
      />
      {project.criticalPathEnabled ? (
        <Card>
          <CardTitle as="h2">Đường găng và dự báo</CardTitle>
          {criticalPathQuery.isLoading ? <Spinner /> : null}
          {criticalPathQuery.isError ? (
            <p role="alert" className="mt-8">
              {criticalPathQuery.error.message}
            </p>
          ) : null}
          {criticalPathQuery.data ? (
            <>
              <p className="mt-8 text-sm text-text-secondary">
                Hoàn thành ước tính: {criticalPathQuery.data.forecastFinishDate}{" "}
                · {criticalPathQuery.data.projectDurationWorkdays} ngày làm
                việc. Chỉ là tính toán CPM theo các quan hệ đã khai báo, không
                phải dự báo tiến độ thực tế.
              </p>
              <p className="mt-4 text-sm text-text-secondary">
                Tiến độ thực tế có trọng số:{" "}
                {criticalPathQuery.data.actualProgressPercent === null
                  ? "chưa đủ dữ liệu"
                  : `${criticalPathQuery.data.actualProgressPercent}%`}
                {" · "}Dự báo theo tiến độ:{" "}
                {criticalPathQuery.data.progressForecastFinishDate ??
                  "chưa đủ dữ liệu"}
                . {criticalPathQuery.data.progressForecastMethod}
              </p>
              <ul className="mt-12 divide-y divide-border-default">
                {criticalPathQuery.data.entries.map((entry) => (
                  <li
                    key={entry.taskId}
                    className="flex flex-wrap justify-between gap-8 py-8"
                  >
                    <span>
                      {entry.title}
                      {entry.critical ? " · Đường găng" : ""}
                    </span>
                    <span className="text-sm text-text-secondary">
                      Dự trữ: {entry.totalFloat} ngày làm việc
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Card>
      ) : null}
      <ProjectLabelsPanel
        projectId={projectId}
        canManage={Boolean(canManage)}
      />

      <Card>
        <CardTitle as="h2">{t.members}</CardTitle>
        {membersQuery.isLoading ? <Spinner /> : null}
        {membersQuery.isError ? (
          <div role="alert" className="mt-12 flex items-center gap-8">
            <span>{t.loadMembersFailed}</span>
            <Button onClick={() => void membersQuery.refetch()}>
              {t.retry}
            </Button>
          </div>
        ) : null}
        <ul className="mt-12 divide-y divide-border-default">
          {membersQuery.data?.map((member) => (
            <li
              key={member.userId}
              className="flex flex-wrap items-center justify-between gap-8 py-8"
            >
              <div>
                <p className="font-medium">{member.user.name}</p>
                <p className="text-sm text-text-secondary">
                  {member.user.email}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-8">
                {canManage ? (
                  <select
                    aria-label={t.memberRoleFor(member.user.name)}
                    value={member.role}
                    disabled={member.role === "owner" || roleMutation.isPending}
                    onChange={(event) =>
                      roleMutation.mutate({
                        userId: member.userId,
                        role: event.currentTarget.value,
                      })
                    }
                    className="min-h-touch rounded-md border border-border-default bg-surface-base px-8"
                  >
                    {Object.entries(t.memberRoles).map(([value, name]) => (
                      <option key={value} value={value}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm">{t.memberRoles[member.role]}</span>
                )}
                {canManage && member.role !== "owner" ? (
                  <Button
                    variant="danger"
                    onClick={() => setMemberToRemove(member)}
                  >
                    {t.removeMember}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        {canManage ? (
          <div className="mt-16 flex flex-col gap-12 border-t border-border-default pt-16">
            <CardTitle as="h3">{t.inviteMember}</CardTitle>
            <div className="grid gap-12 sm:grid-cols-3">
              <Input
                label={t.searchMembers}
                value={memberSearch}
                onChange={(event) => setMemberSearch(event.currentTarget.value)}
              />
              <label className="flex flex-col gap-4 text-sm font-medium">
                {t.candidate}
                <select
                  value={selectedCandidate}
                  onChange={(event) =>
                    setSelectedCandidate(event.currentTarget.value)
                  }
                  className="min-h-touch rounded-md border border-border-default bg-surface-base px-8"
                >
                  <option value="">{t.selectCandidate}</option>
                  {candidatesQuery.data?.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name} ({candidate.email})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-4 text-sm font-medium">
                {t.memberRole}
                <select
                  value={selectedRole}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    if (isProjectRole(value)) setSelectedRole(value);
                  }}
                  className="min-h-touch rounded-md border border-border-default bg-surface-base px-8"
                >
                  {Object.entries(t.memberRoles).map(([value, name]) => (
                    <option key={value} value={value}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {candidatesQuery.isError ? (
              <div role="alert" className="flex items-center gap-8">
                <span>{t.candidatesFailed}</span>
                <Button onClick={() => void candidatesQuery.refetch()}>
                  {t.retry}
                </Button>
              </div>
            ) : null}
            <div>
              <Button
                variant="primary"
                disabled={!selectedCandidate}
                loading={addMemberMutation.isPending}
                onClick={() => addMemberMutation.mutate()}
              >
                {t.addMember}
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      {canManage ? (
        <ConfirmDialog
          open={dialog === "archive"}
          onOpenChange={(open) => setDialog(open ? "archive" : null)}
          title={t.confirmArchiveTitle}
          description={t.confirmArchiveDescription}
          confirmLabel={t.archive}
          danger
          loading={archiveMutation.isPending}
          onConfirm={() => archiveMutation.mutate("archived")}
        />
      ) : null}
      {canManage ? (
        <ConfirmDialog
          open={dialog === "delete"}
          onOpenChange={(open) => setDialog(open ? "delete" : null)}
          title={t.confirmDeleteTitle}
          description={t.confirmDeleteDescription}
          confirmLabel={t.delete}
          danger
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
        />
      ) : null}
      {canManage ? (
        <ConfirmDialog
          open={Boolean(memberToRemove)}
          onOpenChange={(open) => {
            if (!open) setMemberToRemove(null);
          }}
          title={t.confirmRemoveTitle}
          description={t.confirmRemoveDescription(
            memberToRemove?.user.name ?? "",
          )}
          confirmLabel={t.removeMember}
          danger
          loading={removeMemberMutation.isPending}
          onConfirm={() => {
            if (memberToRemove)
              removeMemberMutation.mutate(memberToRemove.userId);
          }}
        />
      ) : null}
    </section>
  );
}
