import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { CustomFieldDefinition } from "@qlcv/shared";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { Card, CardTitle } from "../../components/Card";
import { Input } from "../../components/Input";

interface ProjectTask {
  id: string;
  title: string;
  customFields: Record<string, string | number | boolean | null>;
}

interface ProjectMemberOption {
  userId: string;
  user: { name: string };
}

interface ProjectTasksPanelProps {
  projectId: string;
  canManage: boolean;
  definitions: CustomFieldDefinition[];
}

export function ProjectTasksPanel({
  projectId,
  canManage,
  definitions,
}: ProjectTasksPanelProps) {
  const { apiFetch } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const notificationTaskId = searchParams.get("task");
  const [title, setTitle] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [filterKey, setFilterKey] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [feedback, setFeedback] = useState("");
  const filterableDefinitions = useMemo(
    () =>
      definitions.filter((field) => !field.hidden && field.type !== "boolean"),
    [definitions],
  );
  const query = useQuery({
    queryKey: ["projects", projectId, "tasks", filterKey, filterValue],
    queryFn: () => {
      const params = new URLSearchParams({ page: "1", pageSize: "200" });
      if (filterKey && filterValue !== "") {
        params.set("customFieldKey", filterKey);
        params.set("customFieldValue", filterValue);
      }
      return apiFetch<{ items: ProjectTask[]; total: number }>(
        `/projects/${projectId}/tasks?${params.toString()}`,
      );
    },
  });
  const notificationTaskQuery = useQuery({
    queryKey: ["projects", projectId, "tasks", notificationTaskId],
    queryFn: () =>
      apiFetch<{
        id: string;
        title: string;
        status: string;
        dueDate: string | null;
      }>(`/projects/${projectId}/tasks/${notificationTaskId}`),
    enabled: Boolean(notificationTaskId),
  });
  const membersQuery = useQuery({
    queryKey: ["projects", projectId, "members"],
    queryFn: () =>
      apiFetch<ProjectMemberOption[]>(`/projects/${projectId}/members`),
  });
  const visibleDefinitions = definitions.filter((field) => !field.hidden);
  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/projects/${projectId}/tasks`, {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          customFields: values,
        }),
      }),
    onSuccess: async () => {
      setTitle("");
      setValues({});
      setFeedback("Đã tạo việc.");
      await queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "tasks"],
      });
    },
    onError: (error: Error) => setFeedback(error.message),
  });

  return (
    <div className="space-y-12">
      {notificationTaskId ? (
        <Card>
          <CardTitle as="h2">Việc từ thông báo</CardTitle>
          {notificationTaskQuery.isPending ? (
            <p className="mt-8 text-sm" role="status">
              Đang tải việc…
            </p>
          ) : notificationTaskQuery.isError ? (
            <p className="mt-8 text-sm text-status-danger" role="alert">
              Không thể mở việc này. Việc có thể đã bị xóa hoặc bạn không có
              quyền xem.
            </p>
          ) : notificationTaskQuery.data ? (
            <div className="mt-8">
              <h3 className="font-medium">
                {notificationTaskQuery.data.title}
              </h3>
              <p className="mt-4 text-sm text-text-secondary">
                Trạng thái: {notificationTaskQuery.data.status}
                {notificationTaskQuery.data.dueDate
                  ? ` · Hạn ${new Date(notificationTaskQuery.data.dueDate).toLocaleDateString("vi-VN")}`
                  : ""}
              </p>
            </div>
          ) : null}
        </Card>
      ) : null}
      <Card>
        <CardTitle as="h2">Việc và trường tùy chỉnh</CardTitle>
        {canManage ? (
          <form
            className="mt-12 flex flex-col gap-12"
            onSubmit={(event) => {
              event.preventDefault();
              setFeedback("");
              createMutation.mutate();
            }}
          >
            <Input
              label="Tên việc"
              required
              maxLength={500}
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
            {visibleDefinitions.map((field) => (
              <label
                key={field.key}
                className="flex flex-col gap-4 text-sm font-medium"
              >
                {field.label}
                {field.type === "select" ? (
                  <select
                    required={field.required}
                    value={String(values[field.key] ?? "")}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [field.key]: event.currentTarget.value || null,
                      }))
                    }
                    className="min-h-touch rounded-md border border-border-default bg-surface-base px-12"
                  >
                    <option value="">-- Chọn --</option>
                    {field.options?.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : field.type === "user" ? (
                  <select
                    required={field.required}
                    value={String(values[field.key] ?? "")}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [field.key]: event.currentTarget.value || null,
                      }))
                    }
                    className="min-h-touch rounded-md border border-border-default bg-surface-base px-12"
                  >
                    <option value="">-- Chọn thành viên --</option>
                    {membersQuery.data?.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.user.name}
                      </option>
                    ))}
                  </select>
                ) : field.type === "boolean" ? (
                  <input
                    type="checkbox"
                    checked={values[field.key] === true}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [field.key]: event.currentTarget.checked,
                      }))
                    }
                  />
                ) : (
                  <input
                    type={
                      field.type === "date"
                        ? "date"
                        : field.type === "number"
                          ? "number"
                          : field.type === "url"
                            ? "url"
                            : "text"
                    }
                    required={field.required}
                    value={String(values[field.key] ?? "")}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [field.key]:
                          field.type === "number"
                            ? event.currentTarget.value === ""
                              ? null
                              : Number(event.currentTarget.value)
                            : event.currentTarget.value || null,
                      }))
                    }
                    className="min-h-touch rounded-md border border-border-default bg-surface-base px-12"
                  />
                )}
              </label>
            ))}
            <Button
              type="submit"
              variant="primary"
              loading={createMutation.isPending}
            >
              Tạo việc
            </Button>
          </form>
        ) : null}
        <div className="mt-16 flex flex-wrap items-end gap-8">
          <label className="flex min-w-48 flex-col gap-4 text-sm font-medium">
            Lọc theo trường
            <select
              value={filterKey}
              onChange={(event) => {
                const nextKey = event.currentTarget.value;
                setFilterKey(nextKey);
                setFilterValue("");
              }}
              className="min-h-touch rounded-md border border-border-default bg-surface-base px-12"
            >
              <option value="">Tất cả</option>
              {filterableDefinitions.map((field) => (
                <option key={field.key} value={field.key}>
                  {field.label}
                </option>
              ))}
            </select>
          </label>
          {filterKey ? (
            <label className="flex min-w-48 flex-col gap-4 text-sm font-medium">
              Giá trị
              {definitions.find((field) => field.key === filterKey)?.type ===
              "select" ? (
                <select
                  value={filterValue}
                  onChange={(event) =>
                    setFilterValue(event.currentTarget.value)
                  }
                  className="min-h-touch rounded-md border border-border-default bg-surface-base px-12"
                >
                  <option value="">-- Chọn --</option>
                  {definitions
                    .find((field) => field.key === filterKey)
                    ?.options?.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                </select>
              ) : (
                <input
                  type={
                    definitions.find((field) => field.key === filterKey)
                      ?.type === "date"
                      ? "date"
                      : definitions.find((field) => field.key === filterKey)
                            ?.type === "number"
                        ? "number"
                        : "text"
                  }
                  value={filterValue}
                  onChange={(event) =>
                    setFilterValue(event.currentTarget.value)
                  }
                  className="min-h-touch rounded-md border border-border-default bg-surface-base px-12"
                />
              )}
            </label>
          ) : null}
        </div>
        {feedback ? (
          <p role="status" className="mt-8">
            {feedback}
          </p>
        ) : null}
        {query.isError ? (
          <p role="alert" className="mt-8">
            {query.error.message}
          </p>
        ) : null}
        {query.data ? (
          <>
            <p className="mt-12 text-sm text-text-secondary">
              {query.data.total} việc
            </p>
            <ul className="mt-8 divide-y divide-border-default">
              {query.data.items.map((task) => (
                <li key={task.id} className="py-8">
                  <h3 className="font-medium">{task.title}</h3>
                  <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                    {visibleDefinitions.map((field) => {
                      const value = task.customFields?.[field.key];
                      return value === null || value === undefined ? null : (
                        <div key={field.key}>
                          <dt className="text-text-secondary">{field.label}</dt>
                          <dd>{String(value)}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Card>
    </div>
  );
}
