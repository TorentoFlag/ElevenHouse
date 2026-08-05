import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { bookingLifecycleEventIntegritySql } from "../src/schema/scheduling/booking-lifecycle-events.schema";

const extensionStatement = "CREATE EXTENSION IF NOT EXISTS btree_gist;";
const exclusionConstraintName = "schedule_reservations_active_owner_range_exclude";
const statementBreakpoint = "--> statement-breakpoint";
const exclusionStatement = `ALTER TABLE "schedule_reservations"
  ADD CONSTRAINT "${exclusionConstraintName}"
  EXCLUDE USING gist (
    "owner_user_id" WITH =,
    tstzrange("occupied_start_at", "occupied_end_at", '[)') WITH &&
  ) WHERE ("lifecycle" = 'active');`;
const bookingLifecycleIntegrityBegin = "-- ElevenHouse booking lifecycle integrity objects: begin";
const bookingLifecycleIntegrityEnd = "-- ElevenHouse booking lifecycle integrity objects: end";
const bookingLifecycleImmutableTrigger = "booking_lifecycle_events_immutable";
const bookingLifecycleNoTruncateTrigger = "booking_lifecycle_events_no_truncate";
const bookingLifecycleAggregateTrigger = "booking_lifecycle_events_aggregate_consistency";
const bookingLifecycleHistoryTrigger = "bookings_lifecycle_history_consistency";
const bookingOwnerUniqueConstraint = 'CONSTRAINT "bookings_id_owner_unique"';
const bookingLifecycleOwnerForeignKey = 'CONSTRAINT "booking_lifecycle_events_booking_owner_fk"';
const bookingOwnerUniqueAlterStatement =
  'ALTER TABLE "bookings" ADD CONSTRAINT "bookings_id_owner_unique" UNIQUE("id","owner_user_id");';
const bookingLifecycleIntegrityBlock = `${bookingLifecycleIntegrityBegin}
${bookingLifecycleEventIntegritySql}
${bookingLifecycleIntegrityEnd}`;

export async function augmentSchedulingBaseline(migrationPath: string): Promise<void> {
  const source = await readFile(migrationPath, "utf8");
  assertReservationShape(source);
  assertBookingLifecycleEventShape(source);
  const dependencyOrderedSource = normalizeBookingLifecycleDependencyOrder(source);
  const normalizedSource = normalizeBookingLifecycleIntegrityBlock(dependencyOrderedSource);

  const extensionCount = countOccurrences(normalizedSource, extensionStatement);
  const constraintCount = countOccurrences(normalizedSource, exclusionConstraintName);
  if (extensionCount > 1)
    throw new Error("Scheduling baseline contains duplicate btree_gist setup");
  if (constraintCount > 1) {
    throw new Error("Scheduling baseline contains duplicate active-range exclusion constraints");
  }
  assertBookingLifecycleIntegrityBlock(normalizedSource);

  let augmented = normalizedSource;
  if (extensionCount === 0) {
    augmented = `${extensionStatement}\n${statementBreakpoint}\n${augmented}`;
  }
  if (constraintCount === 0) {
    augmented = `${augmented.trimEnd()}\n${statementBreakpoint}\n${exclusionStatement}\n`;
  }
  if (countOccurrences(normalizedSource, bookingLifecycleIntegrityBegin) === 0) {
    augmented = `${augmented.trimEnd()}\n${statementBreakpoint}\n${bookingLifecycleIntegrityBlock}\n`;
  }

  if (augmented !== source) await writeFile(migrationPath, augmented, "utf8");
}

function normalizeBookingLifecycleDependencyOrder(source: string): string {
  const uniqueCount = countOccurrences(source, bookingOwnerUniqueConstraint);
  const foreignKeyCount = countOccurrences(source, bookingLifecycleOwnerForeignKey);
  if (uniqueCount !== 1 || foreignKeyCount !== 1) {
    throw new Error(
      "Cannot augment scheduling baseline: expected one booking owner unique constraint and lifecycle foreign key"
    );
  }
  const uniqueIndex = source.indexOf(bookingOwnerUniqueConstraint);
  const foreignKeyIndex = source.indexOf(bookingLifecycleOwnerForeignKey);
  if (uniqueIndex < foreignKeyIndex) return source;

  const statementStart = source.indexOf(bookingOwnerUniqueAlterStatement);
  if (statementStart === -1) {
    throw new Error(
      "Cannot augment scheduling baseline: late booking owner unique constraint is not a generated ALTER statement"
    );
  }
  let statementEnd = statementStart + bookingOwnerUniqueAlterStatement.length;
  const breakpointMatch = source
    .slice(statementEnd)
    .match(/^[ \t\r\n]*--> statement-breakpoint[ \t]*(?:\r?\n)?/);
  if (breakpointMatch) statementEnd += breakpointMatch[0].length;

  const withoutLateUnique = `${source.slice(0, statementStart)}${source.slice(statementEnd)}`;
  const insertionPoint = withoutLateUnique.indexOf(bookingLifecycleOwnerForeignKey);
  if (insertionPoint === -1) {
    throw new Error("Cannot augment scheduling baseline: lifecycle foreign key disappeared");
  }
  const alterStatementStart = withoutLateUnique.lastIndexOf(
    'ALTER TABLE "booking_lifecycle_events"',
    insertionPoint
  );
  if (alterStatementStart === -1) {
    throw new Error(
      "Cannot augment scheduling baseline: lifecycle foreign key statement is invalid"
    );
  }
  return `${withoutLateUnique.slice(0, alterStatementStart)}${bookingOwnerUniqueAlterStatement}${statementBreakpoint}\n${withoutLateUnique.slice(alterStatementStart)}`;
}

