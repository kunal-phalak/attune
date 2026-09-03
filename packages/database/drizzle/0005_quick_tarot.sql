CREATE TABLE "buyer_commerce_profiles" (
	"principal_id" text PRIMARY KEY NOT NULL,
	"profile" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopify_customer_bindings" (
	"buyer_principal_id" text NOT NULL,
	"shop_domain" text NOT NULL,
	"customer_id" text NOT NULL,
	"default_address_id" text,
	"binding" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopify_customer_bindings_buyer_principal_id_shop_domain_pk" PRIMARY KEY("buyer_principal_id","shop_domain")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "shopify_customer_bindings_customer_unique" ON "shopify_customer_bindings" USING btree ("shop_domain","customer_id");