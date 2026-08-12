import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  astroDiaryProductIntegrityConstraintName,
  astroDiaryProductIntegritySql,
  astroDiaryProductIntegrityTriggerTables,
  productAccessGrants,
  productDeliveryFormats
} from "./index";

describe("AstroDiary product database integrity", () => {
  it("makes product child ordering deterministic per product revision", () => {
    expect(getTableConfig(productAccessGrants).indexes.map((index) => index.config.name)).toContain(
      "product_access_grants_product_order_unique"
    );
    expect(
      getTableConfig(productDeliveryFormats).indexes.map((index) => index.config.name)
    ).toContain("product_delivery_formats_product_order_unique");
  });

  it("pins the trigger function search path to trusted schemas", () => {
    expect(normalizeSql(astroDiaryProductIntegritySql)).toContain(
      "returns trigger language plpgsql set search_path = pg_catalog, public as"
    );
  });

  it("serializes raw child validation with the parent product mutation", () => {
    const sql = normalizeSql(astroDiaryProductIntegritySql);
    expect(sql).toContain(
      "from products where id = checked_product_id for no key update"
    );
    expect(sql).toContain("new.revision <> old.revision + 1");
    expect(sql).toContain("product_row_transaction_id is distinct from pg_current_xact_id()::text");
    expect(sql).toContain("product child mutation requires a parent revision bump");
  });

  it("defers final cross-table validation for the parent and every authoritative child table", () => {
    expect(astroDiaryProductIntegrityConstraintName).toBe("astro_diary_product_integrity");
    expect(astroDiaryProductIntegrityTriggerTables).toEqual([
      "products",
      "product_access_grants",
      "product_delivery_formats",
      "product_required_client_data",
      "product_methods",
      "product_modifiers"
    ]);

    for (const table of astroDiaryProductIntegrityTriggerTables) {
      expect(normalizeSql(astroDiaryProductIntegritySql)).toContain(
        normalizeSql(`CREATE CONSTRAINT TRIGGER "astro_diary_product_integrity"
          AFTER INSERT OR UPDATE OR DELETE ON "${table}"
          DEFERRABLE INITIALLY DEFERRED
          FOR EACH ROW
          EXECUTE FUNCTION elevenhouse_assert_astro_diary_product_integrity()`)
      );
    }
  });

  it("rejects journal/config disagreement with stable PostgreSQL diagnostics", () => {
    const sql = normalizeSql(astroDiaryProductIntegritySql);

    expect(sql).toContain("num_nonnulls(");
    expect(sql).toContain("count(*) filter (where grant_value = 'journal')");
    expect(sql).toContain(
      "count(*) filter (where grant_value = 'journal' and grant_order = 0)"
    );
    expect(sql).toContain("journal_grant_count <> 0 and (");
    expect(sql).toContain("access_grant_count <> 1");
    expect(sql).toContain("canonical_journal_grant_count <> journal_grant_count");
    expect(sql).toContain("config_present is distinct from journal_is_sole_grant");
    expect(sql).toContain("errcode = '23514'");
    expect(sql).toContain("constraint = 'astro_diary_product_integrity'");
  });

  it("enforces the exact journal parent and child shape at transaction commit", () => {
    const sql = normalizeSql(astroDiaryProductIntegritySql);

    expect(sql).toContain("product_row.type is distinct from 'sub'");
    expect(sql).toContain("product_row.payment_model is distinct from 'sub'");
    expect(sql).toContain("product_row.execution_mode is distinct from 'async'");
    expect(sql).toContain("product_row.participant_mode is distinct from 'solo'");
    expect(sql).toContain("product_row.price_minor <= 0");
    for (const legacyField of [
      "duration_minutes",
      "duration_label",
      "sla_label",
      "package_session_count",
      "package_discount_percent",
      "trial_days",
      "group_size"
    ]) {
      expect(sql).toContain(`product_row.${legacyField} is not null`);
    }

    expect(sql).toContain("array_agg(delivery_format order by format_order)");
    expect(sql).toContain("array['chat', 'audio', 'file']::text[]");
    expect(sql).toContain("grant_value = 'journal' and grant_order = 0");
    expect(sql).toContain("exact_format.value = 'chat' and exact_format.\"order\" = 0");
    expect(sql).toContain("exact_format.value = 'audio' and exact_format.\"order\" = 1");
    expect(sql).toContain("exact_format.value = 'file' and exact_format.\"order\" = 2");
    expect(sql).toContain("required_client_data_count <> 0");
    expect(sql).toContain("method_count <> 0");
    expect(sql).toContain("modifier_count <> 0");
  });

  it("requires the configured service timezone to be a PostgreSQL IANA timezone", () => {
    const sql = normalizeSql(astroDiaryProductIntegritySql);

    expect(sql).toContain("from pg_catalog.pg_timezone_names");
    expect(sql).toContain("name = product_row.astro_diary_service_timezone");
    expect(sql).toContain("astrodiary service timezone is not a recognized iana timezone");
  });

  it("validates both sides of a moved child row and ignores a deleted cascade parent", () => {
    const sql = normalizeSql(astroDiaryProductIntegritySql);

    expect(sql).toContain("if tg_op <> 'delete'");
    expect(sql).toContain("if tg_op <> 'insert'");
    expect(sql).toContain("array[new_product_id, old_product_id]");
    expect(sql).toContain("array_agg(candidate_product_id order by candidate_product_id)");
    expect(sql).toContain("if not found then continue");
  });
});

function normalizeSql(value: string): string {
  return value.replaceAll(/\s+/gu, " ").trim().toLowerCase();
}
