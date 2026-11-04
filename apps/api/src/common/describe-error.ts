/** Rút ra thông điệp dễ hiểu từ lỗi, kể cả lỗi mạng của SDK (thường có message rỗng). */
export function describeError(error: unknown): string {
  if (error instanceof AggregateError && error.errors.length > 0) {
    return error.errors.map(describeError).join("; ");
  }
  if (error instanceof Error) {
    const code = (error as Error & { code?: unknown }).code;
    return (
      error.message ||
      (typeof code === "string" ? code : "") ||
      error.name ||
      "không rõ nguyên nhân"
    );
  }
  return String(error);
}
