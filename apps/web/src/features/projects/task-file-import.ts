import {
  parseCsv,
  parsePdfLines,
  parsePlanRows,
  type ImportPreviewRow,
} from "./import-rows";

const maxFileSize = 10 * 1024 * 1024;

function unwrapCell(value: unknown): unknown {
  if (value && typeof value === "object" && "result" in value) {
    return value.result;
  }
  if (value && typeof value === "object" && "text" in value) {
    return value.text;
  }
  return value;
}

async function readPdf(file: File): Promise<ImportPreviewRow[]> {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const loadingTask = pdfjs.getDocument({
    data: await file.arrayBuffer(),
  });
  const document = await loadingTask.promise;
  try {
    if (document.numPages > 100) {
      throw new Error("PDF vượt quá giới hạn 100 trang");
    }
    const lines: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageLines = new Map<number, string[]>();
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const y = Math.round(item.transform[5] / 3) * 3;
        const current = pageLines.get(y) ?? [];
        current.push(item.str);
        pageLines.set(y, current);
      }
      lines.push(
        ...[...pageLines.entries()]
          .sort(([left], [right]) => right - left)
          .map(([, parts]) => parts.join(" ")),
      );
    }
    return parsePdfLines(lines);
  } finally {
    await loadingTask.destroy();
  }
}

export async function readImportFile(file: File): Promise<ImportPreviewRow[]> {
  if (file.size === 0 || file.size > maxFileSize) {
    throw new Error("Tệp phải có dung lượng từ 1 byte đến 10 MB");
  }
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "pdf") {
    return readPdf(file);
  }
  if (extension === "csv") {
    return parsePlanRows(parseCsv(await file.text()));
  }
  if (extension !== "xlsx") {
    throw new Error("Chỉ hỗ trợ tệp XLSX, CSV hoặc PDF");
  }

  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("Tệp Excel không có trang tính");
  const rows: unknown[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values: unknown[] = [];
    for (let index = 1; index <= row.cellCount; index += 1) {
      values.push(unwrapCell(row.getCell(index).value));
    }
    rows.push(values);
    if (rows.length > 1008) {
      throw new Error("Tệp vượt quá giới hạn 1.000 dòng việc");
    }
  });
  return parsePlanRows(rows);
}
