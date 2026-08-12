import { describe, expect, it } from "vitest";

import {
  astroDiaryDeferredGraphIntegritySql,
  astroDiaryOpeningAllowanceFactIntegritySql,
  astroDiaryImmutableEvidenceSql,
  astroDiaryOutboxIntegritySql,
  astroDiarySourceSqlAppendOrder,
  astroDiaryWriteSetPersistence
} from "./index";

describe("AstroDiary source-owned PostgreSQL integrity", () => {
  it("binds client direct consumption and prompt reservation opening facts exactly", () => {
    expect(astroDiaryOpeningAllowanceFactIntegritySql).toContain(
      "astro_diary_validate_cycle_opening_allowance_fact"
    );
    expect(astroDiaryOpeningAllowanceFactIntegritySql).toContain(
      "consumption.source = 'available'"
    );
    expect(astroDiaryOpeningAllowanceFactIntegritySql).toContain(
      "astro_diary_cycles_opening_allowance_fact_integrity"
    );
    expect(astroDiaryOpeningAllowanceFactIntegritySql).toContain(
      "if tg_table_name = 'astro_diary_cycles' then"
    );
    expect(astroDiaryOpeningAllowanceFactIntegritySql).toContain(
      "cycle_row.state = 'awaiting_client_entry'"
    );
  });
  it("maps every current domain write-set field to its exact persistence owner", () => {
    expect(Object.keys(astroDiaryWriteSetPersistence).sort()).toEqual(
      [
        "allowances",
        "cascadeCommands",
        "cascadeTargets",
        "contextInvalidations",
        "contextSnapshots",
        "cycles",
        "derivativeCommands",
        "drafts",
        "erasureCommands",
        "erasureFacts",
        "events",
        "itemReadAccessRevocations",
        "journalMediaAccessRevocations",
        "journals",
        "mediaAccessRevocations",
        "mediaBindings",
        "mediaReleases",
        "obligations",
        "readCursors",
        "subscriptionTransitions",
        "timelineItems"
      ].sort()
    );
    expect(astroDiaryWriteSetPersistence.allowances.owner).toBe("client_subscriptions");
    expect(astroDiaryWriteSetPersistence.subscriptionTransitions.owner).toBe(
      "client_subscriptions"
    );
    expect(astroDiaryWriteSetPersistence.allowances.tables).toEqual([
      "client_subscription_period_allowances",
      "client_subscription_allowance_command_receipts",
      "client_subscription_allowance_command_effects",
      "client_subscription_allowance_reservations",
      "client_subscription_allowance_consumptions"
    ]);
    expect(astroDiaryWriteSetPersistence.mediaBindings.tables).toEqual([
      "astro_diary_media_authorities",
      "astro_diary_entry_attachments"
    ]);
    expect(astroDiaryWriteSetPersistence.mediaReleases.tables).toEqual([
      "astro_diary_media_authorities",
      "astro_diary_entry_attachments"
    ]);
    expect(astroDiaryWriteSetPersistence.subscriptionTransitions.tables).toEqual([
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
    ]);
    for (const [field, binding] of Object.entries(astroDiaryWriteSetPersistence)) {
      expect(binding.tables.length, field).toBeGreaterThan(0);
      expect(binding.tables.join(" "), field).not.toMatch(/json|fallback|legacy|compat/i);
    }
  });


  it("defers graph validation until the whole atomic write-set is visible", () => {
    expect(astroDiaryDeferredGraphIntegritySql).toContain("deferrable initially deferred");
    expect(astroDiaryDeferredGraphIntegritySql).toContain("astro_diary_validate_journal_graph");
    expect(astroDiaryDeferredGraphIntegritySql).toContain("for update");
    expect(astroDiaryDeferredGraphIntegritySql).toContain(
      "author role does not match journal pair"
    );
    expect(astroDiaryDeferredGraphIntegritySql).toContain(
      "timeline head does not match latest revision"
    );
    expect(astroDiaryDeferredGraphIntegritySql).toContain("cross-journal reference");
    expect(astroDiaryDeferredGraphIntegritySql).toContain("media binding is not private and ready");
    expect(astroDiaryDeferredGraphIntegritySql).toContain(
      "read cursor participant does not match journal pair"
    );
    expect(astroDiaryDeferredGraphIntegritySql).toContain("working weekday evidence is incomplete");
    expect(astroDiaryDeferredGraphIntegritySql).toContain("published revision identity differs");
    expect(astroDiaryDeferredGraphIntegritySql).toContain(
      "journal media revocation has a cross-journal reference"
    );
    expect(astroDiaryDeferredGraphIntegritySql).toContain(
      "astro_diary_response_obligation_weekdays_graph_integrity"
    );
    expect(astroDiaryDeferredGraphIntegritySql).toContain(
      "cycle lacks its exact immutable opening allowance fact"
    );
    expect(astroDiaryDeferredGraphIntegritySql).toContain(
      "astro_diary_command_preconditions_graph_integrity"
    );
    expect(astroDiaryDeferredGraphIntegritySql).toContain("astro_diary_export_pdf");
    expect(astroDiaryDeferredGraphIntegritySql).toContain(
      "export artifact is not a private ready PDF owned by its requester"
    );
    expect(astroDiaryDeferredGraphIntegritySql).toContain(
      "calculated context and immutable display evidence differ"
    );
    expect(astroDiaryDeferredGraphIntegritySql).toContain(
      "context display has stale digest, version, or personal evidence"
    );
    expect(astroDiaryDeferredGraphIntegritySql).toContain(
      "AI terminal command, attempts, and immutable draft differ"
    );
    expect(astroDiaryDeferredGraphIntegritySql).toContain(
      "completed item erasure lacks its exact redaction receipt set"
    );
    expect(astroDiaryDeferredGraphIntegritySql).toContain(
      "completed journal erasure lacks its exact cascade target receipt set"
    );
    expect(astroDiaryDeferredGraphIntegritySql).toContain(
      "command event receipt ordinals are not contiguous"
    );
    expect(astroDiaryDeferredGraphIntegritySql).toContain(
      "realtime projection type does not exactly map its canonical visible event"
    );
    expect(astroDiaryDeferredGraphIntegritySql).toContain(
      "realtime projection lacks its exact application receipt"
    );
    expect(astroDiaryDeferredGraphIntegritySql).toContain(
      "application receipt source identity differs from its canonical event"
    );
    expect(astroDiaryOutboxIntegritySql).toContain(
      "published delivery lacks its exact application receipt"
    );
    expect(astroDiaryDeferredGraphIntegritySql).toContain(
      "source.event_type = 'astro_diary.timeline_item_published.v1'"
    );
    for (const stateEvent of [
      "astro_diary.timeline_item_edited.v1",
      "astro_diary.timeline_item_hidden.v1",
      "astro_diary.timeline_item_erased.v1",
      "astro_diary.context_completed.v1",
      "astro_diary.context_failed.v1",
      "astro_diary.ai_updated.v1",
      "astro_diary.export_ready.v1",
      "astro_diary.export_failed.v1",
      "astro_diary.export_invalidated.v1",
      "astro_diary.erasure_completed.v1",
      "astro_diary.journal_activated.v1"
    ]) {
      expect(astroDiaryDeferredGraphIntegritySql).toContain(stateEvent);
      expect(astroDiaryOutboxIntegritySql).toContain(stateEvent);
    }
    expect(astroDiaryDeferredGraphIntegritySql).not.toMatch(
      /context_generation_requested\.v1'[\s\S]{0,180}context\.updated/
    );
    expect(
      astroDiaryOutboxIntegritySql.match(/select 'realtime_projection' where exists/g)
    ).toHaveLength(1);
    expect(astroDiaryOutboxIntegritySql).not.toMatch(
      /select 'realtime_projection' where exists\s*\(\s*select 'realtime_projection'/
    );
  });

  it("binds stable body-free draft results to immutable exact draft version facts", () => {
    expect(astroDiaryDeferredGraphIntegritySql).toContain(
      "command draft result lacks its exact immutable version fact"
    );
    expect(astroDiaryImmutableEvidenceSql).toContain("astro_diary_draft_version_facts");
    expect(astroDiaryDeferredGraphIntegritySql).not.toContain("result_body");
  });

  it("requires every private Diary asset to have one exact same-journal media authority", () => {
    expect(astroDiaryDeferredGraphIntegritySql).toContain("astro_diary_media_authorities");
    expect(astroDiaryDeferredGraphIntegritySql).toContain(
      "media authority differs from its exact private generic asset"
    );
    expect(astroDiaryDeferredGraphIntegritySql).toContain(
      "media authority owner is not a journal participant"
    );
    expect(astroDiaryDeferredGraphIntegritySql).toContain(
      "bound media authority has a cross-journal item or author"
    );
    expect(astroDiaryDeferredGraphIntegritySql).toContain(
      "journal media revocation set is not exact for live journal authorities"
    );
    expect(astroDiaryDeferredGraphIntegritySql).toContain(
      "generic Diary asset lacks its exact journal authority"
    );
  });

  it("guards contiguous versions, server cursors and immutable evidence", () => {
    expect(astroDiaryImmutableEvidenceSql).toContain("astro_diary_guard_versioned_head");
    expect(astroDiaryImmutableEvidenceSql).toContain("new.version <> old.version + 1");
    expect(astroDiaryImmutableEvidenceSql).toContain(
      "new.current_revision <> old.current_revision + 1"
    );
    expect(astroDiaryImmutableEvidenceSql).toContain("astro_diary_guard_immutable_evidence");
    expect(astroDiaryImmutableEvidenceSql).toContain("astro_diary_timeline_item_revisions");
    expect(astroDiaryImmutableEvidenceSql).toContain("astro_diary_realtime_events");
    expect(astroDiaryImmutableEvidenceSql).toContain("astro_diary_context_displays");
    expect(astroDiaryImmutableEvidenceSql).toContain(
      "astro_diary_context_display_personal_highlights"
    );
    expect(astroDiaryImmutableEvidenceSql).toContain("astro_diary_command_receipts");
    expect(astroDiaryImmutableEvidenceSql).toContain("astro_diary_event_application_receipts");
    expect(astroDiaryImmutableEvidenceSql).toContain("cursor is server generated");
    expect(astroDiaryImmutableEvidenceSql).toContain("astro_diary_guard_async_command_transition");
    expect(astroDiaryImmutableEvidenceSql).toContain("claim_fence <> old.claim_fence + 1");
    expect(astroDiaryImmutableEvidenceSql).toContain("attempts <> old.attempts + 1");
    expect(astroDiaryImmutableEvidenceSql).toContain(
      "retry exhaustion requires terminal quarantine"
    );
    expect(astroDiaryImmutableEvidenceSql).toContain(
      "new.next_attempt_at is not null or new.last_failure_code is not null"
    );
    expect(astroDiaryImmutableEvidenceSql).toContain(
      "worker terminal transition requires an active claim"
    );
    expect(astroDiaryImmutableEvidenceSql).toContain(
      "source invalidation is the only terminal transition allowed before claim"
    );
    expect(astroDiaryImmutableEvidenceSql).toContain("array['source_stale', 'cancelled']");
    expect(astroDiaryImmutableEvidenceSql).toContain("array['invalidated']");
    expect(astroDiaryImmutableEvidenceSql).toContain(
      "async quarantine transition requires an active claim"
    );
    expect(astroDiaryImmutableEvidenceSql).toContain(
      "cycle allowance reservation may clear only when leaving client entry"
    );
    expect(astroDiaryImmutableEvidenceSql).toContain(
      "old.state = 'awaiting_client_follow_up'\n          and new.state in ('awaiting_astrologer_response', 'awaiting_astrologer_closing_response', 'closed')"
    );
    expect(astroDiaryImmutableEvidenceSql).toContain(
      "astro_diary_cycle_opening_allowance_facts_immutable"
    );
    expect(astroDiaryImmutableEvidenceSql).toContain("expected_next_cursor");
    expect(astroDiaryImmutableEvidenceSql).toContain("cursor is not the next server cursor");
  });

  it("contains no content-bearing outbox or realtime projection", () => {
    expect(astroDiaryDeferredGraphIntegritySql).not.toMatch(
      /outbox[^\n]*(body|mood|birth|prompt)/i
    );
    expect(astroDiaryImmutableEvidenceSql).not.toMatch(/outbox[^\n]*(body|mood|birth|prompt)/i);
    expect(astroDiaryOutboxIntegritySql).toContain(
      "astro-diary-event-delivery-dispatch-request.v1"
    );
    expect(astroDiaryOutboxIntegritySql).toContain("deliveryId");
    expect(astroDiaryOutboxIntegritySql).toContain("astro_diary_event_deliveries");
    expect(astroDiaryOutboxIntegritySql).toContain(
      "AstroDiary outbox dispatch does not reference a delivery"
    );
    expect(astroDiaryOutboxIntegritySql).toContain("select count(*) from outbox_events outbox");
    expect(astroDiaryOutboxIntegritySql).toContain(") <> 1");
    expect(astroDiaryOutboxIntegritySql).not.toMatch(/body|mood|birth|prompt/i);
    const realtimeFanout = astroDiaryOutboxIntegritySql.slice(
      astroDiaryOutboxIntegritySql.indexOf("select 'realtime_projection'"),
      astroDiaryOutboxIntegritySql.indexOf("union all select 'notification'")
    );
    expect(realtimeFanout).toContain("astro_diary.response_obligation_overdue.v1");
    expect(realtimeFanout).not.toMatch(
      /context_generation_requested|ai_generation_requested|export_requested|erasure_requested/
    );
    expect(astroDiarySourceSqlAppendOrder).toEqual([
      astroDiaryImmutableEvidenceSql,
      astroDiaryDeferredGraphIntegritySql,
      astroDiaryOutboxIntegritySql,
      astroDiaryOpeningAllowanceFactIntegritySql
    ]);
  });
});
