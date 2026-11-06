CREATE TABLE "background_job_failure" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "queue" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "error" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "failed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "background_job_failure_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "background_job_failure_queue_job_id_key"
ON "background_job_failure"("queue", "job_id");

CREATE INDEX "background_job_failure_resolved_at_failed_at_idx"
ON "background_job_failure"("resolved_at", "failed_at");
