ALTER TABLE "project"
ADD COLUMN "custom_field_definitions" JSONB NOT NULL DEFAULT '[]';
