import { readFileSync } from "node:fs";
import { platformRoles } from "@elevenhouse/auth";
import { describe, expect, it } from "vitest";
import {
  authChallengeDeliveries,
  authChallengeDeliveryAttempts,
  authChallengeDeliveryAttemptStatusValues,
  authChallengeDeliveryStatusValues,
  authChallenges,
  authChallengeStatusValues,
  authSecurityEventTypeValues,
  authSessionStatusValues,
  astrologerProfiles,
  databasePlatformRoleValues,
  dictionaryAstrologerEntries,
  dictionaryAstrologerEntryTypeValues,
  dictionaryCategories,
  dictionaryLocaleValues,
  dictionaryPlatformEntries,
  dictionaryPlatformEntryStatusValues,
  identityProviderValues,
  mediaAssets,
  mediaImageMimeTypeValues,
  mediaMimeTypeValues,
  mediaPurposeValues,
  mediaStatusValues,
  mediaVariants,
  mediaVariantValues,
  mediaVisibilityValues,
  outboxEvents,
  outboxEventStatusValues,
  billingInvoices,
  billingInvoiceStatusValues,
  billingPaymentMethods,
  platformBillingProviderValues,
  platformPlanFeatures,
  platformPlanFeatureValues,
  platformPlans,
  platformSubscriptions,
  platformSubscriptionStatusValues,
  productAccessGrants,
  productAccessGrantValues,
  productCurrencyValues,
  productDeliveryFormats,
  productDeliveryFormatValues,
  productExecutionModeValues,
  productIncludedItems,
  productMethods,
  productMethodValues,
  productModifiers,
  productModifierKindValues,
  productParticipantModeValues,
  productPaymentModelValues,
  productRequiredClientData,
  productRequiredClientDataValues,
  products,
  productStatusValues,
  productSubscriptionPeriodValues,
  productTypeValues,
  userProfiles,
  userStatusValues,
  verificationApplications,
  verificationApplicationDocuments,
  verificationApplicationStatusValues,
  verificationDocumentKindValues
} from "./schema/index";

const currentBaselineMigration = "packages/db/drizzle/0000_dazzling_metal_master.sql";

