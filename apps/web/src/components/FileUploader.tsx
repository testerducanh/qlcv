import { useEffect, useRef, useState } from "react";
import { viMessages } from "../i18n/vi";
import { cx } from "../lib/cx";
import { formatBytes, isAccepted } from "../lib/files";
import { Button } from "./Button";
import { AlertIcon, CheckIcon, FileIcon, RetryIcon, UploadIcon } from "./icons";
import { ProgressBar } from "./ProgressBar";

export type UploadFn = (
  file: File,
  context: { signal: AbortSignal; onProgress: (percent: number) => void },
) => Promise<void>;

export interface FileUploaderProps {
  /** Hàm tải một tệp lên. Ném lỗi (có message tiếng Việt) khi thất bại. */
  upload: UploadFn;
  /** Giống thuộc tính accept của input file, ví dụ "image/*,.pdf". */
  accept?: string;
  maxSizeBytes?: number;
  maxFiles?: number;
  /** Hiện nút chụp ảnh trực tiếp (điện thoại). */
  allowCamera?: boolean;
  label?: string;
  className?: string;
}

interface Item {
  id: number;
  file: File;
  status: "uploading" | "done" | "error";
  progress: number;
  error?: string;
  /** Bị loại ngay từ đầu (sai loại, quá lớn, quá số lượng): không thử lại được. */
  rejected?: boolean;
}

function FileThumb({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (
      !file.type.startsWith("image/") ||
      typeof URL.createObjectURL !== "function"
    )
      return;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url ? (
    <img
      src={url}
      alt={file.name}
      className="size-40 shrink-0 rounded-md object-cover"
    />
  ) : (
    <span className="inline-flex size-40 shrink-0 items-center justify-center rounded-md bg-surface-muted text-text-secondary">
      <FileIcon />
    </span>
  );
}

export function FileUploader({
  upload,
  accept,
  maxSizeBytes,
  maxFiles,
  allowCamera,
  label = viMessages.uploader.label,
  className,
}: FileUploaderProps) {
  const text = viMessages.uploader;
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  const controllers = useRef(new Map<number, AbortController>());
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const active = controllers.current;
    return () => active.forEach((controller) => controller.abort());
  }, []);

  const patch = (id: number, change: Partial<Item>) =>
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...change } : item)),
    );

  const run = async (item: Item) => {
    const controller = new AbortController();
    controllers.current.set(item.id, controller);
    patch(item.id, { status: "uploading", progress: 0, error: undefined });
    try {
      await upload(item.file, {
        signal: controller.signal,
        onProgress: (percent) =>
          patch(item.id, { progress: Math.round(percent) }),
      });
      patch(item.id, { status: "done", progress: 100 });
      setAnnouncement(text.announceDone(item.file.name));
    } catch (error) {
      if (controller.signal.aborted) {
        setItems((prev) => prev.filter((x) => x.id !== item.id));
      } else {
        const reason =
          error instanceof Error && error.message ? error.message : text.failed;
        patch(item.id, { status: "error", error: reason });
        setAnnouncement(text.announceFailed(item.file.name, reason));
      }
    } finally {
      controllers.current.delete(item.id);
    }
  };

  const addFiles = (incoming: File[]) => {
    if (incoming.length === 0) return;
    let accepted = items.filter((item) => !item.rejected).length;
    const created: Item[] = incoming.map((file) => {
      let rejection: string | undefined;
      if (!isAccepted(file, accept)) rejection = text.badType;
      else if (maxSizeBytes !== undefined && file.size > maxSizeBytes) {
        rejection = text.tooLarge(formatBytes(maxSizeBytes));
      } else if (maxFiles !== undefined && accepted >= maxFiles) {
        rejection = text.tooMany(maxFiles);
      }
      if (!rejection) accepted += 1;
      return {
        id: nextId.current++,
        file,
        status: rejection ? "error" : "uploading",
        progress: 0,
        error: rejection,
        rejected: Boolean(rejection),
      };
    });
    setItems((prev) => [...prev, ...created]);
    created.filter((item) => !item.rejected).forEach((item) => void run(item));
    const firstRejected = created.find((item) => item.rejected);
    if (firstRejected?.error)
      setAnnouncement(
        text.announceFailed(firstRejected.file.name, firstRejected.error),
      );
  };

  const cancel = (id: number) => controllers.current.get(id)?.abort();
  const remove = (id: number) =>
    setItems((prev) => prev.filter((item) => item.id !== id));

  return (
    <div className={cx("flex flex-col gap-12", className)}>
      <div
        role="group"
        aria-label={label}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          addFiles(Array.from(event.dataTransfer.files));
        }}
        onPaste={(event) => {
          const files = Array.from(event.clipboardData.files);
          if (files.length > 0) {
            event.preventDefault();
            addFiles(files);
          }
        }}
        className={cx(
          "flex flex-col items-center gap-12 rounded-lg border-2 border-dashed p-24 text-center transition-fast",
          dragging
            ? "border-brand-primary bg-surface-muted"
            : "border-border-strong bg-surface-raised",
        )}
      >
        <UploadIcon size="lg" className="text-text-secondary" />
        <p className="text-sm text-text-secondary">{text.dropHint}</p>
        <div className="flex flex-wrap justify-center gap-8">
          <Button variant="primary" onClick={() => inputRef.current?.click()}>
            {text.choose}
          </Button>
          {allowCamera ? (
            <Button onClick={() => cameraRef.current?.click()}>
              {text.camera}
            </Button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          hidden
          type="file"
          multiple
          accept={accept}
          data-testid="file-input"
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        {allowCamera ? (
          <input
            ref={cameraRef}
            hidden
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => {
              addFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
        ) : null}
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {items.length > 0 ? (
        <ul aria-label={text.queue} className="flex flex-col gap-8">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-12 rounded-lg border border-border-default bg-surface-raised p-12"
            >
              <FileThumb file={item.file} />
              <div className="flex min-w-0 flex-1 flex-col gap-4">
                <p
                  className="truncate text-md font-medium"
                  title={item.file.name}
                >
                  {item.file.name}
                </p>
                <p className="text-xs text-text-secondary">
                  {formatBytes(item.file.size)}
                </p>
                {item.status === "uploading" ? (
                  <ProgressBar
                    label={text.progress(item.file.name)}
                    value={item.progress}
                  />
                ) : null}
                {item.status === "done" ? (
                  <p className="flex items-center gap-4 text-sm text-status-success">
                    <CheckIcon />
                    {text.done}
                  </p>
                ) : null}
                {item.status === "error" ? (
                  <p className="flex items-start gap-4 text-sm text-status-danger">
                    <AlertIcon className="mt-1" />
                    <span>{item.error}</span>
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-4">
                {item.status === "uploading" ? (
                  <Button
                    variant="ghost"
                    aria-label={`${text.cancel}: ${item.file.name}`}
                    onClick={() => cancel(item.id)}
                  >
                    {text.cancel}
                  </Button>
                ) : null}
                {item.status === "error" && !item.rejected ? (
                  <Button
                    icon={<RetryIcon />}
                    aria-label={`${text.retry}: ${item.file.name}`}
                    onClick={() => void run(item)}
                  >
                    {text.retry}
                  </Button>
                ) : null}
                {item.status !== "uploading" ? (
                  <Button
                    variant="ghost"
                    aria-label={`${text.remove}: ${item.file.name}`}
                    onClick={() => remove(item.id)}
                  >
                    {text.remove}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
