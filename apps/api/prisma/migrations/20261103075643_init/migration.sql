-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'invited', 'disabled');

-- CreateEnum
CREATE TYPE "system_role" AS ENUM ('system_admin', 'executive', 'branch_director', 'department_head', 'member');

-- CreateEnum
CREATE TYPE "project_status" AS ENUM ('active', 'on_hold', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "progress_mode" AS ENUM ('by_count', 'by_workdays', 'manual');

-- CreateEnum
CREATE TYPE "confidentiality" AS ENUM ('normal', 'restricted');

-- CreateEnum
CREATE TYPE "project_role" AS ENUM ('owner', 'manager', 'member', 'restricted', 'commenter', 'viewer');

-- CreateEnum
CREATE TYPE "task_type" AS ENUM ('group', 'task', 'milestone');

-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('todo', 'doing', 'done', 'blocked');

-- CreateEnum
CREATE TYPE "task_priority" AS ENUM ('urgent', 'high', 'normal', 'low');

-- CreateEnum
CREATE TYPE "collaborator_role" AS ENUM ('collaborator', 'follower', 'approver');

-- CreateEnum
CREATE TYPE "dependency_type" AS ENUM ('finish_start', 'overlap', 'blocking_finish');

-- CreateEnum
CREATE TYPE "view_mode" AS ENUM ('list', 'kanban', 'timeline', 'calendar');

-- CreateTable
CREATE TABLE "organization" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "branch_id" UUID,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT,
    "status" "user_status" NOT NULL DEFAULT 'invited',
    "system_role" "system_role" NOT NULL DEFAULT 'member',
    "branch_id" UUID,
    "department_id" UUID,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_department" (
    "user_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "is_head" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_department_pkey" PRIMARY KEY ("user_id","department_id")
);

-- CreateTable
CREATE TABLE "project" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "project_status" NOT NULL DEFAULT 'active',
    "start_date" DATE,
    "due_date" DATE,
    "work_calendar" JSONB NOT NULL DEFAULT '{"weeklyOff":[0],"holidays":[]}',
    "progress_mode" "progress_mode" NOT NULL DEFAULT 'by_workdays',
    "confidentiality" "confidentiality" NOT NULL DEFAULT 'normal',
    "status_labels" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_member" (
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "project_role" NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_member_pkey" PRIMARY KEY ("project_id","user_id")
);

-- CreateTable
CREATE TABLE "task" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "parent_id" UUID,
    "type" "task_type" NOT NULL DEFAULT 'task',
    "position" TEXT NOT NULL,
    "depth" SMALLINT NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "task_status" NOT NULL DEFAULT 'todo',
    "blocked_reason" TEXT,
    "priority" "task_priority" NOT NULL DEFAULT 'normal',
    "start_date" DATE,
    "duration_days" INTEGER,
    "due_date" DATE,
    "completed_at" TIMESTAMPTZ(3),
    "progress" INTEGER NOT NULL DEFAULT 0,
    "assignee_id" UUID,
    "creator_id" UUID NOT NULL,
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_collaborator" (
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "collaborator_role" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_collaborator_pkey" PRIMARY KEY ("task_id","user_id","role")
);

-- CreateTable
CREATE TABLE "checklist_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "done_at" TIMESTAMPTZ(3),
    "assignee_id" UUID,
    "position" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "label" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "label_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_label" (
    "task_id" UUID NOT NULL,
    "label_id" UUID NOT NULL,

    CONSTRAINT "task_label_pkey" PRIMARY KEY ("task_id","label_id")
);

