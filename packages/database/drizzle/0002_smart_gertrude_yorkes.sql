CREATE TABLE "delegation_grants" (
	"grant_id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"delegating_principal_id" text NOT NULL,
	"delegated_principal_id" text NOT NULL,
	"role" text NOT NULL,
	"capability_ids" text[] NOT NULL,
	"observation_cursor" integer DEFAULT 0 NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_capability_profiles" (
	"profile_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"version" text NOT NULL,
	"profile" jsonb NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_capability_profiles_profile_id_version_pk" PRIMARY KEY("profile_id","version")
);
--> statement-breakpoint
ALTER TABLE "delegation_grants" ADD CONSTRAINT "delegation_grants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delegation_grants_workspace_role_index" ON "delegation_grants" USING btree ("workspace_id","role");--> statement-breakpoint
CREATE INDEX "delegation_grants_delegated_principal_index" ON "delegation_grants" USING btree ("delegated_principal_id");--> statement-breakpoint
CREATE INDEX "provider_capability_profiles_provider_index" ON "provider_capability_profiles" USING btree ("provider_id");