ALTER TABLE "task"
    ADD COLUMN "pending_assignee_id" UUID,
    ADD COLUMN "handoff_note" TEXT;

ALTER TABLE "task"
    ADD CONSTRAINT "task_pending_assignee_id_fkey"
    FOREIGN KEY ("pending_assignee_id") REFERENCES "app_user"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "task_pending_assignee_id_idx"
    ON "task"("pending_assignee_id");
