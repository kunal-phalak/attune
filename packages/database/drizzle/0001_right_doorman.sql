CREATE TABLE "external_action_attempts" (
	"workspace_id" text NOT NULL,
	"command_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"status" text NOT NULL,
	"failure_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_action_attempts_workspace_id_command_id_pk" PRIMARY KEY("workspace_id","command_id")
);
--> statement-breakpoint
ALTER TABLE "external_action_attempts" ADD CONSTRAINT "external_action_attempts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;