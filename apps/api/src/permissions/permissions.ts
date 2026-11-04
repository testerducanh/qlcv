/** Ma trận quyền theo vai trò trong dự án: docs/phan-tich-v2.md mục 8.3. */
export type ProjectRole =
  | "owner"
  | "manager"
  | "member"
  | "restricted"
  | "commenter"
  | "viewer";

export type ProjectAction =
  | "project.view"
  | "task.write"
  | "task.assign"
  | "task.progress"
  | "attachment.add"
  | "attachment.deleteOthers"
  | "comment.write"
  | "task.approve"
  | "project.settings"
  | "member.manage"
  | "template.save"
  | "data.export"
  | "project.delete";

/** all: mọi việc. own: chỉ việc của mình. approver: chỉ khi là người duyệt. config: theo cấu hình dự án. */
type Scope = "all" | "own" | "approver" | "config";

const M: Record<ProjectAction, Partial<Record<ProjectRole, Scope>>> = {
  "project.view": { owner: "all", manager: "all", member: "all", restricted: "own", commenter: "all", viewer: "all" },
  "task.write": { owner: "all", manager: "all", member: "all", restricted: "own" },
  "task.assign": { owner: "all", manager: "all", member: "all" },
  "task.progress": { owner: "all", manager: "all", member: "all", restricted: "own" },
  "attachment.add": { owner: "all", manager: "all", member: "all", restricted: "own", commenter: "all" },
  "attachment.deleteOthers": { owner: "all", manager: "all" },
  "comment.write": { owner: "all", manager: "all", member: "all", restricted: "all", commenter: "all" },
  "task.approve": { owner: "all", manager: "all", member: "approver" },
  "project.settings": { owner: "all", manager: "all" },
  "member.manage": { owner: "all", manager: "all" },
  "template.save": { owner: "all", manager: "all" },
  "data.export": { owner: "all", manager: "all", member: "config" },
  "project.delete": { owner: "all" },
};

export interface PermissionContext {
  /** Việc được giao hoặc do chính người dùng tạo. */
  isOwnTask?: boolean;
  /** Người dùng là người duyệt của việc này. */
  isApprover?: boolean;
  /** Dự án cho phép thành viên xuất dữ liệu. */
  membersMayExport?: boolean;
}

export function canInProject(
  role: ProjectRole | null | undefined,
  action: ProjectAction,
  ctx: PermissionContext = {},
): boolean {
  if (!role) return false;
  const scope = M[action][role];
  switch (scope) {
    case "all":
      return true;
    case "own":
      return ctx.isOwnTask === true;
    case "approver":
      return ctx.isApprover === true;
    case "config":
      return ctx.membersMayExport === true;
    default:
      return false;
  }
}