import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("hiển thị tên sản phẩm", () => {
    expect(renderToString(<App />)).toContain("qlcv");
  });
});
