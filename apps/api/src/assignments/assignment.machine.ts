export const ASSIGNMENT_LEVELS = ["light", "standard", "strict"] as const;
export type AssignmentLevel = (typeof ASSIGNMENT_LEVELS)[number];

export const ASSIGNMENT_STATUSES = [
  "draft",
  "assigned",
  "accepted",
  "in_progress",
  "pending_review",
  "done",
  "rejected",
  "on_hold",
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const ASSIGNMENT_ACTIONS = [
  "assign",
  "reassign",
  "accept",
  "reject",
  "propose_adjustment",
  "start",
  "submit",
  "approve",
  "return",
  "pause",
  "resume",
] as const;
export type AssignmentAction = (typeof ASSIGNMENT_ACTIONS)[number];
export type AssignmentActorRole = "assigner" | "assignee" | "reviewer";
export type AssignmentEvidenceRequirement = "attachment" | "note" | "either";

interface TransitionDefinition {
  from: AssignmentStatus;
  action: AssignmentAction;
  role: AssignmentActorRole;
  to: AssignmentStatus;
  requiresReason?: boolean;
}

export const ASSIGNMENT_TRANSITIONS: readonly TransitionDefinition[] = [
  { from: "draft", action: "assign", role: "assigner", to: "assigned" },
  { from: "rejected", action: "reassign", role: "assigner", to: "assigned" },
  { from: "assigned", action: "accept", role: "assignee", to: "accepted" },
  {
    from: "assigned",
    action: "reject",
    role: "assignee",
    to: "rejected",
    requiresReason: true,
  },
  {
    from: "assigned",
    action: "propose_adjustment",
    role: "assignee",
    to: "assigned",
    requiresReason: true,
  },
  { from: "accepted", action: "start", role: "assignee", to: "in_progress" },
  {
    from: "in_progress",
    action: "submit",
    role: "assignee",
    to: "pending_review",
  },
  {
    from: "pending_review",
    action: "approve",
    role: "reviewer",
    to: "done",
  },
  {
    from: "pending_review",
    action: "return",
    role: "reviewer",
    to: "in_progress",
    requiresReason: true,
  },
  {
    from: "in_progress",
    action: "pause",
    role: "assignee",
    to: "on_hold",
    requiresReason: true,
  },
  { from: "on_hold", action: "resume", role: "assignee", to: "in_progress" },
];

export class AssignmentTransitionError extends Error {
  constructor(
    readonly code:
      | "level_requires_workflow"
      | "invalid_transition"
      | "reason_required"
      | "assignment_incomplete"
      | "evidence_required"
      | "self_approval",
  ) {
    super(code);
    this.name = "AssignmentTransitionError";
  }
}

export interface TransitionAssignmentInput {
  level: AssignmentLevel;
  from: AssignmentStatus;
  action: AssignmentAction;
  actorRole: AssignmentActorRole;
  reason?: string | null;
  assigneeId?: string | null;
  dueDate?: Date | string | null;
  evidenceRequirement?: AssignmentEvidenceRequirement;
  attachmentCount?: number;
  evidenceNote?: string | null;
  actorId?: string;
  assigneeUserId?: string | null;
}

export function transitionAssignment(
  input: TransitionAssignmentInput,
): AssignmentStatus {
  if (input.level === "light") {
    throw new AssignmentTransitionError("level_requires_workflow");
  }
  const definition = ASSIGNMENT_TRANSITIONS.find(
    (transition) =>
      transition.from === input.from &&
      transition.action === input.action &&
      transition.role === input.actorRole,
  );
  if (!definition) {
    throw new AssignmentTransitionError("invalid_transition");
  }
  if (definition.requiresReason && !input.reason?.trim()) {
    throw new AssignmentTransitionError("reason_required");
  }
  if (
    (input.action === "assign" || input.action === "reassign") &&
    (!input.assigneeId || !input.dueDate)
  ) {
    throw new AssignmentTransitionError("assignment_incomplete");
  }
  if (
    input.action === "approve" &&
    input.actorId &&
    input.actorId === input.assigneeUserId
  ) {
    throw new AssignmentTransitionError("self_approval");
  }
  if (input.action === "submit" && input.level === "strict") {
    const hasAttachment = (input.attachmentCount ?? 0) > 0;
    const hasNote = Boolean(input.evidenceNote?.trim());
    const requirement = input.evidenceRequirement ?? "either";
    const evidenceIsPresent =
      requirement === "attachment"
        ? hasAttachment
        : requirement === "note"
          ? hasNote
          : hasAttachment || hasNote;
    if (!evidenceIsPresent) {
      throw new AssignmentTransitionError("evidence_required");
    }
  }
  return definition.to;
}

export function assignmentStatusFromTaskStatus(
  taskStatus: "todo" | "doing" | "done" | "blocked",
  assigneeId?: string | null,
  dueDate?: Date | string | null,
): AssignmentStatus {
  switch (taskStatus) {
    case "todo":
      return assigneeId && dueDate ? "assigned" : "draft";
    case "doing":
      return "in_progress";
    case "done":
      return "done";
    case "blocked":
      return "on_hold";
  }
}

export function taskStatusFromAssignmentStatus(
  assignmentStatus: AssignmentStatus,
): "todo" | "doing" | "done" | "blocked" {
  switch (assignmentStatus) {
    case "draft":
    case "assigned":
    case "accepted":
    case "rejected":
      return "todo";
    case "in_progress":
    case "pending_review":
      return "doing";
    case "done":
      return "done";
    case "on_hold":
      return "blocked";
  }
}
