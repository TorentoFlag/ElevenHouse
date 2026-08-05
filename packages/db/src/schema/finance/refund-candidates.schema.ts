import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { users } from "../identity/accounts.schema";
import { orders } from "./orders.schema";
import { financeRefundCases } from "./refund-cases.schema";
import { financeRevisionString } from "./finance-values";

export const financeRefundCandidateStatusValues = [
  "submitted",
  "under_review",
  "rejected",
  "resolved"
] as const;

export const financeRefundCandidateReviewActionValues = [
  "claimed",
  "rejected",
  "refund_decision_recorded"
] as const;

/**
 * A client dispute is deliberately separate from a monetary refund case. It carries no amount
 * and never makes an ArcPay or ledger mutation; only a later administrative decision may create
 * the `finance_refund_cases` execution aggregate.
 */
export const financeRefundCandidates = pgTable(
  "finance_refund_candidates",
  {
    id: uuid("id").primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    clientUserId: uuid("client_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    statement: text("statement").notNull(),
    status: text("status").notNull().default("submitted"),
    version: financeRevisionString("version").notNull(),
    resolvedRefundCaseId: varchar("resolved_refund_case_id", { length: 160 }).references(
      () => financeRefundCases.id,
      { onDelete: "restrict" }
    ),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("finance_refund_candidates_one_open_order_unique")
      .on(table.orderId, table.clientUserId)
      .where(sql`${table.status} in ('submitted', 'under_review')`),
    check(
      "finance_refund_candidates_status_check",
      sql`${table.status} in ('submitted', 'under_review', 'rejected', 'resolved')`
    ),
    check(
      "finance_refund_candidates_statement_check",
      sql`length(trim(${table.statement})) between 1 and 2000
        and ${table.statement} = trim(${table.statement})
        and ${table.statement} !~ '[[:cntrl:]]'`
    ),
    check("finance_refund_candidates_version_check", sql`${table.version} >= 1`),
    check(
      "finance_refund_candidates_resolution_shape_check",
      sql`(${table.status} = 'resolved'
          and ${table.resolvedRefundCaseId} is not null
          and ${table.resolvedAt} is not null)
        or (${table.status} <> 'resolved'
          and ${table.resolvedRefundCaseId} is null
          and ${table.resolvedAt} is null)`
    ),
    check(
      "finance_refund_candidates_time_check",
      sql`${table.updatedAt} >= ${table.createdAt}
        and (${table.resolvedAt} is null or ${table.resolvedAt} >= ${table.submittedAt})`
    ),
    index("finance_refund_candidates_client_created_idx").on(
      table.clientUserId,
      table.createdAt,
      table.id
    ),
    index("finance_refund_candidates_status_updated_idx").on(table.status, table.updatedAt, table.id)
  ]
);

/** Append-only internal audit facts; candidate state is advanced with a matching expected version. */
export const financeRefundCandidateReviews = pgTable(
  "finance_refund_candidate_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => financeRefundCandidates.id, { onDelete: "restrict" }),
    candidateVersion: financeRevisionString("candidate_version").notNull(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    note: text("note").notNull(),
    refundCaseId: varchar("refund_case_id", { length: 160 }).references(
      () => financeRefundCases.id,
      { onDelete: "restrict" }
    ),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("finance_refund_candidate_reviews_candidate_version_unique").on(
      table.candidateId,
      table.candidateVersion
    ),
    check(
      "finance_refund_candidate_reviews_action_check",
      sql`${table.action} in ('claimed', 'rejected', 'refund_decision_recorded')`
    ),
    check(
      "finance_refund_candidate_reviews_note_check",
      sql`length(trim(${table.note})) between 1 and 2000
        and ${table.note} = trim(${table.note})
        and ${table.note} !~ '[[:cntrl:]]'`
    ),
    check("finance_refund_candidate_reviews_version_check", sql`${table.candidateVersion} >= 1`),
    check(
      "finance_refund_candidate_reviews_refund_shape_check",
      sql`(${table.action} = 'refund_decision_recorded' and ${table.refundCaseId} is not null)
        or (${table.action} <> 'refund_decision_recorded' and ${table.refundCaseId} is null)`
    ),
    index("finance_refund_candidate_reviews_candidate_created_idx").on(
      table.candidateId,
      table.createdAt,
      table.id
    )
  ]
);

/**
 * The application layer owns expected-version transitions, but these database guards ensure a
 * direct SQL path cannot attach a candidate to another client's order, erase its history, or
 * rewrite an already-recorded review fact.
 */
export const financeRefundCandidateIntegritySql = `
create or replace function finance_validate_refund_candidate_owner()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  order_client_user_id uuid;
begin
  select client_user_id into strict order_client_user_id
  from orders
  where id = new.order_id;

  if new.client_user_id <> order_client_user_id then
    raise exception 'refund candidate client does not own the order' using errcode = '23514';
  end if;
  return new;
exception
  when no_data_found then
    raise exception 'refund candidate order is missing' using errcode = '23503';
end;
$$;

create trigger finance_refund_candidate_owner_guard
before insert or update of order_id, client_user_id on finance_refund_candidates
for each row execute function finance_validate_refund_candidate_owner();

create or replace function finance_protect_refund_candidate_transition()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'refund candidates cannot be deleted' using errcode = '55000';
  end if;
  if new.id <> old.id
     or new.order_id <> old.order_id
     or new.client_user_id <> old.client_user_id
     or new.statement <> old.statement
     or new.submitted_at <> old.submitted_at
     or new.created_at <> old.created_at then
    raise exception 'refund candidate identity is immutable' using errcode = '55000';
  end if;
  if new.version <> old.version + 1 then
    raise exception 'refund candidate version must advance by one' using errcode = '40001';
  end if;
  if new.updated_at < old.updated_at then
    raise exception 'refund candidate updated time cannot move backwards' using errcode = '23514';
  end if;
  if old.status in ('rejected', 'resolved') then
    raise exception 'terminal refund candidate cannot transition' using errcode = '55000';
  end if;
  if (old.status = 'submitted' and new.status not in ('under_review', 'rejected', 'resolved'))
     or (old.status = 'under_review' and new.status not in ('rejected', 'resolved')) then
    raise exception 'refund candidate has an invalid status transition' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger finance_refund_candidates_transition_guard
before update or delete on finance_refund_candidates
for each row execute function finance_protect_refund_candidate_transition();
create trigger finance_refund_candidates_no_truncate
before truncate on finance_refund_candidates
for each statement execute function finance_protect_refund_candidate_transition();

create or replace function finance_reject_refund_candidate_review_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'refund candidate reviews are append-only' using errcode = '55000';
end;
$$;

create trigger finance_refund_candidate_reviews_immutable
before update or delete on finance_refund_candidate_reviews
for each row execute function finance_reject_refund_candidate_review_mutation();
create trigger finance_refund_candidate_reviews_no_truncate
before truncate on finance_refund_candidate_reviews
for each statement execute function finance_reject_refund_candidate_review_mutation();
`;
