import { parsePastedTaskTree, PastedTaskTreeError } from "./task-paste";

describe("pasted task trees", () => {
  it("parses 20 indented lines into the expected levels", () => {
    const text = [
      "Gốc 1",
      "  Con 1.1",
      "    Cháu 1.1.1",
      "  Con 1.2",
      ...Array.from({ length: 16 }, (_, index) => `Gốc ${index + 2}`),
    ].join("\n");

    const tree = parsePastedTaskTree(text);
    expect(tree).toHaveLength(17);
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children[0].children[0].title).toBe("Cháu 1.1.1");
    expect(tree.slice(1).every((node) => node.children.length === 0)).toBe(
      true,
    );
  });

  it("rejects a sixth nesting level", () => {
    const text = ["A", " B", "  C", "   D", "    E", "     F"].join("\n");
    expect(() => parsePastedTaskTree(text)).toThrow(PastedTaskTreeError);
  });

  it("ignores blank lines but rejects a list that starts indented", () => {
    expect(parsePastedTaskTree("A\n\n  B")).toHaveLength(1);
    expect(() => parsePastedTaskTree("  A")).toThrow(PastedTaskTreeError);
  });
});
