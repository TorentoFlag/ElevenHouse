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
  databasePlatformRoleValues,
  dictionaryAstrologerEntries,
  dictionaryAstrologerEntryTypeValues,
  dictionaryCategories,
  dictionaryLocaleValues,
  dictionaryPlatformEntries,
  dictionaryPlatformEntryStatusValues,
  identityProviderValues,
  outboxEvents,
  outboxEventStatusValues,
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
  userStatusValues
} from "./schema/index";

const currentBaselineMigration = "packages/db/drizzle/0000_dusty_bloodstorm.sql";

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
      'CREATE INDEX "products_owner_status_idx" ON "products" USING btree ("owner_user_id","status")'
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
  return (
    migration.match(new RegExp(`CREATE TABLE "${tableName}" \\([\\s\\S]*?\\n\\);`))?.[0] ?? ""
  );
}
