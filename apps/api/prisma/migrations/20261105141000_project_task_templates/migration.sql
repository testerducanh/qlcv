CREATE TYPE "template_kind" AS ENUM ('project', 'task');
CREATE TYPE "template_ownership" AS ENUM ('personal', 'department', 'branch', 'company');
CREATE TYPE "template_status" AS ENUM ('draft', 'pending_approval', 'published');

CREATE TABLE "template" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "owner_user_id" UUID,
    "department_id" UUID,
    "branch_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "template_kind" NOT NULL,
    "ownership" "template_ownership" NOT NULL,
    "status" "template_status" NOT NULL DEFAULT 'draft',
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "template_version" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_version_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "template_usage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_id" UUID NOT NULL,
    "template_version_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "applied_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_usage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "template_organization_id_ownership_status_idx"
    ON "template"("organization_id", "ownership", "status");
CREATE INDEX "template_created_by_id_status_idx"
    ON "template"("created_by_id", "status");
CREATE INDEX "template_branch_id_status_idx"
    ON "template"("branch_id", "status");
CREATE INDEX "template_department_id_status_idx"
    ON "template"("department_id", "status");
CREATE UNIQUE INDEX "template_version_template_id_version_key"
    ON "template_version"("template_id", "version");
CREATE INDEX "template_version_template_id_created_at_idx"
    ON "template_version"("template_id", "created_at" DESC);
CREATE INDEX "template_usage_template_id_created_at_idx"
    ON "template_usage"("template_id", "created_at" DESC);
CREATE INDEX "template_usage_project_id_idx" ON "template_usage"("project_id");

ALTER TABLE "template"
    ADD CONSTRAINT "template_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "template"
    ADD CONSTRAINT "template_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "app_user"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "template"
    ADD CONSTRAINT "template_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "app_user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "template"
    ADD CONSTRAINT "template_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "department"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "template"
    ADD CONSTRAINT "template_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branch"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "template_version"
    ADD CONSTRAINT "template_version_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "template"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "template_version"
    ADD CONSTRAINT "template_version_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "app_user"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "template_usage"
    ADD CONSTRAINT "template_usage_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "template"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "template_usage"
    ADD CONSTRAINT "template_usage_template_version_id_fkey"
    FOREIGN KEY ("template_version_id") REFERENCES "template_version"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "template_usage"
    ADD CONSTRAINT "template_usage_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "template_usage"
    ADD CONSTRAINT "template_usage_applied_by_id_fkey"
    FOREIGN KEY ("applied_by_id") REFERENCES "app_user"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