-- CreateTable
CREATE TABLE "task_dependency" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "predecessor_id" UUID NOT NULL,
    "successor_id" UUID NOT NULL,
    "type" "dependency_type" NOT NULL DEFAULT 'finish_start',
    "lag_days" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_dependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "task_id" UUID,
    "checklist_item_id" UUID,
    "comment_id" UUID,
    "uploader_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "thumb_key" TEXT,
    "version_group_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version_no" INTEGER NOT NULL DEFAULT 1,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "taken_at" TIMESTAMPTZ(3),
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "parent_id" UUID,
    "body" TEXT NOT NULL,
    "is_question" BOOLEAN NOT NULL DEFAULT false,
    "edited_at" TIMESTAMPTZ(3),
    "hidden_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mention" (
    "comment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mention_pkey" PRIMARY KEY ("comment_id","user_id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "project_id" UUID,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_view" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "project_id" UUID,
    "name" TEXT NOT NULL,
    "filter" JSONB NOT NULL DEFAULT '{}',
    "view_mode" "view_mode" NOT NULL DEFAULT 'list',
    "is_shared" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_view_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branch_organization_id_name_key" ON "branch"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "branch_organization_id_code_key" ON "branch"("organization_id", "code");

-- CreateIndex
CREATE INDEX "department_branch_id_idx" ON "department"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "department_organization_id_branch_id_name_key" ON "department"("organization_id", "branch_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- CreateIndex
CREATE INDEX "app_user_organization_id_status_idx" ON "app_user"("organization_id", "status");

-- CreateIndex
CREATE INDEX "app_user_branch_id_idx" ON "app_user"("branch_id");

-- CreateIndex
CREATE INDEX "app_user_department_id_idx" ON "app_user"("department_id");

-- CreateIndex
CREATE INDEX "user_department_department_id_idx" ON "user_department"("department_id");

-- CreateIndex
CREATE INDEX "project_branch_id_status_idx" ON "project"("branch_id", "status");

-- CreateIndex
CREATE INDEX "project_owner_id_idx" ON "project"("owner_id");

-- CreateIndex
CREATE INDEX "project_deleted_at_idx" ON "project"("deleted_at");

-- CreateIndex
CREATE INDEX "project_member_user_id_idx" ON "project_member"("user_id");

-- CreateIndex
CREATE INDEX "task_project_id_status_idx" ON "task"("project_id", "status");

-- CreateIndex
CREATE INDEX "task_assignee_id_due_date_idx" ON "task"("assignee_id", "due_date");

-- CreateIndex
CREATE INDEX "task_parent_id_position_idx" ON "task"("parent_id", "position");

-- CreateIndex
CREATE INDEX "task_deleted_at_idx" ON "task"("deleted_at");

-- CreateIndex
CREATE INDEX "task_custom_fields_gin" ON "task" USING GIN ("custom_fields");

-- CreateIndex
CREATE INDEX "task_collaborator_user_id_role_idx" ON "task_collaborator"("user_id", "role");


-- CreateIndex
CREATE INDEX "checklist_item_assignee_id_idx" ON "checklist_item"("assignee_id");

-- CreateIndex
CREATE INDEX "label_project_id_idx" ON "label"("project_id");

-- CreateIndex
CREATE INDEX "task_label_label_id_idx" ON "task_label"("label_id");

-- CreateIndex
CREATE INDEX "task_dependency_successor_id_idx" ON "task_dependency"("successor_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_dependency_predecessor_id_successor_id_key" ON "task_dependency"("predecessor_id", "successor_id");

-- CreateIndex
CREATE INDEX "attachment_project_id_created_at_idx" ON "attachment"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "attachment_task_id_idx" ON "attachment"("task_id");

-- CreateIndex
CREATE INDEX "attachment_checklist_item_id_idx" ON "attachment"("checklist_item_id");

-- CreateIndex
CREATE INDEX "attachment_comment_id_idx" ON "attachment"("comment_id");

-- CreateIndex
CREATE INDEX "attachment_uploader_id_idx" ON "attachment"("uploader_id");

-- CreateIndex
CREATE INDEX "attachment_deleted_at_idx" ON "attachment"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "attachment_version_group_id_version_no_key" ON "attachment"("version_group_id", "version_no");

-- CreateIndex
CREATE INDEX "comment_task_id_created_at_idx" ON "comment"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "comment_parent_id_idx" ON "comment"("parent_id");

-- CreateIndex
CREATE INDEX "comment_author_id_idx" ON "comment"("author_id");

-- CreateIndex
CREATE INDEX "mention_user_id_idx" ON "mention"("user_id");

-- CreateIndex
CREATE INDEX "notification_user_id_read_at_created_at_idx" ON "notification"("user_id", "read_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "activity_log_entity_type_entity_id_at_idx" ON "activity_log"("entity_type", "entity_id", "at" DESC);

-- CreateIndex
CREATE INDEX "activity_log_project_id_at_idx" ON "activity_log"("project_id", "at" DESC);

-- CreateIndex
CREATE INDEX "activity_log_actor_id_at_idx" ON "activity_log"("actor_id", "at" DESC);

-- CreateIndex
CREATE INDEX "saved_view_user_id_idx" ON "saved_view"("user_id");

-- CreateIndex
CREATE INDEX "saved_view_project_id_is_shared_idx" ON "saved_view"("project_id", "is_shared");

-- AddForeignKey
ALTER TABLE "branch" ADD CONSTRAINT "branch_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_department" ADD CONSTRAINT "user_department_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_department" ADD CONSTRAINT "user_department_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_collaborator" ADD CONSTRAINT "task_collaborator_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_collaborator" ADD CONSTRAINT "task_collaborator_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "label" ADD CONSTRAINT "label_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "label" ADD CONSTRAINT "label_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_label" ADD CONSTRAINT "task_label_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_label" ADD CONSTRAINT "task_label_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "label"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependency" ADD CONSTRAINT "task_dependency_predecessor_id_fkey" FOREIGN KEY ("predecessor_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependency" ADD CONSTRAINT "task_dependency_successor_id_fkey" FOREIGN KEY ("successor_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_checklist_item_id_fkey" FOREIGN KEY ("checklist_item_id") REFERENCES "checklist_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mention" ADD CONSTRAINT "mention_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mention" ADD CONSTRAINT "mention_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================
-- PHẦN BỔ SUNG THỦ CÔNG (Prisma không tự tạo được)
-- ============================================================

-- 1. Vị trí anh em so sánh theo byte (chỉ mục phân số cần đúng thứ tự này).
ALTER TABLE "task" ALTER COLUMN "position" TYPE TEXT COLLATE "C";
ALTER TABLE "checklist_item" ALTER COLUMN "position" TYPE TEXT COLLATE "C";

-- 2. Ràng buộc CHECK
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_email_lowercase" CHECK ("email" = lower("email"));
ALTER TABLE "project" ADD CONSTRAINT "project_name_not_empty" CHECK (length(btrim("name")) > 0);
ALTER TABLE "project" ADD CONSTRAINT "project_dates_order"
  CHECK ("due_date" IS NULL OR "start_date" IS NULL OR "due_date" >= "start_date");

ALTER TABLE "task" ADD CONSTRAINT "task_title_not_empty" CHECK (length(btrim("title")) > 0);
ALTER TABLE "task" ADD CONSTRAINT "task_position_not_empty" CHECK (length("position") > 0);
ALTER TABLE "task" ADD CONSTRAINT "task_progress_range" CHECK ("progress" BETWEEN 0 AND 100);
ALTER TABLE "task" ADD CONSTRAINT "task_depth_range" CHECK ("depth" BETWEEN 1 AND 5);
ALTER TABLE "task" ADD CONSTRAINT "task_no_self_parent" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");
ALTER TABLE "task" ADD CONSTRAINT "task_duration_nonnegative" CHECK ("duration_days" IS NULL OR "duration_days" >= 0);
ALTER TABLE "task" ADD CONSTRAINT "task_dates_order"
  CHECK ("due_date" IS NULL OR "start_date" IS NULL OR "due_date" >= "start_date");
ALTER TABLE "task" ADD CONSTRAINT "task_blocked_needs_reason"
  CHECK ("status" <> 'blocked' OR ("blocked_reason" IS NOT NULL AND length(btrim("blocked_reason")) > 0));

ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_title_not_empty" CHECK (length(btrim("title")) > 0);
ALTER TABLE "label" ADD CONSTRAINT "label_color_format" CHECK ("color" ~ '^#[0-9a-fA-F]{6}$');
ALTER TABLE "label" ADD CONSTRAINT "label_name_not_empty" CHECK (length(btrim("name")) > 0);
ALTER TABLE "task_dependency" ADD CONSTRAINT "task_dependency_no_self" CHECK ("predecessor_id" <> "successor_id");

ALTER TABLE "attachment" ADD CONSTRAINT "attachment_size_nonnegative" CHECK ("size" >= 0);
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_version_positive" CHECK ("version_no" >= 1);
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_lat_range" CHECK ("lat" IS NULL OR "lat" BETWEEN -90 AND 90);
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_lng_range" CHECK ("lng" IS NULL OR "lng" BETWEEN -180 AND 180);

ALTER TABLE "comment" ADD CONSTRAINT "comment_body_not_empty" CHECK (length(btrim("body")) > 0);

-- 3. Chỉ mục duy nhất đặc biệt (từng phần, hoặc coi NULL là bằng nhau)
-- Hai việc cùng cha (kể cả cha rỗng = việc gốc) không được trùng vị trí. Việc đã xóa mềm không tính.
CREATE UNIQUE INDEX "task_sibling_position_uq"
  ON "task" ("project_id", "parent_id", "position") NULLS NOT DISTINCT
  WHERE "deleted_at" IS NULL;

-- Vị trí trong checklist: duy nhất trong cùng một công việc, so theo byte vì cột dùng COLLATE "C".
CREATE UNIQUE INDEX "checklist_item_position_uq" ON "checklist_item" ("task_id", "position");

-- Mỗi nhóm phiên bản của một tệp chỉ có một bản hiện hành.
CREATE UNIQUE INDEX "attachment_one_current_uq"
  ON "attachment" ("version_group_id")
  WHERE "is_current" AND "deleted_at" IS NULL;

-- Tên nhãn không trùng (không phân biệt hoa thường) trong cùng phạm vi công ty hoặc dự án.
CREATE UNIQUE INDEX "label_scope_name_uq"
  ON "label" ("organization_id", "project_id", lower("name")) NULLS NOT DISTINCT;

-- 4. Trigger cây việc: tự tính độ sâu, tối đa 5 cấp, cùng dự án, chặn chu trình
CREATE OR REPLACE FUNCTION qlcv_task_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_project UUID;
  parent_depth INT;
  subtree_height INT := 0;
BEGIN
  IF NEW."parent_id" IS NULL THEN
    NEW."depth" := 1;
    RETURN NEW;
  END IF;

  SELECT "project_id", "depth" INTO parent_project, parent_depth
  FROM "task" WHERE "id" = NEW."parent_id";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'QLCV_TASK_PARENT_MISSING: việc cha không tồn tại' USING ERRCODE = '23503';
  END IF;

  IF parent_project <> NEW."project_id" THEN
    RAISE EXCEPTION 'QLCV_TASK_PARENT_PROJECT: việc cha phải thuộc cùng dự án' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Chặn chu trình: việc mới của cha không được là con cháu của chính việc này.
    IF EXISTS (
      WITH RECURSIVE sub AS (
        SELECT "id" FROM "task" WHERE "parent_id" = NEW."id"
        UNION ALL
        SELECT t."id" FROM "task" t JOIN sub ON t."parent_id" = sub."id"
      )
      SELECT 1 FROM sub WHERE sub."id" = NEW."parent_id"
    ) THEN
      RAISE EXCEPTION 'QLCV_TASK_CYCLE: không thể chuyển việc vào chính cây con của nó' USING ERRCODE = '23514';
    END IF;

    -- Chiều cao cây con hiện có (số cấp bên dưới việc này).
    WITH RECURSIVE sub AS (
      SELECT "id", 1 AS lvl FROM "task" WHERE "parent_id" = NEW."id"
      UNION ALL
      SELECT t."id", sub.lvl + 1 FROM "task" t JOIN sub ON t."parent_id" = sub."id"
    )
    SELECT COALESCE(MAX(lvl), 0) INTO subtree_height FROM sub;
  END IF;

  NEW."depth" := parent_depth + 1;
  IF NEW."depth" + subtree_height > 5 THEN
    RAISE EXCEPTION 'QLCV_TASK_DEPTH_EXCEEDED: việc con tối đa 5 cấp' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END $$;

-- Sau khi một việc đổi cha, đổi dự án hoặc đổi độ sâu: kéo cây con theo (mỗi con sẽ tự tính lại độ sâu).
CREATE OR REPLACE FUNCTION qlcv_task_after_move() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "task" SET "project_id" = NEW."project_id" WHERE "parent_id" = NEW."id";
  RETURN NULL;
END $$;

CREATE TRIGGER "task_before_write"
  BEFORE INSERT OR UPDATE OF "parent_id", "project_id", "depth" ON "task"
  FOR EACH ROW EXECUTE FUNCTION qlcv_task_before_write();

CREATE TRIGGER "task_after_move"
  AFTER UPDATE OF "parent_id", "project_id", "depth" ON "task"
  FOR EACH ROW
  WHEN (OLD."parent_id" IS DISTINCT FROM NEW."parent_id"
     OR OLD."project_id" IS DISTINCT FROM NEW."project_id"
     OR OLD."depth" IS DISTINCT FROM NEW."depth")
  EXECUTE FUNCTION qlcv_task_after_move();

-- 5. Nhật ký chỉ ghi thêm: chặn sửa, xóa và làm rỗng bảng
CREATE OR REPLACE FUNCTION qlcv_activity_log_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'QLCV_ACTIVITY_LOG_IMMUTABLE: nhật ký hoạt động chỉ được ghi thêm, không được sửa hoặc xóa'
    USING ERRCODE = '42501';
END $$;

CREATE TRIGGER "activity_log_no_update_delete"
  BEFORE UPDATE OR DELETE ON "activity_log"
  FOR EACH ROW EXECUTE FUNCTION qlcv_activity_log_guard();

CREATE TRIGGER "activity_log_no_truncate"
  BEFORE TRUNCATE ON "activity_log"
  FOR EACH STATEMENT EXECUTE FUNCTION qlcv_activity_log_guard();