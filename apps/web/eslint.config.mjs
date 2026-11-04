import js from "@eslint/js";
import tseslint from "typescript-eslint";

const HEX = /(^|[^\w&])#[0-9a-fA-F]{3,8}(?![\w-])/;
const PX = /(^|[^\w.#-])\d+(\.\d+)?px(?!\w)/;
const ARBITRARY = /(^|\s)[a-z][a-z0-9:-]*-\[/;

const noRawDesignValues = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      hex: "Không dùng mã màu trong component. Dùng tên token (xem docs/ui-guidelines.md).",
      px: "Không dùng số px thô. Dùng token khoảng cách hoặc cỡ chữ.",
      arbitrary:
        "Không dùng giá trị tùy ý của Tailwind (ví dụ w-[10px]). Dùng token.",
    },
  },
  create(context) {
    const check = (node, text) => {
      if (HEX.test(text)) context.report({ node, messageId: "hex" });
      if (PX.test(text)) context.report({ node, messageId: "px" });
      if (ARBITRARY.test(text))
        context.report({ node, messageId: "arbitrary" });
    };
    return {
      Literal(node) {
        if (typeof node.value === "string") check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
    };
  },
};

export default tseslint.config(
  { ignores: ["dist"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/design/**", "src/**/*.test.{ts,tsx}", "src/test/**"],
    plugins: { qlcv: { rules: { "no-raw-design-values": noRawDesignValues } } },
    rules: { "qlcv/no-raw-design-values": "error" },
  },
);
