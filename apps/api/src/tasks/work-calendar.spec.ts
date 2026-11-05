import {
  addWorkingDays,
  calculateCountProgress,
  calculateWorkdayProgress,
  countWorkingDays,
  type WorkCalendar,
} from "@qlcv/shared";

const calendar: WorkCalendar = {
  weeklyOff: [0, 6],
  holidays: ["2026-11-04"],
};

describe("working-day calculations", () => {
  it("counts weekdays inclusively while excluding configured holidays", () => {
    expect(countWorkingDays("2026-11-02", "2026-11-06", calendar)).toBe(4);
    expect(countWorkingDays("2026-11-07", "2026-11-06", calendar)).toBe(0);
  });

  it("adds working days across weekends and holidays", () => {
    expect(addWorkingDays("2026-11-03", 2, calendar)).toBe("2026-11-06");
    expect(addWorkingDays("2026-11-03", 0, calendar)).toBe("2026-11-03");
  });

  it("calculates clamped elapsed workday progress", () => {
    expect(
      calculateWorkdayProgress(
        "2026-11-02",
        "2026-11-06",
        "2026-11-05",
        calendar,
      ),
    ).toBe(75);
    expect(
      calculateWorkdayProgress(
        "2026-11-02",
        "2026-11-06",
        "2026-11-01",
        calendar,
      ),
    ).toBe(0);
    expect(
      calculateWorkdayProgress(
        "2026-11-02",
        "2026-11-06",
        "2026-11-10",
        calendar,
      ),
    ).toBe(100);
  });

  it("validates dates and workday counts", () => {
    expect(() =>
      countWorkingDays("2026-02-30", "2026-03-01", calendar),
    ).toThrow("Ngày không hợp lệ");
    expect(() => addWorkingDays("2026-11-02", -1, calendar)).toThrow(
      "Số ngày làm việc phải là số nguyên không âm",
    );
  });
});

describe("count progress", () => {
  it("combines completed tasks and checklist completion evenly", () => {
    expect(
      calculateCountProgress([
        { status: "done" },
        { status: "doing" },
        { status: "todo", checklistDone: 1, checklistTotal: 2 },
      ]),
    ).toBe(50);
    expect(calculateCountProgress([])).toBe(0);
  });
});
