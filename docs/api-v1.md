# Internal integration API v1

The versioned API currently supports project-scoped API keys and task reads /
creation. The authenticated OpenAPI explorer is available at `/docs`; the JSON
document is at `/openapi.json`.

## API keys

Only a project owner, project manager, system administrator, or executive can
create, list, or revoke a key for a project in their organization. Keys are
restricted to one project and can have `task:read` and/or `task:write` scopes.
The owner must still have permission for each underlying task operation; a key
cannot grant permissions the owner does not have.

```http
POST /integrations/projects/{projectId}/api-keys
Authorization: Bearer <user-access-token>
Content-Type: application/json

{
  "name": "External reporting",
  "scopes": ["task:read"],
  "expiresAt": "2027-01-01T00:00:00.000Z"
}
```

The response contains the raw `token` once. The database stores only its
SHA-256 hash. The list endpoint never returns the token or hash:

```http
GET /integrations/projects/{projectId}/api-keys
DELETE /integrations/projects/{projectId}/api-keys/{apiKeyId}
```

Keys expire within one year, are revoked immediately, are limited to 60
requests per minute per key, and each authenticated API-key operation is
recorded in the activity log. A key with only `task:read` receives HTTP 403 if it attempts to
create a task.

## Task endpoints

```http
GET /api/v1/projects/{projectId}/tasks/{taskId}
X-API-Key: qlcv_live_<secret>
```

```http
POST /api/v1/projects/{projectId}/tasks
X-API-Key: qlcv_live_<secret>
Content-Type: application/json

{
  "title": "Review external deliverable",
  "dueDate": "2026-12-01",
  "customFields": { "externalRecord": "EXT-123" }
}
```

Task responses use the existing task API representation. A key can access only
its bound project; task-level authorization is re-evaluated by the existing
`TasksService` for each call. Use a short-lived access credential from a secure
secret store; do not put keys in source control or browser code.

## Not yet implemented

Organization-wide keys, task updates, custom external-link fields, a key
management screen, webhook subscriptions/delivery/retry/dead-letter handling,
and integration examples for receiving webhooks remain open P4.4 work.
