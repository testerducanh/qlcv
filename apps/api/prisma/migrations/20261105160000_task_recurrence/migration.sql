CREATE TABLE "task_recurrence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "rule" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_recurrence_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "task"
    ADD COLUMN "recurrence_series_id" UUID,
    ADD COLUMN "recurrence_index" INTEGER;

CREATE UNIQUE INDEX "task_recurrence_series_id_recurrence_index_key"
    ON "task"("recurrence_series_id", "recurrence_index");
CREATE INDEX "task_recurrence_series_id_due_date_idx"
    ON "task"("recurrence_series_id", "due_date");
CREATE INDEX "task_recurrence_project_id_created_at_idx"
    ON "task_recurrence"("project_id", "created_at");

ALTER TABLE "task_recurrence"
    ADD CONSTRAINT "task_recurrence_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_recurrence"
    ADD CONSTRAINT "task_recurrence_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "app_user"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task"
    ADD CONSTRAINT "task_recurrence_series_id_fkey"
    FOREIGN KEY ("recurrence_series_id") REFERENCES "task_recurrence"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
