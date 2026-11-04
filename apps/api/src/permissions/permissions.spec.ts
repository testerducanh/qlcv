import { canInProject, type ProjectAction, type ProjectRole } from "./permissions";

const roles: ProjectRole[] = ["owner", "manager", "member", "restricted", "commenter", "viewer"];

// Thứ tự cột: owner, manager, member, restricted, commenter, viewer. Y = có, O = chỉ của mình, - = không.
const table: Array<[ProjectAction, string]> = [
  ["project.view", "YYYOYY"],
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
        expect(canInProject(role, action, { isOwnTask: false })).toBe(cell === "Y");
        expect(canInProject(role, action, { isOwnTask: true })).toBe(cell === "Y" || cell === "O");
      });
    });
  }

  it("thành viên chỉ duyệt khi là người duyệt", () => {
    expect(canInProject("member", "task.approve")).toBe(false);
    expect(canInProject("member", "task.approve", { isApprover: true })).toBe(true);
    expect(canInProject("manager", "task.approve")).toBe(true);
    expect(canInProject("viewer", "task.approve", { isApprover: true })).toBe(false);
  });

  it("xuất dữ liệu: thành viên theo cấu hình dự án", () => {
    expect(canInProject("member", "data.export")).toBe(false);
    expect(canInProject("member", "data.export", { membersMayExport: true })).toBe(true);
    expect(canInProject("restricted", "data.export", { membersMayExport: true })).toBe(false);
  });

  it("không có vai trò thì không có quyền gì", () => {
    expect(canInProject(null, "project.view")).toBe(false);
    expect(canInProject(undefined, "comment.write")).toBe(false);
  });
});