describe("database account schema constants", () => {
  it("keeps database role checks aligned with the application role model", () => {
    expect(databasePlatformRoleValues).toEqual(platformRoles);
  });

  it("allows the launch identity providers", () => {
    expect(identityProviderValues).toEqual(["email", "phone", "telegram", "google", "apple"]);
  });

  it("keeps account statuses explicit", () => {
    expect(userStatusValues).toEqual(["active", "suspended", "deleted"]);
  });

  it("keeps auth session statuses explicit", () => {
    expect(authSessionStatusValues).toEqual(["active", "revoked"]);
  });

  it("keeps auth challenge statuses explicit", () => {
    expect(authChallengeStatusValues).toEqual(["pending", "consumed", "cancelled"]);
  });

  it("keeps auth challenge delivery statuses explicit", () => {
    expect(authChallengeDeliveryStatusValues).toEqual(["queued", "sent", "failed"]);
  });

  it("keeps auth challenge delivery attempt statuses explicit", () => {
    expect(authChallengeDeliveryAttemptStatusValues).toEqual(["sent", "failed"]);
  });

  it("exports passwordless auth challenge tables", () => {
    expect(authChallenges).toBeDefined();
    expect(authChallengeDeliveries).toBeDefined();
    expect(authChallengeDeliveryAttempts).toBeDefined();
  });

  it("exports user profile table for self-declared display names", () => {
    expect(userProfiles).toBeDefined();
  });

  it("keeps outbox event statuses explicit", () => {
    expect(outboxEventStatusValues).toEqual(["pending", "publishing", "published"]);
    expect(outboxEvents).toBeDefined();
  });

  it("exports verification tables and explicit values", () => {
    expect(verificationApplicationStatusValues).toEqual([
      "pending",
      "approved",
      "rejected",
      "revoked"
    ]);
    expect(verificationDocumentKindValues).toEqual(["identity", "qualification"]);
    expect(mediaPurposeValues).toContain("verification_identity_document");
    expect(mediaPurposeValues).toContain("verification_qualification_document");
    expect(mediaMimeTypeValues).toContain("application/pdf");
    expect(verificationApplications).toBeDefined();
    expect(verificationApplicationDocuments).toBeDefined();
  });

  it("keeps verification tables in the current baseline migration", () => {
    const migration = readFileSync(currentBaselineMigration, "utf8");

    expect(migration).toContain('CREATE TABLE "verification_applications"');
    expect(migration).toContain('CREATE TABLE "verification_application_documents"');
    expect(migration).toContain(
      'CONSTRAINT "verification_applications_status_check" CHECK ("verification_applications"."status" in (\'pending\', \'approved\', \'rejected\', \'revoked\'))'
    );
    expect(migration).toContain(
      'CONSTRAINT "verification_application_documents_kind_check" CHECK ("verification_application_documents"."kind" in (\'identity\', \'qualification\'))'
    );
    expect(migration).toContain(
      'CREATE INDEX "verification_applications_owner_submitted_idx" ON "verification_applications" USING btree ("owner_user_id","submitted_at","id")'
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "verification_application_documents_application_media_unique" ON "verification_application_documents" USING btree ("application_id","media_id")'
    );
    expect(migration).toContain(
      'ALTER TABLE "verification_applications" ADD CONSTRAINT "verification_applications_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action'
    );
    expect(migration).toContain(
      'ALTER TABLE "verification_application_documents" ADD CONSTRAINT "verification_application_documents_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action'
    );
  });

  it("exports dictionary tables and explicit values", () => {
    expect(dictionaryLocaleValues).toEqual(["ru", "en"]);
    expect(dictionaryPlatformEntryStatusValues).toEqual(["published", "archived"]);
    expect(dictionaryAstrologerEntryTypeValues).toEqual(["override", "custom"]);
    expect(dictionaryCategories).toBeDefined();
    expect(dictionaryPlatformEntries).toBeDefined();
    expect(dictionaryAstrologerEntries).toBeDefined();
  });

  it("keeps dictionary tables in the current baseline migration", () => {
    const migration = readFileSync(currentBaselineMigration, "utf8");
    const dictionaryAstrologerEntriesTable = getCreateTableStatement(
      migration,
      "dictionary_astrologer_entries"
    );

    expect(migration).toContain('CREATE TABLE "dictionary_categories"');
    expect(migration).toContain('"code" text NOT NULL');
    expect(migration).toContain('"name" text NOT NULL');
    expect(migration).toContain('"order" integer NOT NULL');
    expect(migration).toContain('CREATE TABLE "dictionary_platform_entries"');
    expect(migration).toContain('CREATE TABLE "dictionary_astrologer_entries"');
    expect(migration).toContain('"entry_type" text NOT NULL');
    expect(migration).toContain('"content" text NOT NULL');
    expect(dictionaryAstrologerEntriesTable).not.toContain('"status" text');
    expect(dictionaryAstrologerEntriesTable).not.toContain('"deleted_at"');
    expect(migration).not.toContain('"body" text NOT NULL');
    expect(migration).not.toContain('CONSTRAINT "dictionary_astrologer_entries_status_check"');
    expect(migration).not.toContain('CONSTRAINT "dictionary_astrologer_entries_deleted_at_check"');
    expect(migration).not.toContain('CONSTRAINT "dictionary_platform_entries_version_check"');
    expect(migration).not.toContain('CONSTRAINT "dictionary_astrologer_entries_version_check"');
    expect(migration).toContain(
      'CONSTRAINT "dictionary_platform_entries_category_code_locale_unique" UNIQUE("category_id","code","locale")'
    );
    expect(migration).toContain(
      'CONSTRAINT "dictionary_platform_entries_identity_category_code_locale_unique" UNIQUE("id","category_id","code","locale")'
    );
    expect(migration).toContain(
      'ALTER TABLE "dictionary_astrologer_entries" ADD CONSTRAINT "dictionary_astrologer_entries_platform_entry_identity_fk" FOREIGN KEY ("platform_entry_id","category_id","code","locale") REFERENCES "public"."dictionary_platform_entries"("id","category_id","code","locale") ON DELETE restrict ON UPDATE no action'
    );
    expect(migration).toContain(
      'CREATE INDEX "dictionary_platform_entries_locale_status_category_index" ON "dictionary_platform_entries" USING btree ("locale","status","category_id")'
    );
    expect(migration).toContain(
      'CREATE INDEX "dictionary_astrologer_entries_custom_owner_locale_category_index" ON "dictionary_astrologer_entries" USING btree ("owner_user_id","locale","category_id") WHERE "dictionary_astrologer_entries"."entry_type" = \'custom\''
    );
    expect(migration).toContain(
      'CREATE INDEX "dictionary_astrologer_entries_platform_entry_id_index" ON "dictionary_astrologer_entries" USING btree ("platform_entry_id")'
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "dictionary_astrologer_entries_override_unique" ON "dictionary_astrologer_entries" USING btree ("owner_user_id","platform_entry_id","locale") WHERE "dictionary_astrologer_entries"."entry_type" = \'override\''
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "dictionary_astrologer_entries_custom_code_unique" ON "dictionary_astrologer_entries" USING btree ("owner_user_id","category_id","code","locale") WHERE "dictionary_astrologer_entries"."entry_type" = \'custom\''
    );
  });

  it("exports product tables and explicit values", () => {
    expect(productStatusValues).toEqual(["draft", "active", "archived"]);
    expect(productTypeValues).toEqual([
      "single",
      "pack",
      "async",
      "sub",
      "mini",
      "course",
      "custom"
    ]);
    expect(productDeliveryFormatValues).toEqual([
      "video",
      "audio",
      "chat",
      "text",
      "file",
      "channel"
    ]);
    expect(productExecutionModeValues).toEqual(["live", "async", "instant"]);
    expect(productPaymentModelValues).toEqual(["once", "pack", "sub", "free"]);
    expect(productCurrencyValues).toEqual(["RUB"]);
    expect(productSubscriptionPeriodValues).toEqual(["week", "month", "year"]);
    expect(productParticipantModeValues).toEqual(["solo", "group", "gift"]);
    expect(productRequiredClientDataValues).toEqual([
      "chart1",
      "cities",
      "chart2",
      "question",
      "event"
    ]);
    expect(productMethodValues).toEqual([
      "natal",
      "forecast",
      "synastry",
      "child",
      "numerology",
      "matrix",
      "humandesign"
    ]);
    expect(productAccessGrantValues).toEqual([
      "content",
      "channel",
      "records",
      "course",
      "community",
      "journal"
    ]);
    expect(productModifierKindValues).toEqual(["fixed", "percent", "free"]);
    expect(products).toBeDefined();
    expect(productDeliveryFormats).toBeDefined();
    expect(productRequiredClientData).toBeDefined();
    expect(productMethods).toBeDefined();
    expect(productAccessGrants).toBeDefined();
    expect(productIncludedItems).toBeDefined();
    expect(productModifiers).toBeDefined();
  });

  it("keeps product tables in the current baseline migration", () => {
    const migration = readFileSync(currentBaselineMigration, "utf8");

    expect(migration).toContain('CREATE TABLE "products"');
    expect(migration).toContain('"owner_user_id" uuid NOT NULL');
    expect(migration).toContain('"price_minor" integer NOT NULL');
    expect(migration).toContain('CREATE TABLE "product_delivery_formats"');
    expect(migration).toContain('CREATE TABLE "product_required_client_data"');
    expect(migration).toContain('CREATE TABLE "product_methods"');
    expect(migration).toContain('CREATE TABLE "product_access_grants"');
    expect(migration).toContain('CREATE TABLE "product_included_items"');
    expect(migration).toContain('CREATE TABLE "product_modifiers"');
    expect(migration).toContain('CONSTRAINT "products_free_price_check"');
    expect(migration).toContain('CONSTRAINT "products_package_settings_check"');
    expect(migration).toContain('CONSTRAINT "products_subscription_settings_check"');
    expect(migration).toContain('CONSTRAINT "products_group_settings_check"');
    expect(migration).toContain('CONSTRAINT "product_modifiers_free_price_check"');
    expect(migration).toContain(
      'CREATE INDEX "products_owner_created_id_idx" ON "products" USING btree ("owner_user_id","created_at","id")'
    );
    expect(migration).toContain(
      'CREATE INDEX "products_owner_status_created_id_idx" ON "products" USING btree ("owner_user_id","status","created_at","id")'
    );
    expect(migration).toContain(
      'ALTER TABLE "products" ADD CONSTRAINT "products_cover_media_id_media_assets_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action'
    );
  });

  it("exports platform billing tables and explicit values", () => {
    expect(platformPlanFeatureValues).toContain("products");
    expect(platformPlanFeatureValues).toContain("analytics");
    expect(platformBillingProviderValues).toEqual(["arc_pay"]);
    expect(platformSubscriptionStatusValues).toEqual([
      "active",
      "past_due",
      "canceled",
      "incomplete"
    ]);
    expect(billingInvoiceStatusValues).toEqual(["paid", "open", "void", "uncollectible"]);
    expect(platformPlans).toBeDefined();
    expect(platformPlanFeatures).toBeDefined();
    expect(platformSubscriptions).toBeDefined();
    expect(billingPaymentMethods).toBeDefined();
    expect(billingInvoices).toBeDefined();
  });

  it("keeps platform billing tables in the current baseline migration", () => {
    const migration = readFileSync(currentBaselineMigration, "utf8");

    expect(migration).toContain('CREATE TABLE "platform_plans"');
    expect(migration).toContain('"monthly_price_minor" integer NOT NULL');
    expect(migration).toContain('"platform_fee_bps" integer NOT NULL');
    expect(migration).toContain('CREATE TABLE "platform_plan_features"');
    expect(migration).toContain('CREATE TABLE "platform_subscriptions"');
    expect(migration).toContain('CREATE TABLE "billing_payment_methods"');
    expect(migration).toContain('CREATE TABLE "billing_invoices"');
    expect(migration).toContain('CONSTRAINT "platform_plans_platform_fee_bps_check"');
    expect(migration).toContain('CONSTRAINT "platform_subscriptions_status_check"');
    expect(migration).toContain('CONSTRAINT "billing_payment_methods_last4_check"');
    expect(migration).toContain('CONSTRAINT "billing_invoices_amount_minor_check"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "platform_subscriptions_current_owner_unique" ON "platform_subscriptions" USING btree ("owner_user_id") WHERE "platform_subscriptions"."is_current" = true'
    );
  });

  it("exports media tables and explicit values", () => {
    expect(mediaPurposeValues).toEqual([
      "product_cover",
      "profile_avatar",
      "profile_cover",
      "verification_identity_document",
      "verification_qualification_document"
    ]);
    expect(mediaStatusValues).toEqual(["uploading", "processing", "ready", "failed", "deleted"]);
    expect(mediaVisibilityValues).toEqual(["public", "private"]);
    expect(mediaImageMimeTypeValues).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/avif"
    ]);
    expect(mediaMimeTypeValues).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/avif",
      "application/pdf"
    ]);
    expect(mediaVariantValues).toEqual(["original", "preview", "card", "cover"]);
    expect(mediaAssets).toBeDefined();
    expect(mediaVariants).toBeDefined();
  });

  it("keeps media tables in the current baseline migration", () => {
    const migration = readFileSync(currentBaselineMigration, "utf8");

    expect(migration).toContain('CREATE TABLE "media_assets"');
    expect(migration).toContain('"owner_user_id" uuid NOT NULL');
    expect(migration).toContain('"storage_bucket" text NOT NULL');
    expect(migration).toContain('"storage_key" text NOT NULL');
    expect(migration).toContain('"checksum_sha256" text');
    expect(migration).toContain('CREATE TABLE "media_variants"');
    expect(migration).toContain('CONSTRAINT "media_assets_purpose_check"');
    expect(migration).toContain('CONSTRAINT "media_assets_status_check"');
    expect(migration).toContain('CONSTRAINT "media_assets_visibility_check"');
    expect(migration).toContain('CONSTRAINT "media_assets_mime_type_check"');
    expect(migration).toContain('CONSTRAINT "media_assets_size_bytes_check"');
    expect(migration).toContain('CONSTRAINT "media_assets_checksum_sha256_check"');
    expect(migration).toContain(
      'ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action'
    );
    expect(migration).toContain(
      'ALTER TABLE "media_variants" ADD CONSTRAINT "media_variants_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action'
    );
    expect(migration).toContain(
      'CONSTRAINT "media_assets_storage_bucket_storage_key_unique" UNIQUE("storage_bucket","storage_key")'
    );
    expect(migration).toContain(
      'CONSTRAINT "media_variants_asset_variant_unique" UNIQUE("asset_id","variant")'
    );
    expect(migration).toContain(
      'CREATE INDEX "media_assets_owner_purpose_status_created_idx" ON "media_assets" USING btree ("owner_user_id","purpose","status","created_at")'
    );
  });

  it("exports astrologer profile tables", () => {
    expect(astrologerProfiles).toBeDefined();
  });

  it("keeps astrologer profile tables in the current baseline migration", () => {
    const migration = readFileSync(currentBaselineMigration, "utf8");

    expect(migration).toContain('CREATE TABLE "astrologer_profiles"');
    expect(migration).toContain('"owner_user_id" uuid PRIMARY KEY NOT NULL');
    expect(migration).toContain('"public_handle" text NOT NULL');
    expect(migration).toContain('"avatar_media_id" uuid');
    expect(migration).toContain('"cover_media_id" uuid');
    expect(migration).toContain('"consultation_languages" jsonb NOT NULL');
    expect(migration).toContain("\"visibility_status\" text DEFAULT 'draft' NOT NULL");
    expect(migration).toContain('"professional_experience_years" integer');
    expect(migration).toContain("\"specializations\" jsonb DEFAULT '[]'::jsonb NOT NULL");
    expect(migration).toContain('"telegram_handle" text');
    expect(migration).toContain('"own_birth_date" text');
    expect(migration).toContain('"show_own_birth_data_public" boolean DEFAULT false NOT NULL');
    expect(migration).toContain(
      'CONSTRAINT "astrologer_profiles_public_handle_unique" UNIQUE("public_handle")'
    );
    expect(migration).toContain('CONSTRAINT "astrologer_profiles_public_handle_format_check"');
    expect(migration).toContain('CONSTRAINT "astrologer_profiles_visibility_status_check"');
    expect(migration).toContain('CONSTRAINT "astrologer_profiles_own_birth_date_check"');
    expect(migration).toContain("^[0-9]{4}-[0-9]{2}-[0-9]{2}$");
    expect(migration).toContain("^[0-9]{2}:[0-9]{2}$");
    expect(migration).toContain(
      'ALTER TABLE "astrologer_profiles" ADD CONSTRAINT "astrologer_profiles_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action'
    );
    expect(migration).toContain(
      'ALTER TABLE "astrologer_profiles" ADD CONSTRAINT "astrologer_profiles_avatar_media_id_media_assets_id_fk" FOREIGN KEY ("avatar_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action'
    );
    expect(migration).toContain(
      'ALTER TABLE "astrologer_profiles" ADD CONSTRAINT "astrologer_profiles_cover_media_id_media_assets_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action'
    );
    expect(migration).toContain(
      'CREATE INDEX "astrologer_profiles_public_handle_idx" ON "astrologer_profiles" USING btree ("public_handle")'
    );
  });

  it("keeps pending passwordless challenges unique per channel and identifier", () => {
    const migration = readFileSync(currentBaselineMigration, "utf8");

    expect(migration).toContain(
      'CREATE UNIQUE INDEX "auth_challenges_pending_identifier_unique" ON "auth_challenges" USING btree ("channel","identifier_normalized") WHERE "auth_challenges"."status" = \'pending\''
    );
  });

  it("keeps user profiles in the current identity migration", () => {
    const migration = readFileSync(currentBaselineMigration, "utf8");

    expect(migration).toContain('CREATE TABLE "user_profiles"');
    expect(migration).toContain('"display_name" text NOT NULL');
    expect(migration).toContain(
      'ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action'
    );
  });

  it("keeps auth security event types explicit", () => {
    expect(authSecurityEventTypeValues).toEqual([
      "registration_succeeded",
      "login_succeeded",
      "login_failed",
      "logout_succeeded",
      "session_revoked"
    ]);
  });
});

function getCreateTableStatement(migration: string, tableName: string): string {
  return migration.match(new RegExp(`CREATE TABLE "${tableName}" \\([\\s\\S]*?\\n\\);`))?.[0] ?? "";
}
