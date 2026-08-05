import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { financeArtifacts } from "./finance-artifacts.schema";
import { financeRevisionString, formatFinanceSqlValues } from "./finance-values";
import { financeProviderOperationIntents } from "./provider-operations.schema";
import { financeSavedCardSetupSessions } from "./saved-card-setup-sessions.schema";

const customerActionTypeValues = ["three_ds_method", "three_ds_challenge"] as const;
const customerActionPhaseValues = ["method", "challenge"] as const;
const customerActionStatusValues = ["pending", "superseded", "completed", "expired"] as const;

/**
 * An authenticated browser handoff is an auditable state, not a provider success. Exact 3DS
 * fields live only in `provider_response` storage; this row is intentionally safe to query.
 */
export const financeSavedCardSetupCustomerActions = pgTable(
  "finance_saved_card_setup_customer_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    setupSessionId: uuid("setup_session_id").notNull(),
    setupSessionVersion: financeRevisionString("setup_session_version").notNull(),
    providerOperationIntentId: varchar("provider_operation_intent_id", { length: 160 }).notNull(),
    providerOperationIntentVersion: financeRevisionString("provider_operation_intent_version").notNull(),
    providerResponseArtifactId: varchar("provider_response_artifact_id", { length: 160 }).notNull(),
    providerResponseArtifactDigest: varchar("provider_response_artifact_digest", { length: 71 }).notNull(),
    actionType: text("action_type").notNull(),
    phase: text("phase").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true })
  },
  (table) => [
    foreignKey({
      columns: [table.setupSessionId],
      foreignColumns: [financeSavedCardSetupSessions.id],
      name: "finance_saved_card_setup_customer_actions_session_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.providerOperationIntentId],
      foreignColumns: [financeProviderOperationIntents.id],
      name: "finance_saved_card_setup_customer_actions_operation_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.providerResponseArtifactId],
      foreignColumns: [financeArtifacts.id],
      name: "finance_saved_card_setup_customer_actions_artifact_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_saved_card_setup_customer_actions_operation_version_unique").on(
      table.providerOperationIntentId,
      table.providerOperationIntentVersion
    ),
    uniqueIndex("finance_saved_card_setup_customer_actions_one_pending_session_unique")
      .on(table.setupSessionId)
      .where(sql`${table.status} = 'pending'`),
    index("finance_saved_card_setup_customer_actions_session_status_idx").on(
      table.setupSessionId,
      table.status,
      table.createdAt,
      table.id
    ),
    check(
      "finance_saved_card_setup_customer_actions_shape_check",
      sql`${table.setupSessionVersion} >= 1
        and ${table.providerOperationIntentVersion} >= 1
        and ${table.providerResponseArtifactDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.actionType} in ${sql.raw(formatFinanceSqlValues(customerActionTypeValues))}
        and ${table.phase} in ${sql.raw(formatFinanceSqlValues(customerActionPhaseValues))}
        and ((${table.actionType} = 'three_ds_method' and ${table.phase} = 'method')
             or (${table.actionType} = 'three_ds_challenge' and ${table.phase} = 'challenge'))
        and ${table.status} in ${sql.raw(formatFinanceSqlValues(customerActionStatusValues))}
        and ((${table.status} = 'pending' and ${table.resolvedAt} is null)
             or (${table.status} in ('superseded', 'completed', 'expired') and ${table.resolvedAt} is not null and ${table.resolvedAt} >= ${table.createdAt}))`
    )
  ]
);

export const financeSavedCardSetupCustomerActionIntegritySql = `
create or replace function finance_validate_saved_card_setup_customer_action()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  setup_session finance_saved_card_setup_sessions%rowtype;
  provider_operation finance_provider_operation_intents%rowtype;
  response_artifact finance_artifacts%rowtype;
begin
  if tg_op = 'DELETE' then
    raise exception 'saved-card customer actions cannot be deleted' using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' then
    if new.id <> old.id
       or new.setup_session_id <> old.setup_session_id
       or new.setup_session_version <> old.setup_session_version
       or new.provider_operation_intent_id <> old.provider_operation_intent_id
       or new.provider_operation_intent_version <> old.provider_operation_intent_version
       or new.provider_response_artifact_id <> old.provider_response_artifact_id
       or new.provider_response_artifact_digest <> old.provider_response_artifact_digest
       or new.action_type <> old.action_type
       or new.phase <> old.phase
       or new.created_at <> old.created_at then
      raise exception 'saved-card customer action identity is immutable' using errcode = '55000';
    end if;
    if not (old.status = 'pending' and new.status in ('superseded', 'completed', 'expired')) then
      raise exception 'saved-card customer action transition is invalid' using errcode = '23514';
    end if;
    return new;
  end if;

  select * into strict setup_session from finance_saved_card_setup_sessions
    where id = new.setup_session_id;
  select * into strict provider_operation from finance_provider_operation_intents
    where id = new.provider_operation_intent_id;
  select * into strict response_artifact from finance_artifacts
    where id = new.provider_response_artifact_id;
  if setup_session.state <> 'requires_customer_action'
     or setup_session.version <> new.setup_session_version
     or provider_operation.status <> 'requires_customer_action'
     or provider_operation.version <> new.provider_operation_intent_version
     or not ((provider_operation.operation_kind = 'card_setup_execute' and provider_operation.dispatch_step = 'execute')
             or (provider_operation.operation_kind = 'card_setup_3ds_method_complete' and provider_operation.dispatch_step = 'complete_3ds_method'))
     or provider_operation.purpose <> 'platform_card_setup'
     or provider_operation.source_id <> new.setup_session_id::text
     or provider_operation.economic_payment_intent_id is distinct from setup_session.economic_payment_intent_id
     or provider_operation.series_id <> setup_session.series_id
     or provider_operation.provider_account_id <> setup_session.provider_account_id
     or provider_operation.provider_identity_version <> setup_session.provider_identity_version
     or response_artifact.artifact_class <> 'provider_response'
     or response_artifact.binding_kind <> 'provider'
     or response_artifact.sha256_digest <> new.provider_response_artifact_digest
     or response_artifact.series_id <> setup_session.series_id
     or response_artifact.provider_account_id <> setup_session.provider_account_id
     or response_artifact.provider_identity_version <> setup_session.provider_identity_version then
    raise exception 'saved-card customer action is cross-wired' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_validate_saved_card_setup_customer_action
after insert or update or delete on finance_saved_card_setup_customer_actions
deferrable initially deferred
for each row execute function finance_validate_saved_card_setup_customer_action();

create or replace function finance_reject_saved_card_setup_customer_actions_truncate()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'saved-card customer actions cannot be truncated' using errcode = '55000';
end;
$$;

create trigger finance_saved_card_setup_customer_actions_no_truncate
before truncate on finance_saved_card_setup_customer_actions
for each statement execute function finance_reject_saved_card_setup_customer_actions_truncate();
`;
