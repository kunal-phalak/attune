CREATE TABLE "acceptances" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"quote_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"spec_hash" text NOT NULL,
	"record" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_intervention_observations" (
	"workspace_id" text NOT NULL,
	"principal_id" text NOT NULL,
	"receipt_id" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_intervention_observations_workspace_id_principal_id_receipt_id_pk" PRIMARY KEY("workspace_id","principal_id","receipt_id")
);
--> statement-breakpoint
CREATE TABLE "capability_transitions" (
	"transition_id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"receipt_id" text NOT NULL,
	"workspace_seq" integer NOT NULL,
	"capability_epoch" integer NOT NULL,
	"transition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_receipts" (
	"receipt_id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"receipt_seq" integer NOT NULL,
	"command_id" text NOT NULL,
	"origin" text NOT NULL,
	"principal_id" text NOT NULL,
	"role" text NOT NULL,
	"before_hash" text NOT NULL,
	"after_hash" text NOT NULL,
	"specification_before_hash" text NOT NULL,
	"specification_after_hash" text NOT NULL,
	"receipt" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "command_idempotency_records" (
	"workspace_id" text NOT NULL,
	"command_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"principal_id" text NOT NULL,
	"role" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "command_idempotency_records_workspace_id_command_id_pk" PRIMARY KEY("workspace_id","command_id")
);
--> statement-breakpoint
CREATE TABLE "command_rejections" (
	"rejection_id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"command_id" text NOT NULL,
	"rejection" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commerce_verification_records" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"spec_hash" text NOT NULL,
	"status" text NOT NULL,
	"record" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "frozen_revisions" (
	"workspace_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"spec_hash" text NOT NULL,
	"canonical_specification" jsonb NOT NULL,
	"liveblocks_version_id" text,
	"frozen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frozen_revisions_workspace_id_revision_id_pk" PRIMARY KEY("workspace_id","revision_id")
);
--> statement-breakpoint
CREATE TABLE "organization_memberships" (
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"roles" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_memberships_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"spec_hash" text NOT NULL,
	"draft_version" integer NOT NULL,
	"record" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"spec_hash" text NOT NULL,
	"record" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attune_users" (
	"id" text PRIMARY KEY NOT NULL,
	"auth_user_id" text NOT NULL,
	"email" text,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_files" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_memberships" (
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"roles" text[] NOT NULL,
	"can_comment" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_memberships_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspace_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"workspace_seq" integer NOT NULL,
	"specification" jsonb NOT NULL,
	"spec_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"commitment_id" text NOT NULL,
	"liveblocks_room_id" text NOT NULL,
	"current_specification" jsonb NOT NULL,
	"workspace_seq" integer NOT NULL,
	"draft_version" integer NOT NULL,
	"capability_epoch" integer NOT NULL,
	"need_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acceptances" ADD CONSTRAINT "acceptances_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_intervention_observations" ADD CONSTRAINT "agent_intervention_observations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_intervention_observations" ADD CONSTRAINT "agent_intervention_observations_receipt_id_change_receipts_receipt_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."change_receipts"("receipt_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_transitions" ADD CONSTRAINT "capability_transitions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_transitions" ADD CONSTRAINT "capability_transitions_receipt_id_change_receipts_receipt_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."change_receipts"("receipt_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_receipts" ADD CONSTRAINT "change_receipts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "command_idempotency_records" ADD CONSTRAINT "command_idempotency_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "command_rejections" ADD CONSTRAINT "command_rejections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_verification_records" ADD CONSTRAINT "commerce_verification_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frozen_revisions" ADD CONSTRAINT "frozen_revisions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_attune_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."attune_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_files" ADD CONSTRAINT "workspace_files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_user_id_attune_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."attune_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_snapshots" ADD CONSTRAINT "workspace_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capability_transitions_workspace_index" ON "capability_transitions" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "change_receipts_sequence_unique" ON "change_receipts" USING btree ("workspace_id","receipt_seq");--> statement-breakpoint
CREATE UNIQUE INDEX "change_receipts_command_unique" ON "change_receipts" USING btree ("workspace_id","command_id");--> statement-breakpoint
CREATE INDEX "change_receipts_workspace_created_index" ON "change_receipts" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "command_rejections_workspace_index" ON "command_rejections" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attune_users_auth_user_id_unique" ON "attune_users" USING btree ("auth_user_id");--> statement-breakpoint
CREATE INDEX "workspace_files_workspace_id_index" ON "workspace_files" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_snapshots_sequence_unique" ON "workspace_snapshots" USING btree ("workspace_id","workspace_seq");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_commitment_id_unique" ON "workspaces" USING btree ("commitment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_liveblocks_room_id_unique" ON "workspaces" USING btree ("liveblocks_room_id");--> statement-breakpoint
CREATE INDEX "workspaces_project_id_index" ON "workspaces" USING btree ("project_id");