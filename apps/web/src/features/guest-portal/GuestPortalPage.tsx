import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { Card, CardTitle } from "../../components/Card";
import { Input } from "../../components/Input";
import { ApiError, guestApiRequest, guestDownload } from "../../lib/api";

type GuestTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: string | null;
};
type GuestTaskDetails = GuestTask & {
  sharedFiles: Array<{
    id: string;
    fileName: string;
    mime: string;
    size: number;
  }>;
};
type GuestSubmission = {
  id: string;
  body: string;
  createdAt: string;
  files: Array<{
    id: string;
    fileName: string;
    mime: string;
    size: number;
  }>;
};
type GuestProfile = {
  name: string;
  email: string;
  projectName: string;
  expiresAt: string;
};
type UploadUrl = { fileId: string; uploadUrl: string };

const tokenStorageKey = "qlcv.guest.token";

function initialToken() {
  return typeof window === "undefined"
    ? ""
    : (window.sessionStorage.getItem(tokenStorageKey) ?? "");
}

export function GuestPortalPage() {
  const [token, setToken] = useState(initialToken);
  const [manualToken, setManualToken] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const urlToken = window.location.hash.slice(1);
    if (urlToken) {
      const received = decodeURIComponent(urlToken);
      window.sessionStorage.setItem(tokenStorageKey, received);
      setToken(received);
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }
  }, []);

  const profileQuery = useQuery({
    queryKey: ["guest", "profile", token],
    queryFn: () => guestApiRequest<GuestProfile>("/guest/me", token),
    enabled: Boolean(token),
  });
  const tasksQuery = useQuery({
    queryKey: ["guest", "tasks", token],
    queryFn: () => guestApiRequest<GuestTask[]>("/guest/tasks", token),
    enabled: Boolean(token),
  });
  const taskQuery = useQuery({
    queryKey: ["guest", "task", token, selectedTaskId],
    queryFn: () =>
      guestApiRequest<GuestTaskDetails>(
        `/guest/tasks/${selectedTaskId}`,
        token,
      ),
    enabled: Boolean(token && selectedTaskId),
  });
  const submissionsQuery = useQuery({
    queryKey: ["guest", "submissions", token, selectedTaskId],
    queryFn: () =>
      guestApiRequest<GuestSubmission[]>(
        `/guest/tasks/${selectedTaskId}/submissions`,
        token,
      ),
    enabled: Boolean(token && selectedTaskId),
  });

  useEffect(() => {
    const error = profileQuery.error;
    if (error instanceof ApiError && error.status === 401) {
      window.sessionStorage.removeItem(tokenStorageKey);
      setToken("");
    }
  }, [profileQuery.error]);

  const activateManualToken = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = manualToken.trim();
    if (!next) return;
    window.sessionStorage.setItem(tokenStorageKey, next);
    setToken(next);
    setManualToken("");
    setFeedback("");
  };

  const download = async (
    fileId: string,
    fileName: string,
    kind: "shared-files" | "submission-files",
  ) => {
    setFeedback("");
    try {
      const blob = await guestDownload(
        `/guest/${kind}/${fileId}/download`,
        token,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Không tải được tệp",
      );
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTaskId || !body.trim()) return;
    setBusy(true);
    setFeedback("");
    let submissionCreated = false;
    let fileConfirmed = false;
    try {
      const submission = await guestApiRequest<{ id: string }>(
        `/guest/tasks/${selectedTaskId}/submissions`,
        token,
        { method: "POST", body: JSON.stringify({ body: body.trim() }) },
      );
      submissionCreated = true;
      if (file) {
        const upload = await guestApiRequest<UploadUrl>(
          `/guest/submissions/${submission.id}/files/upload-url`,
          token,
          {
            method: "POST",
            body: JSON.stringify({
              fileName: file.name,
              mime: file.type,
              size: file.size,
            }),
          },
        );
        const response = await fetch(upload.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!response.ok)
          throw new Error(`Tải tệp lên thất bại (${response.status}).`);
        await guestApiRequest(
          `/guest/submissions/${submission.id}/files/${upload.fileId}/confirm`,
          token,
          { method: "POST" },
        );
        fileConfirmed = true;
      }
      setBody("");
      setFile(null);
      setFeedback("Đã ghi nhận lần nộp mới.");
      await queryClient.invalidateQueries({
        queryKey: ["guest", "submissions", token, selectedTaskId],
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không gửi được nội dung";
      setFeedback(
        submissionCreated && file && !fileConfirmed
          ? `Nội dung đã được ghi nhận; tệp chưa xác nhận: ${message}`
          : message,
      );
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl items-center px-16 py-24">
        <Card className="w-full">
          <CardTitle as="h2">Cổng khách ngoài</CardTitle>
          <p className="mt-8 text-sm text-text-secondary">
            Mở liên kết mời của dự án hoặc nhập mã truy cập được cấp.
          </p>
          <form
            className="mt-16 flex flex-col gap-12"
            onSubmit={activateManualToken}
          >
            <Input
              label="Mã truy cập"
              value={manualToken}
              onChange={(event) => setManualToken(event.currentTarget.value)}
              autoComplete="off"
              required
            />
            <Button type="submit" variant="primary">
              Tiếp tục
            </Button>
          </form>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-16 px-16 py-24">
      <header className="flex flex-wrap items-start justify-between gap-12">
        <div>
          <h1 className="text-2xl font-bold">Cổng khách ngoài</h1>
          {profileQuery.data ? (
            <p className="mt-4 text-sm text-text-secondary">
              {profileQuery.data.projectName} · {profileQuery.data.name} · hết
              hạn{" "}
              {new Date(profileQuery.data.expiresAt).toLocaleDateString(
                "vi-VN",
              )}
            </p>
          ) : null}
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            window.sessionStorage.removeItem(tokenStorageKey);
            setToken("");
            setSelectedTaskId("");
          }}
        >
          Thoát
        </Button>
      </header>
      {profileQuery.isLoading ? (
        <p role="status">Đang xác minh liên kết…</p>
      ) : null}
      {profileQuery.isError ? (
        <p role="alert" className="text-status-danger">
          {profileQuery.error.message}
        </p>
      ) : null}
      {tasksQuery.isError ? (
        <p role="alert" className="text-status-danger">
          {tasksQuery.error.message}
        </p>
      ) : null}
      {feedback ? <p role="status">{feedback}</p> : null}
      <div className="grid gap-16 lg:grid-cols-3">
        <Card>
          <CardTitle as="h2">Công việc được chia sẻ</CardTitle>
          {tasksQuery.isLoading ? <p className="mt-12">Đang tải…</p> : null}
          <ul className="mt-8 divide-y divide-border-default">
            {(tasksQuery.data ?? []).map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  aria-current={selectedTaskId === task.id ? "page" : undefined}
                  className="min-h-touch w-full rounded-md px-8 py-8 text-left hover:bg-surface-muted"
                  onClick={() => setSelectedTaskId(task.id)}
                >
                  <span className="block font-medium">{task.title}</span>
                  <span className="text-sm text-text-secondary">
                    {task.status}
                    {task.dueDate
                      ? ` · hạn ${new Date(task.dueDate).toLocaleDateString("vi-VN")}`
                      : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <div className="flex flex-col gap-16 lg:col-span-2">
          {taskQuery.data ? (
            <>
              <Card>
                <CardTitle as="h2">{taskQuery.data.title}</CardTitle>
                {taskQuery.data.description ? (
                  <p className="mt-8 whitespace-pre-wrap text-sm">
                    {taskQuery.data.description}
                  </p>
                ) : null}
                <div className="mt-12">
                  <h3 className="font-semibold">Tệp được chia sẻ</h3>
                  <ul className="mt-4 flex flex-col gap-8">
                    {taskQuery.data.sharedFiles.map((sharedFile) => (
                      <li key={sharedFile.id}>
                        <Button
                          variant="ghost"
                          className="justify-start break-all"
                          onClick={() =>
                            void download(
                              sharedFile.id,
                              sharedFile.fileName,
                              "shared-files",
                            )
                          }
                        >
                          Tải {sharedFile.fileName}
                        </Button>
                      </li>
                    ))}
                    {!taskQuery.data.sharedFiles.length ? (
                      <li className="text-sm text-text-secondary">
                        Chưa có tệp chia sẻ.
                      </li>
                    ) : null}
                  </ul>
                </div>
              </Card>
              <Card>
                <CardTitle as="h2">Gửi kết quả</CardTitle>
                <form className="mt-12 flex flex-col gap-12" onSubmit={submit}>
                  <label className="flex flex-col gap-4 text-sm font-medium">
                    Nội dung
                    <textarea
                      value={body}
                      onChange={(event) => setBody(event.currentTarget.value)}
                      rows={5}
                      maxLength={20000}
                      required
                      className="rounded-md border border-border-default bg-surface-base p-12 text-md"
                    />
                  </label>
                  <label className="flex flex-col gap-4 text-sm font-medium">
                    Tệp đính kèm (ảnh hoặc PDF)
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={(event) =>
                        setFile(event.currentTarget.files?.[0] ?? null)
                      }
                      className="min-h-touch rounded-md border border-border-default bg-surface-base p-8"
                    />
                  </label>
                  <Button
                    type="submit"
                    variant="primary"
                    loading={busy}
                    disabled={busy || !body.trim()}
                  >
                    Gửi lần nộp mới
                  </Button>
                </form>
              </Card>
              <Card>
                <CardTitle as="h2">Lịch sử lần nộp</CardTitle>
                {submissionsQuery.isError ? (
                  <p role="alert" className="mt-8">
                    {submissionsQuery.error.message}
                  </p>
                ) : null}
                <ol className="mt-8 flex flex-col gap-12">
                  {(submissionsQuery.data ?? []).map((submission) => (
                    <li
                      key={submission.id}
                      className="rounded-md border border-border-default p-12"
                    >
                      <p className="text-xs text-text-secondary">
                        {new Date(submission.createdAt).toLocaleString("vi-VN")}
                      </p>
                      <p className="mt-4 whitespace-pre-wrap">
                        {submission.body}
                      </p>
                      {submission.files.map((submissionFile) => (
                        <Button
                          key={submissionFile.id}
                          variant="ghost"
                          className="mt-8 justify-start break-all"
                          onClick={() =>
                            void download(
                              submissionFile.id,
                              submissionFile.fileName,
                              "submission-files",
                            )
                          }
                        >
                          Tải {submissionFile.fileName}
                        </Button>
                      ))}
                    </li>
                  ))}
                </ol>
              </Card>
            </>
          ) : (
            <Card>
              <p>
                {taskQuery.isError
                  ? taskQuery.error.message
                  : "Chọn một công việc để xem chi tiết và gửi kết quả."}
              </p>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}
