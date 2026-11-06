import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";

const userId = "00000000-0000-4000-8000-000000000001";
const projectId = "00000000-0000-4000-8000-000000000030";
const branchId = "00000000-0000-4000-8000-000000000020";
const taskId = "00000000-0000-4000-8000-000000000051";
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
function dayOffset(days: number) {
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
const originalDueDate = dayOffset(3);
const proposedDueDate = dayOffset(5);

function makeTextPdf() {
  const content =
    "BT /F1 12 Tf 50 700 Td (1. Check equipment 2026-11-06 3 days) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let document = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(document, "ascii"));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(document, "ascii");
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    document += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(document, "ascii");
}
const session = {
  accessToken: "phase3-report-test-token",
  user: {
    id: userId,
    email: "owner@example.test",
    name: "Chủ dự án",
    systemRole: "member",
  },
};
const task = {
  id: taskId,
  parentId: null,
  depth: 1,
  type: "task",
  title: "Kiểm tra thiết bị dài để xác nhận nội dung báo cáo được xuống dòng",
  description: "Hạng mục thử nghiệm",
  status: "doing",
  priority: "normal",
  startDate: today,
  durationDays: 2,
  dueDate: originalDueDate,
  progress: 50,
  assigneeId: null,
  recurrenceSeriesId: null,
  recurrenceIndex: null,
  labelIds: [],
  version: 1,
  customFields: {},
};

async function installProjectApi(
  page: Page,
  role = "owner",
  confidentiality = "normal",
) {
  const exports: string[] = [];
  const baselines: Array<{ name: string }> = [];
  const approvalRequests: Array<{
    id: string;
    subjectType: string;
    subjectId: string;
    status: string;
  }> = [];
  const importedTasks: Array<{ title: string; depth: number }[]> = [];
  const recurrences: unknown[] = [];
  let scheduleApplied = false;
  await page.route("http://127.0.0.1:3000/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    let body: unknown = {};
    let status = 200;
    if (path === "/auth/refresh") {
      body = session;
      status = 201;
    } else if (path === `/projects/${projectId}`) {
      body = {
        id: projectId,
        name: "Dự án kiểm thử P3",
        description: null,
        branchId,
        status: "active",
        startDate: "2026-11-02",
        dueDate: "2026-11-30",
        criticalPathEnabled: true,
        autoRescheduleEnabled: true,
        baselineEnabled: true,
        membersMayExport: false,
        workCalendar: { weeklyOff: [0, 6], holidays: [] },
        progressMode: "by_workdays",
        confidentiality,
        statusLabels: {},
        customFieldDefinitions: [],
        branch: { id: branchId, name: "Chi nhánh Bắc" },
        owner: { id: userId, name: "Chủ dự án" },
        members: [{ role }],
      };
    } else if (path === "/branches/available") {
      body = [{ id: branchId, name: "Chi nhánh Bắc" }];
    } else if (path === `/projects/${projectId}/tasks`) {
      body = { items: [task], page: 1, pageSize: 200, total: 1, role: "owner" };
    } else if (path === `/projects/${projectId}/members`) {
      body = [
        {
          userId,
          role,
          user: {
            id: userId,
            name: "Chủ dự án",
            email: "owner@example.test",
            status: "active",
          },
        },
      ];
    } else if (path === `/projects/${projectId}/available-members`) {
      body = [];
    } else if (path === `/projects/${projectId}/labels`) {
      body = [];
    } else if (path === `/projects/${projectId}/reports/baselines`) {
      body = baselines.map((baseline, index) => ({
        id: `baseline-${index}`,
        name: baseline.name,
        createdAt: "2026-11-06T00:00:00.000Z",
        taskCount: 1,
        changedCount: 0,
        changes: [],
      }));
    } else if (
      path === `/projects/${projectId}/reports/baselines` &&
      request.method() === "POST"
    ) {
      const input = JSON.parse(request.postData() ?? "{}") as { name: string };
      baselines.push(input);
      body = { id: "baseline-1", name: input.name, taskCount: 1 };
      status = 201;
    } else if (path === `/projects/${projectId}/reports/export-data`) {
      const requestedFormat = url.searchParams.get("format") ?? "json";
      exports.push(requestedFormat);
      body = {
        project: {
          id: projectId,
          name: "Dự án kiểm thử P3",
          description: null,
          status: "active",
          startDate: "2026-11-02",
          dueDate: "2026-11-30",
          confidentiality: "normal",
          branch: "Chi nhánh Bắc",
          progressMode: "by_workdays",
        },
        labels: [],
        tasks:
          requestedFormat === "pdf"
            ? Array.from({ length: 300 }, (_, index) => ({
                ...task,
                id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
                title: `${index + 1}. Kiểm tra thiết bị dài để xác nhận nội dung báo cáo được xuống dòng qua nhiều trang`,
                labels: [],
              }))
            : [
                {
                  ...task,
                  assignee: null,
                  labels: [],
                  checklist: [],
                  predecessors: [],
                  successors: [],
                },
              ],
        exportedAt: "2026-11-06T00:00:00.000Z",
      };
    } else if (path === `/projects/${projectId}/tasks/critical-path`) {
      body = {
        anchorDate: "2026-11-02",
        projectDurationWorkdays: 2,
        forecastFinishDate: "2026-11-03",
        actualProgressPercent: 50,
        progressForecastFinishDate: "2026-11-10",
        progressForecastMethod: "Tốc độ bình quân theo ngày làm việc.",
        entries: [
          {
            taskId,
            title: task.title,
            totalFloat: 0,
            critical: true,
          },
        ],
      };
    } else if (
      path === `/projects/${projectId}/tasks/schedule/preview/${taskId}`
    ) {
      body = {
        previewToken: "preview-token",
        changes: [
          {
            id: taskId,
            title: task.title,
            previousStartDate: today,
            previousDueDate: originalDueDate,
            startDate: today,
            dueDate: proposedDueDate,
          },
        ],
      };
    } else if (path === `/projects/${projectId}/tasks/schedule/apply`) {
      scheduleApplied = true;
      body = { updated: 1, undoToken: "undo-token" };
    } else if (path === `/projects/${projectId}/tasks/schedule/undo`) {
      body = { restored: 1 };
    } else if (
      path === `/projects/${projectId}/tasks/import` &&
      request.method() === "POST"
    ) {
      const input = JSON.parse(request.postData() ?? "{}") as {
        tasks: Array<{ title: string; depth: number }>;
      };
      importedTasks.push(input.tasks);
      body = {
        created: input.tasks.length,
        undoToken: "import-undo",
        expiresIn: 600,
      };
      status = 201;
    } else if (path === `/projects/${projectId}/tasks/import/undo`) {
      body = { deleted: 1 };
    } else if (path === `/projects/${projectId}/tasks/recurring`) {
      recurrences.push(JSON.parse(request.postData() ?? "{}"));
      body = { created: 4, tasks: [] };
      status = 201;
    } else if (path === `/projects/${projectId}/approval-flows`) {
      body =
        confidentiality === "restricted"
          ? [
              {
                id: "confidential-export-flow",
                name: "Duyệt xuất dữ liệu mật",
                requestType: "confidential_export",
                enabled: true,
              },
            ]
          : [];
    } else if (
      path === `/projects/${projectId}/approval-requests` &&
      request.method() === "GET"
    ) {
      body = approvalRequests;
    } else if (
      path === `/projects/${projectId}/approval-requests` &&
      request.method() === "POST"
    ) {
      const input = JSON.parse(request.postData() ?? "{}") as {
        subjectType: string;
        subjectId: string;
      };
      const approvalRequest = {
        id: "confidential-export-request",
        ...input,
        status: "pending",
      };
      approvalRequests.push(approvalRequest);
      body = approvalRequest;
      status = 201;
    } else if (path === `/projects/${projectId}/task-labels`) {
      body = [];
    } else {
      body = { message: `Unexpected request: ${path}` };
      status = 404;
    }
    if (
      path === `/projects/${projectId}/reports/baselines` &&
      request.method() === "POST"
    ) {
      const input = JSON.parse(request.postData() ?? "{}") as { name: string };
      baselines.push(input);
      body = { id: "baseline-1", name: input.name, taskCount: 1 };
      status = 201;
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  return {
    exports,
    baselines,
    importedTasks,
    recurrences,
    wasScheduleApplied: () => scheduleApplied,
  };
}

function captureBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("saves baselines, previews and undoes schedule changes, exports workbook and opens printable report", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const browserErrors = captureBrowserErrors(page);
  const api = await installProjectApi(page);
  await page.goto(`/du-an/${projectId}`);
  await expect(
    page.getByRole("heading", { name: "Dự án kiểm thử P3" }),
  ).toBeVisible();

  await page.getByLabel("Tên baseline").fill("Kế hoạch gốc");
  await page.getByRole("button", { name: "Lưu baseline" }).click();
  await expect(page.getByText(/Kế hoạch gốc/)).toBeVisible();
  expect(api.baselines.map((item) => item.name)).toEqual(["Kế hoạch gốc"]);

  await page.getByLabel("Chọn tệp (tối đa 10 MB)").setInputFiles({
    name: "ke-hoach.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Tên việc,Cấp,Ngày kết thúc\nChuẩn bị,1,2026-11-12"),
  });
  await expect(page.getByText("Xem trước 1 dòng")).toBeVisible();
  await page.getByRole("button", { name: "Xác nhận nạp 1 việc" }).click();
  await expect(
    page.getByRole("button", { name: "Hoàn tác nhập" }),
  ).toBeVisible();
  expect(api.importedTasks[0]).toEqual([
    expect.objectContaining({ title: "Chuẩn bị", depth: 0 }),
  ]);
  await page.getByRole("button", { name: "Hoàn tác nhập" }).click();
  await expect(page.getByText("Đã hoàn tác 1 việc.")).toBeVisible();

  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Plan").addRows([
    ["Tên việc", "Ngày kết thúc"],
    ["Từ XLSX", dayOffset(6)],
  ]);
  const xlsx = Buffer.from(await workbook.xlsx.writeBuffer());
  const fileInput = page.getByLabel("Chọn tệp (tối đa 10 MB)");
  await fileInput.setInputFiles({
    name: "plan.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: xlsx,
  });
  await expect(
    page.getByRole("textbox", { name: "Tên việc dòng 1" }),
  ).toHaveValue("Từ XLSX");
  await page.getByRole("button", { name: "Xác nhận nạp 1 việc" }).click();
  await page.getByRole("button", { name: "Hoàn tác nhập" }).click();

  await fileInput.setInputFiles({
    name: "plan.pdf",
    mimeType: "application/pdf",
    buffer: makeTextPdf(),
  });
  await expect(
    page.getByRole("textbox", { name: "Tên việc dòng 1" }),
  ).toHaveValue("Check equipment");
  await page.getByRole("button", { name: "Xác nhận nạp 1 việc" }).click();
  await page.getByRole("button", { name: "Hoàn tác nhập" }).click();

  await page.getByLabel("Việc lặp").fill("Kiểm tra an toàn");
  await page.getByLabel("Kỳ đầu").fill(today);
  await page.getByLabel("Số kỳ (tối đa 52)").fill("4");
  await page.getByRole("button", { name: "Tạo các kỳ lặp" }).click();
  await expect(page.getByText("Đã tạo 4 kỳ việc.")).toBeVisible();
  expect(api.recurrences).toHaveLength(1);

  await page
    .getByLabel(
      "Đổi hạn: Kiểm tra thiết bị dài để xác nhận nội dung báo cáo được xuống dòng",
    )
    .fill(proposedDueDate);
  await expect(
    page.getByRole("region", { name: "Xem trước thay đổi lịch" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Xem trước thay đổi lịch" }),
  ).toContainText(
    `${today} – ${originalDueDate} → ${today} – ${proposedDueDate}`,
  );
  await page.getByRole("button", { name: "Áp dụng lịch" }).click();
  await expect.poll(api.wasScheduleApplied).toBe(true);
  await page.getByRole("button", { name: "Hoàn tác tự dời lịch" }).click();
  await expect(page.getByText(/Đã hoàn tác lịch/)).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByLabel("Người phụ trách", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Tải XLSX" }).click();
  const downloadedFile = await download;
  expect(downloadedFile.suggestedFilename()).toBe("Dự án kiểm thử P3.xlsx");
  const downloadedPath = await downloadedFile.path();
  expect(downloadedPath).not.toBeNull();
  const exportedWorkbook = new ExcelJS.Workbook();
  await exportedWorkbook.xlsx.readFile(downloadedPath!);
  const exportedSheet = exportedWorkbook.getWorksheet("Tiến độ");
  expect(exportedSheet?.getRow(5).values).toEqual([
    undefined,
    "Tên việc",
    "Bắt đầu",
    "Kết thúc",
    "Thời lượng",
    "Trạng thái",
    "Tiến độ",
    "Ưu tiên",
    "Nhãn",
    "Ghi chú",
    "Checklist",
    "Phụ thuộc trước",
  ]);
  expect(exportedSheet?.getCell("A6").value).toBe(`  ${task.title}`);
  expect(api.exports).toContain("xlsx");

  await page.getByRole("button", { name: "Xem trước bản in" }).click();
  await expect(
    page.getByRole("heading", { name: "Tùy chọn in" }),
  ).toBeVisible();
  await expect(page.locator(".report-print tbody tr").first()).toContainText(
    "1. Kiểm tra thiết bị dài",
  );
  await expect(page.locator(".report-print tbody tr")).toHaveCount(300);
  await expect(page.locator(".report-signatures section")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "In / Lưu PDF" }),
  ).toBeVisible();
  expect(api.exports).toContain("pdf");
  const pdf = await page.pdf({
    format: "A3",
    landscape: true,
    printBackground: true,
  });
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  expect(pdf.byteLength).toBeGreaterThan(10_000);

  await page.addScriptTag({ content: axe.source });
  const accessibility = await page.evaluate(async () => {
    const result = await (window as Window & { axe: typeof axe }).axe.run(
      document,
    );
    return result.violations
      .filter((violation) => violation.impact === "critical")
      .map((violation) => violation.id);
  });
  expect(accessibility).toEqual([]);
  expect(browserErrors).toEqual([]);
});

