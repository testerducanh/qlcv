import type { paths } from "@qlcv/api-client";

export type ApiPath =
  | keyof paths
  | `/projects?${string}`
  | `/projects/${string}`
  | `/projects/${string}/archive`
  | `/projects/${string}/clone`
  | `/projects/${string}/members`
  | `/projects/${string}/members/${string}`
  | `/projects/${string}/available-members${string}`
  | "/branches/available";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function messageFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || !("message" in body)) return;
  const message = body.message;
  if (typeof message === "string") return message;
  if (
    Array.isArray(message) &&
    message.every((item) => typeof item === "string")
  ) {
    return message.join(", ");
  }
}

export async function apiRequest<T>(
  path: ApiPath,
  init: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(
    `${(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "")}${path}`,
    { ...init, headers, credentials: "include" },
  );
  const body: unknown =
    response.status === 204
      ? undefined
      : await response.json().catch(() => undefined);

  if (!response.ok) {
    throw new ApiError(
      messageFromBody(body) ?? `Yêu cầu thất bại (${response.status}).`,
      response.status,
      body,
    );
  }
  return body as T;
}
