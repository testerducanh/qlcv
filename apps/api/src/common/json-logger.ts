import { LoggerService } from "@nestjs/common";

const SECRET_KEY = /pass|token|secret|authorization|cookie/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        SECRET_KEY.test(k) ? "[ĐÃ ẨN]" : redact(v),
      ]),
    );
  }
  return value;
}

export class JsonLogger implements LoggerService {
  private write(level: string, message: unknown, rest: unknown[]) {
    const context =
      typeof rest[rest.length - 1] === "string"
        ? (rest.pop() as string)
        : undefined;
    const payload =
      message && typeof message === "object"
        ? (redact(message) as Record<string, unknown>)
        : { message: String(message) };
    const extra = rest.length ? { extra: redact(rest) } : {};
    process.stdout.write(
      JSON.stringify({
        time: new Date().toISOString(),
        level,
        context,
        ...payload,
        ...extra,
      }) + "\n",
    );
  }
  log(message: unknown, ...rest: unknown[]) {
    this.write("info", message, rest);
  }
  error(message: unknown, ...rest: unknown[]) {
    this.write("error", message, rest);
  }
  warn(message: unknown, ...rest: unknown[]) {
    this.write("warn", message, rest);
  }
  debug(message: unknown, ...rest: unknown[]) {
    this.write("debug", message, rest);
  }
  verbose(message: unknown, ...rest: unknown[]) {
    this.write("verbose", message, rest);
  }
}
