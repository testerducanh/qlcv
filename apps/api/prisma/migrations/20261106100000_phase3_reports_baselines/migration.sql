ALTER TABLE "project"
    ADD COLUMN "members_may_export" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "auto_reschedule_enabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "baseline_enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "task_dependency"
    ADD COLUMN "auto_reschedule" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "project_baseline" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_baseline_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_baseline_project_id_created_at_idx"
    ON "project_baseline"("project_id", "created_at");

ALTER TABLE "project_baseline"
    ADD CONSTRAINT "project_baseline_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_baseline"
    ADD CONSTRAINT "project_baseline_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "app_user"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
