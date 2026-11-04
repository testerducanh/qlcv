import { readFileSync, writeFileSync } from "node:fs";

const t = JSON.parse(
  readFileSync(new URL("../src/design/tokens.json", import.meta.url), "utf8"),
);

const flat = (obj, path = []) =>
  Object.entries(obj).flatMap(([key, value]) =>
    typeof value === "object"
      ? flat(value, [...path, key])
      : [[[...path, key].join("-"), value]],
  );

const theme = ["--*: initial;"];
const add = (prefix, group) => {
  for (const [name, value] of flat(group))
    theme.push(`${prefix}-${name}: ${value};`);
};

add("--color", t.color);
add("--text", t.font.size);
add("--font-weight", t.font.weight);
add("--leading", t.font["line-height"]);
theme.push(`--font-base: ${t.font.family.base};`);
theme.push("--spacing: 1px;");
add("--spacing", t.space);
add("--spacing", t.target);
add("--radius", t.radius);
add("--shadow", t.shadow);
add("--container", t.container);
add("--breakpoint", t.breakpoint);

const root = flat(t.motion).map(
  ([name, value]) => `--motion-${name}: ${value};`,
);

const css = [
  "/* TỰ SINH từ tokens.json bằng scripts/build-tokens.mjs. KHÔNG sửa tay. */",
  "@theme {",
  ...theme.map((l) => `  ${l}`),
  "}",
  "",
  ":root {",
  ...root.map((l) => `  ${l}`),
  "}",
  "",
].join("\n");

writeFileSync(new URL("../src/design/tokens.css", import.meta.url), css);
console.log("Đã sinh src/design/tokens.css");
