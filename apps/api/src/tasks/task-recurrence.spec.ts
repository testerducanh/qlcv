import {
  generateRecurrenceDates,
  type RecurrenceRule,
} from "./task-recurrence";
import type { WorkCalendar } from "@qlcv/shared";

const calendar: WorkCalendar = {
  weeklyOff: [0, 6],
  holidays: ["2026-11-09"],
};

describe("generateRecurrenceDates", () => {
  it("generates four Mondays and moves a holiday to the next workday", () => {
    const rule: RecurrenceRule = {
      frequency: "weekly",
      interval: 1,
      weekdays: [1],
    };
    expect(generateRecurrenceDates("2026-11-02", rule, calendar, 4)).toEqual([
      "2026-11-02",
      "2026-11-10",
      "2026-11-16",
      "2026-11-23",
    ]);
  });

  it("clamps monthly dates to the last day of shorter months", () => {
    expect(
      generateRecurrenceDates(
        "2026-01-31",
        { frequency: "monthly", interval: 1 },
        { weeklyOff: [], holidays: [] },
        4,
      ),
    ).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("uses project working days for daily workday recurrence", () => {
    expect(
      generateRecurrenceDates(
        "2026-11-06",
        { frequency: "working_day", interval: 1 },
        calendar,
        4,
      ),
    ).toEqual(["2026-11-06", "2026-11-10", "2026-11-11", "2026-11-12"]);
  });

  it("supports intervals, quarterly recurrence, and date-only DST boundaries", () => {
    expect(
      generateRecurrenceDates(
        "2026-03-07",
        { frequency: "daily", interval: 2 },
        { weeklyOff: [], holidays: [] },
        3,
      ),
    ).toEqual(["2026-03-07", "2026-03-09", "2026-03-11"]);
    expect(
      generateRecurrenceDates(
        "2026-01-05",
        { frequency: "quarterly", interval: 1 },
        { weeklyOff: [], holidays: [] },
        3,
      ),
    ).toEqual(["2026-01-05", "2026-04-05", "2026-07-05"]);
    expect(
      generateRecurrenceDates(
        "2026-01-05",
        { frequency: "quarterly", interval: 365 },
        { weeklyOff: [], holidays: [] },
        2,
      ),
    ).toEqual(["2026-01-05", "2117-04-05"]);
    expect(
      generateRecurrenceDates(
        "2026-03-07",
        { frequency: "daily", interval: 1 },
        { weeklyOff: [], holidays: [] },
        10,
        "2026-03-09",
      ),
    ).toEqual(["2026-03-07", "2026-03-08", "2026-03-09"]);
  });

  it("rejects invalid limits and dates", () => {
    expect(() =>
      generateRecurrenceDates(
        "2026-02-30",
        { frequency: "daily", interval: 1 },
        calendar,
        2,
      ),
    ).toThrow("Ngày lặp không hợp lệ");
    expect(() =>
      generateRecurrenceDates(
        "2026-11-02",
        { frequency: "daily", interval: 1 },
        calendar,
        53,
      ),
    ).toThrow("Số kỳ lặp phải từ 1 đến 52");
  });
});
