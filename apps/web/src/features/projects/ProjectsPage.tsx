import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import type { FormEvent } from "react";
import { projectCreateSchema, type ProjectCreateInput } from "@qlcv/shared";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { Card, CardTitle } from "../../components/Card";
import { Dialog } from "../../components/Dialog";
import { EmptyState } from "../../components/EmptyState";
import { Input } from "../../components/Input";
import { Spinner } from "../../components/Spinner";
import { viMessages } from "../../i18n/vi";
import { TaskImportPanel } from "./TaskImportPanel";

const t = viMessages.app.projects;
const pageSize = 20;

interface BranchOption {
  id: string;
  name: string;
}

interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "on_hold" | "completed" | "archived";
  dueDate: string | null;
  branch: BranchOption;
  owner: { id: string; name: string };
  stats: {
    taskCount: number;
    overdueTaskCount: number;
    completionPercent: number;
  };
}

interface ProjectListResponse {
  items: ProjectSummary[];
  page: number;
  pageSize: number;
  total: number;
}

interface ProjectCandidate {
  id: string;
  name: string;
  email: string;
}

interface ProjectTemplateOption {
  id: string;
  name: string;
  kind: "project" | "task";
  status: "draft" | "pending_approval" | "published";
}

const statusNames: Record<ProjectSummary["status"], string> = {
  active: t.status.active,
  on_hold: t.status.onHold,
  completed: t.status.completed,
  archived: t.status.archived,
};

function useProjectList() {
  const { apiFetch } = useAuth();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [branchId, setBranchId] = useState("");
  const [status, setStatus] = useState("");
  const [mine, setMine] = useState(false);
  const [layout, setLayout] = useState<"cards" | "table">("cards");
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    sort: "createdAt",
    order: "desc",
  });
  if (search) params.set("search", search);
  if (branchId) params.set("branchId", branchId);
  if (status) params.set("status", status);
  if (mine) params.set("mine", "true");

  const projectsQuery = useQuery({
    queryKey: ["projects", page, search, branchId, status, mine],
    queryFn: () =>
      apiFetch<ProjectListResponse>(`/projects?${params.toString()}`),
    placeholderData: (previous) => previous,
  });
  const branchesQuery = useQuery({
    queryKey: ["branches", "available"],
    queryFn: () => apiFetch<BranchOption[]>("/branches/available"),
  });

  return {
    page,
    setPage,
    searchInput,
    setSearchInput,
    setSearch,
    branchId,
    setBranchId,
    status,
    setStatus,
    mine,
    setMine,
    layout,
    setLayout,
    projectsQuery,
    branchesQuery,
  };
}

function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <Card className="flex flex-col gap-12">
      <div className="flex items-start justify-between gap-12">
        <div className="min-w-0">
          <CardTitle as="h2">
            <Link
              to={`/du-an/${project.id}`}
              className="rounded-sm text-brand-primary underline-offset-4 hover:underline"
            >
              {project.name}
            </Link>
          </CardTitle>
          <p className="mt-4 text-sm text-text-secondary">
            {project.branch.name} · {project.owner.name}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-surface-muted px-8 py-4 text-xs">
          {statusNames[project.status]}
        </span>
      </div>
      {project.description ? (
        <p className="line-clamp-2 text-sm text-text-secondary">
          {project.description}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-x-16 gap-y-8 text-sm">
        <span>
          {t.progress}: {project.stats.completionPercent}%
        </span>
        <span>
          {t.taskCount}: {project.stats.taskCount}
        </span>
        <span className="text-status-danger">
          {t.overdue}: {project.stats.overdueTaskCount}
        </span>
        <span className="text-text-secondary">
          {t.dueDate}: {formatDate(project.dueDate)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${t.progress}: ${project.stats.completionPercent}%`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={project.stats.completionPercent}
        className="h-8 overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className="h-full bg-brand-primary"
          style={{ width: `${project.stats.completionPercent}%` }}
        />
      </div>
    </Card>
  );
}

function formatDate(value: string | null): string {
  if (!value) return t.noDueDate;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00+07:00`));
}

