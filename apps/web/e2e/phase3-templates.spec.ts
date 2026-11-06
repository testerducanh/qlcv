import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";

const userId = "00000000-0000-4000-8000-000000000001";
const projectId = "00000000-0000-4000-8000-000000000030";
const templateId = "00000000-0000-4000-8000-000000000060";
const session = {
  accessToken: "phase3-template-test-token",
  user: {
    id: userId,
    email: "owner@example.test",
    name: "Chủ dự án",
    systemRole: "member",
  },
};
const project = { id: projectId, name: "Dự án mẫu" };

function captureBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("creates, publishes, previews and applies a project template", async ({
  page,
}) => {
  const browserErrors = captureBrowserErrors(page);
  const requests: string[] = [];
  let template = {
    id: templateId,
    name: "Mẫu kiểm thử",
    description: "Cây việc thử",
    kind: "project" as const,
    ownership: "personal" as const,
    status: "draft" as "draft" | "published",
    currentVersion: 1,
    tags: [],
    _count: { usages: 0 },
    createdById: userId,
    versions: [
      {
        id: "00000000-0000-4000-8000-000000000061",
        version: 1,
        content: {
          tasks: [
            {
              title: "Chuẩn bị",
              type: "group",
              checklist: [],
              children: [
                {
                  title: "Kiểm tra",
                  type: "task",
                  checklist: [],
                  children: [],
                },
              ],
            },
          ],
        },
      },
    ],
  };
  await page.route("http://127.0.0.1:3000/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    let body: unknown = {};
    let status = 200;
    if (path === "/auth/refresh") {
      body = session;
      status = 201;
    } else if (path === "/templates" && request.method() === "GET") {
      body = template.status === "draft" ? [] : [template];
    } else if (path === "/templates" && request.method() === "POST") {
      requests.push("create");
      template = {
        ...template,
        name: (JSON.parse(request.postData() ?? "{}") as { name: string }).name,
      };
      body = template;
      status = 201;
    } else if (path === `/templates/${templateId}`) {
      body = template;
    } else if (
      path === `/templates/${templateId}/request-publication` &&
      request.method() === "POST"
    ) {
      requests.push("publish");
      template = { ...template, status: "published" };
      body = template;
      status = 201;
    } else if (path === `/templates/${templateId}/apply`) {
      requests.push("apply");
      body = { taskCount: 2, undoToken: "template-undo" };
      status = 201;
    } else if (path === "/projects") {
      body = { items: [project], page: 1, pageSize: 200, total: 1 };
    } else if (path === `/projects/${projectId}/members`) {
      body = [{ userId, user: { name: "Chủ dự án" } }];
    } else {
      body = { message: `Unexpected request: ${path}` };
      status = 404;
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await page.goto("/mau");
  const domContentLoadedMs = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    return navigation?.domContentLoadedEventEnd ?? Number.POSITIVE_INFINITY;
  });
  expect(domContentLoadedMs).toBeLessThan(5_000);
  await page.getByLabel("Tên mẫu").fill("Mẫu kiểm thử");
  await page.getByLabel("Mô tả").fill("Cây việc thử");
  await page.getByRole("button", { name: "Tạo mẫu nháp" }).click();
  await expect(page.getByText("Đã tạo mẫu nháp.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Mẫu kiểm thử" }),
  ).toBeVisible();
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => {
    const result = await (window as Window & { axe: typeof axe }).axe.run(
      document,
    );
    return result.violations
      .filter(
        (violation) =>
          violation.impact === "critical" || violation.impact === "serious",
      )
      .map((violation) => violation.id);
  });
  expect(violations).toEqual([]);
  await page.getByText("Xem trước cây việc").click();
  await expect(page.locator("pre")).toContainText("Chuẩn bị");
  await page.getByRole("button", { name: "Công bố mẫu cá nhân" }).click();
  await expect(page.getByText("Đã công bố mẫu cá nhân.")).toBeVisible();
  await page.getByLabel("Nạp vào dự án").selectOption(projectId);
  await page.getByRole("button", { name: "Nạp mẫu" }).click();
  await expect(page.getByText("Đã nạp 2 việc vào dự án.")).toBeVisible();
  expect(requests).toEqual(["create", "publish", "apply"]);
  expect(browserErrors).toEqual([]);
});

