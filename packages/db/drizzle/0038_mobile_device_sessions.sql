CREATE TABLE "mobile_refresh_retry_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"refresh_token_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"encrypted_token_pair" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mobile_refresh_retry_receipts_timestamp_order_check" CHECK ("mobile_refresh_retry_receipts"."expires_at" > "mobile_refresh_retry_receipts"."created_at"),
	CONSTRAINT "mobile_refresh_retry_receipts_ciphertext_check" CHECK (char_length("mobile_refresh_retry_receipts"."encrypted_token_pair") between 1 and 4096)
);
--> statement-breakpoint
CREATE TABLE "mobile_refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mobile_refresh_tokens_status_check" CHECK ("mobile_refresh_tokens"."status" in ('active', 'consumed', 'revoked')),
	CONSTRAINT "mobile_refresh_tokens_token_hash_check" CHECK ("mobile_refresh_tokens"."token_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "mobile_refresh_tokens_timestamp_order_check" CHECK ("mobile_refresh_tokens"."expires_at" > "mobile_refresh_tokens"."created_at"
        and ("mobile_refresh_tokens"."consumed_at" is null
          or ("mobile_refresh_tokens"."consumed_at" >= "mobile_refresh_tokens"."created_at" and "mobile_refresh_tokens"."consumed_at" <= "mobile_refresh_tokens"."expires_at"))),
	CONSTRAINT "mobile_refresh_tokens_lifecycle_check" CHECK (("mobile_refresh_tokens"."status" = 'active' and "mobile_refresh_tokens"."consumed_at" is null)
        or ("mobile_refresh_tokens"."status" = 'consumed' and "mobile_refresh_tokens"."consumed_at" is not null)
        or ("mobile_refresh_tokens"."status" = 'revoked' and "mobile_refresh_tokens"."consumed_at" is null))
);
--> statement-breakpoint
CREATE TABLE "mobile_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"device_label" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"access_token_hash" text NOT NULL,
	"access_token_expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	CONSTRAINT "mobile_sessions_platform_check" CHECK ("mobile_sessions"."platform" in ('ios', 'android')),
	CONSTRAINT "mobile_sessions_status_check" CHECK ("mobile_sessions"."status" in ('active', 'revoked')),
	CONSTRAINT "mobile_sessions_device_label_check" CHECK ("mobile_sessions"."device_label" = btrim("mobile_sessions"."device_label") and char_length("mobile_sessions"."device_label") between 1 and 120),
	CONSTRAINT "mobile_sessions_access_token_hash_check" CHECK ("mobile_sessions"."access_token_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "mobile_sessions_timestamp_order_check" CHECK ("mobile_sessions"."last_used_at" >= "mobile_sessions"."created_at"
        and "mobile_sessions"."access_token_expires_at" > "mobile_sessions"."last_used_at"
        and "mobile_sessions"."access_token_expires_at" <= "mobile_sessions"."expires_at"),
	CONSTRAINT "mobile_sessions_lifecycle_check" CHECK (("mobile_sessions"."status" = 'active' and "mobile_sessions"."revoked_at" is null and "mobile_sessions"."revoked_reason" is null)
        or ("mobile_sessions"."status" = 'revoked' and "mobile_sessions"."revoked_at" is not null
          and "mobile_sessions"."revoked_at" >= "mobile_sessions"."created_at"
          and "mobile_sessions"."revoked_reason" is not null
          and "mobile_sessions"."revoked_reason" = btrim("mobile_sessions"."revoked_reason")
          and char_length("mobile_sessions"."revoked_reason") between 1 and 120))
);
--> statement-breakpoint
ALTER TABLE "auth_security_events" DROP CONSTRAINT "auth_security_events_event_type_check";--> statement-breakpoint
ALTER TABLE "mobile_refresh_retry_receipts" ADD CONSTRAINT "mobile_refresh_retry_receipts_refresh_token_id_mobile_refresh_tokens_id_fk" FOREIGN KEY ("refresh_token_id") REFERENCES "public"."mobile_refresh_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_refresh_tokens" ADD CONSTRAINT "mobile_refresh_tokens_session_id_mobile_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."mobile_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_sessions" ADD CONSTRAINT "mobile_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mobile_refresh_retry_receipts_operation_unique" ON "mobile_refresh_retry_receipts" USING btree ("refresh_token_id","operation_id");--> statement-breakpoint
CREATE INDEX "mobile_refresh_retry_receipts_expires_at_index" ON "mobile_refresh_retry_receipts" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mobile_refresh_tokens_token_hash_unique" ON "mobile_refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "mobile_refresh_tokens_one_active_per_session" ON "mobile_refresh_tokens" USING btree ("session_id") WHERE "mobile_refresh_tokens"."status" = 'active';--> statement-breakpoint
CREATE INDEX "mobile_refresh_tokens_session_id_index" ON "mobile_refresh_tokens" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "mobile_refresh_tokens_consumed_at_index" ON "mobile_refresh_tokens" USING btree ("consumed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mobile_sessions_access_token_hash_unique" ON "mobile_sessions" USING btree ("access_token_hash");--> statement-breakpoint
CREATE INDEX "mobile_sessions_active_user_index" ON "mobile_sessions" USING btree ("user_id") WHERE "mobile_sessions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "mobile_sessions_expires_at_index" ON "mobile_sessions" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "auth_security_events" ADD CONSTRAINT "auth_security_events_event_type_check" CHECK ("auth_security_events"."event_type" in (
        'registration_succeeded',
        'login_succeeded',
        'login_failed',
        'logout_succeeded',
        'session_revoked',
        'refresh_succeeded',
        'refresh_token_reuse_detected'
      ));