function ProjectWizard({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (project: ProjectSummary) => void;
}) {
  const { apiFetch } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [startingContent, setStartingContent] = useState<
    "empty" | "template" | "import"
  >("empty");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [memberRole, setMemberRole] = useState("member");
  const [memberSearch, setMemberSearch] = useState("");
  const [serverError, setServerError] = useState("");
  const [inviting, setInviting] = useState(false);
  const form = useForm<ProjectCreateInput>({
    resolver: zodResolver(projectCreateSchema),
    defaultValues: {
      branchId: "",
      name: "",
      description: "",
      workCalendar: { weeklyOff: [0, 6], holidays: [] },
      progressMode: "by_workdays",
      confidentiality: "normal",
    },
  });
  const branchesQuery = useQuery({
    queryKey: ["branches", "available"],
    queryFn: () => apiFetch<BranchOption[]>("/branches/available"),
    enabled: open,
  });
  const templatesQuery = useQuery({
    queryKey: ["templates", "project-wizard"],
    queryFn: () => apiFetch<ProjectTemplateOption[]>("/templates"),
    enabled: open && step === 2,
  });
  const candidatesQuery = useQuery({
    queryKey: ["projects", project?.id, "available-members", memberSearch],
    queryFn: () => {
      const params = new URLSearchParams();
      if (memberSearch.trim()) params.set("search", memberSearch.trim());
      const suffix = params.size ? `?${params.toString()}` : "";
      return apiFetch<ProjectCandidate[]>(
        `/projects/${project?.id}/available-members${suffix}`,
      );
    },
    enabled: open && step === 3 && Boolean(project),
  });

  const createProject = form.handleSubmit(async (values) => {
    setServerError("");
    try {
      const created = project
        ? await apiFetch<ProjectSummary>(`/projects/${project.id}`, {
            method: "PATCH",
            body: JSON.stringify(values),
          })
        : await apiFetch<ProjectSummary>("/projects", {
            method: "POST",
            body: JSON.stringify(values),
          });
      setProject(created);
      setStep(3);
      onCreated(created);
      if (!project && selectedTemplateId) {
        try {
          await apiFetch(`/templates/${selectedTemplateId}/apply`, {
            method: "POST",
            body: JSON.stringify({
              projectId: created.id,
              ...(values.startDate ? { startDate: values.startDate } : {}),
            }),
          });
        } catch (error) {
          setServerError(
            error instanceof Error
              ? `Đã tạo dự án nhưng chưa nạp được mẫu: ${error.message}`
              : "Đã tạo dự án nhưng chưa nạp được mẫu.",
          );
        }
      }
      await queryClient.invalidateQueries({
        queryKey: ["projects", created.id, "available-members"],
      });
    } catch (error) {
      setServerError(error instanceof Error ? error.message : t.createFailed);
    }
  });

  const goToMemberStep = async () => {
    setServerError("");
    const valid = await form.trigger([
      "branchId",
      "name",
      "description",
      "startDate",
      "dueDate",
      "workCalendar.weeklyOff",
      "workCalendar.holidays",
    ]);
    if (valid) setStep(2);
  };

  const addSelectedMembers = async () => {
    if (!project) return;
    setServerError("");
    const addedIds: string[] = [];
    setInviting(true);
    try {
      for (const userId of selectedIds) {
        try {
          await apiFetch(`/projects/${project.id}/members`, {
            method: "POST",
            body: JSON.stringify({ userId, role: memberRole }),
          });
          addedIds.push(userId);
        } catch (error) {
          setSelectedIds((ids) => ids.filter((id) => !addedIds.includes(id)));
          setServerError(
            addedIds.length
              ? t.invitePartial(
                  addedIds.length,
                  error instanceof Error ? error.message : t.inviteFailed,
                )
              : error instanceof Error
                ? error.message
                : t.inviteFailed,
          );
          await queryClient.invalidateQueries({
            queryKey: ["projects", project.id, "available-members"],
          });
          return;
        }
      }
      await queryClient.invalidateQueries({
        queryKey: ["projects", project.id, "members"],
      });
      finish();
    } catch (error) {
      setSelectedIds((ids) => ids.filter((id) => !addedIds.includes(id)));
      setServerError(error instanceof Error ? error.message : t.inviteFailed);
    } finally {
      setInviting(false);
    }
  };

  const finish = () => {
    if (!project) return;
    onOpenChange(false);
    navigate(`/du-an/${project.id}`);
  };

  const setWeekday = (day: number, checked: boolean) => {
    const days = form.getValues("workCalendar.weeklyOff") ?? [];
    form.setValue(
      "workCalendar.weeklyOff",
      checked ? [...days, day].sort() : days.filter((value) => value !== day),
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const close = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setStep(1);
      setProject(null);
      setStartingContent("empty");
      setSelectedTemplateId("");
      setSelectedIds([]);
      setServerError("");
      form.reset();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={t.wizardTitle}
      description={t.wizardStep(step)}
      footer={
        <>
          {step === 1 ? (
            <>
              <Button onClick={() => close(false)}>{t.cancel}</Button>
              <Button variant="primary" onClick={() => void goToMemberStep()}>
                {t.next}
              </Button>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <Button onClick={() => setStep(1)}>{t.back}</Button>
              <Button
                variant="primary"
                loading={form.formState.isSubmitting}
                disabled={startingContent === "template" && !selectedTemplateId}
                onClick={() => void createProject()}
              >
                {project ? t.saveAndContinue : t.createAndContinue}
              </Button>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <Button disabled={inviting} onClick={() => setStep(2)}>
                {t.back}
              </Button>
              <Button disabled={inviting} onClick={finish}>
                {t.skipMembers}
              </Button>
              <Button
                variant="primary"
                loading={inviting}
                disabled={!selectedIds.length}
                onClick={() => void addSelectedMembers()}
              >
                {t.inviteSelected(selectedIds.length)}
              </Button>
            </>
          ) : null}
        </>
      }
    >
      {step === 1 ? (
        <div className="flex flex-col gap-16">
          <label className="flex flex-col gap-4 text-sm font-medium">
            {t.branch}
            <select
              {...form.register("branchId", {
                onChange: () => setSelectedIds([]),
              })}
              aria-invalid={Boolean(form.formState.errors.branchId)}
              aria-describedby={
                form.formState.errors.branchId
                  ? "project-branch-error"
                  : undefined
              }
              className="min-h-touch rounded-md border border-border-default bg-surface-base px-12"
            >
              <option value="">{t.selectBranch}</option>
              {branchesQuery.data?.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            {branchesQuery.isError ? (
              <span role="alert">
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
            {form.formState.errors.branchId ? (
              <span id="project-branch-error" className="text-status-danger">
                {t.fieldRequired}
              </span>
            ) : null}
          </label>
          <Input
            label={t.projectName}
            required
            autoFocus
            error={form.formState.errors.name?.message}
            {...form.register("name")}
          />
          <label className="flex flex-col gap-4 text-sm font-medium">
            {t.description}
            <textarea
              {...form.register("description")}
              rows={3}
              className="rounded-md border border-border-default bg-surface-base p-12 text-md"
            />
          </label>
          <div className="grid gap-12 sm:grid-cols-2">
            <Input
              label={t.startDate}
              type="date"
              {...form.register("startDate", {
                setValueAs: (value: string) => value || undefined,
              })}
            />
            <Input
              label={t.dueDate}
              type="date"
              {...form.register("dueDate", {
                setValueAs: (value: string) => value || undefined,
              })}
              error={form.formState.errors.dueDate?.message}
            />
          </div>
          <fieldset className="flex flex-col gap-8">
            <legend className="mb-4 text-sm font-medium">{t.weeklyOff}</legend>
            <div className="flex flex-wrap gap-x-12 gap-y-4">
              {t.weekdays.map((day, index) => (
                <label
                  key={day}
                  className="inline-flex min-h-touch items-center gap-8"
                >
                  <input
                    type="checkbox"
                    checked={form
                      .watch("workCalendar.weeklyOff")
                      ?.includes(index)}
                    onChange={(event) =>
                      setWeekday(index, event.currentTarget.checked)
                    }
                  />
                  {day}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-4 text-sm font-medium">
            {t.holidays}
            <textarea
              value={(form.watch("workCalendar.holidays") ?? []).join("\n")}
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
              rows={2}
              placeholder="YYYY-MM-DD"
              aria-label={t.holidays}
              className="rounded-md border border-border-default bg-surface-base p-12 text-md"
            />
            {form.formState.errors.workCalendar?.holidays ? (
              <span className="text-status-danger">{t.invalidHoliday}</span>
            ) : null}
          </label>
        </div>
      ) : null}
      {step === 2 ? (
        <div className="flex flex-col gap-16">
          <fieldset className="flex flex-col gap-8">
            <legend className="text-md font-semibold">
              {t.startingContent}
            </legend>
            <label className="flex min-h-touch items-center gap-8 rounded-md border border-brand-primary bg-surface-base p-12">
              <input
                type="radio"
                name="project-content"
                checked={startingContent === "empty"}
                onChange={() => {
                  setStartingContent("empty");
                  setSelectedTemplateId("");
                }}
              />
              <span>{t.emptyProject}</span>
            </label>
            <label className="flex min-h-touch items-center gap-8 rounded-md border border-border-default bg-surface-base p-12">
              <input
                type="radio"
                name="project-content"
                checked={startingContent === "template"}
                onChange={() => setStartingContent("template")}
              />
              <span>{t.fromTemplate}</span>
            </label>
            <label className="flex min-h-touch items-center gap-8 rounded-md border border-border-default bg-surface-base p-12">
              <input
                type="radio"
                name="project-content"
                checked={startingContent === "import"}
                onChange={() => {
                  setStartingContent("import");
                  setSelectedTemplateId("");
                }}
              />
              <span>{t.importData}</span>
            </label>
            {startingContent === "template" ? (
              <label className="flex flex-col gap-4 text-sm font-medium">
                Mẫu dự án
                <select
                  value={selectedTemplateId}
                  onChange={(event) =>
                    setSelectedTemplateId(event.currentTarget.value)
                  }
                  className="min-h-touch rounded-md border border-border-default bg-surface-base px-12"
                  required
                >
                  <option value="">-- Chọn mẫu đã công bố --</option>
                  {templatesQuery.data
                    ?.filter(
                      (template) =>
                        template.kind === "project" &&
                        template.status === "published",
                    )
                    .map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                </select>
                {templatesQuery.isError ? (
                  <span role="alert">{templatesQuery.error.message}</span>
                ) : null}
                {!templatesQuery.isLoading &&
                templatesQuery.data?.filter(
                  (template) =>
                    template.kind === "project" &&
                    template.status === "published",
                ).length === 0 ? (
                  <span className="text-sm text-text-secondary">
                    Chưa có mẫu dự án được công bố.
                  </span>
                ) : null}
              </label>
            ) : null}
          </fieldset>
          <label className="flex flex-col gap-4 text-sm font-medium">
            {t.progressMode}
            <select
              {...form.register("progressMode")}
              className="min-h-touch rounded-md border border-border-default bg-surface-base px-12"
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
              className="min-h-touch rounded-md border border-border-default bg-surface-base px-12"
            >
              <option value="normal">{t.normal}</option>
              <option value="restricted">{t.restricted}</option>
            </select>
          </label>
        </div>
      ) : null}
      {step === 3 ? (
        <div className="flex flex-col gap-12">
          <p className="text-sm text-text-secondary">{t.membersOptional}</p>
          {startingContent === "import" && project ? (
            <TaskImportPanel projectId={project.id} canManage />
          ) : null}
          {serverError ? (
            <p role="alert" className="text-sm text-status-danger">
              {serverError}
            </p>
          ) : null}
          <Input
            label={t.searchMembers}
            value={memberSearch}
            onChange={(event) => setMemberSearch(event.currentTarget.value)}
          />
          <label className="flex flex-col gap-4 text-sm font-medium">
            {t.memberRole}
            <select
              value={memberRole}
              onChange={(event) => setMemberRole(event.currentTarget.value)}
              className="min-h-touch rounded-md border border-border-default bg-surface-base px-12"
            >
              <option value="manager">{t.memberRoles.manager}</option>
              <option value="member">{t.memberRoles.member}</option>
              <option value="restricted">{t.memberRoles.restricted}</option>
              <option value="commenter">{t.memberRoles.commenter}</option>
              <option value="viewer">{t.memberRoles.viewer}</option>
            </select>
          </label>
          {candidatesQuery.isLoading ? <Spinner /> : null}
          {candidatesQuery.isError ? (
            <div role="alert" className="flex flex-wrap items-center gap-8">
              <span>{t.candidatesFailed}</span>
              <Button onClick={() => void candidatesQuery.refetch()}>
                {t.retry}
              </Button>
            </div>
          ) : null}
          {candidatesQuery.data?.length ? (
            <ul className="max-h-56 overflow-y-auto">
              {candidatesQuery.data.map((candidate) => (
                <li key={candidate.id}>
                  <label className="flex min-h-touch items-center gap-8 border-b border-border-default">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(candidate.id)}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setSelectedIds((ids) =>
                          checked
                            ? [...ids, candidate.id]
                            : ids.filter((id) => id !== candidate.id),
                        );
                      }}
                    />
                    <span>
                      {candidate.name}{" "}
                      <span className="text-sm text-text-secondary">
                        {candidate.email}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : candidatesQuery.isSuccess ? (
            <EmptyState
              title={t.noCandidates}
              description={t.noCandidatesHint}
            />
          ) : null}
        </div>
      ) : null}
      {serverError && step !== 3 ? (
        <p role="alert" className="mt-12 text-sm text-status-danger">
          {serverError}
        </p>
      ) : null}
    </Dialog>
  );
}

export function ProjectsPage() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const queryClient = useQueryClient();
  const projects = useProjectList();
  const rows = projects.projectsQuery.data?.items ?? [];
  const total = projects.projectsQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    projects.setSearch(projects.searchInput.trim());
    projects.setPage(1);
  };

  const createAction = (
    <Button variant="primary" onClick={() => setWizardOpen(true)}>
      {t.create}
    </Button>
  );

  return (
    <section className="flex flex-col gap-16">
      <header className="flex flex-wrap items-start justify-between gap-12">
        <div>
          <h1 className="text-2xl font-bold">{t.title}</h1>
          <p className="mt-4 text-text-secondary">{t.subtitle}</p>
        </div>
        {projects.projectsQuery.isError || rows.length > 0
          ? createAction
          : null}
      </header>
      <form
        onSubmit={submitSearch}
        className="grid gap-12 rounded-lg border border-border-default bg-surface-raised p-12 sm:grid-cols-2 lg:grid-cols-5"
      >
        <Input
          label={t.search}
          value={projects.searchInput}
          onChange={(event) =>
            projects.setSearchInput(event.currentTarget.value)
          }
        />
        <label className="flex flex-col gap-4 text-sm font-medium">
          {t.branch}
          <select
            value={projects.branchId}
            onChange={(event) => {
              projects.setBranchId(event.currentTarget.value);
              projects.setPage(1);
            }}
            className="min-h-touch rounded-md border border-border-default bg-surface-base px-12"
          >
            <option value="">{t.allBranches}</option>
            {projects.branchesQuery.data?.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
        {projects.branchesQuery.isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-8">
            <span>{t.loadBranchesFailed}</span>
            <Button onClick={() => void projects.branchesQuery.refetch()}>
              {t.retry}
            </Button>
          </div>
        ) : null}
        <label className="flex flex-col gap-4 text-sm font-medium">
          {t.statusLabel}
          <select
            value={projects.status}
            onChange={(event) => {
              projects.setStatus(event.currentTarget.value);
              projects.setPage(1);
            }}
            className="min-h-touch rounded-md border border-border-default bg-surface-base px-12"
          >
            <option value="">{t.allStatuses}</option>
            {Object.entries(statusNames).map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-touch items-center gap-8 text-sm">
          <input
            type="checkbox"
            checked={projects.mine}
            onChange={(event) => {
              projects.setMine(event.currentTarget.checked);
              projects.setPage(1);
            }}
          />
          {t.mine}
        </label>
        <div className="flex items-end gap-8">
          <Button type="submit" variant="primary">
            {t.search}
          </Button>
          <Button
            type="button"
            onClick={() => projects.setLayout("cards")}
            aria-pressed={projects.layout === "cards"}
          >
            {t.cards}
          </Button>
          <Button
            type="button"
            onClick={() => projects.setLayout("table")}
            aria-pressed={projects.layout === "table"}
          >
            {t.table}
          </Button>
        </div>
      </form>

      {projects.projectsQuery.isLoading ? (
        <div className="flex min-h-128 items-center justify-center gap-8">
          <Spinner />
          <span role="status">{t.loading}</span>
        </div>
      ) : null}
      {projects.projectsQuery.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-8">
          <span>{t.loadFailed}</span>
          <Button onClick={() => void projects.projectsQuery.refetch()}>
            {t.retry}
          </Button>
        </div>
      ) : null}
      {projects.projectsQuery.isSuccess && rows.length === 0 ? (
        <EmptyState
          title={t.empty}
          description={t.emptyHint}
          action={createAction}
        />
      ) : null}
      {projects.projectsQuery.isSuccess && rows.length > 0 ? (
        projects.layout === "cards" ? (
          <div className="grid gap-12 md:grid-cols-2">
            {rows.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border-default">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-surface-muted">
                <tr>
                  <th scope="col" className="p-12">
                    {t.projectName}
                  </th>
                  <th scope="col" className="p-12">
                    {t.branch}
                  </th>
                  <th scope="col" className="p-12">
                    {t.statusLabel}
                  </th>
                  <th scope="col" className="p-12">
                    {t.progress}
                  </th>
                  <th scope="col" className="p-12">
                    {t.overdue}
                  </th>
                  <th scope="col" className="p-12">
                    {t.dueDate}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((project) => (
                  <tr
                    key={project.id}
                    className="border-t border-border-default"
                  >
                    <th scope="row" className="p-12 font-medium">
                      <Link
                        to={`/du-an/${project.id}`}
                        className="text-brand-primary underline-offset-4 hover:underline"
                      >
                        {project.name}
                      </Link>
                    </th>
                    <td className="p-12">{project.branch.name}</td>
                    <td className="p-12">{statusNames[project.status]}</td>
                    <td className="p-12">{project.stats.completionPercent}%</td>
                    <td className="p-12">{project.stats.overdueTaskCount}</td>
                    <td className="p-12">{formatDate(project.dueDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
      {total > 0 ? (
        <nav
          aria-label={t.pagination}
          className="flex flex-wrap items-center justify-between gap-8"
        >
          <span className="text-sm text-text-secondary">
            {t.resultCount(total)}
          </span>
          <div className="flex items-center gap-8">
            <Button
              disabled={projects.page <= 1}
              onClick={() => projects.setPage((value) => value - 1)}
            >
              {t.previous}
            </Button>
            <span aria-live="polite">
              {t.pageCount(projects.page, pageCount)}
            </span>
            <Button
              disabled={projects.page >= pageCount}
              onClick={() => projects.setPage((value) => value + 1)}
            >
              {t.next}
            </Button>
          </div>
        </nav>
      ) : null}
      <ProjectWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: ["projects"] });
        }}
      />
    </section>
  );
}
