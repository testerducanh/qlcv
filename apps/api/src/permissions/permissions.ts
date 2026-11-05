/** Ma trận quyền theo vai trò trong dự án: docs/phan-tich-v2.md mục 8.3. */
export type ProjectRole =
  "owner" | "manager" | "member" | "restricted" | "commenter" | "viewer";

export type ProjectAction =
  | "project.view"
  | "task.view"
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
  "project.view": {
    owner: "all",
    manager: "all",
    member: "all",
    restricted: "own",
    commenter: "all",
    viewer: "all",
  },
  "task.view": {
    owner: "all",
    manager: "all",
    member: "all",
    restricted: "own",
    commenter: "all",
    viewer: "all",
  },
  "task.write": {
    owner: "all",
    manager: "all",
    member: "all",
    restricted: "own",
  },
  "task.assign": { owner: "all", manager: "all", member: "all" },
  "task.progress": {
    owner: "all",
    manager: "all",
    member: "all",
    restricted: "own",
  },
  "attachment.add": {
    owner: "all",
    manager: "all",
    member: "all",
    restricted: "own",
    commenter: "all",
  },
  "attachment.deleteOthers": { owner: "all", manager: "all" },
  "comment.write": {
    owner: "all",
    manager: "all",
    member: "all",
    restricted: "all",
    commenter: "all",
  },
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

export type SystemRole =
  | "system_admin"
  | "executive"
  | "branch_director"
  | "department_head"
  | "member";
export type PermissionAction =
  ProjectAction | "company.dashboard.view" | "branch.dashboard.view";
export type PermissionVisibility = "full" | "limited" | "none";
export type AllowedPermissionVisibility = Exclude<PermissionVisibility, "none">;

export interface PermissionUser {
  id: string;
  organizationId: string;
  systemRole: SystemRole;
  branchId?: string | null;
  /** Departments where the user is a head (UserDepartment.isHead = true). */
  managedDepartmentIds?: string[];
}

interface OrganizationResource {
  organizationId: string;
}

export interface CompanyDashboardResource extends OrganizationResource {
  type: "company_dashboard";
}

export interface BranchDashboardResource extends OrganizationResource {
  type: "branch_dashboard";
  branchId: string;
}

interface ProjectResourceBase extends OrganizationResource {
  projectId: string;
  branchId: string;
  confidentiality: "normal" | "restricted";
  projectRole?: ProjectRole | null;
}

export interface ProjectPermissionResource extends ProjectResourceBase {
  type: "project";
}

export interface TaskPermissionResource extends ProjectResourceBase {
  type: "task";
  assigneeId?: string | null;
  reviewerId?: string | null;
  creatorId: string;
  departmentIds?: string[];
}

export type PermissionResource =
  | CompanyDashboardResource
  | BranchDashboardResource
  | ProjectPermissionResource
  | TaskPermissionResource;

function isDepartmentTask(
  user: PermissionUser,
  resource: TaskPermissionResource,
): boolean {
  const departmentIds = user.managedDepartmentIds ?? [];
  return departmentIds.some((id) => resource.departmentIds?.includes(id));
}

function isOwnTask(
  user: PermissionUser,
  resource: TaskPermissionResource,
): boolean {
  return resource.assigneeId === user.id || resource.creatorId === user.id;
}

function canInSystemScope(
  user: PermissionUser,
  action: ProjectAction,
  resource: ProjectResourceBase,
): PermissionVisibility {
  if (user.organizationId !== resource.organizationId) return "none";

  const isBranchDirector =
    user.systemRole === "branch_director" &&
    user.branchId === resource.branchId;
  const canManageBranchProject =
    isBranchDirector &&
    resource.confidentiality === "normal" &&
    action !== "project.delete";

  if (canManageBranchProject) {
    return canInProject("manager", action) ? "full" : "none";
  }

  return "none";
}

/**
 * Returns whether a user may access a resource and, for scoped managers of
 * confidential tasks, whether the response must be reduced to a placeholder.
 */
export function permissionVisibility(
  user: PermissionUser | null | undefined,
  action: PermissionAction,
  resource: PermissionResource,
): PermissionVisibility {
  if (!user || user.organizationId !== resource.organizationId) return "none";

  if (resource.type === "company_dashboard") {
    return action === "company.dashboard.view" &&
      user.systemRole === "executive"
      ? "full"
      : "none";
  }

  if (resource.type === "branch_dashboard") {
    return action === "branch.dashboard.view" &&
      user.systemRole === "branch_director" &&
      user.branchId === resource.branchId
      ? "full"
      : "none";
  }

  if (action === "company.dashboard.view" || action === "branch.dashboard.view")
    return "none";

  if (resource.type === "project") {
    if (action !== "project.view") return "none";
    if (resource.confidentiality === "normal") {
      const scopedVisibility = canInSystemScope(user, action, resource);
      if (scopedVisibility !== "none") return scopedVisibility;
    }
    if (resource.projectRole)
      return canInProject(resource.projectRole, action) ? "full" : "none";
    return canInSystemScope(user, action, resource);
  }

  if (resource.confidentiality === "normal") {
    const scopedVisibility = canInSystemScope(user, action, resource);
    if (scopedVisibility !== "none") return scopedVisibility;

    if (
      user.systemRole === "department_head" &&
      isDepartmentTask(user, resource)
    ) {
      return action === "task.view" ? "full" : "none";
    }
  }

  if (resource.projectRole) {
    return canInProject(resource.projectRole, action, {
      isOwnTask: isOwnTask(user, resource),
      isApprover: resource.reviewerId === user.id,
    })
      ? "full"
      : "none";
  }

  if (resource.confidentiality === "restricted") {
    const managesBranch =
      user.systemRole === "branch_director" &&
      user.branchId === resource.branchId;
    const managesDepartment =
      user.systemRole === "department_head" && isDepartmentTask(user, resource);
    return action === "task.view" && (managesBranch || managesDepartment)
      ? "limited"
      : "none";
  }

  return "none";
}

export function can(
  user: PermissionUser | null | undefined,
  action: PermissionAction,
  resource: PermissionResource,
): boolean {
  return permissionVisibility(user, action, resource) !== "none";
}

export interface RestrictedTaskView {
  title: "Việc hạn chế";
  progress: number;
}

export function presentTask<T extends { title: string; progress: number }>(
  task: T,
  visibility: AllowedPermissionVisibility,
): T | RestrictedTaskView {
  if (visibility === "limited") {
    return { title: "Việc hạn chế", progress: task.progress };
  }
  return task;
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
