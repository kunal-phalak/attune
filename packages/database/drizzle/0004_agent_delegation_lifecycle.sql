ALTER TABLE "delegation_grants" RENAME TO "agent_delegations";--> statement-breakpoint
ALTER TABLE "agent_delegations" RENAME COLUMN "grant_id" TO "id";--> statement-breakpoint
ALTER TABLE "agent_delegations" RENAME COLUMN "delegating_principal_id" TO "principal_id";--> statement-breakpoint
ALTER TABLE "agent_delegations" DROP CONSTRAINT "delegation_grants_workspace_id_workspaces_id_fk";
--> statement-breakpoint
DROP INDEX "delegation_grants_workspace_role_index";--> statement-breakpoint
DROP INDEX "delegation_grants_delegated_principal_index";--> statement-breakpoint
ALTER TABLE "agent_delegations" ADD COLUMN "authority_epoch" integer;--> statement-breakpoint
ALTER TABLE "agent_delegations" ADD COLUMN "consent_expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "agent_delegations"
SET
	"authority_epoch" = 0,
	"consent_expires_at" = "expires_at",
	"revoked_at" = COALESCE("revoked_at", NOW());--> statement-breakpoint
ALTER TABLE "agent_delegations" ALTER COLUMN "authority_epoch" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_delegations" ALTER COLUMN "consent_expires_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_delegations" ADD CONSTRAINT "agent_delegations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_delegations_workspace_principal_index" ON "agent_delegations" USING btree ("workspace_id","principal_id");--> statement-breakpoint
ALTER TABLE "agent_delegations" DROP COLUMN "delegated_principal_id";--> statement-breakpoint
ALTER TABLE "agent_delegations" DROP COLUMN "role";
