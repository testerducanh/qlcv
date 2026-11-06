CREATE TYPE "assignment_extension_status" AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE "assignment_extension_request" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "requested_due_date" DATE NOT NULL,
    "task_version" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "assignment_extension_status" NOT NULL DEFAULT 'pending',
    "decider_id" UUID,
    "decision_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(3),

    CONSTRAINT "assignment_extension_request_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "assignment_extension_request_task_id_status_idx"
    ON "assignment_extension_request"("task_id", "status");
CREATE INDEX "assignment_extension_request_project_id_created_at_idx"
    ON "assignment_extension_request"("project_id", "created_at");

ALTER TABLE "assignment_extension_request"
    ADD CONSTRAINT "assignment_extension_request_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assignment_extension_request"
    ADD CONSTRAINT "assignment_extension_request_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "task"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assignment_extension_request"
    ADD CONSTRAINT "assignment_extension_request_requester_id_fkey"
    FOREIGN KEY ("requester_id") REFERENCES "app_user"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assignment_extension_request"
    ADD CONSTRAINT "assignment_extension_request_decider_id_fkey"
    FOREIGN KEY ("decider_id") REFERENCES "app_user"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
