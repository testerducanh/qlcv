CREATE TYPE "guest_access_status" AS ENUM (
    'pending_approval',
    'active',
    'revoked',
    'expired'
);

ALTER TABLE "project" ADD COLUMN "guest_watermark" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "guest_access" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" "guest_access_status" NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    CONSTRAINT "guest_access_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guest_task_access" (
    "guest_access_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "guest_task_access_pkey" PRIMARY KEY ("guest_access_id", "task_id")
);

CREATE TABLE "guest_shared_attachment" (
    "guest_access_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "attachment_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "guest_shared_attachment_pkey"
        PRIMARY KEY ("guest_access_id", "task_id", "attachment_id")
);

CREATE TABLE "guest_submission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "guest_access_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "guest_submission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guest_submission_file" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "submission_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "upload_storage_key" TEXT,
    "upload_expires_at" TIMESTAMPTZ(3),
    "confirmed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "guest_submission_file_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guest_access_token_hash_key" ON "guest_access"("token_hash");
CREATE INDEX "guest_access_project_id_status_expires_at_idx"
    ON "guest_access"("project_id", "status", "expires_at");
CREATE INDEX "guest_task_access_task_id_idx" ON "guest_task_access"("task_id");
CREATE INDEX "guest_shared_attachment_attachment_id_idx"
    ON "guest_shared_attachment"("attachment_id");
CREATE INDEX "guest_submission_guest_access_id_task_id_created_at_idx"
    ON "guest_submission"("guest_access_id", "task_id", "created_at");
CREATE INDEX "guest_submission_file_submission_id_created_at_idx"
    ON "guest_submission_file"("submission_id", "created_at");

ALTER TABLE "guest_access"
    ADD CONSTRAINT "guest_access_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_access"
    ADD CONSTRAINT "guest_access_invited_by_id_fkey"
    FOREIGN KEY ("invited_by_id") REFERENCES "app_user"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guest_task_access"
    ADD CONSTRAINT "guest_task_access_guest_access_id_fkey"
    FOREIGN KEY ("guest_access_id") REFERENCES "guest_access"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_task_access"
    ADD CONSTRAINT "guest_task_access_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "task"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_shared_attachment"
    ADD CONSTRAINT "guest_shared_attachment_guest_access_id_task_id_fkey"
    FOREIGN KEY ("guest_access_id", "task_id")
    REFERENCES "guest_task_access"("guest_access_id", "task_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_shared_attachment"
    ADD CONSTRAINT "guest_shared_attachment_attachment_id_fkey"
    FOREIGN KEY ("attachment_id") REFERENCES "attachment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_submission"
    ADD CONSTRAINT "guest_submission_guest_access_id_fkey"
    FOREIGN KEY ("guest_access_id") REFERENCES "guest_access"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_submission"
    ADD CONSTRAINT "guest_submission_guest_access_id_task_id_fkey"
    FOREIGN KEY ("guest_access_id", "task_id")
    REFERENCES "guest_task_access"("guest_access_id", "task_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_submission_file"
    ADD CONSTRAINT "guest_submission_file_submission_id_fkey"
    FOREIGN KEY ("submission_id") REFERENCES "guest_submission"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION prevent_guest_submission_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
        RAISE EXCEPTION 'Guest submissions are immutable';
    END;
    $$;

CREATE TRIGGER "guest_submission_immutable"
    BEFORE UPDATE ON "guest_submission"
    FOR EACH ROW EXECUTE FUNCTION prevent_guest_submission_update();
