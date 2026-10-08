CREATE TABLE "data_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"collection" varchar(64) NOT NULL,
	"record_key" varchar(128) NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_records" ADD CONSTRAINT "data_records_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "data_records_owner_collection_key_unique" ON "data_records" USING btree ("owner_id","collection","record_key");--> statement-breakpoint
CREATE INDEX "data_records_owner_collection_updated_idx" ON "data_records" USING btree ("owner_id","collection","updated_at");