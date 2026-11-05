import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { projectUpdateSchema, type ProjectUpdateInput } from "@qlcv/shared";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { Card, CardTitle } from "../../components/Card";
import { ConfirmDialog } from "../../components/Dialog";
import { EmptyState } from "../../components/EmptyState";
import { Input } from "../../components/Input";
import { Spinner } from "../../components/Spinner";
import { viMessages } from "../../i18n/vi";

const t = viMessages.app.projects;

interface ProjectDetails {
  id: string;
  name: string;
  description: string | null;
  branchId: string;
  status: "active" | "on_hold" | "completed" | "archived";
  startDate: string | null;
  dueDate: string | null;
  workCalendar: { weeklyOff: number[]; holidays: string[] };
  progressMode: "by_count" | "by_workdays" | "manual";
  confidentiality: "normal" | "restricted";
  statusLabels: Record<string, string>;
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
    projectRole === "owner" ||
    projectRole === "manager" ||
    (user?.systemRole === "branch_director" &&
      projectQuery.data?.confidentiality === "normal" &&
      branchesQuery.data?.some(
        (branch) => branch.id === projectQuery.data?.branchId,
      ));
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
          workCalendar: project.workCalendar,
          progressMode: project.progressMode,
          confidentiality: project.confidentiality,
          statusLabels: {
            todo: project.statusLabels?.todo ?? statusNames.todo,
            doing: project.statusLabels?.doing ?? statusNames.doing,
            done: project.statusLabels?.done ?? statusNames.done,
            blocked: project.statusLabels?.blocked ?? statusNames.blocked,
          },
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
      </form>

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
