import axe from "axe-core";
import { expect } from "vitest";

/** Tương phản màu đã có test riêng trên token (jsdom không đo được màu hiển thị). */
export async function expectNoA11yViolations(container: Element) {
  const results = await axe.run(container, {
    rules: {
      "color-contrast": { enabled: false },
      region: { enabled: false },
      "landmark-one-main": { enabled: false },
      "page-has-heading-one": { enabled: false },
    },
  });
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}
