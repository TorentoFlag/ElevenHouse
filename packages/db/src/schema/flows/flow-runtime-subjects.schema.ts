import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import { users } from "../identity/accounts.schema";

export const flowRuntimeOwnerSubjects = pgTable(
  "flow_runtime_owner_subjects",
  {
    ownerSubjectId: uuid("owner_subject_id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id"),
    state: text("state").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    erasedAt: timestamp("erased_at", { withTimezone: true })
  },
  (table) => [
    foreignKey({
      columns: [table.ownerUserId],
      foreignColumns: [users.id],
      name: "flow_runtime_owner_subjects_user_fk"
    }).onDelete("set null"),
    uniqueIndex("flow_runtime_owner_subjects_user_unique")
      .on(table.ownerUserId)
      .where(sql`${table.ownerUserId} is not null`),
    index("flow_runtime_owner_subjects_state_created_idx").on(
      table.state,
      table.createdAt,
      table.ownerSubjectId
    ),
    check(
      "flow_runtime_owner_subjects_shape_check",
      sql`(
          ${table.state} = 'active'
          and ${table.ownerUserId} is not null
          and ${table.erasedAt} is null
        ) or (
          ${table.state} = 'erased'
          and ${table.ownerUserId} is null
          and ${table.erasedAt} is not null
          and ${table.erasedAt} >= ${table.createdAt}
        )`
    )
  ]
);

export const flowRuntimeOwnerSubjectIntegritySql = `
create or replace function flow_prepare_runtime_owner_subject()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  new.state := 'active';
  new.created_at := clock_timestamp();
  new.erased_at := null;
  return new;
end;
$$;

create trigger flow_runtime_owner_subjects_prepare
before insert on flow_runtime_owner_subjects
for each row execute function flow_prepare_runtime_owner_subject();

create or replace function flow_enforce_runtime_owner_subject_erasure()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if old.state <> 'active'
     or old.owner_user_id is null
     or new.owner_user_id is not null
     or new.owner_subject_id <> old.owner_subject_id
     or new.created_at <> old.created_at then
    raise exception 'flow runtime owner subject mapping is immutable' using errcode = '55000';
  end if;
  new.state := 'erased';
  new.erased_at := clock_timestamp();
  return new;
end;
$$;

create trigger flow_runtime_owner_subjects_erasure_guard
before update on flow_runtime_owner_subjects
for each row execute function flow_enforce_runtime_owner_subject_erasure();

create or replace function flow_reject_runtime_owner_subject_removal()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'flow runtime owner subject tombstones cannot be removed' using errcode = '55000';
end;
$$;

create trigger flow_runtime_owner_subjects_reject_delete
before delete on flow_runtime_owner_subjects
for each row execute function flow_reject_runtime_owner_subject_removal();

create trigger flow_runtime_owner_subjects_reject_truncate
before truncate on flow_runtime_owner_subjects
for each statement execute function flow_reject_runtime_owner_subject_removal();
`;
