import { describe, expect, it } from "vitest";
import { parseCsv, parsePdfLines, parsePlanRows } from "./import-rows";
import { readImportFile } from "./task-file-import";

describe("file import preview parsing", () => {
  it("maps Vietnamese spreadsheet columns and keeps hierarchy and checklist", () => {
    expect(
      parsePlanRows([
        [
          "Tên công việc",
          "Cấp",
          "Ngày bắt đầu",
          "Thời lượng",
          "Checklist",
          "Người thực hiện",
        ],
        ["Giai đoạn", 1, "2026-11-02", 5, "", ""],
        ["  Chuẩn bị", 2, "03/11/2026", "2 ngày", "Biên bản; Hồ sơ", "An"],
      ]),
    ).toEqual([
      expect.objectContaining({
        title: "Giai đoạn",
        depth: 0,
        startDate: "2026-11-02",
        durationDays: 5,
      }),
      expect.objectContaining({
        title: "Chuẩn bị",
        depth: 1,
        startDate: "2026-11-03",
        durationDays: 2,
        assigneeName: "An",
        checklist: ["Biên bản", "Hồ sơ"],
      }),
    ]);
  });

  it("reports unrecognized dates and safely handles quoted CSV fields", () => {
    const rows = parseCsv(
      'Tên việc,Ghi chú,Ngày kết thúc\r\n"Kiểm tra, nghiệm thu","Có ""biên bản""",sai-ngày',
    );
    expect(rows[1]).toEqual([
      "Kiểm tra, nghiệm thu",
      'Có "biên bản"',
      "sai-ngày",
    ]);
    expect(parsePlanRows(rows)[0]).toMatchObject({
      title: "Kiểm tra, nghiệm thu",
      description: 'Có "biên bản"',
      dueDate: null,
      warnings: ["Không đọc được ngày kết thúc"],
    });
  });

  it("produces low-confidence rows for text PDF and rejects malformed CSV", () => {
    expect(parsePdfLines(["1. Kiểm tra 2026-11-05 3 ngày"])[0]).toMatchObject({
      title: "Kiểm tra",
      startDate: "2026-11-05",
      durationDays: 3,
      confidence: 0.55,
    });
    expect(() => parseCsv('"unfinished')).toThrow("dấu nháy chưa đóng");
  });

  it("reads XLSX data locally before the user commits an import", async () => {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Kế hoạch").addRows([
      ["Tên việc", "Ngày kết thúc"],
      ["Nghiệm thu", "2026-11-20"],
    ]);
    const bytes = await workbook.xlsx.writeBuffer();
    const file = new File([new Uint8Array(bytes)], "ke-hoach.xlsx");

    await expect(readImportFile(file)).resolves.toMatchObject([
      { title: "Nghiệm thu", dueDate: "2026-11-20" },
    ]);
  }, 15_000);
});
