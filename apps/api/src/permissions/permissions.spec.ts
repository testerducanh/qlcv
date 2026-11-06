import {
  can,
  canInProject,
  presentTask,
  permissionVisibility,
  type PermissionResource,
  type PermissionUser,
  type ProjectAction,
  type ProjectRole,
} from "./permissions";

const roles: ProjectRole[] = [
  "owner",
  "manager",
  "member",
  "restricted",
  "commenter",
  "viewer",
];

// Thứ tự cột: owner, manager, member, restricted, commenter, viewer. Y = có, O = chỉ của mình, - = không.
const table: Array<[ProjectAction, string]> = [
  ["project.view", "YYYOYY"],
  ["task.view", "YYYOYY"],
  ["task.write", "YYYO--"],
  ["task.assign", "YYY---"],
  ["task.progress", "YYYO--"],
  ["attachment.add", "YYYOY-"],
  ["attachment.deleteOthers", "YY----"],
  ["comment.write", "YYYYY-"],
  ["project.settings", "YY----"],
  ["member.manage", "YY----"],
  ["template.save", "YY----"],
  ["project.delete", "Y-----"],
];

describe("canInProject", () => {
  for (const [action, row] of table) {
    roles.forEach((role, i) => {
      const cell = row[i];
      it(`${role} / ${action}: ${cell}`, () => {
        expect(canInProject(role, action, { isOwnTask: false })).toBe(
          cell === "Y",
        );
        expect(canInProject(role, action, { isOwnTask: true })).toBe(
          cell === "Y" || cell === "O",
        );
      });
    });
  }

  it("thành viên chỉ duyệt khi là người duyệt", () => {
    expect(canInProject("member", "task.approve")).toBe(false);
    expect(canInProject("member", "task.approve", { isApprover: true })).toBe(
      true,
    );
    expect(canInProject("manager", "task.approve")).toBe(true);
    expect(canInProject("viewer", "task.approve", { isApprover: true })).toBe(
      false,
    );
  });

  it("xuất dữ liệu: thành viên theo cấu hình dự án", () => {
    expect(canInProject("member", "data.export")).toBe(false);
    expect(
      canInProject("member", "data.export", { membersMayExport: true }),
    ).toBe(true);
    expect(
      canInProject("restricted", "data.export", { membersMayExport: true }),
    ).toBe(false);
  });

  it("không có vai trò thì không có quyền gì", () => {
    expect(canInProject(null, "project.view")).toBe(false);
    expect(canInProject(undefined, "comment.write")).toBe(false);
  });
});

