import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  buildMonthGrid,
  endOfWeek,
  formatDisplayDate,
  formatRelativeTime,
  parseDisplayDate,
  parseIso,
  startOfWeek,
  todayIso,
  weekdayMonFirst,
} from "./date";
import { formatBytes, isAccepted } from "./files";
import { normalizeSearch } from "./text";

describe("normalizeSearch", () => {
  it("bỏ dấu tiếng Việt và chữ đ", () => {
    expect(normalizeSearch("Báo cáo tuần")).toBe("bao cao tuan");
    expect(normalizeSearch("Đổ bê tông móng")).toBe("do be tong mong");
  });
});

describe("files", () => {
  it("định dạng dung lượng", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("kiểm tra loại tệp theo accept", () => {
    const png = new File(["x"], "a.png", { type: "image/png" });
    const pdf = new File(["x"], "B.PDF", { type: "application/pdf" });
    expect(isAccepted(png, "image/*")).toBe(true);
    expect(isAccepted(pdf, "image/*")).toBe(false);
    expect(isAccepted(pdf, "image/*,.pdf")).toBe(true);
    expect(isAccepted(pdf, undefined)).toBe(true);
  });
});

describe("date", () => {
  it("đọc và định dạng dd/MM/yyyy", () => {
    expect(parseDisplayDate("05/11/2026")).toBe("2026-11-05");
    expect(parseDisplayDate("5/11/2026")).toBe("2026-11-05");
    expect(formatDisplayDate("2026-11-05")).toBe("05/11/2026");
  });

  it("từ chối ngày không có thật", () => {
    expect(parseDisplayDate("31/02/2026")).toBeNull();
    expect(parseDisplayDate("29/02/2027")).toBeNull();
    expect(parseDisplayDate("29/02/2028")).toBe("2028-02-29");
    expect(parseDisplayDate("abc")).toBeNull();
    expect(parseIso("2026-13-01")).toBeNull();
  });

  it("cộng ngày và tháng, giữ ngày cuối tháng", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-01-15", -2)).toBe("2025-11-15");
  });

  it("thứ trong tuần bắt đầu từ thứ Hai", () => {
    expect(weekdayMonFirst(2026, 9, 31)).toBe(5); // 31/10/2026 là thứ Bảy
    expect(startOfWeek("2026-10-31")).toBe("2026-10-26");
    expect(endOfWeek("2026-10-31")).toBe("2026-11-01");
  });

  it("lưới tháng có 6 tuần và bắt đầu bằng thứ Hai", () => {
    const grid = buildMonthGrid(2026, 9);
    expect(grid).toHaveLength(6);
    expect(grid[0]).toHaveLength(7);
    expect(grid[0][0]).toBe("2026-09-28");
    expect(grid.flat()).toContain("2026-10-31");
  });

  it("hôm nay theo múi giờ Asia/Bangkok", () => {
    expect(todayIso(new Date("2026-10-31T20:00:00Z"))).toBe("2026-11-01");
    expect(todayIso(new Date("2026-10-31T10:00:00Z"))).toBe("2026-10-31");
  });

  it("thời gian tương đối", () => {
    const now = new Date("2026-10-31T10:00:00Z");
    expect(formatRelativeTime("2026-10-31T10:00:00Z", now)).toBe("Vừa xong");
    expect(formatRelativeTime("2026-10-31T09:55:00Z", now)).toBe(
      "5 phút trước",
    );
    expect(formatRelativeTime("2026-10-31T07:00:00Z", now)).toBe("3 giờ trước");
    expect(formatRelativeTime("2026-10-29T10:00:00Z", now)).toBe(
      "2 ngày trước",
    );
  });
});
