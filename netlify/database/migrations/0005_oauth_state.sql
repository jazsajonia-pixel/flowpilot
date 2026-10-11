CREATE TABLE "oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"provider" varchar(32) NOT NULL,
	"state_hash" varchar(64) NOT NULL,
	"session_token_hash" varchar(64) NOT NULL,
	"browser_binding_hash" varchar(64) NOT NULL,
	"encrypted_code_verifier" text NOT NULL,
	"redirect_uri" varchar(512) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "credentials_integration_id_idx";--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_states_state_hash_unique" ON "oauth_states" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "oauth_states_owner_expires_idx" ON "oauth_states" USING btree ("owner_id","expires_at");--> statement-breakpoint
CREATE INDEX "oauth_states_expires_at_idx" ON "oauth_states" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "credentials_integration_id_unique" ON "credentials" USING btree ("integration_id");