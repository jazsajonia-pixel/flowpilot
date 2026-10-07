ALTER TABLE "workflows" ADD COLUMN "webhook_token" varchar(64);--> statement-breakpoint
UPDATE "workflows"
SET "webhook_token" = replace(gen_random_uuid()::text, '-', '')
WHERE "webhook_token" IS NULL;--> statement-breakpoint
ALTER TABLE "workflows" ALTER COLUMN "webhook_token" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "workflows_webhook_token_unique" ON "workflows" USING btree ("webhook_token");
