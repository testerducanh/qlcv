export interface PastedTask {
  title: string;
  children: PastedTask[];
}

export class PastedTaskTreeError extends Error {}

export function parsePastedTaskTree(text: string): PastedTask[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length > 1000) {
    throw new PastedTaskTreeError("Tối đa 1000 dòng trong một lần dán");
  }
  const roots: PastedTask[] = [];
  const stack: Array<{ indent: number; node: PastedTask }> = [];
  for (const [index, line] of lines.entries()) {
    const indent = line.match(/^[\t ]*/)?.[0].length ?? 0;
    const title = line.trim();
    if (!title) continue;
    while (stack.length && stack[stack.length - 1].indent >= indent)
      stack.pop();
    const depth = stack.length + 1;
    if (depth > 5) {
      throw new PastedTaskTreeError(
        `Dòng ${index + 1}: cây việc không được vượt quá 5 cấp`,
      );
    }
    if (indent > 0 && stack.length === 0) {
      throw new PastedTaskTreeError(
        `Dòng ${index + 1}: dòng đầu tiên của một cây không được thụt đầu`,
      );
    }
    const node: PastedTask = { title, children: [] };
    const parent = stack[stack.length - 1]?.node;
    if (parent) parent.children.push(node);
    else roots.push(node);
    stack.push({ indent, node });
  }
  if (!roots.length) throw new PastedTaskTreeError("Danh sách việc đang trống");
  return roots;
}
