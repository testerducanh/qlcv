ALTER TABLE "attachment"
ADD COLUMN "preview_key" TEXT,
ADD COLUMN "width" INTEGER,
ADD COLUMN "height" INTEGER,
ADD COLUMN "confirmed_at" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "upload_expires_at" TIMESTAMPTZ(3);

UPDATE "attachment" SET "confirmed_at" = "created_at";

CREATE INDEX "attachment_project_id_confirmed_at_created_at_idx"
ON "attachment"("project_id", "confirmed_at", "created_at");

CREATE INDEX "attachment_upload_expires_at_idx"
ON "attachment"("upload_expires_at");
