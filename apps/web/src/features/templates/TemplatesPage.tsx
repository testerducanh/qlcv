import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { Card, CardTitle } from "../../components/Card";
import { Input } from "../../components/Input";

interface TemplateListItem {
  id: string;
  name: string;
  description: string | null;
  kind: "project" | "task";
  ownership: "personal" | "department" | "branch" | "company";
  status: "draft" | "pending_approval" | "published";
  currentVersion: number;
  tags: string[];
  _count: { usages: number };
}

interface TemplateVersion {
  id: string;
  version: number;
  content: unknown;
}

interface TemplateDetails extends TemplateListItem {
  createdById: string;
  versions: TemplateVersion[];
}

interface ProjectOption {
  id: string;
  name: string;
}

interface ApprovalFlowOption {
  id: string;
  name: string;
  requestType: string;
  enabled: boolean;
}

function getTemplateRoles(value: unknown): string[] {
  if (!value || typeof value !== "object" || !("tasks" in value)) return [];
  const roles = new Set<string>();
  const visit = (nodes: unknown) => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      if ("role" in node && typeof node.role === "string") roles.add(node.role);
      if ("children" in node) visit(node.children);
    }
  };
  visit(value.tasks);
  return [...roles].sort((a, b) => a.localeCompare(b));
}

const starterContent = JSON.stringify(
  {
    tasks: [
      {
        title: "Nhóm việc mới",
        type: "group",
        checklist: [],
        children: [
          {
            title: "Công việc mới",
            type: "task",
            checklist: [],
            children: [],
          },
        ],
      },
    ],
  },
  null,
  2,
);