describe("can: quyền theo phạm vi hệ thống", () => {
  const executive: PermissionUser = {
    id: "executive",
    organizationId: "org-1",
    systemRole: "executive",
  };
  const branchDirector: PermissionUser = {
    id: "branch-director",
    organizationId: "org-1",
    systemRole: "branch_director",
    branchId: "branch-1",
  };
  const departmentHead: PermissionUser = {
    id: "department-head",
    organizationId: "org-1",
    systemRole: "department_head",
    managedDepartmentIds: ["department-1"],
  };
  const project: PermissionResource = {
    type: "project",
    organizationId: "org-1",
    projectId: "project-1",
    branchId: "branch-1",
    confidentiality: "normal",
  };
  const task: PermissionResource = {
    type: "task",
    organizationId: "org-1",
    projectId: "project-1",
    branchId: "branch-2",
    confidentiality: "normal",
    creatorId: "another-user",
    departmentIds: ["department-1"],
  };

  it("executive chỉ xem tổng hợp toàn công ty, không được ngầm xem chi tiết dự án", () => {
    expect(
      can(executive, "company.dashboard.view", {
        type: "company_dashboard",
        organizationId: "org-1",
      }),
    ).toBe(true);
    expect(can(executive, "project.view", project)).toBe(false);
    expect(
      can({ ...executive, organizationId: "org-2" }, "company.dashboard.view", {
        type: "company_dashboard",
        organizationId: "org-1",
      }),
    ).toBe(false);
  });

  describe("task reviewer permission", () => {
    const reviewer: PermissionUser = {
      id: "reviewer",
      organizationId: "org-1",
      systemRole: "member",
    };
    const task: PermissionResource = {
      type: "task",
      organizationId: "org-1",
      projectId: "project-1",
      branchId: "branch-1",
      confidentiality: "normal",
      projectRole: "member",
      creatorId: "assigner",
      assigneeId: "assignee",
      reviewerId: "reviewer",
    };

    it("allows only the configured project member to approve", () => {
      expect(permissionVisibility(reviewer, "task.approve", task)).toBe("full");
      expect(
        permissionVisibility(
          { ...reviewer, id: "another-member" },
          "task.approve",
          task,
        ),
      ).toBe("none");
    });
  });

  it("giám đốc chi nhánh chỉ quản lý dự án thường trong chi nhánh của mình", () => {
    expect(can(branchDirector, "project.view", project)).toBe(true);
    expect(
      can(branchDirector, "task.write", {
        ...task,
        branchId: "branch-1",
      }),
    ).toBe(true);
    expect(
      can(branchDirector, "task.write", {
        ...task,
        branchId: "branch-1",
        projectRole: "viewer",
      }),
    ).toBe(true);
    expect(
      can(branchDirector, "project.view", {
        ...project,
        branchId: "branch-2",
      }),
    ).toBe(false);
    expect(can(branchDirector, "project.delete", project)).toBe(false);
  });

  it("trưởng phòng xem việc của phòng xuyên dự án, không được tự có quyền sửa", () => {
    expect(can(departmentHead, "task.view", task)).toBe(true);
    expect(
      can(departmentHead, "task.view", {
        ...task,
        projectId: "another-project",
      }),
    ).toBe(true);
    expect(
      can(departmentHead, "task.view", {
        ...task,
        projectRole: "viewer",
      }),
    ).toBe(true);
    expect(can(departmentHead, "task.write", task)).toBe(false);
    expect(
      can(departmentHead, "task.view", {
        ...task,
        departmentIds: ["department-2"],
      }),
    ).toBe(false);
  });

  it("dự án mật không cho người ngoài xem nội dung; quản lý đúng phạm vi chỉ thấy placeholder", () => {
    const restrictedTask: PermissionResource = {
      ...task,
      type: "task",
      branchId: "branch-1",
      confidentiality: "restricted",
    };
    expect(
      permissionVisibility(branchDirector, "task.view", restrictedTask),
    ).toBe("limited");
    expect(
      permissionVisibility(departmentHead, "task.view", restrictedTask),
    ).toBe("limited");
    expect(can(branchDirector, "task.write", restrictedTask)).toBe(false);
    expect(can(executive, "task.view", restrictedTask)).toBe(false);
    expect(
      can(
        { ...departmentHead, managedDepartmentIds: ["department-2"] },
        "task.view",
        restrictedTask,
      ),
    ).toBe(false);
    expect(
      presentTask(
        { title: "Nội dung bí mật", progress: 45, description: "Chi tiết" },
        "limited",
      ),
    ).toEqual({
      title: "Việc hạn chế",
      progress: 45,
    });
  });

  it("thành viên có vai trò dự án vẫn tuân theo ma trận trong dự án mật", () => {
    const memberTask: PermissionResource = {
      type: "task",
      organizationId: "org-1",
      projectId: "secret-project",
      branchId: "branch-1",
      confidentiality: "restricted",
      creatorId: "member",
      projectRole: "restricted",
    };
    expect(
      permissionVisibility(
        { ...branchDirector, id: "member" },
        "task.view",
        memberTask,
      ),
    ).toBe("full");
    expect(
      can({ ...branchDirector, branchId: "branch-2" }, "task.view", {
        ...memberTask,
        projectRole: null,
        creatorId: "someone-else",
      }),
    ).toBe(false);
  });

  it("dashboard chi nhánh chỉ dành cho giám đốc đúng chi nhánh", () => {
    expect(
      can(branchDirector, "branch.dashboard.view", {
        type: "branch_dashboard",
        organizationId: "org-1",
        branchId: "branch-1",
      }),
    ).toBe(true);
    expect(
      can(branchDirector, "branch.dashboard.view", {
        type: "branch_dashboard",
        organizationId: "org-1",
        branchId: "branch-2",
      }),
    ).toBe(false);
  });
});
