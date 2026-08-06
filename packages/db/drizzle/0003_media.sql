CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"visibility" text NOT NULL,
	"storage_bucket" text NOT NULL,
	"storage_key" text NOT NULL,
	"original_file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum_sha256" text,
	"width" integer,
	"height" integer,
	"alt_text" text,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_storage_bucket_storage_key_unique" UNIQUE("storage_bucket","storage_key"),
	CONSTRAINT "media_assets_id_owner_unique" UNIQUE("id","owner_user_id"),
	CONSTRAINT "media_assets_purpose_check" CHECK ("media_assets"."purpose" in ('product_cover', 'profile_avatar', 'profile_cover', 'verification_identity_document', 'verification_qualification_document', 'calculation_report_pdf', 'messaging_attachment')),
	CONSTRAINT "media_assets_status_check" CHECK ("media_assets"."status" in ('uploading', 'processing', 'ready', 'failed', 'deleted')),
	CONSTRAINT "media_assets_visibility_check" CHECK ("media_assets"."visibility" in ('public', 'private')),
	CONSTRAINT "media_assets_mime_type_check" CHECK ("media_assets"."mime_type" in ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'video/mp4')),
	CONSTRAINT "media_assets_size_bytes_check" CHECK ("media_assets"."size_bytes" >= 0),
	CONSTRAINT "media_assets_ready_size_bytes_check" CHECK ("media_assets"."status" <> 'ready' or "media_assets"."size_bytes" > 0),
	CONSTRAINT "media_assets_width_check" CHECK ("media_assets"."width" is null or "media_assets"."width" > 0),
	CONSTRAINT "media_assets_height_check" CHECK ("media_assets"."height" is null or "media_assets"."height" > 0),
	CONSTRAINT "media_assets_checksum_sha256_check" CHECK ("media_assets"."checksum_sha256" is null or "media_assets"."checksum_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "media_assets_alt_text_length_check" CHECK ("media_assets"."alt_text" is null or length(trim("media_assets"."alt_text")) <= 300)
);
--> statement-breakpoint
CREATE TABLE "media_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"variant" text NOT NULL,
	"storage_bucket" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_variants_asset_variant_unique" UNIQUE("asset_id","variant"),
	CONSTRAINT "media_variants_storage_bucket_storage_key_unique" UNIQUE("storage_bucket","storage_key"),
	CONSTRAINT "media_variants_variant_check" CHECK ("media_variants"."variant" in ('original', 'preview', 'card', 'cover')),
	CONSTRAINT "media_variants_mime_type_check" CHECK ("media_variants"."mime_type" in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
	CONSTRAINT "media_variants_width_check" CHECK ("media_variants"."width" > 0),
	CONSTRAINT "media_variants_height_check" CHECK ("media_variants"."height" > 0),
	CONSTRAINT "media_variants_size_bytes_check" CHECK ("media_variants"."size_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_variants" ADD CONSTRAINT "media_variants_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_assets_owner_purpose_status_created_idx" ON "media_assets" USING btree ("owner_user_id","purpose","status","created_at");--> statement-breakpoint
CREATE INDEX "media_assets_owner_created_id_idx" ON "media_assets" USING btree ("owner_user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "media_variants_asset_id_idx" ON "media_variants" USING btree ("asset_id");