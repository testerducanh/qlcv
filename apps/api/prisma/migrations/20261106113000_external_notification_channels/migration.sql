CREATE TYPE "notification_delivery_channel" AS ENUM ('email', 'zalo', 'sms');
CREATE TYPE "notification_delivery_status" AS ENUM ('pending', 'processing', 'sent', 'failed');

ALTER TABLE "notification_preference"
    ADD COLUMN "channels" JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN "phone_number" TEXT,
    ADD COLUMN "zalo_user_id" TEXT;

CREATE TABLE "notification_delivery" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notification_id" UUID NOT NULL,
    "channel" "notification_delivery_channel" NOT NULL,
    "status" "notification_delivery_status" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "provider_message_id" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_delivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_delivery_notification_id_channel_key"
    ON "notification_delivery"("notification_id", "channel");
CREATE INDEX "notification_delivery_status_next_attempt_at_idx"
    ON "notification_delivery"("status", "next_attempt_at");

ALTER TABLE "notification_delivery"
    ADD CONSTRAINT "notification_delivery_notification_id_fkey"
    FOREIGN KEY ("notification_id") REFERENCES "notification"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
