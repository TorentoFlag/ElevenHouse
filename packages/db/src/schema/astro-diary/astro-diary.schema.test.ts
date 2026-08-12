import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as astroDiarySchema from "./index";

import {
  astroDiaryAiAttempts,
  astroDiaryAiCommands,
  astroDiaryAiDrafts,
  astroDiaryCascadeCommands,
  astroDiaryCascadeReceipts,
  astroDiaryCascadeTargets,
  astroDiaryCommandEventReceipts,
  astroDiaryCommandPreconditions,
  astroDiaryCommandReceipts,
  astroDiaryContextInvalidations,
  astroDiaryContextDisplayPersonalHighlights,
  astroDiaryContextDisplays,
  astroDiaryContextDisplayTransits,
  astroDiaryContextSnapshots,
  astroDiaryDerivativeCommands,
  astroDiaryDraftAttachments,
  astroDiaryDraftVersionFacts,
  astroDiaryDrafts,
  astroDiaryEntryAttachments,
  astroDiaryErasureCommands,
  astroDiaryErasureDecisionFacts,
  astroDiaryEventDeliveries,
  astroDiaryEvents,
  astroDiaryEventApplicationReceipts,
  astroDiaryExportCommands,
  astroDiaryItemReadAccessRevocations,
  astroDiaryJournals,
  astroDiaryJournalMediaAccessRevocations,
  astroDiaryMediaAccessRevocations,
  astroDiaryMediaAuthorities,
  astroDiaryReadCursors,
  astroDiaryRealtimeEvents,
  astroDiaryResponseObligations,
  astroDiaryResponseObligationWeekdays,
  astroDiaryTimelineItemRevisions,
  astroDiaryTimelineItems,
  astroDiaryTimelineRevisionAttachments,
  astroDiaryCycles,
  astroDiaryCycleOpeningAllowanceFacts
} from "./index";

function config(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table);
}

function sqlText(value: Parameters<PgDialect["sqlToQuery"]>[0]): string {
  return new PgDialect().sqlToQuery(value).sql;
}

