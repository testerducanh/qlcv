CREATE TYPE "assignment_level" AS ENUM ('light', 'standard', 'strict');
CREATE TYPE "assignment_status" AS ENUM (
    'draft',
    'assigned',
    'accepted',
    'in_progress',
    'pending_review',
    'done',
    'rejected',
    'on_hold'
);
CREATE TYPE "assignment_evidence_requirement" AS ENUM ('attachment', 'note', 'either');

ALTER TABLE "project"
    ADD COLUMN "assignment_level" "assignment_level" NOT NULL DEFAULT 'light',
    ADD COLUMN "strict_evidence_requirement" "assignment_evidence_requirement" NOT NULL DEFAULT 'either';

ALTER TABLE "task"
    ADD COLUMN "assignment_level" "assignment_level",
    ADD COLUMN "assignment_status" "assignment_status",
    ADD COLUMN "reviewer_id" UUID,
    ADD COLUMN "assigner_id" UUID;

ALTER TABLE "task"
    ADD CONSTRAINT "task_reviewer_id_fkey"
    FOREIGN KEY ("reviewer_id") REFERENCES "app_user"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "task"
    ADD CONSTRAINT "task_assigner_id_fkey"
    FOREIGN KEY ("assigner_id") REFERENCES "app_user"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "task_reviewer_id_idx" ON "task"("reviewer_id");

CREATE TABLE "task_assignment_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "from_status" "assignment_status",
    "to_status" "assignment_status",
    "reason" TEXT,
    "evidence_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_assignment_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_assignment_event_task_id_created_at_idx"
    ON "task_assignment_event"("task_id", "created_at");
CREATE INDEX "task_assignment_event_project_id_created_at_idx"
    ON "task_assignment_event"("project_id", "created_at");

ALTER TABLE "task_assignment_event"
    ADD CONSTRAINT "task_assignment_event_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_assignment_event"
    ADD CONSTRAINT "task_assignment_event_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "task"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_assignment_event"
    ADD CONSTRAINT "task_assignment_event_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "app_user"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