test("submits a branch template for approval and keeps it unpublished while pending", async ({
  page,
}) => {
  const browserErrors = captureBrowserErrors(page);
  const template = {
    id: templateId,
    name: "Mẫu cấp chi nhánh",
    description: "Chờ duyệt",
    kind: "project",
    ownership: "branch",
    status: "draft",
    currentVersion: 1,
    tags: [],
    _count: { usages: 0 },
    createdById: userId,
    versions: [
      {
        id: "00000000-0000-4000-8000-000000000061",
        version: 1,
        content: { tasks: [{ title: "Việc thử", type: "task", children: [] }] },
      },
    ],
  };
  let templateStatus = "draft";
  let approvalRequest: Record<string, unknown> | null = null;
  await page.route("http://127.0.0.1:3000/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body: unknown = {};
    let status = 200;
    if (path === "/auth/refresh") {
      body = session;
      status = 201;
    } else if (path === "/templates" && request.method() === "GET") {
      body = [{ ...template, status: templateStatus }];
    } else if (path === `/templates/${templateId}`) {
      body = { ...template, status: templateStatus };
    } else if (path === "/projects") {
      body = { items: [project], page: 1, pageSize: 200, total: 1 };
    } else if (path === `/projects/${projectId}/approval-flows`) {
      body = [
        {
          id: "publication-flow",
          name: "Duyệt công bố mẫu",
          requestType: "template_publish",
          enabled: true,
        },
      ];
    } else if (
      path === `/templates/${templateId}/request-publication` &&
      request.method() === "POST"
    ) {
      const input = JSON.parse(request.postData() ?? "{}") as {
        projectId: string;
        flowId: string;
      };
      expect(input).toEqual({
        projectId,
        flowId: "publication-flow",
      });
      templateStatus = "pending_approval";
      approvalRequest = { id: "publication-request", status: "pending" };
      body = approvalRequest;
      status = 201;
    } else {
      body = { message: `Unexpected request: ${path}` };
      status = 404;
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await page.goto("/mau");
  await page.getByRole("button", { name: /Mẫu cấp chi nhánh/ }).click();
  await page.getByLabel("Dự án yêu cầu duyệt").selectOption(projectId);
  await page.getByLabel("Luồng duyệt công bố").selectOption("publication-flow");
  await page.getByRole("button", { name: "Gửi duyệt công bố" }).click();
  await expect(
    page.getByText("Đã gửi yêu cầu công bố qua luồng duyệt."),
  ).toBeVisible();
  await expect(page.getByText("Trạng thái: pending_approval")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Gửi duyệt công bố" }),
  ).toBeDisabled();
  expect(approvalRequest).toMatchObject({ status: "pending" });
  expect(browserErrors).toEqual([]);
});

test("does not offer publication controls to a user who does not own the draft", async ({
  page,
}) => {
  const browserErrors = captureBrowserErrors(page);
  const draft = {
    id: templateId,
    name: "Bản nháp của người khác",
    description: "Không được công bố",
    kind: "project",
    ownership: "branch",
    status: "draft",
    currentVersion: 1,
    tags: [],
    _count: { usages: 0 },
    createdById: "00000000-0000-4000-8000-000000000099",
    versions: [
      {
        id: "00000000-0000-4000-8000-000000000061",
        version: 1,
        content: { tasks: [] },
      },
    ],
  };
  await page.route("http://127.0.0.1:3000/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path === "/auth/refresh") {
      body = session;
    } else if (path === "/templates") {
      body = [draft];
    } else if (path === `/templates/${templateId}`) {
      body = draft;
    } else if (path === "/projects") {
      body = { items: [], page: 1, pageSize: 200, total: 0 };
    } else {
      body = { message: `Unexpected request: ${path}` };
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await page.goto("/mau");
  await page.getByRole("button", { name: /Bản nháp của người khác/ }).click();
  await expect(
    page.getByRole("heading", { name: "Bản nháp của người khác" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Công bố mẫu|Gửi duyệt công bố/ }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel(
      "Nội dung mẫu JSON (ngày, người và tệp thật không được chấp nhận)",
    ),
  ).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});
