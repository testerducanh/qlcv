import { expect, test, type Page } from "@playwright/test";

const userId = "00000000-0000-4000-8000-000000000001";
const branchId = "00000000-0000-4000-8000-000000000020";
const projectId = "00000000-0000-4000-8000-000000000030";
const candidateId = "00000000-0000-4000-8000-000000000041";
const branch = { id: branchId, name: "Chi nhánh Bắc" };
const session = {
  accessToken: "playwright-test-token",
  user: {
    id: userId,
    email: "owner@example.test",
    name: "Chủ dự án",
    systemRole: "member",
  },
};
const candidate = {
  id: candidateId,
  name: "Thành viên mới",
  email: "member@example.test",
};
const project = {
  id: projectId,
  name: "Dự án mới",
  description: null,
  branchId,
  status: "active",
  startDate: null,
  dueDate: null,
  workCalendar: { weeklyOff: [0, 6], holidays: [] },
  progressMode: "by_workdays",
  confidentiality: "normal",
  statusLabels: {},
  branch,
  owner: { id: userId, name: session.user.name },
  members: [{ role: "owner" }],
};

async function installApiMock(
  page: Page,
  members: { id: string; name: string; email: string }[],
): Promise<{ projectNames: string[]; memberRoles: string[] }> {
  const projectNames: string[] = [];
  const memberRoles: string[] = [];
  await page.route("http://127.0.0.1:3000/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    let body: unknown;
    let status = 200;

    if (url.pathname === "/auth/refresh") {
      body = session;
      status = 201;
    } else if (url.pathname === "/branches/available") {
      body = [branch];
    } else if (url.pathname === "/projects" && method === "GET") {
      body = { items: [], page: 1, pageSize: 20, total: 0 };
    } else if (url.pathname === "/projects" && method === "POST") {
      projectNames.push(JSON.parse(request.postData() ?? "{}").name);
      body = project;
      status = 201;
    } else if (url.pathname === `/projects/${projectId}/available-members`) {
      body = members;
    } else if (
      url.pathname === `/projects/${projectId}/members` &&
      method === "POST"
    ) {
      const input = JSON.parse(request.postData() ?? "{}");
      memberRoles.push(input.role);
      body = { userId: candidateId, role: input.role };
      status = 201;
    } else if (url.pathname === `/projects/${projectId}/members`) {
      body = [
        {
          userId,
          role: "owner",
          user: { ...session.user, status: "active" },
        },
      ];
    } else if (url.pathname === `/projects/${projectId}`) {
      body = project;
    } else {
      body = { message: `Unexpected request: ${url.pathname}` };
      status = 404;
    }

    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  return { projectNames, memberRoles };
}

test("creates a project and invites selected members with the chosen role", async ({
  page,
}) => {
  const requests = await installApiMock(page, [candidate]);
  await page.goto("/du-an");

  await page.getByRole("heading", { name: "Dự án" }).waitFor();
  await page.getByRole("button", { name: "Tạo dự án" }).click();
  const dialog = page.getByRole("dialog", { name: "Tạo dự án" });
  await dialog.getByLabel("Chi nhánh").selectOption(branchId);
  await dialog.getByRole("textbox", { name: "Tên dự án" }).fill("Dự án mới");
  await dialog.getByRole("button", { name: "Tiếp theo" }).click();
  await expect(dialog.getByText("Nội dung khởi đầu")).toBeVisible();
  await dialog.getByRole("button", { name: "Tạo dự án và tiếp tục" }).click();
  await expect(dialog.getByText("Thành viên mới")).toBeVisible();
  await dialog.getByRole("checkbox", { name: /Thành viên mới/ }).check();
  await dialog.getByLabel("Vai trò dự án").selectOption("manager");
  await dialog.getByRole("button", { name: "Mời 1 thành viên" }).click();

  await expect(page.getByRole("heading", { name: "Dự án mới" })).toBeVisible();
  expect(requests.projectNames).toEqual(["Dự án mới"]);
  expect(requests.memberRoles).toEqual(["manager"]);
});

test("shows an accessible inline error for an empty project name", async ({
  page,
}) => {
  await installApiMock(page, []);
  await page.goto("/du-an");
  await page.getByRole("button", { name: "Tạo dự án" }).click();
  const dialog = page.getByRole("dialog", { name: "Tạo dự án" });
  await dialog.getByLabel("Chi nhánh").selectOption(branchId);
  await dialog.getByRole("button", { name: "Tiếp theo" }).click();

  const nameInput = dialog.getByRole("textbox", { name: "Tên dự án" });
  await expect(nameInput).toHaveAttribute("aria-invalid", "true");
  await expect(nameInput).toHaveAttribute("aria-describedby", /-error/);
  await expect(dialog.getByText("Vui lòng nhập tên dự án.")).toBeVisible();
});

test("filters 100 projects and renders a paginated 20-item page", async ({
  page,
}) => {
  const projectQueries: URLSearchParams[] = [];
  await page.route("http://127.0.0.1:3000/**", async (route) => {
    const url = new URL(route.request().url());
    let body: unknown;
    let status = 200;
    if (url.pathname === "/auth/refresh") {
      body = session;
      status = 201;
    } else if (url.pathname === "/branches/available") {
      body = [branch];
    } else if (url.pathname === "/projects") {
      projectQueries.push(new URLSearchParams(url.search));
      const currentPage = Number(url.searchParams.get("page") ?? 1);
      body = {
        items: Array.from({ length: 20 }, (_, index) => ({
          id: `00000000-0000-4000-8000-${String(currentPage * 20 + index + 100).padStart(12, "0")}`,
          name: `Dự án ${currentPage}-${index + 1}`,
          description: null,
          status: "active",
          dueDate: null,
          branch,
          owner: { id: userId, name: session.user.name },
          stats: {
            taskCount: 0,
            overdueTaskCount: 0,
            completionPercent: 0,
          },
        })),
        page: currentPage,
        pageSize: 20,
        total: 100,
      };
    } else {
      body = { message: `Unexpected request: ${url.pathname}` };
      status = 404;
    }

    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await page.goto("/du-an");
  await expect(page.getByText("100 dự án")).toBeVisible();
  await expect(page.locator('a[href^="/du-an/"]')).toHaveCount(20);

  await page.getByRole("button", { name: "Bảng" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByLabel("Tìm theo tên").fill("Dự án 1");
  await page.getByLabel("Chi nhánh").selectOption(branchId);
  await page.getByLabel("Trạng thái").selectOption("active");
  await page.getByLabel("Dự án của tôi").check();
  await page.getByLabel("Tìm theo tên").press("Enter");

  await expect
    .poll(() =>
      projectQueries.some(
        (query) =>
          query.get("search") === "Dự án 1" &&
          query.get("branchId") === branchId &&
          query.get("status") === "active" &&
          query.get("mine") === "true",
      ),
    )
    .toBe(true);
  await page
    .getByRole("navigation", { name: "Phân trang dự án" })
    .getByRole("button", { name: "Tiếp theo" })
    .click();
  await expect(page.getByText("Trang 2 / 5")).toBeVisible();
  await expect(page.locator('a[href^="/du-an/"]')).toHaveCount(20);
});
