export interface ApprovalFlowStep {
  userId?: string;
  role?: "owner" | "manager" | "member" | "restricted" | "commenter" | "viewer";
  slaHours: number;
  canForward: boolean;
  important: boolean;
}

export function validateApprovalSteps(
  steps: ApprovalFlowStep[],
  eligibleUserIds: Set<string>,
  eligibleRoles: Set<ApprovalFlowStep["role"]>,
): void {
  if (!steps.length) throw new Error("Luồng duyệt phải có ít nhất một bước");
  for (const step of steps) {
    if (step.userId && !eligibleUserIds.has(step.userId)) {
      throw new Error(
        "Người duyệt phải là thành viên đang hoạt động của dự án",
      );
    }
    if (step.role && !eligibleRoles.has(step.role)) {
      throw new Error("Vai trò của bước duyệt không có người đang hoạt động");
    }
    if (Boolean(step.userId) === Boolean(step.role)) {
      throw new Error(
        "Mỗi bước phải chỉ định duy nhất người duyệt hoặc vai trò",
      );
    }
    if (!Number.isInteger(step.slaHours) || step.slaHours < 1) {
      throw new Error("SLA mỗi bước phải là số giờ nguyên dương");
    }
  }
}

export function isDelegationActive(
  delegation: {
    startsAt: Date;
    endsAt: Date;
    revokedAt: Date | null;
    projectId: string | null;
  },
  projectId: string,
  at: Date,
): boolean {
  return (
    delegation.revokedAt === null &&
    delegation.startsAt <= at &&
    delegation.endsAt > at &&
    (delegation.projectId === null || delegation.projectId === projectId)
  );
}
