import { isDelegationActive, validateApprovalSteps } from "./approval-rules";

describe("approval rules", () => {
  it("rejects steps without an eligible approver", () => {
    expect(() =>
      validateApprovalSteps(
        [{ slaHours: 24, canForward: false, important: false }],
        new Set(),
        new Set(),
      ),
    ).toThrow("Mỗi bước phải chỉ định duy nhất người duyệt hoặc vai trò");
    expect(() =>
      validateApprovalSteps(
        [
          {
            userId: "member",
            role: "owner",
            slaHours: 24,
            canForward: false,
            important: false,
          },
        ],
        new Set(["member"]),
        new Set(["owner"]),
      ),
    ).toThrow("Mỗi bước phải chỉ định duy nhất người duyệt hoặc vai trò");
    expect(() =>
      validateApprovalSteps(
        [
          {
            userId: "missing",
            slaHours: 24,
            canForward: false,
            important: false,
          },
        ],
        new Set(),
        new Set(),
      ),
    ).toThrow("Người duyệt phải là thành viên đang hoạt động của dự án");
  });

  it("rejects a delegation once its end time is reached", () => {
    const delegation = {
      startsAt: new Date("2026-01-01T00:00:00Z"),
      endsAt: new Date("2026-01-02T00:00:00Z"),
      revokedAt: null,
      projectId: null,
    };
    expect(
      isDelegationActive(
        delegation,
        "project",
        new Date("2026-01-02T00:00:00Z"),
      ),
    ).toBe(false);
  });
});