function assertBookingLifecycleEventShape(source: string): void {
  const requiredFragments = [
    'CREATE TABLE "booking_lifecycle_events"',
    '"booking_id" uuid NOT NULL',
    '"revision" integer NOT NULL',
    '"canonical_digest" varchar(71) NOT NULL'
  ];
  for (const fragment of requiredFragments) {
    if (!source.includes(fragment)) {
      throw new Error(
        `Cannot augment scheduling baseline: missing booking_lifecycle_events table shape (${fragment})`
      );
    }
  }
}

function assertBookingLifecycleIntegrityBlock(source: string): void {
  const beginCount = countOccurrences(source, bookingLifecycleIntegrityBegin);
  const endCount = countOccurrences(source, bookingLifecycleIntegrityEnd);
  if (beginCount > 1 || endCount > 1) {
    throw new Error("Scheduling baseline contains duplicate booking lifecycle integrity blocks");
  }
  if (beginCount !== endCount) {
    throw new Error("Scheduling baseline contains an incomplete booking lifecycle integrity block");
  }
  const unmanagedSource =
    beginCount === 0 ? source : source.replace(extractBookingLifecycleIntegrityBlock(source), "");
  if (
    unmanagedSource.includes(`CREATE TRIGGER "${bookingLifecycleImmutableTrigger}"`) ||
    unmanagedSource.includes(`CREATE TRIGGER "${bookingLifecycleNoTruncateTrigger}"`) ||
    unmanagedSource.includes(`CREATE CONSTRAINT TRIGGER "${bookingLifecycleAggregateTrigger}"`) ||
    unmanagedSource.includes(`CREATE CONSTRAINT TRIGGER "${bookingLifecycleHistoryTrigger}"`)
  ) {
    throw new Error("Scheduling baseline has unmanaged booking lifecycle integrity triggers");
  }
}

function normalizeBookingLifecycleIntegrityBlock(source: string): string {
  assertBookingLifecycleIntegrityBlock(source);
  if (!source.includes(bookingLifecycleIntegrityBegin)) return source;
  return source.replace(
    extractBookingLifecycleIntegrityBlock(source),
    bookingLifecycleIntegrityBlock
  );
}

function extractBookingLifecycleIntegrityBlock(source: string): string {
  const beginIndex = source.indexOf(bookingLifecycleIntegrityBegin);
  const endIndex = source.indexOf(bookingLifecycleIntegrityEnd);
  if (beginIndex === -1 || endIndex < beginIndex) {
    throw new Error("Scheduling baseline contains an incomplete booking lifecycle integrity block");
  }
  return source.slice(beginIndex, endIndex + bookingLifecycleIntegrityEnd.length);
}

function assertReservationShape(source: string): void {
  const requiredFragments = [
    'CREATE TABLE "schedule_reservations"',
    '"owner_user_id" uuid NOT NULL',
    '"lifecycle" text',
    '"occupied_start_at" timestamp with time zone NOT NULL',
    '"occupied_end_at" timestamp with time zone NOT NULL'
  ];
  for (const fragment of requiredFragments) {
    if (!source.includes(fragment)) {
      throw new Error(
        `Cannot augment scheduling baseline: missing schedule_reservations table shape (${fragment})`
      );
    }
  }
}

function countOccurrences(source: string, fragment: string): number {
  return source.split(fragment).length - 1;
}

async function findCurrentBaseline(): Promise<string> {
  const migrationDirectory = join(__dirname, "../drizzle");
  const baselines = (await readdir(migrationDirectory))
    .filter((entry) => /^0000_.+\.sql$/.test(entry))
    .sort();
  if (baselines.length !== 1) {
    throw new Error(`Expected exactly one generated 0000 baseline, found ${baselines.length}`);
  }
  return join(migrationDirectory, baselines[0]!);
}

async function main(): Promise<void> {
  const migrationPath = await findCurrentBaseline();
  await augmentSchedulingBaseline(migrationPath);
  console.log(`Scheduling constraints verified in ${migrationPath}`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
