import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { Card, CardTitle } from "../../components/Card";
import { Input } from "../../components/Input";

type GuestTask = { id: string; title: string };
type GuestAttachment = {
  id: string;
  taskId: string | null;
  fileName: string;
  mime: string;
  size: number;
};
type GuestInvite = {
  id: string;
  name: string;
  email: string;
  status: string;
  expiresAt: string;
  tasks: Array<{ taskId: string; task: { title: string } }>;
};
type ApprovalFlow = { id: string; name: string; requestType: string };

export function GuestAccessPanel({
  projectId,
  restricted,
}: {
  projectId: string;
  restricted: boolean;
}) {
  const { apiFetch } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(14);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>(
    [],
  );
  const [approvalFlowId, setApprovalFlowId] = useState("");
  const [issuedLink, setIssuedLink] = useState("");
  const [feedback, setFeedback] = useState("");

  const tasksQuery = useQuery({
    queryKey: ["projects", projectId, "guest-task-options"],
    queryFn: async () => {
      const result = await apiFetch<{ items: GuestTask[] }>(
        `/projects/${projectId}/tasks?page=1&pageSize=200`,
      );
      return result.items;
    },
  });
  const invitesQuery = useQuery({
    queryKey: ["projects", projectId, "guest-access"],
    queryFn: () =>
      apiFetch<GuestInvite[]>(`/projects/${projectId}/guest-access`),
  });
  const flowsQuery = useQuery({
    queryKey: ["projects", projectId, "approval-flows"],
    queryFn: () =>
      apiFetch<ApprovalFlow[]>(`/projects/${projectId}/approval-flows`),
    enabled: restricted,
  });
  const attachmentQueries = useQueries({
    queries: selectedTaskIds.map((taskId) => ({
      queryKey: ["projects", projectId, "guest-attachments", taskId],
      queryFn: async () => {
        const query = new URLSearchParams({
          taskId,
          page: "1",
          pageSize: "200",
        });
        const result = await apiFetch<{ items: GuestAttachment[] }>(
          `/projects/${projectId}/attachments?${query}`,
        );
        return result.items.filter((item) => item.taskId === taskId);
      },
    })),
  });
  const attachments = attachmentQueries.flatMap((query) => query.data ?? []);

  const createInvite = useMutation({
    mutationFn: () =>
      apiFetch<{ token: string; status: string }>(
        `/projects/${projectId}/guest-access`,
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            expiresInDays,
            taskIds: selectedTaskIds,
            attachmentIds: selectedAttachmentIds,
            ...(restricted ? { approvalFlowId } : {}),
          }),
        },
      ),
    onSuccess: async (result) => {
      setIssuedLink(`${window.location.origin}/guest#${result.token}`);
      setFeedback(
        result.status === "pending_approval"
          ? "Đã tạo lời mời; khách chỉ truy cập được sau khi được duyệt."
          : "Đã tạo lời mời khách.",
      );
      setName("");
      setEmail("");
      setSelectedTaskIds([]);
      setSelectedAttachmentIds([]);
      await queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "guest-access"],
      });
    },
    onError: (error: Error) => setFeedback(error.message),
  });
  const revokeInvite = useMutation({
    mutationFn: (guestAccessId: string) =>
      apiFetch(`/projects/${projectId}/guest-access/${guestAccessId}/revoke`, {
        method: "POST",
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "guest-access"],
      }),
    onError: (error: Error) => setFeedback(error.message),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback("");
    setIssuedLink("");
    createInvite.mutate();
  };
  const toggle = (
    values: string[],
    value: string,
    checked: boolean,
    update: (next: string[]) => void,
  ) => {
    update(
      checked ? [...values, value] : values.filter((item) => item !== value),
    );
  };
  const guestFlows = (flowsQuery.data ?? []).filter(
    (flow) => flow.requestType === "guest_invite",
  );

  return (
    <Card>
      <CardTitle as="h2">Cổng khách ngoài</CardTitle>
      <p className="mt-8 text-sm text-text-secondary">
        Lời mời chỉ xem được các công việc và tệp đã chọn. Quyền truy cập có thể
        thu hồi; nội dung gửi lên được lưu thành các lần nộp bất biến.
      </p>
      <form className="mt-16 grid gap-12 md:grid-cols-2" onSubmit={submit}>
        <Input
          label="Tên khách"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          required
          maxLength={120}
        />
        <Input
          label="Email khách"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
          required
          maxLength={320}
        />
        <Input
          label="Thời hạn (ngày)"
          type="number"
          min={1}
          max={90}
          value={expiresInDays}
          onChange={(event) =>
            setExpiresInDays(Number(event.currentTarget.value))
          }
          required
        />
        {restricted ? (
          <label className="flex flex-col gap-4 text-sm font-medium">
            Luồng duyệt khách
            <select
              value={approvalFlowId}
              onChange={(event) => setApprovalFlowId(event.currentTarget.value)}
              required
              className="min-h-touch rounded-md border border-border-default bg-surface-base px-12"
            >
              <option value="">Chọn luồng duyệt</option>
              {guestFlows.map((flow) => (
                <option key={flow.id} value={flow.id}>
                  {flow.name}
                </option>
              ))}
            </select>
            {flowsQuery.isError ? (
              <span role="alert">{flowsQuery.error.message}</span>
            ) : null}
            {!flowsQuery.isLoading && !guestFlows.length ? (
              <span role="alert">
                Chưa có luồng duyệt guest_invite. Hãy cấu hình luồng trước khi
                mời khách vào dự án mật.
              </span>
            ) : null}
          </label>
        ) : null}
        <fieldset className="flex flex-col gap-8 md:col-span-2">
          <legend className="text-sm font-medium">
            Công việc được phép xem
          </legend>
          {tasksQuery.isError ? (
            <p role="alert">{tasksQuery.error.message}</p>
          ) : null}
          {tasksQuery.isLoading ? <p>Đang tải công việc…</p> : null}
          <div className="grid gap-8 sm:grid-cols-2">
            {(tasksQuery.data ?? []).map((task) => (
              <label key={task.id} className="flex items-start gap-8 text-sm">
                <input
                  type="checkbox"
                  checked={selectedTaskIds.includes(task.id)}
                  onChange={(event) =>
                    toggle(
                      selectedTaskIds,
                      task.id,
                      event.currentTarget.checked,
                      setSelectedTaskIds,
                    )
                  }
                />
                <span>{task.title}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {selectedTaskIds.length ? (
          <fieldset className="flex flex-col gap-8 md:col-span-2">
            <legend className="text-sm font-medium">
              Tệp được phép tải xuống (không bắt buộc)
            </legend>
            {attachments.length ? (
              <div className="grid gap-8 sm:grid-cols-2">
                {attachments.map((file) => (
                  <label
                    key={file.id}
                    className="flex items-start gap-8 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAttachmentIds.includes(file.id)}
                      onChange={(event) =>
                        toggle(
                          selectedAttachmentIds,
                          file.id,
                          event.currentTarget.checked,
                          setSelectedAttachmentIds,
                        )
                      }
                    />
                    <span className="break-all">{file.fileName}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-secondary">
                Không có tệp đã xác nhận trong công việc được chọn.
              </p>
            )}
          </fieldset>
        ) : null}
        <div className="flex flex-col items-start gap-8 md:col-span-2">
          <Button
            type="submit"
            disabled={
              createInvite.isPending ||
              !selectedTaskIds.length ||
              (restricted && !approvalFlowId)
            }
            loading={createInvite.isPending}
          >
            Tạo lời mời
          </Button>
          {feedback ? <p role="status">{feedback}</p> : null}
          {issuedLink ? (
            <label className="flex w-full flex-col gap-4 text-sm">
              Liên kết xuất hiện một lần; hãy gửi an toàn cho khách.
              <input
                readOnly
                value={issuedLink}
                onFocus={(event) => event.currentTarget.select()}
                className="min-h-touch w-full rounded-md border border-border-default bg-surface-base px-12"
                aria-label="Liên kết truy cập khách"
              />
            </label>
          ) : null}
        </div>
      </form>

      <div className="mt-24">
        <h3 className="font-semibold">Lời mời hiện có</h3>
        {invitesQuery.isError ? (
          <p role="alert" className="mt-8">
            {invitesQuery.error.message}
          </p>
        ) : null}
        <ul className="mt-8 divide-y divide-border-default">
          {(invitesQuery.data ?? []).map((invite) => (
            <li
              key={invite.id}
              className="flex flex-col justify-between gap-8 py-12 sm:flex-row sm:items-center"
            >
              <div>
                <p className="font-medium">
                  {invite.name} · {invite.email}
                </p>
                <p className="text-sm text-text-secondary">
                  {invite.status} · hết hạn{" "}
                  {new Date(invite.expiresAt).toLocaleDateString("vi-VN")} ·{" "}
                  {invite.tasks.map((task) => task.task.title).join(", ")}
                </p>
              </div>
              {["active", "pending_approval"].includes(invite.status) ? (
                <Button
                  variant="danger"
                  loading={revokeInvite.isPending}
                  onClick={() => revokeInvite.mutate(invite.id)}
                >
                  Thu hồi
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
