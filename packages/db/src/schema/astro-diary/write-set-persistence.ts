import type { AstroDiaryCommandWriteSet } from "@elevenhouse/domain";

type WriteSetPersistenceBinding = Readonly<{
  owner: "astro_diary" | "client_subscriptions" | "outbox";
  tables: readonly [string, ...string[]];
}>;

/**
 * Compile-time exhaustive ownership ledger for the domain write-set. Adding a write-set field is
 * a schema decision: TypeScript fails here until its authoritative tables are named explicitly.
 */
export const astroDiaryWriteSetPersistence = {
  journals: { owner: "astro_diary", tables: ["astro_diary_journals"] },
  cycles: {
    owner: "astro_diary",
    tables: ["astro_diary_cycles", "astro_diary_cycle_opening_allowance_facts"]
  },
  drafts: {
    owner: "astro_diary",
    tables: [
      "astro_diary_drafts",
      "astro_diary_draft_version_facts",
      "astro_diary_draft_attachments"
    ]
  },
  obligations: {
    owner: "astro_diary",
    tables: ["astro_diary_response_obligations", "astro_diary_response_obligation_weekdays"]
  },
  allowances: {
    owner: "client_subscriptions",
    tables: [
      "client_subscription_period_allowances",
      "client_subscription_allowance_command_receipts",
      "client_subscription_allowance_command_effects",
      "client_subscription_allowance_reservations",
      "client_subscription_allowance_consumptions"
    ]
  },
  timelineItems: {
    owner: "astro_diary",
    tables: [
      "astro_diary_timeline_items",
      "astro_diary_timeline_item_revisions",
      "astro_diary_timeline_revision_attachments"
    ]
  },
  mediaBindings: {
    owner: "astro_diary",
    tables: ["astro_diary_media_authorities", "astro_diary_entry_attachments"]
  },
  mediaReleases: {
    owner: "astro_diary",
    tables: ["astro_diary_media_authorities", "astro_diary_entry_attachments"]
  },
  mediaAccessRevocations: {
    owner: "astro_diary",
    tables: ["astro_diary_media_access_revocations"]
  },
  journalMediaAccessRevocations: {
    owner: "astro_diary",
    tables: ["astro_diary_journal_media_access_revocations"]
  },
  itemReadAccessRevocations: {
    owner: "astro_diary",
    tables: ["astro_diary_item_read_access_revocations"]
  },
  contextSnapshots: { owner: "astro_diary", tables: ["astro_diary_context_snapshots"] },
  contextInvalidations: {
    owner: "astro_diary",
    tables: ["astro_diary_context_invalidations"]
  },
  derivativeCommands: {
    owner: "astro_diary",
    tables: ["astro_diary_derivative_commands"]
  },
  erasureCommands: { owner: "astro_diary", tables: ["astro_diary_erasure_commands"] },
  subscriptionTransitions: {
    owner: "client_subscriptions",
    tables: [
      "client_subscription_command_receipts",
      "client_subscription_transition_receipts",
      "client_subscription_lifecycle_events",
      "client_subscriptions",
      "client_subscription_periods",
      "client_subscription_period_allowances",
      "client_subscription_renewal_requests",
      "client_entitlement_transition_applications",
      "client_entitlement_grants",
      "client_entitlement_transition_effects",
      "client_subscription_slots",
      "outbox_events"
    ]
  },
  cascadeCommands: { owner: "astro_diary", tables: ["astro_diary_cascade_commands"] },
  cascadeTargets: { owner: "astro_diary", tables: ["astro_diary_cascade_targets"] },
  erasureFacts: {
    owner: "astro_diary",
    tables: ["astro_diary_erasure_decision_facts"]
  },
  readCursors: { owner: "astro_diary", tables: ["astro_diary_read_cursors"] },
  events: {
    owner: "outbox",
    tables: ["astro_diary_events", "astro_diary_event_deliveries", "outbox_events"]
  }
} as const satisfies Record<keyof AstroDiaryCommandWriteSet, WriteSetPersistenceBinding>;
