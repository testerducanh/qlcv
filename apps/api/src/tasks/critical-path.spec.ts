import { calculateCriticalPath } from "./critical-path";

describe("calculateCriticalPath", () => {
  it("finds the critical chain across FS, SS, and FF links with a negative lead", () => {
    const result = calculateCriticalPath(
      [
        { id: "A", durationDays: 3, startDate: null },
        { id: "B", durationDays: 2, startDate: null },
        { id: "C", durationDays: 2, startDate: null },
        { id: "D", durationDays: 1, startDate: null },
        { id: "E", durationDays: 2, startDate: null },
        { id: "F", durationDays: 1, startDate: null },
      ],
      [
        {
          predecessorId: "A",
          successorId: "B",
          type: "overlap",
          lagDays: 0,
        },
        {
          predecessorId: "A",
          successorId: "C",
          type: "finish_start",
          lagDays: 0,
        },
        {
          predecessorId: "B",
          successorId: "D",
          type: "blocking_finish",
          lagDays: -1,
        },
        {
          predecessorId: "C",
          successorId: "E",
          type: "finish_start",
          lagDays: 0,
        },
        {
          predecessorId: "D",
          successorId: "E",
          type: "finish_start",
          lagDays: 0,
        },
        {
          predecessorId: "E",
          successorId: "F",
          type: "finish_start",
          lagDays: 0,
        },
      ],
      { weeklyOff: [0, 6], holidays: ["2027-01-11"] },
      "2027-01-04",
    );

    expect(result.projectDurationWorkdays).toBe(8);
    expect(result.forecastFinishDate).toBe("2027-01-14");
    expect(
      result.entries
        .filter((entry) => entry.critical)
        .map((entry) => entry.taskId),
    ).toEqual(["A", "C", "E", "F"]);
    expect(
      result.entries
        .filter((entry) => entry.taskId === "B" || entry.taskId === "D")
        .map((entry) => entry.totalFloat),
    ).toEqual([4, 4]);
  });

  it("rejects cyclic dependencies instead of returning a misleading schedule", () => {
    expect(() =>
      calculateCriticalPath(
        [
          { id: "A", durationDays: 1, startDate: null },
          { id: "B", durationDays: 1, startDate: null },
        ],
        [
          {
            predecessorId: "A",
            successorId: "B",
            type: "finish_start",
            lagDays: 0,
          },
          {
            predecessorId: "B",
            successorId: "A",
            type: "finish_start",
            lagDays: 0,
          },
        ],
        { weeklyOff: [0, 6], holidays: [] },
        "2027-01-04",
      ),
    ).toThrow("dependency graph contains a cycle");
  });
});
