import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { augmentSchedulingBaseline } from "./augment-scheduling-baseline";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("scheduling baseline augmenter", () => {
  it("adds scheduling exclusion and immutable booking lifecycle history exactly once", async () => {
    const migrationPath = await createFixture(`
CREATE TABLE "schedule_reservations" (
  "owner_user_id" uuid NOT NULL,
  "lifecycle" text NOT NULL,
  "occupied_start_at" timestamp with time zone NOT NULL,
  "occupied_end_at" timestamp with time zone NOT NULL
);
CREATE TABLE "bookings" (
  "id" uuid NOT NULL,
  "owner_user_id" uuid NOT NULL,
  CONSTRAINT "bookings_id_owner_unique" UNIQUE("id","owner_user_id")
);
CREATE TABLE "booking_lifecycle_events" (
  "id" uuid PRIMARY KEY NOT NULL,
  "booking_id" uuid NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "revision" integer NOT NULL,
  "canonical_digest" varchar(71) NOT NULL
);
ALTER TABLE "booking_lifecycle_events" ADD CONSTRAINT "booking_lifecycle_events_booking_owner_fk" FOREIGN KEY ("booking_id","owner_user_id") REFERENCES "public"."bookings"("id","owner_user_id");
`);

    await augmentSchedulingBaseline(migrationPath);
    await augmentSchedulingBaseline(migrationPath);

    const migration = await readFile(migrationPath, "utf8");
    expect(migration.match(/CREATE EXTENSION IF NOT EXISTS btree_gist;/g)).toHaveLength(1);
    expect(migration.match(/schedule_reservations_active_owner_range_exclude/g)).toHaveLength(1);
    expect(migration.match(/booking_lifecycle_events_immutable/g)).toHaveLength(1);
    expect(migration.match(/booking_lifecycle_events_no_truncate/g)).toHaveLength(1);
    expect(migration.match(/booking_lifecycle_events_aggregate_consistency/g)).toHaveLength(1);
    expect(
      migration.match(/CREATE CONSTRAINT TRIGGER "bookings_lifecycle_history_consistency"/g)
    ).toHaveLength(1);
  });

  it("fails closed when the generated reservation table is absent", async () => {
    const migrationPath = await createFixture('CREATE TABLE "users" ("id" uuid PRIMARY KEY);\n');

    await expect(augmentSchedulingBaseline(migrationPath)).rejects.toThrow(
      "schedule_reservations table"
    );
  });

  it("fails closed when the booking lifecycle event table is absent", async () => {
    const migrationPath = await createFixture(`
CREATE TABLE "schedule_reservations" (
  "owner_user_id" uuid NOT NULL,
  "lifecycle" text NOT NULL,
  "occupied_start_at" timestamp with time zone NOT NULL,
  "occupied_end_at" timestamp with time zone NOT NULL
);
`);

    await expect(augmentSchedulingBaseline(migrationPath)).rejects.toThrow(
      "booking_lifecycle_events table"
    );
  });

  it("orders the booking owner unique constraint before the lifecycle foreign key", async () => {
    const migrationPath = await createFixture(`
CREATE TABLE "schedule_reservations" (
  "owner_user_id" uuid NOT NULL,
  "lifecycle" text NOT NULL,
  "occupied_start_at" timestamp with time zone NOT NULL,
  "occupied_end_at" timestamp with time zone NOT NULL
);
CREATE TABLE "bookings" (
  "id" uuid NOT NULL,
  "owner_user_id" uuid NOT NULL
);
CREATE TABLE "booking_lifecycle_events" (
  "id" uuid PRIMARY KEY NOT NULL,
  "booking_id" uuid NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "revision" integer NOT NULL,
  "canonical_digest" varchar(71) NOT NULL
);
ALTER TABLE "booking_lifecycle_events" ADD CONSTRAINT "booking_lifecycle_events_booking_owner_fk" FOREIGN KEY ("booking_id","owner_user_id") REFERENCES "public"."bookings"("id","owner_user_id");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_id_owner_unique" UNIQUE("id","owner_user_id");--> statement-breakpoint
`);

    await augmentSchedulingBaseline(migrationPath);

    const migration = await readFile(migrationPath, "utf8");
    expect(migration.indexOf('CONSTRAINT "bookings_id_owner_unique"')).toBeLessThan(
      migration.indexOf('CONSTRAINT "booking_lifecycle_events_booking_owner_fk"')
    );
  });

  it("refreshes the complete managed lifecycle block without duplicating it", async () => {
    const migrationPath = await createFixture(`
CREATE TABLE "schedule_reservations" (
  "owner_user_id" uuid NOT NULL,
  "lifecycle" text NOT NULL,
  "occupied_start_at" timestamp with time zone NOT NULL,
  "occupied_end_at" timestamp with time zone NOT NULL
);
CREATE TABLE "bookings" (
  "id" uuid NOT NULL,
  "owner_user_id" uuid NOT NULL,
  CONSTRAINT "bookings_id_owner_unique" UNIQUE("id","owner_user_id")
);
CREATE TABLE "booking_lifecycle_events" (
  "id" uuid PRIMARY KEY NOT NULL,
  "booking_id" uuid NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "revision" integer NOT NULL,
  "canonical_digest" varchar(71) NOT NULL
);
ALTER TABLE "booking_lifecycle_events" ADD CONSTRAINT "booking_lifecycle_events_booking_owner_fk" FOREIGN KEY ("booking_id","owner_user_id") REFERENCES "public"."bookings"("id","owner_user_id");
-- ElevenHouse booking lifecycle integrity objects: begin
CREATE FUNCTION old_managed_guard() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NULL; END';
-- ElevenHouse booking lifecycle integrity objects: end
`);

    await augmentSchedulingBaseline(migrationPath);

    const migration = await readFile(migrationPath, "utf8");
    expect(migration).not.toContain("old_managed_guard");
    expect(
      migration.match(/-- ElevenHouse booking lifecycle integrity objects: begin/g)
    ).toHaveLength(1);
    expect(
      migration.match(/CREATE CONSTRAINT TRIGGER "bookings_lifecycle_history_consistency"/g)
    ).toHaveLength(1);
  });
});

async function createFixture(contents: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "elevenhouse-scheduling-baseline-"));
  temporaryDirectories.push(directory);
  const migrationPath = join(directory, "0000_fixture.sql");
  await writeFile(migrationPath, contents.trimStart(), "utf8");
  return migrationPath;
}
