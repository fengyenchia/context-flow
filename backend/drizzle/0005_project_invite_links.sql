CREATE TABLE "project_invite_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_invite_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"role" varchar(20) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_invite_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "project_invite_grants" ADD CONSTRAINT "project_invite_grants_link_id_project_invite_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."project_invite_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invite_grants" ADD CONSTRAINT "project_invite_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invite_links" ADD CONSTRAINT "project_invite_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invite_links" ADD CONSTRAINT "project_invite_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_project_invite_grants_link_user" ON "project_invite_grants" USING btree ("link_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_project_invite_grants_user" ON "project_invite_grants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_project_invite_links_project" ON "project_invite_links" USING btree ("project_id");