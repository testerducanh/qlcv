CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION qlcv_immutable_unaccent(input TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT public.unaccent('public.unaccent'::regdictionary, input)
$$;

ALTER TABLE "task" ADD COLUMN "search_vector" tsvector NOT NULL DEFAULT ''::tsvector;

CREATE OR REPLACE FUNCTION qlcv_refresh_task_search_vector(target_task_id UUID)
RETURNS VOID
LANGUAGE SQL
AS $$
  UPDATE "task" AS t
  SET "search_vector" =
    setweight(to_tsvector('simple', qlcv_immutable_unaccent(coalesce(t."title", ''))), 'A') ||
    setweight(to_tsvector('simple', qlcv_immutable_unaccent(coalesce(t."description", ''))), 'B') ||
    setweight(to_tsvector('simple', qlcv_immutable_unaccent(coalesce((
      SELECT string_agg(c."body", ' ')
      FROM "comment" AS c
      WHERE c."task_id" = t."id" AND c."hidden_at" IS NULL
    ), ''))), 'C') ||
    setweight(to_tsvector('simple', qlcv_immutable_unaccent(coalesce((
      SELECT string_agg(a."file_name", ' ')
      FROM "attachment" AS a
      LEFT JOIN "checklist_item" AS ci ON ci."id" = a."checklist_item_id"
      LEFT JOIN "comment" AS c ON c."id" = a."comment_id"
      WHERE coalesce(a."task_id", ci."task_id", c."task_id") = t."id"
        AND a."deleted_at" IS NULL
        AND a."confirmed_at" IS NOT NULL
    ), ''))), 'D')
  WHERE t."id" = target_task_id;
$$;

CREATE OR REPLACE FUNCTION qlcv_task_search_vector_before_write()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
BEGIN
  NEW."search_vector" :=
    setweight(to_tsvector('simple', qlcv_immutable_unaccent(coalesce(NEW."title", ''))), 'A') ||
    setweight(to_tsvector('simple', qlcv_immutable_unaccent(coalesce(NEW."description", ''))), 'B') ||
    setweight(to_tsvector('simple', qlcv_immutable_unaccent(coalesce((
      SELECT string_agg(c."body", ' ')
      FROM "comment" AS c
      WHERE c."task_id" = NEW."id" AND c."hidden_at" IS NULL
    ), ''))), 'C') ||
    setweight(to_tsvector('simple', qlcv_immutable_unaccent(coalesce((
      SELECT string_agg(a."file_name", ' ')
      FROM "attachment" AS a
      LEFT JOIN "checklist_item" AS ci ON ci."id" = a."checklist_item_id"
      LEFT JOIN "comment" AS c ON c."id" = a."comment_id"
      WHERE coalesce(a."task_id", ci."task_id", c."task_id") = NEW."id"
        AND a."deleted_at" IS NULL
        AND a."confirmed_at" IS NOT NULL
    ), ''))), 'D');
  RETURN NEW;
END;
$$;

CREATE TRIGGER task_search_vector_before_insert
BEFORE INSERT
ON "task"
FOR EACH ROW
EXECUTE FUNCTION qlcv_task_search_vector_before_write();

CREATE TRIGGER task_search_vector_before_update
BEFORE UPDATE OF "title", "description"
ON "task"
FOR EACH ROW
EXECUTE FUNCTION qlcv_task_search_vector_before_write();

CREATE OR REPLACE FUNCTION qlcv_related_search_vector_after_write()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
DECLARE
  affected_task_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'comment' THEN
    IF TG_OP = 'DELETE' THEN
      affected_task_id := OLD."task_id";
    ELSE
      affected_task_id := NEW."task_id";
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      affected_task_id := COALESCE(
        OLD."task_id",
        (SELECT "task_id" FROM "checklist_item" WHERE "id" = OLD."checklist_item_id"),
        (SELECT "task_id" FROM "comment" WHERE "id" = OLD."comment_id")
      );
    ELSE
      affected_task_id := COALESCE(
        NEW."task_id",
        (SELECT "task_id" FROM "checklist_item" WHERE "id" = NEW."checklist_item_id"),
        (SELECT "task_id" FROM "comment" WHERE "id" = NEW."comment_id")
      );
    END IF;
  END IF;
  IF affected_task_id IS NOT NULL THEN
    PERFORM qlcv_refresh_task_search_vector(affected_task_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER comment_search_vector_after_write
AFTER INSERT OR UPDATE OR DELETE
ON "comment"
FOR EACH ROW
EXECUTE FUNCTION qlcv_related_search_vector_after_write();

CREATE TRIGGER attachment_search_vector_after_write
AFTER INSERT OR UPDATE OR DELETE
ON "attachment"
FOR EACH ROW
EXECUTE FUNCTION qlcv_related_search_vector_after_write();

UPDATE "task" SET "search_vector" = ''::tsvector;
SELECT qlcv_refresh_task_search_vector("id") FROM "task";

CREATE INDEX "task_search_vector_gin_idx" ON "task" USING GIN ("search_vector");
