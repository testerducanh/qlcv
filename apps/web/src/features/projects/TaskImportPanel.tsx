import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { Card, CardTitle } from "../../components/Card";
import { readImportFile } from "./task-file-import";
import type { ImportPreviewRow } from "./import-rows";

interface ImportResult {
  created: number;
  undoToken: string;
  expiresIn: number;
}

export function TaskImportPanel({
  projectId,
  canManage,
}: {
  projectId: string;
  canManage: boolean;
}) {
  const { apiFetch } = useAuth();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<ImportPreviewRow[]>([]);
  const [feedback, setFeedback] = useState("");
  const [working, setWorking] = useState(false);
  const [undoToken, setUndoToken] = useState("");

  const updateRow = (index: number, patch: Partial<ImportPreviewRow>) => {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  };

  const parseFile = async (file?: File) => {
    if (!file) return;
    setFeedback("");
    setUndoToken("");
    setWorking(true);
    try {
      const parsed = await readImportFile(file);
      setRows(parsed);
      setFeedback(
        `Đã đọc ${parsed.length} dòng ngay trên thiết bị. Chưa có dữ liệu nào được gửi hoặc nạp.`,
      );
    } catch (error) {
      setRows([]);
      setFeedback(
        error instanceof Error ? error.message : "Không đọc được tệp",
      );
    } finally {
      setWorking(false);
    }
  };

  const importRows = async () => {
    setFeedback("");
    setWorking(true);
    try {
      const result = await apiFetch<ImportResult>(
        `/projects/${projectId}/tasks/import`,
        {
          method: "POST",
          body: JSON.stringify({
            tasks: rows.map(
              ({
                title,
                depth,
                startDate,
                durationDays,
                dueDate,
                description,
                checklist,
              }) => ({
                title,
                depth,
                startDate,
                durationDays,
                dueDate,
                description,
                checklist,
              }),
            ),
          }),
        },
      );
      setUndoToken(result.undoToken);
      setFeedback(
        `Đã nạp ${result.created} việc. Có thể hoàn tác trong ${Math.floor(result.expiresIn / 60)} phút.`,
      );
      await queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "tasks"],
      });
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Không nạp được tệp",
      );
    } finally {
      setWorking(false);
    }
  };

  const undoImport = async () => {
    if (!undoToken) return;
    setFeedback("");
    setWorking(true);
    try {
      const result = await apiFetch<{ deleted: number }>(
        `/projects/${projectId}/tasks/import/undo`,
        {
          method: "POST",
          body: JSON.stringify({ undoToken }),
        },
      );
      setUndoToken("");
      setRows([]);
      setFeedback(`Đã hoàn tác ${result.deleted} việc.`);
      await queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "tasks"],
      });
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Không hoàn tác được",
      );
    } finally {
      setWorking(false);
    }
  };

  return (
    <Card>
      <CardTitle as="h2">Nhập từ tệp</CardTitle>
      <p className="mt-8 text-sm text-text-secondary">
        Hỗ trợ XLSX, CSV và PDF có văn bản. Tệp được đọc ngay trong trình duyệt;
        không tải tệp gốc lên máy chủ, không dùng AI. PDF scan chưa hỗ trợ OCR.
        Người trong tệp chỉ hiển thị để đối chiếu, chưa tự giao việc.
      </p>
      {canManage ? (
        <label className="mt-12 flex flex-col gap-8 text-sm font-medium">
          Chọn tệp (tối đa 10 MB)
          <input
            type="file"
            accept=".xlsx,.csv,.pdf"
            disabled={working || Boolean(undoToken)}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              void parseFile(file);
            }}
            className="min-h-touch rounded-md border border-border-default p-8"
          />
        </label>
      ) : (
        <p className="mt-12 text-sm text-text-secondary">
          Bạn cần quyền quản lý việc để nhập tệp.
        </p>
      )}
      {feedback ? (
        <p className="mt-8 text-sm" role="status">
          {feedback}
        </p>
      ) : null}
      {rows.length ? (
        <>
          <p className="mt-12 text-sm font-semibold">
            Xem trước {rows.length} dòng — chỉnh sửa rồi mới xác nhận nạp
          </p>
          <div className="mt-8 max-h-96 overflow-auto rounded-md border border-border-default">
            <table className="w-full min-w-max border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-surface-muted">
                <tr>
                  <th scope="col" className="p-8">
                    Tên việc
                  </th>
                  <th scope="col" className="p-8">
                    Cấp
                  </th>
                  <th scope="col" className="p-8">
                    Bắt đầu
                  </th>
                  <th scope="col" className="p-8">
                    Kết thúc
                  </th>
                  <th scope="col" className="p-8">
                    Người trong tệp
                  </th>
                  <th scope="col" className="p-8">
                    Độ tin cậy
                  </th>
                  <th scope="col" className="p-8">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={`${index}-${row.title}`}
                    className="border-t border-border-default"
                  >
                    <td className="p-8">
                      <input
                        aria-label={`Tên việc dòng ${index + 1}`}
                        value={row.title}
                        maxLength={500}
                        onChange={(event) =>
                          updateRow(index, { title: event.currentTarget.value })
                        }
                        className="min-h-touch w-full rounded border border-border-default bg-surface-base px-8"
                        style={{
                          paddingInlineStart: `${row.depth * 12}px`,
                        }}
                      />
                      {row.warnings.map((warning) => (
                        <p
                          key={warning}
                          className="mt-4 text-xs text-status-danger"
                        >
                          {warning}
                        </p>
                      ))}
                    </td>
                    <td className="p-8">
                      <input
                        aria-label={`Cấp việc dòng ${index + 1}`}
                        type="number"
                        min={0}
                        max={4}
                        value={row.depth}
                        onChange={(event) =>
                          updateRow(index, {
                            depth: Math.max(
                              0,
                              Math.min(
                                4,
                                Number(event.currentTarget.value) || 0,
                              ),
                            ),
                          })
                        }
                        className="min-h-touch w-20 rounded border border-border-default bg-surface-base px-8"
                      />
                    </td>
                    <td className="p-8">
                      <input
                        aria-label={`Ngày bắt đầu dòng ${index + 1}`}
                        type="date"
                        value={row.startDate ?? ""}
                        onChange={(event) =>
                          updateRow(index, {
                            startDate: event.currentTarget.value || null,
                          })
                        }
                        className="min-h-touch rounded border border-border-default bg-surface-base px-8"
                      />
                    </td>
                    <td className="p-8">
                      <input
                        aria-label={`Ngày kết thúc dòng ${index + 1}`}
                        type="date"
                        value={row.dueDate ?? ""}
                        onChange={(event) =>
                          updateRow(index, {
                            dueDate: event.currentTarget.value || null,
                          })
                        }
                        className="min-h-touch rounded border border-border-default bg-surface-base px-8"
                      />
                    </td>
                    <td className="p-8">{row.assigneeName ?? "—"}</td>
                    <td className="p-8">{Math.round(row.confidence * 100)}%</td>
                    <td className="p-8">
                      <Button
                        variant="danger"
                        disabled={working}
                        onClick={() => {
                          const next = rows.filter(
                            (_, rowIndex) => rowIndex !== index,
                          );
                          setRows(
                            next.map((item, rowIndex) => ({
                              ...item,
                              depth:
                                rowIndex === 0
                                  ? 0
                                  : Math.min(
                                      item.depth,
                                      next[rowIndex - 1].depth + 1,
                                    ),
                            })),
                          );
                        }}
                      >
                        Bỏ dòng
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canManage ? (
            <Button
              className="mt-12"
              variant="primary"
              disabled={
                working || !rows.length || rows.some((row) => !row.title.trim())
              }
              loading={working}
              onClick={() => void importRows()}
            >
              Xác nhận nạp {rows.length} việc
            </Button>
          ) : null}
        </>
      ) : null}
      {undoToken ? (
        <Button
          className="mt-8"
          variant="danger"
          loading={working}
          disabled={working}
          onClick={() => void undoImport()}
        >
          Hoàn tác nhập
        </Button>
      ) : null}
    </Card>
  );
}
