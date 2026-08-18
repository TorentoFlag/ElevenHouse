CREATE TABLE "astro_diary_subscription_activation_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"journal_id" uuid NOT NULL,
	"relationship_id" uuid NOT NULL,
	"journal_epoch_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"subscription_version" integer NOT NULL,
	"source_event_id" uuid NOT NULL,
	"source_event_digest" varchar(71) NOT NULL,
	"evidence_id" uuid NOT NULL,
	"transition_id" uuid NOT NULL,
	"activation_event_id" uuid NOT NULL,
	"activated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "astro_diary_subscription_activation_journal_unique" UNIQUE("journal_id"),
	CONSTRAINT "astro_diary_subscription_activation_epoch_unique" UNIQUE("journal_epoch_id"),
	CONSTRAINT "astro_diary_subscription_activation_subscription_unique" UNIQUE("subscription_id"),
	CONSTRAINT "astro_diary_subscription_activation_source_event_unique" UNIQUE("source_event_id"),
	CONSTRAINT "astro_diary_subscription_activation_evidence_unique" UNIQUE("evidence_id"),
	CONSTRAINT "astro_diary_subscription_activation_transition_unique" UNIQUE("transition_id"),
	CONSTRAINT "astro_diary_subscription_activation_event_unique" UNIQUE("activation_event_id"),
	CONSTRAINT "astro_diary_subscription_activation_evidence_check" CHECK ("astro_diary_subscription_activation_receipts"."subscription_version" >= 2
        and "astro_diary_subscription_activation_receipts"."source_event_digest" ~ '^sha256:[a-f0-9]{64}$'
        and "astro_diary_subscription_activation_receipts"."id" <> "astro_diary_subscription_activation_receipts"."journal_id"
        and "astro_diary_subscription_activation_receipts"."id" <> "astro_diary_subscription_activation_receipts"."source_event_id"
        and "astro_diary_subscription_activation_receipts"."id" <> "astro_diary_subscription_activation_receipts"."evidence_id"
        and "astro_diary_subscription_activation_receipts"."id" <> "astro_diary_subscription_activation_receipts"."transition_id"
        and "astro_diary_subscription_activation_receipts"."id" <> "astro_diary_subscription_activation_receipts"."activation_event_id")
);
--> statement-breakpoint
DROP INDEX "astro_diary_journals_one_current_per_relationship";--> statement-breakpoint
ALTER TABLE "astro_diary_journals" ADD CONSTRAINT "astro_diary_journals_activation_identity_unique" UNIQUE("id","relationship_id","journal_epoch_id");--> statement-breakpoint
ALTER TABLE "astro_diary_subscription_activation_receipts" ADD CONSTRAINT "astro_diary_subscription_activation_journal_fk" FOREIGN KEY ("journal_id","relationship_id","journal_epoch_id") REFERENCES "public"."astro_diary_journals"("id","relationship_id","journal_epoch_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_subscription_activation_receipts" ADD CONSTRAINT "astro_diary_subscription_activation_subscription_fk" FOREIGN KEY ("subscription_id","contract_id","relationship_id","journal_epoch_id") REFERENCES "public"."client_subscriptions"("id","contract_id","relationship_id","journal_epoch_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_subscription_activation_receipts" ADD CONSTRAINT "astro_diary_subscription_activation_transition_fk" FOREIGN KEY ("transition_id","subscription_id","contract_id","subscription_version") REFERENCES "public"."client_subscription_transition_receipts"("transition_id","subscription_id","contract_id","subscription_version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_subscription_activation_receipts" ADD CONSTRAINT "astro_diary_subscription_activation_event_fk" FOREIGN KEY ("activation_event_id") REFERENCES "public"."astro_diary_events"("event_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
create trigger astro_diary_subscription_activation_receipts_immutable
before update or delete on astro_diary_subscription_activation_receipts
for each row execute function astro_diary_guard_immutable_evidence();
--> statement-breakpoint
create or replace function astro_diary_validate_subscription_activation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  receipt astro_diary_subscription_activation_receipts%rowtype;
begin
  select * into receipt
    from astro_diary_subscription_activation_receipts
   where id = coalesce(new.id, old.id);
  if not found then return null; end if;

  if not exists (
    select 1
      from astro_diary_journals journal
      join client_subscriptions subscription
        on subscription.id = receipt.subscription_id
       and subscription.contract_id = receipt.contract_id
       and subscription.relationship_id = receipt.relationship_id
       and subscription.journal_epoch_id = receipt.journal_epoch_id
      join client_subscription_transition_receipts transition
        on transition.transition_id = receipt.transition_id
       and transition.subscription_id = receipt.subscription_id
       and transition.contract_id = receipt.contract_id
       and transition.relationship_id = receipt.relationship_id
       and transition.journal_epoch_id = receipt.journal_epoch_id
       and transition.subscription_version = receipt.subscription_version
      join client_subscription_event_application_receipts application
        on application.source_event_id = receipt.source_event_id
       and application.source_event_digest = receipt.source_event_digest
       and application.evidence_id = receipt.evidence_id
       and application.subscription_id = receipt.subscription_id
       and application.result_kind = 'applied'
       and application.result_version = receipt.subscription_version
       and application.transition_id = receipt.transition_id
      join astro_diary_events event
        on event.event_id = receipt.activation_event_id
       and event.event_type = 'astro_diary.journal_activated.v1'
       and event.journal_id = receipt.journal_id
       and event.journal_epoch_id = receipt.journal_epoch_id
       and event.occurred_at = receipt.activated_at
     where journal.id = receipt.journal_id
       and journal.relationship_id = receipt.relationship_id
       and journal.journal_epoch_id = receipt.journal_epoch_id
       and journal.created_at = receipt.activated_at
       and transition.primary_event_type = 'client_subscription.activated.v1'
       and transition.state = 'active'
       and transition.entitlement_state = 'active'
       and transition.entitlement_scope = 'period'
       and transition.occurred_at = (
         select period.anchor_captured_at
           from client_subscription_periods period
          where period.id = transition.period_id
            and period.subscription_id = receipt.subscription_id
       )
  ) then
    raise exception 'AstroDiary activation evidence differs from its canonical capture transition graph'
      using errcode = '23514';
  end if;
  return null;
end;
$$;
--> statement-breakpoint
create constraint trigger astro_diary_subscription_activation_graph_integrity
after insert or update or delete on astro_diary_subscription_activation_receipts
deferrable initially deferred for each row
execute function astro_diary_validate_subscription_activation();
