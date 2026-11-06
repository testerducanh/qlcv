CREATE TABLE "integration_api_key" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "scopes" TEXT[] NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "last_used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_api_key_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_api_key_prefix_key" ON "integration_api_key"("prefix");
CREATE UNIQUE INDEX "integration_api_key_token_hash_key" ON "integration_api_key"("token_hash");
CREATE INDEX "integration_api_key_organization_id_project_id_revoked_at_idx"
    ON "integration_api_key"("organization_id", "project_id", "revoked_at");

ALTER TABLE "integration_api_key"
    ADD CONSTRAINT "integration_api_key_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_api_key"
    ADD CONSTRAINT "integration_api_key_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_api_key"
    ADD CONSTRAINT "integration_api_key_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "app_user"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