test("hides import, baseline and downloads from a read-only project viewer", async ({
  page,
}) => {
  const browserErrors = captureBrowserErrors(page);
  await installProjectApi(page, "viewer");
  await page.goto(`/du-an/${projectId}`);
  await expect(
    page.getByRole("heading", { name: "Dự án kiểm thử P3" }),
  ).toBeVisible();
  await expect(
    page.getByText("Bạn chưa được cấp quyền xuất dữ liệu dự án."),
  ).toBeVisible();
  await expect(
    page.getByText("Bạn cần quyền quản lý việc để nhập tệp."),
  ).toBeVisible();
  await expect(page.getByLabel("Chọn tệp (tối đa 10 MB)")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tải XLSX" })).toHaveCount(0);
  await expect(page.getByLabel("Tên baseline")).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});

test("requests approval before exporting a restricted project", async ({
  page,
}) => {
  const browserErrors = captureBrowserErrors(page);
  await installProjectApi(page, "owner", "restricted");
  await page.goto(`/du-an/${projectId}`);
  await expect(
    page.getByRole("heading", { name: "Dự án mật: phê duyệt xuất dữ liệu" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Yêu cầu duyệt xuất dữ liệu" })
    .click();
  await expect(
    page.getByText("Yêu cầu xuất đang chờ phê duyệt."),
  ).toBeVisible();
  expect(browserErrors).toEqual([]);
});
