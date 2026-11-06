import type { paths } from "@qlcv/api-client";

export type ApiPath =
  | keyof paths
  | `/projects?${string}`
  | `/projects/${string}`
  | `/projects/${string}/archive`
  | `/projects/${string}/clone`
  | `/projects/${string}/members`
  | `/projects/${string}/members/${string}`
  | `/projects/${string}/guest-access`
  | `/projects/${string}/guest-access/${string}/revoke`
  | `/projects/${string}/guest-access/${string}/approval`
  | `/projects/${string}/approval-flows`
  | `/projects/${string}/tasks${string}`
  | `/projects/${string}/attachments${string}`
  | `/projects/${string}/available-members${string}`
  | `/projects/${string}/tasks/${string}/claim`
  | `/projects/${string}/tasks/${string}`
  | `/projects/${string}/tasks/critical-path`
  | `/projects/${string}/tasks/import`
  | `/projects/${string}/tasks/import/undo`
  | `/projects/${string}/tasks/recurring`
  | `/projects/${string}/tasks/${string}/recurrence/future`
  | `/templates/${string}`
  | `/templates/${string}/request-publication`
  | `/templates/${string}/apply`
  | `/me/tasks${string}`
  | `/dashboard${string}`
  | "/me/assignment-queue"
  | `/me/notification-deliveries${string}`
  | `/notifications/${string}/read`
  | "/branches/available";

export type GuestApiPath = `/guest/${string}`;

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

export async function guestApiRequest<T>(
  path: GuestApiPath,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-Guest-Token", token);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(
    `${(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "")}${path}`,
    { ...init, headers, credentials: "omit" },
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

export async function guestDownload(
  path: GuestApiPath,
  token: string,
): Promise<Blob> {
  const response = await fetch(
    `${(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "")}${path}`,
    { headers: { "X-Guest-Token": token }, credentials: "omit" },
  );
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    throw new ApiError(
      messageFromBody(body) ?? `Yêu cầu thất bại (${response.status}).`,
      response.status,
      body,
    );
  }
  return response.blob();
}
