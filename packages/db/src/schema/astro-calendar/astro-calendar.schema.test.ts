import { readFileSync } from "node:fs";
import { getTableName } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { astroCalendarEvents, astroCalendarGenerations } from "../index";

const baselineMigrationFile = "packages/db/drizzle/0000_sticky_rictor.sql";

describe("Astro Calendar persistence schema", () => {
  it("exports generation and event read-model tables", () => {
    expect(getTableName(astroCalendarGenerations)).toBe("astro_calendar_generations");
    expect(getTableName(astroCalendarEvents)).toBe("astro_calendar_events");

    expect(Object.keys(getTableColumns(astroCalendarGenerations))).toEqual(
      expect.arrayContaining([
        "ownerUserId",
        "inputFingerprint",
        "status",
        "rangeStart",
        "rangeEnd",
        "timeZone",
        "requestSnapshot",
        "settingsSnapshot",
        "readinessSummary",
        "summary",
        "warnings",
        "provider",
        "generatedAt"
      ])
    );
    expect(Object.keys(getTableColumns(astroCalendarEvents))).toEqual(
      expect.arrayContaining([
        "generationId",
        "ownerUserId",
        "eventId",
        "source",
        "type",
        "startsAt",
        "endsAt",
        "payload",
        "dictionaryCodes"
      ])
    );
  });

  it("defines owner/fingerprint idempotency and event uniqueness", () => {
    const generationConfig = getTableConfig(astroCalendarGenerations);
    const eventConfig = getTableConfig(astroCalendarEvents);

    expect(generationConfig.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "astro_calendar_generations_owner_range_idx",
        "astro_calendar_generations_status_updated_idx",
        "astro_calendar_generations_fingerprint_unique"
      ])
    );
    expect(eventConfig.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "astro_calendar_events_owner_starts_idx",
        "astro_calendar_events_generation_starts_idx",
        "astro_calendar_events_generation_event_unique"
      ])
    );
    expect(generationConfig.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "astro_calendar_generations_status_check",
        "astro_calendar_generations_fingerprint_check",
        "astro_calendar_generations_range_check"
      ])
    );
    expect(eventConfig.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "astro_calendar_events_source_check",
        "astro_calendar_events_type_check",
        "astro_calendar_events_time_precision_check",
        "astro_calendar_events_payload_object_check"
      ])
    );
  });

  it("keeps Astro Calendar DDL in the single current baseline", () => {
    const migration = readFileSync(baselineMigrationFile, "utf8");

    expect(migration).toContain('CREATE TABLE "astro_calendar_generations"');
    expect(migration).toContain('CREATE TABLE "astro_calendar_events"');
    expect(migration).toContain("astro_calendar_generations_fingerprint_unique");
    expect(migration).toContain("astro_calendar_events_generation_event_unique");
    expect(migration).toContain("astro_calendar_generations_range_check");
  });
});
