import {
  positionAt,
  positionBetween,
  PositionSpaceExhaustedError,
} from "./fractional-position";

describe("fractional task positions", () => {
  it("creates sortable positions between, before, and after siblings", () => {
    const first = positionAt(0);
    const third = positionAt(2);
    const middle = positionBetween(first, third);

    expect(first).toHaveLength(12);
    expect(first < middle && middle < third).toBe(true);
    expect(positionBetween(null, first) < first).toBe(true);
    expect(positionBetween(third, null) > third).toBe(true);
  });

  it("reports exhausted or invalid position intervals", () => {
    const first = positionAt(0);
    expect(() => positionBetween(first, first)).toThrow(
      PositionSpaceExhaustedError,
    );
    expect(() => positionBetween("bad", null)).toThrow(
      "Chỉ mục vị trí không hợp lệ",
    );
  });

  it("rejects invalid sibling indexes", () => {
    expect(() => positionAt(-1)).toThrow(
      "Chỉ mục vị trí phải là số nguyên không âm",
    );
  });
});