function formatContent(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function TemplatesPage() {
  const { apiFetch, user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"project" | "task">("project");
  const [ownership, setOwnership] = useState<"personal" | "company">(
    "personal",
  );
  const [createContent, setCreateContent] = useState(starterContent);
  const [editContent, setEditContent] = useState("");
  const [applyProjectId, setApplyProjectId] = useState("");
  const [startDate, setStartDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [roleAssignments, setRoleAssignments] = useState<
    Record<string, string>
  >({});
  const [approvalProjectId, setApprovalProjectId] = useState("");
  const [flowId, setFlowId] = useState("");
  const [feedback, setFeedback] = useState("");
  const isAdmin = user?.systemRole === "system_admin";
  const listQuery = useQuery({
    queryKey: ["templates"],
    queryFn: () => apiFetch<TemplateListItem[]>("/templates"),
  });
  const projectsQuery = useQuery({
    queryKey: ["projects", "template-options"],
    queryFn: () =>
      apiFetch<{ items: ProjectOption[] }>("/projects?page=1&pageSize=200"),
  });
  const membersQuery = useQuery({
    queryKey: ["projects", applyProjectId, "members"],
    queryFn: () =>
      apiFetch<{ userId: string; user: { name: string } }[]>(
        `/projects/${applyProjectId}/members`,
      ),
    enabled: Boolean(applyProjectId),
  });
  const selectedProjectQuery = useQuery({
    queryKey: ["templates", selectedId],
    queryFn: () => apiFetch<TemplateDetails>(`/templates/${selectedId}`),
    enabled: Boolean(selectedId),
  });
  const flowsQuery = useQuery({
    queryKey: ["projects", approvalProjectId, "approval-flows"],
    queryFn: () =>
      apiFetch<ApprovalFlowOption[]>(
        `/projects/${approvalProjectId}/approval-flows`,
      ),
    enabled: Boolean(approvalProjectId),
  });
  const selected = selectedProjectQuery.data;
  const currentContent = selected?.versions.find(
    (version) => version.version === selected.currentVersion,
  )?.content;
  const templateRoles = useMemo(
    () => getTemplateRoles(currentContent),
    [currentContent],
  );
  useEffect(() => {
    if (currentContent !== undefined)
      setEditContent(formatContent(currentContent));
  }, [selectedId, currentContent]);
  const contentError = useMemo(() => {
    if (!selected) return null;
    const current = selected.versions.find(
      (version) => version.version === selected.currentVersion,
    );
    return current ? null : "Không tìm thấy phiên bản hiện hành.";
  }, [selected]);
  const refresh = async () =>
    queryClient.invalidateQueries({ queryKey: ["templates"] });
  const createMutation = useMutation({
    mutationFn: async () => {
      let parsedContent: unknown;
      try {
        parsedContent = JSON.parse(createContent) as unknown;
      } catch {
        throw new Error("Nội dung mẫu phải là JSON hợp lệ.");
      }
      return apiFetch<TemplateDetails>("/templates", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          kind,
          ownership,
          tags: ["Gợi ý, cần phòng chuyên môn rà soát"],
          content: parsedContent,
        }),
      });
    },
    onSuccess: async (created) => {
      setName("");
      setDescription("");
      setFeedback("Đã tạo mẫu nháp.");
      setSelectedId(created.id);
      await refresh();
    },
    onError: (error: Error) => setFeedback(error.message),
  });
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Chưa chọn mẫu.");
      let parsedContent: unknown;
      try {
        parsedContent = JSON.parse(editContent) as unknown;
      } catch {
        throw new Error("Nội dung mẫu phải là JSON hợp lệ.");
      }
      return apiFetch<TemplateDetails>(`/templates/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: selected.name,
          description: selected.description,
          content: parsedContent,
        }),
      });
    },
    onSuccess: async (updated) => {
      setFeedback(`Đã tạo phiên bản ${updated.currentVersion}.`);
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({
          queryKey: ["templates", updated.id],
        }),
      ]);
    },
    onError: (error: Error) => setFeedback(error.message),
  });
  const publishMutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Chưa chọn mẫu.");
      return apiFetch(`/templates/${selected.id}/request-publication`, {
        method: "POST",
        body: JSON.stringify(
          selected.ownership === "personal"
            ? {}
            : { projectId: approvalProjectId, flowId },
        ),
      });
    },
    onSuccess: async () => {
      setFeedback(
        selected?.ownership === "personal"
          ? "Đã công bố mẫu cá nhân."
          : "Đã gửi yêu cầu công bố qua luồng duyệt.",
      );
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({
          queryKey: ["templates", selectedId],
        }),
      ]);
    },
    onError: (error: Error) => setFeedback(error.message),
  });
  const applyMutation = useMutation({
    mutationFn: () => {
      if (!selected || !applyProjectId) {
        throw new Error("Chọn dự án cần nạp mẫu.");
      }
      return apiFetch<{ taskCount: number }>(
        `/templates/${selected.id}/apply`,
        {
          method: "POST",
          body: JSON.stringify({
            projectId: applyProjectId,
            startDate,
            roleAssignments: Object.fromEntries(
              Object.entries(roleAssignments).filter(([, userId]) => userId),
            ),
          }),
        },
      );
    },
    onSuccess: async (result) => {
      setFeedback(`Đã nạp ${result.taskCount} việc vào dự án.`);
      await refresh();
    },
    onError: (error: Error) => setFeedback(error.message),
  });
  const flows =
    flowsQuery.data?.filter(
      (flow) => flow.enabled && flow.requestType === "template_publish",
    ) ?? [];

  return (
    <section className="flex flex-col gap-16">
      <header>
        <h1 className="text-2xl font-bold">Thư viện mẫu</h1>
        <p className="mt-4 text-sm text-text-secondary">
          Mẫu chỉ chứa cấu trúc gợi ý; kiểm tra nội dung trước khi nạp vào dự
          án.
        </p>
      </header>
      {feedback ? <p role="status">{feedback}</p> : null}
      {listQuery.isError ? <p role="alert">{listQuery.error.message}</p> : null}
      {projectsQuery.isError ? (
        <p role="alert">{projectsQuery.error.message}</p>
      ) : null}
      {selectedProjectQuery.isError ? (
        <p role="alert">{selectedProjectQuery.error.message}</p>
      ) : null}
      <div className="grid gap-16 xl:grid-cols-2">
        <Card>
          <CardTitle as="h2">Mẫu có thể dùng</CardTitle>
          {listQuery.data?.length ? (
            <ul className="mt-12 divide-y divide-border-default">
              {listQuery.data.map((template) => (
                <li key={template.id} className="py-8">
                  <button
                    type="button"
                    aria-current={
                      template.id === selectedId ? "true" : undefined
                    }
                    onClick={() => {
                      setSelectedId(template.id);
                      setRoleAssignments({});
                      setFeedback("");
                    }}
                    className="w-full rounded-md p-8 text-left hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-brand-primary"
                  >
                    <span className="block font-medium">{template.name}</span>
                    <span className="mt-4 block text-sm text-text-secondary">
                      {template.ownership} · {template.status} · v
                      {template.currentVersion} · đã dùng{" "}
                      {template._count.usages} lần
                    </span>
                    {template.description ? (
                      <span className="mt-4 block text-sm text-text-secondary">
                        {template.description}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-12 text-sm text-text-secondary">
              {listQuery.isLoading ? "Đang tải mẫu..." : "Chưa có mẫu."}
            </p>
          )}
        </Card>

        <div className="flex flex-col gap-16">
          {selected ? (
            <Card>
              <CardTitle as="h2">{selected.name}</CardTitle>
              <p className="mt-8 text-sm text-text-secondary">
                Trạng thái: {selected.status} · Phiên bản hiện hành: v
                {selected.currentVersion}
              </p>
              {contentError ? (
                <p role="alert" className="mt-8">
                  {contentError}
                </p>
              ) : null}
              {selected.createdById === user?.id || isAdmin ? (
                <>
                  <label className="mt-12 flex flex-col gap-4 text-sm font-medium">
                    Nội dung mẫu JSON (ngày, người và tệp thật không được chấp
                    nhận)
                    <textarea
                      value={editContent}
                      onChange={(event) =>
                        setEditContent(event.currentTarget.value)
                      }
                      rows={16}
                      spellCheck={false}
                      className="rounded-md border border-border-default bg-surface-base p-12 font-mono text-sm"
                    />
                  </label>
                  <Button
                    className="mt-8"
                    loading={updateMutation.isPending}
                    onClick={() => updateMutation.mutate()}
                  >
                    Lưu thành phiên bản mới
                  </Button>
                  <div className="mt-16 grid gap-8 md:grid-cols-2">
                    <label className="flex flex-col gap-4 text-sm font-medium">
                      Dự án yêu cầu duyệt
                      <select
                        value={approvalProjectId}
                        onChange={(event) => {
                          setApprovalProjectId(event.currentTarget.value);
                          setFlowId("");
                        }}
                        className="min-h-touch rounded-md border border-border-default bg-surface-base px-12"
                      >
                        <option value="">-- Chọn dự án --</option>
                        {projectsQuery.data?.items.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {selected.ownership !== "personal" ? (
                      <label className="flex flex-col gap-4 text-sm font-medium">
                        Luồng duyệt công bố
                        <select
                          value={flowId}
                          onChange={(event) =>
                            setFlowId(event.currentTarget.value)
                          }
                          className="min-h-touch rounded-md border border-border-default bg-surface-base px-12"
                        >
                          <option value="">-- Chọn luồng --</option>
                          {flows.map((flow) => (
                            <option key={flow.id} value={flow.id}>
                              {flow.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                  {flowsQuery.isError ? (
                    <p role="alert" className="mt-8">
                      {flowsQuery.error.message}
                    </p>
                  ) : null}
                  <Button
                    className="mt-8"
                    disabled={
                      selected.status !== "draft" ||
                      (selected.ownership !== "personal" &&
                        (!approvalProjectId || !flowId))
                    }
                    loading={publishMutation.isPending}
                    onClick={() => publishMutation.mutate()}
                  >
                    {selected.ownership === "personal"
                      ? "Công bố mẫu cá nhân"
                      : "Gửi duyệt công bố"}
                  </Button>
                </>
              ) : null}
              {selected.status === "published" ||
              selected.createdById === user?.id ? (
                <div className="mt-16 flex flex-wrap items-end gap-8">
                  <label className="flex min-w-48 flex-col gap-4 text-sm font-medium">
                    Nạp vào dự án
                    <select
                      value={applyProjectId}
                      onChange={(event) => {
                        setApplyProjectId(event.currentTarget.value);
                        setRoleAssignments({});
                      }}
                      className="min-h-touch rounded-md border border-border-default bg-surface-base px-12"
                    >
                      <option value="">-- Chọn dự án --</option>
                      {projectsQuery.data?.items.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-4 text-sm font-medium">
                    Ngày bắt đầu
                    <input
                      type="date"
                      value={startDate}
                      onChange={(event) =>
                        setStartDate(event.currentTarget.value)
                      }
                      className="min-h-touch rounded-md border border-border-default bg-surface-base px-12"
                    />
                  </label>
                  <Button
                    disabled={!applyProjectId}
                    loading={applyMutation.isPending}
                    onClick={() => applyMutation.mutate()}
                  >
                    Nạp mẫu
                  </Button>
                  {templateRoles.map((role) => (
                    <label
                      key={role}
                      className="flex min-w-48 flex-col gap-4 text-sm font-medium"
                    >
                      Vai trò: {role}
                      <select
                        value={roleAssignments[role] ?? ""}
                        onChange={(event) =>
                          setRoleAssignments((previous) => ({
                            ...previous,
                            [role]: event.currentTarget.value,
                          }))
                        }
                        className="min-h-touch rounded-md border border-border-default bg-surface-base px-12"
                      >
                        <option value="">-- Chưa gán --</option>
                        {membersQuery.data?.map((member) => (
                          <option key={member.userId} value={member.userId}>
                            {member.user.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  {membersQuery.isError ? (
                    <p role="alert" className="mt-8">
                      {membersQuery.error.message}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <details className="mt-16">
                <summary className="cursor-pointer font-medium">
                  Xem trước cây việc
                </summary>
                <pre className="mt-8 overflow-auto rounded-md bg-surface-muted p-12 text-sm">
                  {formatContent(currentContent)}
                </pre>
              </details>
            </Card>
          ) : null}

          <Card>
            <CardTitle as="h2">Tạo mẫu nháp</CardTitle>
            <div className="mt-12 grid gap-12 md:grid-cols-2">
              <Input
                label="Tên mẫu"
                required
                maxLength={200}
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
              />
              <label className="flex flex-col gap-4 text-sm font-medium">
                Loại mẫu
                <select
                  value={kind}
                  onChange={(event) =>
                    setKind(event.currentTarget.value as "project" | "task")
                  }
                  className="min-h-touch rounded-md border border-border-default bg-surface-base px-12"
                >
                  <option value="project">Dự án</option>
                  <option value="task">Việc</option>
                </select>
              </label>
              {isAdmin ? (
                <label className="flex flex-col gap-4 text-sm font-medium">
                  Phạm vi sở hữu
                  <select
                    value={ownership}
                    onChange={(event) =>
                      setOwnership(
                        event.currentTarget.value as "personal" | "company",
                      )
                    }
                    className="min-h-touch rounded-md border border-border-default bg-surface-base px-12"
                  >
                    <option value="personal">Cá nhân</option>
                    <option value="company">Công ty</option>
                  </select>
                </label>
              ) : null}
              <Input
                label="Mô tả"
                maxLength={2000}
                value={description}
                onChange={(event) => setDescription(event.currentTarget.value)}
              />
            </div>
            <label className="mt-12 flex flex-col gap-4 text-sm font-medium">
              Cây việc và checklist dạng JSON
              <textarea
                value={createContent}
                onChange={(event) =>
                  setCreateContent(event.currentTarget.value)
                }
                rows={14}
                spellCheck={false}
                className="rounded-md border border-border-default bg-surface-base p-12 font-mono text-sm"
              />
            </label>
            <Button
              className="mt-12"
              variant="primary"
              loading={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              Tạo mẫu nháp
            </Button>
          </Card>
        </div>
      </div>
    </section>
  );
}
