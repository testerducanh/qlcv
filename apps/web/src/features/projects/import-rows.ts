export interface ImportPreviewRow {
  title: string;
  depth: number;
  startDate: string | null;
  durationDays: number | null;
  dueDate: string | null;
  description: string | null;
  assigneeName: string | null;
  checklist: string[];
  confidence: number;
  warnings: string[];
}

function cellText(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" || typeof value === "string") {
    return String(value).trim();
  }
  if (value && typeof value === "object") {
    if ("text" in value && typeof value.text === "string")
      return value.text.trim();
    if ("result" in value) return cellText(value.result);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part) =>
          part && typeof part === "object" && "text" in part
            ? String(part.text)
            : "",
        )
        .join("")
        .trim();
    }
  }
  return "";
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .trim();
}

function parseDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const text = cellText(value);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const local = /^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/.exec(text);
  const parts = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : local
      ? [Number(local[3]), Number(local[2]), Number(local[1])]
      : null;
  if (!parts) return null;
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) ===
    `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    ? date.toISOString().slice(0, 10)
    : null;
}

function headerIndex(
  headers: string[],
  alternatives: string[],
): number | undefined {
  const normalizedHeaders = headers.map(normalize);
  const index = normalizedHeaders.findIndex((header) =>
    alternatives.some((alternative) => header.includes(alternative)),
  );
  return index < 0 ? undefined : index;
}

export function parsePlanRows(rows: unknown[][]): ImportPreviewRow[] {
  const headerRow = rows
    .slice(0, 8)
    .findIndex((row) =>
      row.some((value) =>
        ["ten viec", "cong viec", "task", "activity", "noi dung"].some((key) =>
          normalize(cellText(value)).includes(key),
        ),
      ),
    );
  const hasHeader = headerRow >= 0;
  const headers = hasHeader ? rows[headerRow].map(cellText) : [];
  const titleColumn = hasHeader
    ? (headerIndex(headers, [
        "ten viec",
        "cong viec",
        "task",
        "activity",
        "noi dung",
      ]) ?? 0)
    : 0;
  const startColumn = headerIndex(headers, [
    "ngay bat dau",
    "start date",
    "start",
  ]);
  const durationColumn = headerIndex(headers, [
    "thoi luong",
    "duration",
    "so ngay",
  ]);
  const dueColumn = headerIndex(headers, [
    "ngay ket thuc",
    "due date",
    "deadline",
    "han",
  ]);
  const depthColumn = headerIndex(headers, ["cap", "level", "outline"]);
  const assigneeColumn = headerIndex(headers, [
    "nguoi thuc hien",
    "nguoi phu trach",
    "assignee",
    "responsible",
  ]);
  const noteColumn = headerIndex(headers, ["ghi chu", "note", "description"]);
  const checklistColumn = headerIndex(headers, ["checklist", "danh sach kiem"]);
  const firstDataRow = hasHeader ? headerRow + 1 : 0;
  const output: ImportPreviewRow[] = [];

  for (const row of rows.slice(firstDataRow)) {
    const rawTitle = cellText(row[titleColumn]);
    if (!rawTitle.trim()) continue;
    const warnings: string[] = [];
    const title = rawTitle.trim().slice(0, 500);
    if (rawTitle.trim().length > 500) {
      warnings.push("Tên việc đã được rút gọn");
    }
    const startDate =
      startColumn === undefined || !cellText(row[startColumn])
        ? null
        : parseDate(row[startColumn]);
    const dueDate =
      dueColumn === undefined || !cellText(row[dueColumn])
        ? null
        : parseDate(row[dueColumn]);
    if (startColumn !== undefined && cellText(row[startColumn]) && !startDate) {
      warnings.push("Không đọc được ngày bắt đầu");
    }
    if (dueColumn !== undefined && cellText(row[dueColumn]) && !dueDate) {
      warnings.push("Không đọc được ngày kết thúc");
    }
    const durationValue =
      durationColumn === undefined ? "" : cellText(row[durationColumn]);
    const durationMatch = /-?\d+(?:[.,]\d+)?/.exec(durationValue);
    const durationDays = durationMatch
      ? Math.max(0, Math.round(Number(durationMatch[0].replace(",", "."))))
      : null;
    const depthValue =
      depthColumn === undefined ? "" : cellText(row[depthColumn]);
    const explicitDepth = /^\d+$/.test(depthValue)
      ? Math.max(0, Number(depthValue) - (Number(depthValue) > 0 ? 1 : 0))
      : null;
    const indentation = /^[\t ]+/.exec(rawTitle)?.[0] ?? "";
    const inferredDepth = Math.floor(
      indentation.replace(/\t/g, "  ").length / 2,
    );
    const rawDescription =
      noteColumn === undefined ? "" : cellText(row[noteColumn]);
    const description = rawDescription ? rawDescription.slice(0, 20000) : null;
    if (rawDescription.length > 20000) {
      warnings.push("Ghi chú đã được rút gọn");
    }
    const assigneeName =
      assigneeColumn === undefined
        ? null
        : cellText(row[assigneeColumn]).slice(0, 255) || null;
    const checklist =
      checklistColumn === undefined
        ? []
        : cellText(row[checklistColumn])
            .split(/\r?\n|[;|]/)
            .map((item) => item.trim().slice(0, 500))
            .filter(Boolean)
            .slice(0, 100);
    output.push({
      title: title.slice(0, 500),
      depth: Math.min(4, explicitDepth ?? inferredDepth),
      startDate,
      durationDays,
      dueDate,
      description,
      assigneeName,
      checklist,
      confidence: Math.max(
        0.2,
        (hasHeader ? 0.88 : 0.55) - warnings.length * 0.2,
      ),
      warnings,
    });
    if (output.length > 1000) {
      throw new Error("Tệp vượt quá giới hạn 1.000 dòng việc");
    }
  }
  if (!output.length) throw new Error("Không tìm thấy dòng việc trong tệp");
  return output;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error("Tệp CSV có dấu nháy chưa đóng");
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

export function parsePdfLines(lines: string[]): ImportPreviewRow[] {
  const rows: ImportPreviewRow[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length < 2 || /^(trang|page)\s+\d+/i.test(line)) continue;
    const startMatch =
      /\b(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/. -]\d{1,2}[/. -]\d{4})\b/.exec(line);
    const parsedDate = startMatch ? parseDate(startMatch[1]) : null;
    const durationMatch = /\b(\d+)\s*(?:ngày|ngay|days?)\b/i.exec(line);
    const title = line
      .replace(/^[-*•]?\s*\d*[.)]?\s*/, "")
      .replace(startMatch?.[0] ?? "", "")
      .replace(durationMatch?.[0] ?? "", "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!title) continue;
    rows.push({
      title,
      depth: 0,
      startDate: parsedDate,
      durationDays: durationMatch ? Number(durationMatch[1]) : null,
      dueDate: parsedDate,
      description: line.slice(0, 20000),
      assigneeName: null,
      checklist: [],
      confidence: parsedDate ? 0.55 : 0.4,
      warnings: ["Đọc PDF theo dòng, cần kiểm tra tên và cột ngày"],
    });
  }
  if (!rows.length)
    throw new Error("Không tìm thấy dòng việc có thể đọc trong PDF");
  if (rows.length > 1000)
    throw new Error("PDF vượt quá giới hạn 1.000 dòng việc");
  return rows;
}