--> statement-breakpoint
create or replace function mobile_validate_session_family()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  target_session_id uuid;
  family mobile_sessions%rowtype;
  active_refresh_count bigint;
  invalid_expiry_count bigint;
begin
  if tg_table_name = 'mobile_sessions' then
    target_session_id := coalesce(new.id, old.id);
  else
    target_session_id := coalesce(new.session_id, old.session_id);
  end if;

  select * into family
  from public.mobile_sessions
  where id = target_session_id
  for update;

  if not found then
    return null;
  end if;

  select
    count(*) filter (where status = 'active'),
    count(*) filter (
      where expires_at > family.expires_at
        or (status = 'active' and expires_at is distinct from family.expires_at)
        or created_at < family.created_at
    )
  into active_refresh_count, invalid_expiry_count
  from public.mobile_refresh_tokens
  where session_id = target_session_id;

  if invalid_expiry_count <> 0 then
    raise exception 'mobile refresh token expiry is outside its session family'
      using errcode = '23514';
  end if;

  if family.status = 'active' and active_refresh_count <> 1 then
    raise exception 'active mobile session must have exactly one active refresh token'
      using errcode = '23514';
  end if;

  if family.status = 'revoked' and active_refresh_count <> 0 then
    raise exception 'revoked mobile session cannot have an active refresh token'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create or replace function mobile_guard_session_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'active' then
      raise exception 'mobile sessions must be created active' using errcode = '23514';
    end if;
    return new;
  end if;

  if old.status = 'revoked' then
    raise exception 'revoked mobile session is immutable' using errcode = '23514';
  end if;

  if old.user_id is distinct from new.user_id
    or old.platform is distinct from new.platform
    or old.device_label is distinct from new.device_label
    or old.created_at is distinct from new.created_at then
    raise exception 'mobile session identity is immutable' using errcode = '23514';
  end if;

  if new.status = 'active' then
    if new.revoked_at is not null or new.revoked_reason is not null
      or new.last_used_at < old.last_used_at
      or new.expires_at < old.expires_at then
      raise exception 'mobile session active transition is not allowed' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.status <> 'revoked'
    or new.revoked_at is null
    or new.revoked_at < old.created_at
    or new.revoked_reason is null
    or btrim(new.revoked_reason) = ''
    or new.access_token_hash is distinct from old.access_token_hash
    or new.access_token_expires_at is distinct from old.access_token_expires_at
    or new.last_used_at is distinct from old.last_used_at
    or new.expires_at is distinct from old.expires_at then
    raise exception 'mobile session revocation transition is not allowed' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function mobile_guard_refresh_token_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'active' or new.consumed_at is not null then
      raise exception 'mobile refresh tokens must be created active' using errcode = '23514';
    end if;
    return new;
  end if;

  if old.session_id is distinct from new.session_id
    or old.token_hash is distinct from new.token_hash
    or old.created_at is distinct from new.created_at
    or old.expires_at is distinct from new.expires_at then
    raise exception 'mobile refresh token binding is immutable' using errcode = '23514';
  end if;

  if old.status <> 'active'
    or (new.status = 'consumed' and (new.consumed_at is null
      or new.consumed_at < old.created_at or new.consumed_at > old.expires_at))
    or (new.status = 'revoked' and new.consumed_at is not null)
    or new.status not in ('consumed', 'revoked') then
    raise exception 'mobile refresh token transition is not allowed' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger mobile_sessions_mutation_guard
before insert or update on mobile_sessions
for each row execute function mobile_guard_session_mutation();

create trigger mobile_refresh_tokens_mutation_guard
before insert or update on mobile_refresh_tokens
for each row execute function mobile_guard_refresh_token_mutation();

create constraint trigger mobile_sessions_family_integrity
after insert or update or delete on mobile_sessions
deferrable initially deferred
for each row execute function mobile_validate_session_family();

create constraint trigger mobile_refresh_tokens_family_integrity
after insert or update or delete on mobile_refresh_tokens
deferrable initially deferred
for each row execute function mobile_validate_session_family();
