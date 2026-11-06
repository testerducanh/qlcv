CREATE TYPE "assignment_automation_status" AS ENUM ('active', 'completed', 'failed');
CREATE TYPE "approval_request_status" AS ENUM ('pending', 'approved', 'rejected', 'changes_requested');

ALTER TABLE "notification"
    ADD COLUMN "dedupe_key" TEXT;
CREATE UNIQUE INDEX "notification_dedupe_key_key"
    ON "notification"("dedupe_key");

CREATE TABLE "notification_preference" (
    "user_id" UUID NOT NULL,
    "disabled_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "digest_enabled" BOOLEAN NOT NULL DEFAULT false,
    "time_zone" TEXT NOT NULL DEFAULT 'Asia/Bangkok',
    "quiet_start" TEXT,
    "quiet_end" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("user_id")
);
ALTER TABLE "notification_preference"
    ADD CONSTRAINT "notification_preference_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app_user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "meeting" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "held_at" TIMESTAMPTZ(3) NOT NULL,
    "attendees" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "meeting_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "meeting_project_id_held_at_idx" ON "meeting"("project_id", "held_at");
ALTER TABLE "meeting"
    ADD CONSTRAINT "meeting_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "meeting_creator_id_fkey"
    FOREIGN KEY ("creator_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "meeting_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "meeting_id" UUID NOT NULL,
    "conclusion" TEXT NOT NULL,
    "assignee_id" UUID NOT NULL,
    "due_date" DATE NOT NULL,
    "task_id" UUID,
    "completed_at" TIMESTAMPTZ(3),
    CONSTRAINT "meeting_item_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "meeting_item_meeting_id_idx" ON "meeting_item"("meeting_id");
CREATE INDEX "meeting_item_assignee_id_completed_at_idx" ON "meeting_item"("assignee_id", "completed_at");
ALTER TABLE "meeting_item"
    ADD CONSTRAINT "meeting_item_meeting_id_fkey"
    FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "meeting_item_assignee_id_fkey"
    FOREIGN KEY ("assignee_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "meeting_item_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "assignment_automation_rule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "trigger_type" TEXT NOT NULL,
    "trigger_task_id" UUID,
    "due_in_days" INTEGER,
    "title" TEXT,
    "assignee_id" UUID,
    "due_date" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assignment_automation_rule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "assignment_automation_rule_project_id_enabled_idx" ON "assignment_automation_rule"("project_id", "enabled");
ALTER TABLE "assignment_automation_rule"
    ADD CONSTRAINT "assignment_automation_rule_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "assignment_automation_rule_creator_id_fkey"
    FOREIGN KEY ("creator_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "assignment_automation_run" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rule_id" UUID NOT NULL,
    "trigger_task_id" UUID,
    "status" "assignment_automation_status" NOT NULL DEFAULT 'active',
    "depth" INTEGER NOT NULL DEFAULT 0,
    "created_task_id" UUID,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assignment_automation_run_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "assignment_automation_run_rule_id_trigger_task_id_key" ON "assignment_automation_run"("rule_id", "trigger_task_id");
CREATE INDEX "assignment_automation_run_rule_id_created_at_idx" ON "assignment_automation_run"("rule_id", "created_at");
ALTER TABLE "assignment_automation_run"
    ADD CONSTRAINT "assignment_automation_run_rule_id_fkey"
    FOREIGN KEY ("rule_id") REFERENCES "assignment_automation_rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "approval_flow" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "request_type" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "approval_flow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "approval_flow_project_id_request_type_name_key" ON "approval_flow"("project_id", "request_type", "name");
CREATE INDEX "approval_flow_project_id_request_type_enabled_idx" ON "approval_flow"("project_id", "request_type", "enabled");
ALTER TABLE "approval_flow"
    ADD CONSTRAINT "approval_flow_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "approval_flow_creator_id_fkey"
    FOREIGN KEY ("creator_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "approval_request" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "flow_id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "current_step" INTEGER NOT NULL DEFAULT 0,
    "current_approver_id" UUID,
    "status" "approval_request_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "approval_request_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "approval_request_project_id_status_created_at_idx" ON "approval_request"("project_id", "status", "created_at");
CREATE INDEX "approval_request_subject_type_subject_id_idx" ON "approval_request"("subject_type", "subject_id");
ALTER TABLE "approval_request"
    ADD CONSTRAINT "approval_request_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "approval_request_flow_id_fkey"
    FOREIGN KEY ("flow_id") REFERENCES "approval_flow"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "approval_request_requester_id_fkey"
    FOREIGN KEY ("requester_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "approval_step_result" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "step_index" INTEGER NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "delegated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "approval_step_result_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "approval_step_result_request_id_step_index_created_at_idx" ON "approval_step_result"("request_id", "step_index", "created_at");
ALTER TABLE "approval_step_result"
    ADD CONSTRAINT "approval_step_result_request_id_fkey"
    FOREIGN KEY ("request_id") REFERENCES "approval_request"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "approval_step_result_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "approval_delegation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "grantor_id" UUID NOT NULL,
    "grantee_id" UUID NOT NULL,
    "project_id" UUID,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "approval_delegation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_delegation_grantor_id_fkey"
    FOREIGN KEY ("grantor_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "approval_delegation_grantee_id_fkey"
    FOREIGN KEY ("grantee_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "approval_delegation_grantor_id_starts_at_ends_at_idx" ON "approval_delegation"("grantor_id", "starts_at", "ends_at");
CREATE INDEX "approval_delegation_grantee_id_starts_at_ends_at_idx" ON "approval_delegation"("grantee_id", "starts_at", "ends_at");
