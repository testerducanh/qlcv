import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { Card, CardTitle } from "../../components/Card";
import { Input } from "../../components/Input";

interface ProjectLabel {
  id: string;
  name: string;
  color: string;
  projectId: string | null;
}

export function ProjectLabelsPanel({
  projectId,
  canManage,
}: {
  projectId: string;
  canManage: boolean;
}) {
  const { apiFetch, user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [mergeTargets, setMergeTargets] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState("");
  const query = useQuery({
    queryKey: ["projects", projectId, "labels"],
    queryFn: () => apiFetch<ProjectLabel[]>(`/projects/${projectId}/labels`),
  });
  const refresh = async () =>
    queryClient.invalidateQueries({
      queryKey: ["projects", projectId, "labels"],
    });
  const createMutation = useMutation({
    mutationFn: (company: boolean) =>
      apiFetch<ProjectLabel>(
        company ? "/labels" : `/projects/${projectId}/labels`,
        {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), color }),
        },
      ),
    onSuccess: async () => {
      setName("");
      setFeedback("Đã lưu nhãn.");
      await refresh();
    },
    onError: (error: Error) => setFeedback(error.message),
  });
  const mergeMutation = useMutation({
    mutationFn: ({
      sourceId,
      targetId,
    }: {
      sourceId: string;
      targetId: string;
    }) =>
      apiFetch(`/projects/${projectId}/labels/${sourceId}/merge`, {
        method: "POST",
        body: JSON.stringify({ targetLabelId: targetId }),
      }),
    onSuccess: async () => {
      setFeedback("Đã hợp nhất nhãn và giữ nguyên liên kết việc.");
      await refresh();
    },
    onError: (error: Error) => setFeedback(error.message),
  });
  const labels = query.data ?? [];

  return (
    <Card>
      <CardTitle as="h2">Nhãn</CardTitle>
      {query.isError ? <p role="alert">{query.error.message}</p> : null}
      {canManage ? (
        <form
          className="mt-12 flex flex-wrap items-end gap-8"
          onSubmit={(event) => {
            event.preventDefault();
            setFeedback("");
            createMutation.mutate(false);
          }}
        >
          <Input
            label="Tên nhãn riêng của dự án"
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <Input
            label="Mã màu (#RRGGBB)"
            required
            pattern="#[0-9a-fA-F]{6}"
            value={color}
            onChange={(event) => setColor(event.currentTarget.value)}
          />
          <Button type="submit" loading={createMutation.isPending}>
            Tạo nhãn dự án
          </Button>
          {user?.systemRole === "system_admin" ? (
            <Button
              type="button"
              loading={createMutation.isPending}
              onClick={() => createMutation.mutate(true)}
            >
              Tạo nhãn chuẩn công ty
            </Button>
          ) : null}
        </form>
      ) : null}
      {feedback ? (
        <p role="status" className="mt-8">
          {feedback}
        </p>
      ) : null}
      {labels.length ? (
        <ul className="mt-12 divide-y divide-border-default">
          {labels.map((label) => (
            <li
              key={label.id}
              className="flex flex-wrap items-center justify-between gap-8 py-8"
            >
              <span className="flex items-center gap-8">
                <span
                  aria-hidden="true"
                  className="size-12 rounded-full border border-border-default"
                  style={{ backgroundColor: label.color }}
                />
                {label.name}
                <span className="text-sm text-text-secondary">
                  {label.projectId ? "Dự án" : "Công ty"}
                </span>
              </span>
              {canManage && label.projectId ? (
                <div className="flex items-center gap-8">
                  <select
                    aria-label={`Gộp ${label.name} vào`}
                    value={mergeTargets[label.id] ?? ""}
                    onChange={(event) =>
                      setMergeTargets((current) => ({
                        ...current,
                        [label.id]: event.currentTarget.value,
                      }))
                    }
                    className="min-h-touch rounded-md border border-border-default bg-surface-base px-12"
                  >
                    <option value="">Chọn nhãn đích</option>
                    {labels
                      .filter((target) => target.id !== label.id)
                      .map((target) => (
                        <option key={target.id} value={target.id}>
                          {target.name}
                        </option>
                      ))}
                  </select>
                  <Button
                    disabled={!mergeTargets[label.id]}
                    loading={mergeMutation.isPending}
                    onClick={() =>
                      mergeMutation.mutate({
                        sourceId: label.id,
                        targetId: mergeTargets[label.id],
                      })
                    }
                  >
                    Hợp nhất
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-12 text-sm text-text-secondary">Chưa có nhãn.</p>
      )}
    </Card>
  );
}
