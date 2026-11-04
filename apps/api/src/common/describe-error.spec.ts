import { describeError } from "./describe-error";

describe("describeError", () => {
  it("giữ nguyên thông điệp của lỗi thường", () => {
    expect(describeError(new Error("mất kết nối"))).toBe("mất kết nối");
  });

  it("dùng mã lỗi khi thông điệp rỗng", () => {
    const error = new Error("");
    Object.assign(error, { code: "ECONNREFUSED" });
    expect(describeError(error)).toBe("ECONNREFUSED");
  });

  it("gộp lỗi của AggregateError", () => {
    const error = new AggregateError([
      Object.assign(new Error(""), { code: "ECONNREFUSED" }),
      new Error("timeout"),
    ]);
    expect(describeError(error)).toBe("ECONNREFUSED; timeout");
  });

  it("không trả chuỗi rỗng với lỗi không có thông điệp", () => {
    expect(describeError(new Error(""))).toBe("Error");
    expect(describeError("chuỗi lạ")).toBe("chuỗi lạ");
  });
});