describe("AstroDiary PostgreSQL source schema", () => {
  it("owns every canonical aggregate and immutable evidence table explicitly", () => {
    expect(
      [
        astroDiaryJournals,
        astroDiaryCycles,
        astroDiaryCycleOpeningAllowanceFacts,
        astroDiaryResponseObligations,
        astroDiaryResponseObligationWeekdays,
        astroDiaryTimelineItems,
        astroDiaryTimelineItemRevisions,
        astroDiaryTimelineRevisionAttachments,
        astroDiaryDrafts,
        astroDiaryDraftVersionFacts,
        astroDiaryDraftAttachments,
        astroDiaryMediaAuthorities,
        astroDiaryEntryAttachments,
        astroDiaryMediaAccessRevocations,
        astroDiaryItemReadAccessRevocations,
        astroDiaryContextSnapshots,
        astroDiaryContextDisplays,
        astroDiaryContextDisplayTransits,
        astroDiaryContextDisplayPersonalHighlights,
        astroDiaryContextInvalidations,
        astroDiaryReadCursors,
        astroDiaryEvents,
        astroDiaryRealtimeEvents,
        astroDiaryEventDeliveries,
        astroDiaryAiCommands,
        astroDiaryAiAttempts,
        astroDiaryAiDrafts,
        astroDiaryExportCommands,
        astroDiaryDerivativeCommands,
        astroDiaryErasureCommands,
        astroDiaryCascadeCommands,
        astroDiaryCascadeTargets,
        astroDiaryCascadeReceipts,
        astroDiaryErasureDecisionFacts,
        astroDiaryCommandReceipts,
        astroDiaryCommandPreconditions,
        astroDiaryCommandEventReceipts,
        astroDiaryEventApplicationReceipts
      ].map((table) => config(table).name)
    ).toEqual([
      "astro_diary_journals",
      "astro_diary_cycles",
      "astro_diary_cycle_opening_allowance_facts",
      "astro_diary_response_obligations",
      "astro_diary_response_obligation_weekdays",
      "astro_diary_timeline_items",
      "astro_diary_timeline_item_revisions",
      "astro_diary_timeline_revision_attachments",
      "astro_diary_drafts",
      "astro_diary_draft_version_facts",
      "astro_diary_draft_attachments",
      "astro_diary_media_authorities",
      "astro_diary_entry_attachments",
      "astro_diary_media_access_revocations",
      "astro_diary_item_read_access_revocations",
      "astro_diary_context_snapshots",
      "astro_diary_context_displays",
      "astro_diary_context_display_transits",
      "astro_diary_context_display_personal_highlights",
      "astro_diary_context_invalidations",
      "astro_diary_read_cursors",
      "astro_diary_events",
      "astro_diary_realtime_events",
      "astro_diary_event_deliveries",
      "astro_diary_ai_commands",
      "astro_diary_ai_attempts",
      "astro_diary_ai_drafts",
      "astro_diary_export_commands",
      "astro_diary_derivative_commands",
      "astro_diary_erasure_commands",
      "astro_diary_cascade_commands",
      "astro_diary_cascade_targets",
      "astro_diary_cascade_receipts",
      "astro_diary_erasure_decision_facts",
      "astro_diary_command_receipts",
      "astro_diary_command_preconditions",
      "astro_diary_command_event_receipts",
      "astro_diary_event_application_receipts"
    ]);
  });

  it("enforces one current journal, one open cycle, exact lifecycle evidence and local bounds", () => {
    const journal = config(astroDiaryJournals);
    const cycle = config(astroDiaryCycles);
    const openingAllowanceFact = config(astroDiaryCycleOpeningAllowanceFacts);
    const obligation = config(astroDiaryResponseObligations);

    expect(journal.indexes.map(({ config }) => config.name)).toContain(
      "astro_diary_journals_one_current_per_relationship"
    );
    expect(cycle.indexes.map(({ config }) => config.name)).toContain(
      "astro_diary_cycles_one_open_per_journal"
    );
    expect(cycle.checks.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "astro_diary_cycles_state_evidence_check",
        "astro_diary_cycles_prompt_window_check",
        "astro_diary_cycles_time_order_check",
        "astro_diary_cycles_version_check"
      ])
    );
    expect(openingAllowanceFact.columns.map(({ name }) => name)).toEqual([
      "cycle_id",
      "journal_id",
      "opening_period_id",
      "opening_allowance_reservation_id",
      "opening_allowance_consumption_id",
      "recorded_at"
    ]);
    expect(obligation.checks.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "astro_diary_response_obligations_state_evidence_check",
        "astro_diary_response_obligations_due_evidence_check",
        "astro_diary_response_obligations_version_check"
      ])
    );
  });

  it("stores a normalized immutable revision and attachment set beside the current item head", () => {
    const item = config(astroDiaryTimelineItems);
    const revision = config(astroDiaryTimelineItemRevisions);
    const revisionAttachment = config(astroDiaryTimelineRevisionAttachments);

    expect(item.columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "journal_id",
        "cycle_id",
        "current_revision",
        "cursor",
        "kind",
        "author_role",
        "author_user_id",
        "body",
        "mood_id",
        "context_status",
        "corrects_item_id",
        "original_kind",
        "tombstone_reason"
      ])
    );
    expect(revision.columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining(["item_id", "revision", "source_digest", "body"])
    );
    expect(revisionAttachment.columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining(["item_id", "revision", "ordinal", "media_id"])
    );
    expect(item.columns.find(({ name }) => name === "cursor")?.hasDefault).toBe(false);
    expect(item.columns.find(({ name }) => name === "cursor")?.generatedIdentity).toBeUndefined();
    expect(
      config(astroDiaryRealtimeEvents).columns.find(({ name }) => name === "event_id")
        ?.generatedIdentity?.type
    ).toBe("always");
  });

  it("keeps realtime and command result envelopes IDs-only and body-free", () => {
    const realtimeColumns = config(astroDiaryRealtimeEvents).columns.map(({ name }) => name);
    const commandColumns = config(astroDiaryCommandReceipts).columns.map(({ name }) => name);

    expect(realtimeColumns).toEqual([
      "event_id",
      "source_event_id",
      "type",
      "journal_id",
      "cycle_id",
      "item_id",
      "obligation_id",
      "context_id",
      "command_id",
      "occurred_at"
    ]);
    expect(realtimeColumns).not.toEqual(
      expect.arrayContaining([
        "body",
        "mood_id",
        "payload",
        "birth_data",
        "prompt",
        "event_type",
        "schema_version",
        "journal_epoch_id",
        "period_id",
        "response_item_id"
      ])
    );
    const eventIdColumn = config(astroDiaryRealtimeEvents).columns.find(
      ({ name }) => name === "event_id"
    );
    expect(eventIdColumn?.getSQLType()).toBe("bigint");
    expect(eventIdColumn?.mapFromDriverValue("9223372036854775807")).toBe(
      9_223_372_036_854_775_807n
    );
    expect(
      sqlText(
        config(astroDiaryRealtimeEvents).checks.find(
          ({ name }) => name === "astro_diary_realtime_events_ids_only_shape_check"
        )!.value
      )
    ).toContain("ai.updated");
    expect(commandColumns).not.toEqual(expect.arrayContaining(["request", "write_set", "body"]));
    expect(commandColumns).toEqual(
      expect.arrayContaining([
        "result_resource_type",
        "result_resource_id",
        "result_resource_version"
      ])
    );
    expect(config(astroDiaryCommandReceipts).foreignKeys.map((key) => key.getName())).toContain(
      "astro_diary_command_receipts_draft_result_fact_fk"
    );
    expect(config(astroDiaryDraftVersionFacts).checks.map(({ name }) => name)).toContain(
      "astro_diary_draft_version_facts_version_check"
    );
    expect(config(astroDiaryCommandPreconditions).columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining(["aggregate", "aggregate_id", "expected_version"])
    );
    expect(config(astroDiaryCommandEventReceipts).columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining(["event_id"])
    );
    expect(config(astroDiaryCommandReceipts).checks.map(({ name }) => name)).toContain(
      "astro_diary_command_receipts_idempotency_key_check"
    );
    expect(config(astroDiaryCommandReceipts).checks.map(({ name }) => name)).toContain(
      "astro_diary_command_receipts_result_resource_check"
    );
  });

  it("permits only one current draft per participant purpose scope", () => {
    const purpose = config(astroDiaryDrafts).uniqueConstraints.find(
      ({ name }) => name === "astro_diary_drafts_author_purpose_unique"
    );
    expect(purpose?.columns.map(({ name }) => name)).toEqual([
      "journal_id",
      "author_user_id",
      "kind",
      "cycle_id",
      "corrects_item_id"
    ]);
    expect(purpose?.nullsNotDistinct).toBe(true);
  });

  it("uses no JSON authority column in the complete AstroDiary contour", () => {
    const tables = [
      astroDiaryJournals,
      astroDiaryCycles,
      astroDiaryResponseObligations,
      astroDiaryTimelineItems,
      astroDiaryTimelineItemRevisions,
      astroDiaryDrafts,
      astroDiaryDraftVersionFacts,
      astroDiaryContextSnapshots,
      astroDiaryContextDisplays,
      astroDiaryContextDisplayTransits,
      astroDiaryContextDisplayPersonalHighlights,
      astroDiaryRealtimeEvents,
      astroDiaryAiCommands,
      astroDiaryAiAttempts,
      astroDiaryAiDrafts,
      astroDiaryExportCommands,
      astroDiaryDerivativeCommands,
      astroDiaryErasureCommands,
      astroDiaryCommandReceipts,
      astroDiaryEventApplicationReceipts
    ];
    for (const table of tables) {
      for (const column of config(table).columns) {
        expect(
          column.getSQLType().toLowerCase(),
          `${config(table).name}.${column.name}`
        ).not.toContain("json");
      }
    }
  });

  it("persists typed immutable context display evidence bound to a snapshot version", () => {
    const display = config(astroDiaryContextDisplays);
    const transit = config(astroDiaryContextDisplayTransits);
    const personalHighlight = config(astroDiaryContextDisplayPersonalHighlights);

    expect(display.columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "context_id",
        "context_version",
        "journal_id",
        "source_context_digest",
        "lunar_phase_id",
        "moon_sign",
        "birth_profile_revision"
      ])
    );
    expect(transit.columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "context_id",
        "context_version",
        "journal_id",
        "ordinal",
        "transit_point",
        "natal_point",
        "aspect",
        "sign",
        "applying"
      ])
    );
    expect(personalHighlight.columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "context_id",
        "context_version",
        "journal_id",
        "ordinal",
        "transit_point",
        "natal_point",
        "aspect",
        "applying"
      ])
    );
    expect(display.foreignKeys.map((foreignKey) => foreignKey.getName())).toContain(
      "astro_diary_context_displays_snapshot_version_fk"
    );
    expect(
      sqlText(
        display.checks.find(
          ({ name }) => name === "astro_diary_context_displays_moon_sign_check"
        )!.value
      )
    ).toContain("libra");
  });

  it("separates immutable canonical events from SSE projections and owns per-consumer delivery", () => {
    expect(config(astroDiaryEvents).columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining(["event_type", "event_digest"])
    );
    expect(config(astroDiaryEventDeliveries).columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining(["event_id", "consumer", "claim_fence", "quarantined_at"])
    );
    expect(astroDiarySchema).toHaveProperty("astroDiaryEvents", astroDiaryEvents);
    expect(astroDiarySchema).toHaveProperty(
      "astroDiaryEventDeliveries",
      astroDiaryEventDeliveries
    );
    const applicationReceipt = config(astroDiaryEventApplicationReceipts);
    expect(applicationReceipt.foreignKeys.map((foreignKey) => foreignKey.getName())).toContain(
      "astro_diary_event_application_receipts_source_event_fk"
    );
    expect(applicationReceipt.checks.map(({ name }) => name)).toContain(
      "astro_diary_event_application_receipts_consumer_check"
    );
  });

  it("persists fenced retry and quarantine authority for every asynchronous command", () => {
    for (const table of [
      astroDiaryAiCommands,
      astroDiaryExportCommands,
      astroDiaryDerivativeCommands,
      astroDiaryErasureCommands,
      astroDiaryCascadeCommands
    ]) {
      const tableConfig = config(table);
      expect(tableConfig.columns.map(({ name }) => name, tableConfig.name)).toEqual(
        expect.arrayContaining([
          "attempts",
          "max_attempts",
          "claim_fence",
          "lease_owner",
          "lease_expires_at",
          "next_attempt_at",
          "last_failure_code",
          "quarantined_at",
          "quarantine_reason_code"
        ])
      );
      expect(tableConfig.checks.map(({ name }) => name), tableConfig.name).toContain(
        `${tableConfig.name}_work_authority_check`
      );
    }
  });

  it("binds exact media ownership, private purpose/readiness and same-journal identities", () => {
    const authority = config(astroDiaryMediaAuthorities);
    expect(authority.foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "astro_diary_media_authorities_journal_id_astro_diary_journals_id_fk",
        "astro_diary_media_authorities_media_owner_fk"
      ])
    );
    expect(authority.checks.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "astro_diary_media_authorities_purpose_check",
        "astro_diary_media_authorities_private_check",
        "astro_diary_media_authorities_state_check"
      ])
    );
    const draftAttachment = config(astroDiaryDraftAttachments);
    expect(draftAttachment.foreignKeys.map((key) => key.getName())).toContain(
      "astro_diary_draft_attachments_media_authority_fk"
    );
    const attachment = config(astroDiaryEntryAttachments);
    expect(attachment.foreignKeys.map((key) => key.getName())).toContain(
      "astro_diary_entry_attachments_media_authority_fk"
    );
    expect(attachment.columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "media_id",
        "journal_id",
        "item_id",
        "owner_user_id",
        "purpose",
        "state",
        "bound_at",
        "released_at"
      ])
    );
    expect(attachment.checks.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "astro_diary_entry_attachments_purpose_check",
        "astro_diary_entry_attachments_state_check"
      ])
    );
    expect(config(astroDiaryMediaAuthorities).uniqueConstraints.map(({ name }) => name)).toContain(
      "astro_diary_media_authorities_media_journal_unique"
    );
    expect(
      config(astroDiaryJournalMediaAccessRevocations).foreignKeys.map((key) => key.getName())
    ).toContain("astro_diary_journal_media_access_revocations_authority_fk");

    const exportCommand = config(astroDiaryExportCommands);
    expect(exportCommand.columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "source_journal_version",
        "locale",
        "artifact_media_id",
        "artifact_owner_user_id",
        "created_at",
        "updated_at"
      ])
    );
    expect(exportCommand.columns.map(({ name }) => name)).not.toEqual(
      expect.arrayContaining(["source_cursor", "output_media_id", "requested_at", "completed_at"])
    );
    expect(exportCommand.foreignKeys.map((foreignKey) => foreignKey.getName())).toContain(
      "astro_diary_export_commands_artifact_media_owner_fk"
    );
    const exportStatusCheck = sqlText(
      exportCommand.checks.find(({ name }) => name === "astro_diary_export_commands_state_check")!
        .value
    );
    expect(exportStatusCheck).not.toContain("'quarantined'");
    expect(exportStatusCheck).toContain("'failed'");
  });

  it("renders every strict check without unresolved identifiers", () => {
    const checks = [
      ...config(astroDiaryCycles).checks,
      ...config(astroDiaryTimelineItems).checks,
      ...config(astroDiaryTimelineItemRevisions).checks,
      ...config(astroDiaryContextSnapshots).checks,
      ...config(astroDiaryRealtimeEvents).checks,
      ...config(astroDiaryAiCommands).checks,
      ...config(astroDiaryErasureCommands).checks
    ];
    expect(checks.length).toBeGreaterThan(20);
    for (const check of checks) expect(sqlText(check.value)).not.toContain("undefined");
  });
});
