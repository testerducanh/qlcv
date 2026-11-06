CREATE OR REPLACE FUNCTION qlcv_related_search_vector_after_write()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
DECLARE
  old_task_id UUID;
  new_task_id UUID;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    IF TG_TABLE_NAME = 'comment' THEN
      old_task_id := OLD."task_id";
    ELSE
      old_task_id := COALESCE(
        OLD."task_id",
        (SELECT "task_id" FROM "checklist_item" WHERE "id" = OLD."checklist_item_id"),
        (SELECT "task_id" FROM "comment" WHERE "id" = OLD."comment_id")
      );
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    IF TG_TABLE_NAME = 'comment' THEN
      new_task_id := NEW."task_id";
    ELSE
      new_task_id := COALESCE(
        NEW."task_id",
        (SELECT "task_id" FROM "checklist_item" WHERE "id" = NEW."checklist_item_id"),
        (SELECT "task_id" FROM "comment" WHERE "id" = NEW."comment_id")
      );
    END IF;
  END IF;

  IF old_task_id IS NOT NULL THEN
    PERFORM qlcv_refresh_task_search_vector(old_task_id);
  END IF;
  IF new_task_id IS NOT NULL AND new_task_id IS DISTINCT FROM old_task_id THEN
    PERFORM qlcv_refresh_task_search_vector(new_task_id);
  END IF;
  RETURN NULL;
END;
$$;
