import { createHash } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { normalizeRequiredString } from "../shared";
import { AvailabilityScheduleNotFoundError } from "./availability-errors";
import type { AvailabilityStore } from "./availability-store";

const manualBlockCreateScope = "calendar.manual-block.create" as const;
const maximumBlockDurationNanoseconds = 366n * 24n * 60n * 60n * 1_000_000_000n;

export type ManualCalendarBlock = {
  readonly id: string;
  readonly reservationId: string;
  readonly ownerUserId: string;
  readonly scheduleId: string;
  readonly title: string;
  readonly state: "active" | "released";
  readonly startAt: string;
  readonly endAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ManualCalendarBlockClaim = {
  readonly ownerUserId: string;
  readonly scheduleId: string;
  readonly title: string;
  readonly startAt: string;
  readonly endAt: string;
};

export type ManualCalendarBlockCommand = {
  readonly actorUserId: string;
  readonly scope: typeof manualBlockCreateScope;
  readonly key: string;
  readonly requestHash: `sha256:${string}`;
  readonly now: string;
  readonly expiresAt: string;
};

export type ManualCalendarBlockCommandStore = {
  readonly executeCreate: (
    command: ManualCalendarBlockCommand,
    createClaim: () => Promise<ManualCalendarBlockClaim>
  ) => Promise<{
    readonly kind: "created" | "replayed";
    readonly block: ManualCalendarBlock;
  }>;
  readonly release: (input: {
    readonly ownerUserId: string;
    readonly blockId: string;
    readonly now: string;
  }) => Promise<ManualCalendarBlock | null>;
};

export class ManualCalendarBlockValidationError extends Error {
  readonly code = "manual_block_validation_error";

  constructor(message: string) {
    super(message);
    this.name = "ManualCalendarBlockValidationError";
  }
}

export class ManualCalendarBlockNotFoundError extends Error {
  readonly code = "manual_block_not_found";

  constructor() {
    super("Manual calendar block was not found");
    this.name = "ManualCalendarBlockNotFoundError";
  }
}

export class ManualCalendarBlockConflictError extends Error {
  readonly code = "slot_no_longer_available";

  constructor() {
    super("Manual calendar block overlaps active schedule occupancy");
    this.name = "ManualCalendarBlockConflictError";
  }
}

export async function createManualCalendarBlock(input: {
  readonly availabilityStore: AvailabilityStore;
  readonly commandStore: ManualCalendarBlockCommandStore;
  readonly ownerUserId: string;
  readonly idempotencyKey: string;
  readonly input: {
    readonly title: string;
    readonly startAt: string;
    readonly endAt: string;
  };
  readonly now: Date;
}): Promise<{ readonly block: ManualCalendarBlock; readonly replayed: boolean }> {
  const ownerUserId = normalizeRequiredString(
    input.ownerUserId,
    "Manual block owner is required"
  );
  const title = normalizeTitle(input.input.title);
  const startAt = normalizeInstant(input.input.startAt, "Manual block start is invalid");
  const endAt = normalizeInstant(input.input.endAt, "Manual block end is invalid");
  validateRange(startAt, endAt);
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const now = input.now.toISOString();
  const requestHash = hashRequest({ ownerUserId, title, startAt, endAt });

  const result = await input.commandStore.executeCreate(
    {
      actorUserId: ownerUserId,
      scope: manualBlockCreateScope,
      key: idempotencyKey,
      requestHash,
      now,
      expiresAt: Temporal.Instant.from(now).add({ hours: 24 }).toString()
    },
    async () => {
      const schedule = await input.availabilityStore.findDefaultByOwner({ ownerUserId });
      if (!schedule) throw new AvailabilityScheduleNotFoundError();
      return { ownerUserId, scheduleId: schedule.id, title, startAt, endAt };
    }
  );

  return { block: result.block, replayed: result.kind === "replayed" };
}

export async function releaseManualCalendarBlock(input: {
  readonly commandStore: ManualCalendarBlockCommandStore;
  readonly ownerUserId: string;
  readonly blockId: string;
  readonly now: Date;
}): Promise<ManualCalendarBlock> {
  const block = await input.commandStore.release({
    ownerUserId: normalizeRequiredString(input.ownerUserId, "Manual block owner is required"),
    blockId: normalizeRequiredString(input.blockId, "Manual block id is required"),
    now: input.now.toISOString()
  });
  if (!block) throw new ManualCalendarBlockNotFoundError();
  return block;
}

function normalizeTitle(value: string): string {
  const title = value.trim();
  if (title.length === 0 || title.length > 120) {
    throw new ManualCalendarBlockValidationError("Manual block title is invalid");
  }
  return title;
}

function normalizeInstant(value: string, message: string): string {
  try {
    return Temporal.Instant.from(value).toString();
  } catch {
    throw new ManualCalendarBlockValidationError(message);
  }
}

function validateRange(startAt: string, endAt: string): void {
  const start = Temporal.Instant.from(startAt);
  const end = Temporal.Instant.from(endAt);
  const duration = end.epochNanoseconds - start.epochNanoseconds;
  if (duration <= 0n || duration > maximumBlockDurationNanoseconds) {
    throw new ManualCalendarBlockValidationError("Manual block range is invalid");
  }
}

function normalizeIdempotencyKey(value: string): string {
  const key = value.trim();
  if (key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new ManualCalendarBlockValidationError("Idempotency key is invalid");
  }
  return key;
}

function hashRequest(input: {
  readonly ownerUserId: string;
  readonly title: string;
  readonly startAt: string;
  readonly endAt: string;
}): `sha256:${string}` {
  const canonical = JSON.stringify([
    manualBlockCreateScope,
    input.ownerUserId,
    input.title,
    input.startAt,
    input.endAt
  ]);
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}
