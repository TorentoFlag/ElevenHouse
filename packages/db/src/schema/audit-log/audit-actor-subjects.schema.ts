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

import { users } from "../identity/accounts.schema";

export const auditActorSubjects = pgTable(
  "audit_actor_subjects",
  {
    actorSubjectId: uuid("actor_subject_id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    userId: uuid("user_id"),
    serviceKey: varchar("service_key", { length: 180 }),
    state: text("state").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    erasedAt: timestamp("erased_at", { withTimezone: true })
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "audit_actor_subjects_user_fk"
    }).onDelete("set null"),
    uniqueIndex("audit_actor_subjects_user_unique")
      .on(table.userId)
      .where(sql`${table.userId} is not null`),
    uniqueIndex("audit_actor_subjects_service_unique")
      .on(table.serviceKey)
      .where(sql`${table.serviceKey} is not null`),
    index("audit_actor_subjects_state_created_idx").on(
      table.state,
      table.createdAt,
      table.actorSubjectId
    ),
    check(
      "audit_actor_subjects_shape_check",
      sql`(
          ${table.state} = 'active'
          and ${table.erasedAt} is null
          and (
            (${table.kind} = 'user' and ${table.userId} is not null and ${table.serviceKey} is null)
            or (${table.kind} = 'service' and ${table.userId} is null
              and length(trim(${table.serviceKey})) between 1 and 180
              and ${table.serviceKey} = trim(${table.serviceKey})
              and ${table.serviceKey} ~ '^[A-Za-z0-9._:-]+$')
          )
        ) or (
          ${table.state} = 'erased'
          and ${table.userId} is null
          and ${table.serviceKey} is null
          and ${table.erasedAt} is not null
          and ${table.erasedAt} >= ${table.createdAt}
        )`
    )
  ]
);

export const auditActorSubjectIntegritySql = `
create or replace function audit_prepare_actor_subject()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  new.state := 'active';
  new.created_at := clock_timestamp();
  new.erased_at := null;
  return new;
end;
$$;

create trigger audit_actor_subjects_prepare
before insert on audit_actor_subjects
for each row execute function audit_prepare_actor_subject();

create or replace function audit_enforce_actor_subject_erasure()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if old.state <> 'active'
     or new.actor_subject_id <> old.actor_subject_id
     or new.kind <> old.kind
     or new.created_at <> old.created_at
     or (
       old.kind = 'user'
       and not (old.user_id is not null and new.user_id is null
         and old.service_key is null and new.service_key is null)
     )
     or (
       old.kind = 'service'
       and not (old.service_key is not null and new.service_key is null
         and old.user_id is null and new.user_id is null)
     ) then
    raise exception 'active audit actor subject mapping is immutable' using errcode = '55000';
  end if;
  new.state := 'erased';
  new.erased_at := clock_timestamp();
  return new;
end;
$$;

create trigger audit_actor_subjects_erasure_guard
before update on audit_actor_subjects
for each row execute function audit_enforce_actor_subject_erasure();

create or replace function audit_reject_actor_subject_removal()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'audit actor subject tombstones cannot be removed' using errcode = '55000';
end;
$$;

create trigger audit_actor_subjects_reject_delete
before delete on audit_actor_subjects
for each row execute function audit_reject_actor_subject_removal();

create trigger audit_actor_subjects_reject_truncate
before truncate on audit_actor_subjects
for each statement execute function audit_reject_actor_subject_removal();
`;
