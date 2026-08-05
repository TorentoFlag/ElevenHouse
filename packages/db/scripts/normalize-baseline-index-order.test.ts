import { describe, expect, it } from "vitest";

import { normalizeBaselineIndexOrder } from "./normalize-baseline-index-order";

describe("baseline unique-index ordering", () => {
  it("places standalone unique indexes before foreign keys and is idempotent", () => {
    const source = [
      'CREATE TABLE "parents" ("id" text NOT NULL, "scope" text NOT NULL);',
      'ALTER TABLE "children" ADD CONSTRAINT "children_parent_fk" FOREIGN KEY ("parent_id", "scope") REFERENCES "parents"("id", "scope");',
      'CREATE UNIQUE INDEX "parents_exact_unique" ON "parents" USING btree ("id", "scope");',
      'CREATE INDEX "children_parent_idx" ON "children" USING btree ("parent_id");'
    ].join("--> statement-breakpoint");

    const normalized = normalizeBaselineIndexOrder(source);
    expect(normalized.indexOf("CREATE UNIQUE INDEX")).toBeLessThan(normalized.indexOf("ALTER TABLE"));
    expect(normalized.indexOf("CREATE INDEX \"children_parent_idx\"")).toBeGreaterThan(
      normalized.indexOf("ALTER TABLE")
    );
    expect(normalizeBaselineIndexOrder(normalized)).toBe(normalized);
  });

  it("does not move a unique index before a table that was appended during baseline consolidation", () => {
    const source = [
      'CREATE TABLE "users" ("id" uuid PRIMARY KEY);',
      'ALTER TABLE "orders" ADD CONSTRAINT "orders_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id");',
      'CREATE TABLE "finance_saved_card_setup_customer_actions" ("id" uuid PRIMARY KEY);',
      'CREATE UNIQUE INDEX "finance_saved_card_setup_customer_actions_operation_version_unique" ON "finance_saved_card_setup_customer_actions" USING btree ("id");'
    ].join("--> statement-breakpoint");

    const normalized = normalizeBaselineIndexOrder(source);
    const table = normalized.indexOf('CREATE TABLE "finance_saved_card_setup_customer_actions"');
    const index = normalized.indexOf(
      'CREATE UNIQUE INDEX "finance_saved_card_setup_customer_actions_operation_version_unique"'
    );
    const foreignKey = normalized.indexOf('ALTER TABLE "orders"');

    expect(table).toBeLessThan(index);
    expect(index).toBeLessThan(foreignKey);
  });

  it("keeps an index after columns added by a consolidated delta and before its foreign key", () => {
    const source = [
      'CREATE TABLE "flow_runs" ("id" uuid PRIMARY KEY, "flow_id" uuid NOT NULL);',
      'CREATE UNIQUE INDEX "flow_runs_epoch_unique" ON "flow_runs" USING btree ("activation_epoch_id", "flow_id") WHERE "flow_runs"."activation_epoch_id" is not null;',
      'ALTER TABLE "flow_runs" ADD COLUMN "activation_epoch_id" uuid;',
      'ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_epoch_fk" FOREIGN KEY ("activation_epoch_id") REFERENCES "flow_activation_epochs"("id");'
    ].join("--> statement-breakpoint");

    const normalized = normalizeBaselineIndexOrder(source);
    const addedColumn = normalized.indexOf('ADD COLUMN "activation_epoch_id"');
    const index = normalized.indexOf('CREATE UNIQUE INDEX "flow_runs_epoch_unique"');
    const foreignKey = normalized.indexOf('ADD CONSTRAINT "flow_runs_epoch_fk"');

    expect(addedColumn).toBeLessThan(index);
    expect(index).toBeLessThan(foreignKey);
    expect(normalizeBaselineIndexOrder(normalized)).toBe(normalized);
  });

  it("places an added composite unique constraint before foreign keys that reference it", () => {
    const source = [
      'CREATE TABLE "flow_runtime_commands" ("id" uuid PRIMARY KEY, "owner_user_id" uuid NOT NULL);',
      'CREATE TABLE "flow_run_events" ("command_id" uuid, "flow_run_id" uuid NOT NULL, "owner_user_id" uuid NOT NULL);',
      'ALTER TABLE "flow_runtime_commands" ADD COLUMN "flow_run_id" uuid;',
      'ALTER TABLE "flow_run_events" ADD CONSTRAINT "flow_run_events_command_run_owner_fk" FOREIGN KEY ("command_id", "flow_run_id", "owner_user_id") REFERENCES "flow_runtime_commands"("id", "flow_run_id", "owner_user_id");',
      'ALTER TABLE "flow_runtime_commands" ADD CONSTRAINT "flow_runtime_commands_id_run_owner_unique" UNIQUE("id", "flow_run_id", "owner_user_id");'
    ].join("--> statement-breakpoint");

    const normalized = normalizeBaselineIndexOrder(source);
    const addedColumn = normalized.indexOf('ADD COLUMN "flow_run_id"');
    const uniqueConstraint = normalized.indexOf(
      'ADD CONSTRAINT "flow_runtime_commands_id_run_owner_unique"'
    );
    const foreignKey = normalized.indexOf(
      'ADD CONSTRAINT "flow_run_events_command_run_owner_fk"'
    );

    expect(addedColumn).toBeLessThan(uniqueConstraint);
    expect(uniqueConstraint).toBeLessThan(foreignKey);
    expect(normalizeBaselineIndexOrder(normalized)).toBe(normalized);
  });

  it("preserves a recreated unique index after its explicit drop", () => {
    const source = [
      'CREATE TABLE "receipts" ("provider_result_id" uuid);',
      'CREATE UNIQUE INDEX "receipts_provider_result_unique" ON "receipts" USING btree ("provider_result_id");',
      'ALTER TABLE "children" ADD CONSTRAINT "children_receipt_fk" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("provider_result_id");',
      'DROP INDEX "receipts_provider_result_unique";',
      'CREATE UNIQUE INDEX "receipts_provider_result_unique" ON "receipts" USING btree ("provider_result_id") WHERE "receipts"."provider_result_id" is not null;'
    ].join("--> statement-breakpoint");

    const normalized = normalizeBaselineIndexOrder(source);
    const drop = normalized.indexOf('DROP INDEX "receipts_provider_result_unique"');
    const finalCreate = normalized.lastIndexOf('CREATE UNIQUE INDEX "receipts_provider_result_unique"');

    expect(drop).toBeLessThan(finalCreate);
    expect(normalizeBaselineIndexOrder(normalized)).toBe(normalized);
  });
});
