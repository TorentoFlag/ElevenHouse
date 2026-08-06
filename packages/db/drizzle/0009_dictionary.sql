CREATE TABLE "dictionary_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dictionary_platform_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"code" text NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dictionary_platform_entries_category_code_locale_unique" UNIQUE("category_id","code","locale"),
	CONSTRAINT "dictionary_platform_entries_identity_category_code_locale_unique" UNIQUE("id","category_id","code","locale"),
	CONSTRAINT "dictionary_platform_entries_locale_check" CHECK ("dictionary_platform_entries"."locale" in ('ru', 'en')),
	CONSTRAINT "dictionary_platform_entries_status_check" CHECK ("dictionary_platform_entries"."status" in ('published', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "dictionary_astrologer_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"platform_entry_id" uuid,
	"category_id" uuid NOT NULL,
	"code" text NOT NULL,
	"locale" text NOT NULL,
	"entry_type" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dictionary_astrologer_entries_locale_check" CHECK ("dictionary_astrologer_entries"."locale" in ('ru', 'en')),
	CONSTRAINT "dictionary_astrologer_entries_entry_type_check" CHECK ("dictionary_astrologer_entries"."entry_type" in ('override', 'custom')),
	CONSTRAINT "dictionary_astrologer_entries_override_platform_check" CHECK ("dictionary_astrologer_entries"."entry_type" <> 'override' or "dictionary_astrologer_entries"."platform_entry_id" is not null),
	CONSTRAINT "dictionary_astrologer_entries_custom_platform_check" CHECK ("dictionary_astrologer_entries"."entry_type" <> 'custom' or "dictionary_astrologer_entries"."platform_entry_id" is null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "dictionary_categories_code_unique" ON "dictionary_categories" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "dictionary_astrologer_entries_override_unique" ON "dictionary_astrologer_entries" USING btree ("owner_user_id","platform_entry_id","locale") WHERE "dictionary_astrologer_entries"."entry_type" = 'override';--> statement-breakpoint
CREATE UNIQUE INDEX "dictionary_astrologer_entries_custom_code_unique" ON "dictionary_astrologer_entries" USING btree ("owner_user_id","category_id","code","locale") WHERE "dictionary_astrologer_entries"."entry_type" = 'custom';--> statement-breakpoint
ALTER TABLE "dictionary_platform_entries" ADD CONSTRAINT "dictionary_platform_entries_category_id_dictionary_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."dictionary_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_astrologer_entries" ADD CONSTRAINT "dictionary_astrologer_entries_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_astrologer_entries" ADD CONSTRAINT "dictionary_astrologer_entries_category_id_dictionary_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."dictionary_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_astrologer_entries" ADD CONSTRAINT "dictionary_astrologer_entries_platform_entry_identity_fk" FOREIGN KEY ("platform_entry_id","category_id","code","locale") REFERENCES "public"."dictionary_platform_entries"("id","category_id","code","locale") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dictionary_platform_entries_locale_status_category_index" ON "dictionary_platform_entries" USING btree ("locale","status","category_id");--> statement-breakpoint
CREATE INDEX "dictionary_astrologer_entries_custom_owner_locale_category_index" ON "dictionary_astrologer_entries" USING btree ("owner_user_id","locale","category_id") WHERE "dictionary_astrologer_entries"."entry_type" = 'custom';--> statement-breakpoint
CREATE INDEX "dictionary_astrologer_entries_platform_entry_id_index" ON "dictionary_astrologer_entries" USING btree ("platform_entry_id");