CREATE TABLE "shopify_installations" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_principal_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"shop_domain" text NOT NULL,
	"shop_name" text NOT NULL,
	"primary_domain" text NOT NULL,
	"currency_code" text NOT NULL,
	"encrypted_offline_access_token" text,
	"encrypted_offline_refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"granted_scopes" text[] NOT NULL,
	"connection_status" text NOT NULL,
	"locations" jsonb NOT NULL,
	"selected_location_id" text,
	"maker_profile" jsonb,
	"marketplace_listed" boolean DEFAULT false NOT NULL,
	"installed_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uninstalled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "shopify_installations_owner_shop_unique" ON "shopify_installations" USING btree ("owner_principal_id","shop_id");--> statement-breakpoint
CREATE INDEX "shopify_installations_owner_index" ON "shopify_installations" USING btree ("owner_principal_id");--> statement-breakpoint
CREATE INDEX "shopify_installations_domain_index" ON "shopify_installations" USING btree ("shop_domain");