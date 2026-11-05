import {
  ASSIGNMENT_ACTIONS,
  ASSIGNMENT_LEVELS,
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_TRANSITIONS,
  AssignmentTransitionError,
  assignmentStatusFromTaskStatus,
  taskStatusFromAssignmentStatus,
  transitionAssignment,
  type AssignmentActorRole,
} from "./assignment.machine";

const roles: AssignmentActorRole[] = ["assigner", "assignee", "reviewer"];

describe("assignment state machine", () => {
  it("allows only transitions listed in the state/action/role table", () => {
    for (const from of ASSIGNMENT_STATUSES) {
      for (const action of ASSIGNMENT_ACTIONS) {
        for (const actorRole of roles) {
          const listed = ASSIGNMENT_TRANSITIONS.some(
            (transition) =>
              transition.from === from &&
              transition.action === action &&
              transition.role === actorRole,
          );
          const run = () =>
            transitionAssignment({
              level: "standard",
              from,
              action,
              actorRole,
              assigneeId: "assignee",
              dueDate: "2026-11-06",
              reason: "Lý do",
              attachmentCount: 1,
              evidenceNote: "Kết quả",
            });
          if (listed) {
            expect(run()).toBe(
              ASSIGNMENT_TRANSITIONS.find(
                (transition) =>
                  transition.from === from &&
                  transition.action === action &&
                  transition.role === actorRole,
              )?.to,
            );
          } else {
            expect(run).toThrow(
              new AssignmentTransitionError("invalid_transition"),
            );
          }
        }
      }
    }
  });

  it("requires a complete assignment and reasons for negative transitions", () => {
    expect(() =>
      transitionAssignment({
        level: "standard",
        from: "draft",
        action: "assign",
        actorRole: "assigner",
      }),
    ).toThrow(new AssignmentTransitionError("assignment_incomplete"));
    expect(() =>
      transitionAssignment({
        level: "standard",
        from: "assigned",
        action: "reject",
        actorRole: "assignee",
        reason: " ",
      }),
    ).toThrow(new AssignmentTransitionError("reason_required"));
    expect(() =>
      transitionAssignment({
        level: "standard",
        from: "pending_review",
        action: "return",
        actorRole: "reviewer",
      }),
    ).toThrow(new AssignmentTransitionError("reason_required"));
  });

  it("requires strict evidence according to project configuration", () => {
    const submit = (overrides: {
      evidenceRequirement?: "attachment" | "note" | "either";
      attachmentCount?: number;
      evidenceNote?: string;
    }) =>
      transitionAssignment({
        level: "strict",
        from: "in_progress",
        action: "submit",
        actorRole: "assignee",
        ...overrides,
      });

    expect(() => submit({})).toThrow(
      new AssignmentTransitionError("evidence_required"),
    );
    expect(
      submit({ evidenceRequirement: "attachment", attachmentCount: 1 }),
    ).toBe("pending_review");
    expect(
      submit({ evidenceRequirement: "note", evidenceNote: "Đã hoàn tất" }),
    ).toBe("pending_review");
    expect(
      submit({ evidenceRequirement: "either", evidenceNote: "Đã hoàn tất" }),
    ).toBe("pending_review");
    expect(() =>
      submit({
        evidenceRequirement: "attachment",
        evidenceNote: "Không có file",
      }),
    ).toThrow(new AssignmentTransitionError("evidence_required"));
  });

  it("prevents a reviewer from approving their own work", () => {
    expect(() =>
      transitionAssignment({
        level: "standard",
        from: "pending_review",
        action: "approve",
        actorRole: "reviewer",
        actorId: "user-1",
        assigneeUserId: "user-1",
      }),
    ).toThrow(new AssignmentTransitionError("self_approval"));
  });

  it("keeps equivalent task status when converting between assignment levels", () => {
    const legacyStatuses = ["todo", "doing", "done", "blocked"] as const;
    for (const status of legacyStatuses) {
      expect(
        taskStatusFromAssignmentStatus(assignmentStatusFromTaskStatus(status)),
      ).toBe(status);
    }
    expect(assignmentStatusFromTaskStatus("todo")).toBe("draft");
    expect(assignmentStatusFromTaskStatus("todo", "user-1", "2026-11-06")).toBe(
      "assigned",
    );
    expect(assignmentStatusFromTaskStatus("doing")).toBe("in_progress");
    expect(assignmentStatusFromTaskStatus("done")).toBe("done");
    expect(assignmentStatusFromTaskStatus("blocked")).toBe("on_hold");

    for (const status of ASSIGNMENT_STATUSES) {
      expect(taskStatusFromAssignmentStatus(status)).toBeDefined();
    }
    expect(ASSIGNMENT_LEVELS).toEqual(["light", "standard", "strict"]);
  });

  it("does not apply the workflow to the light level", () => {
    expect(() =>
      transitionAssignment({
        level: "light",
        from: "draft",
        action: "assign",
        actorRole: "assigner",
        assigneeId: "user-1",
        dueDate: "2026-11-06",
      }),
    ).toThrow(new AssignmentTransitionError("level_requires_workflow"));
  });
});
