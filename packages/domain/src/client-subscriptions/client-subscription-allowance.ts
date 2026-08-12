import { Temporal } from "@js-temporal/polyfill";
import { sha256CanonicalJson } from "../calculations/canonical-json";

export type ClientSubscriptionAllowanceCommand =
  | Readonly<{ operation: "reserve"; reservationId: string; occurredAt: string }>
  | Readonly<{ operation: "consume_available"; consumptionId: string; occurredAt: string }>
  | Readonly<{
      operation: "consume_reserved" | "release_reserved" | "forfeit_reserved";
      reservationId: string;
      occurredAt: string;
    }>
  | Readonly<{ operation: "expire_available"; occurredAt: string }>;

export type ClientSubscriptionAllowanceReservation = {
  readonly reservationId: string;
  readonly state: "reserved" | "consumed" | "released";
};

export type ClientSubscriptionAllowanceReceipt = {
  readonly idempotencyKey: string;
  readonly requestHash: `sha256:${string}`;
  readonly operation: ClientSubscriptionAllowanceCommand["operation"];
  readonly command: ClientSubscriptionAllowanceCommand;
  readonly resultVersion: number;
};

export type ClientSubscriptionPeriodAllowance = {
  readonly periodId: string;
  readonly endsAt: string;
  readonly total: number;
  readonly available: number;
  readonly reserved: number;
  readonly consumed: number;
  readonly released: number;
  readonly version: number;
  readonly reservations: readonly ClientSubscriptionAllowanceReservation[];
  readonly receipts: readonly ClientSubscriptionAllowanceReceipt[];
};

export type ClientSubscriptionAllowanceCommandOutcome =
  | {
      readonly outcome: "applied" | "idempotent";
      readonly allowance: ClientSubscriptionPeriodAllowance;
      readonly receipt?: ClientSubscriptionAllowanceReceipt;
    }
  | {
      readonly outcome: "version_conflict";
      readonly expectedVersion: number;
      readonly currentVersion: number;
    }
  | { readonly outcome: "idempotency_conflict" }
  | { readonly outcome: "allowance_exhausted" }
  | { readonly outcome: "period_ended" }
  | { readonly outcome: "paid_access_not_ended" }
  | { readonly outcome: "reservation_already_exists" }
  | { readonly outcome: "reservation_not_found" }
  | { readonly outcome: "reservation_not_active" };

export function hashClientSubscriptionAllowanceCommand(input: {
  readonly periodId: string;
  readonly expectedVersion: number;
  readonly command: ClientSubscriptionAllowanceCommand;
}): `sha256:${string}` {
  return sha256CanonicalJson(input);
}

export function normalizeClientSubscriptionAllowanceCommand(
  command: ClientSubscriptionAllowanceCommand
): ClientSubscriptionAllowanceCommand {
  return { ...command, occurredAt: Temporal.Instant.from(command.occurredAt).toString() };
}

export function createPeriodAllowance(input: {
  readonly periodId: string;
  readonly total: number;
  readonly endsAt: string;
}): ClientSubscriptionPeriodAllowance {
  if (!Number.isInteger(input.total) || input.total < 0) {
    throw new TypeError("Allowance total must be a nonnegative integer");
  }
  return {
    periodId: input.periodId,
    endsAt: Temporal.Instant.from(input.endsAt).toString(),
    total: input.total,
    available: input.total,
    reserved: 0,
    consumed: 0,
    released: 0,
    version: 1,
    reservations: [],
    receipts: []
  };
}

export function reservePeriodAllowance(
  allowance: ClientSubscriptionPeriodAllowance,
  input: {
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
    readonly reservationId: string;
    readonly now: string;
  }
): ClientSubscriptionAllowanceCommandOutcome {
  const command = normalizeClientSubscriptionAllowanceCommand({
    operation: "reserve",
    reservationId: input.reservationId,
    occurredAt: input.now
  });
  return executeCommand(allowance, {
    expectedVersion: input.expectedVersion,
    idempotencyKey: input.idempotencyKey,
    command,
    apply: () => {
      if (
        allowance.reservations.some(
          (reservation) => reservation.reservationId === input.reservationId
        )
      ) {
        return { outcome: "reservation_already_exists" };
      }
      if (isPeriodEnded(allowance, command.occurredAt)) return { outcome: "period_ended" };
      if (allowance.available === 0) return { outcome: "allowance_exhausted" };
      return {
        allowance: {
          ...allowance,
          available: allowance.available - 1,
          reserved: allowance.reserved + 1,
          reservations: [
            ...allowance.reservations,
            { reservationId: input.reservationId, state: "reserved" as const }
          ]
        }
      };
    }
  });
}

export function consumeAvailableAllowance(
  allowance: ClientSubscriptionPeriodAllowance,
  input: {
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
    readonly consumptionId: string;
    readonly now: string;
  }
): ClientSubscriptionAllowanceCommandOutcome {
  const command = normalizeClientSubscriptionAllowanceCommand({
    operation: "consume_available",
    consumptionId: input.consumptionId,
    occurredAt: input.now
  });
  return executeCommand(allowance, {
    expectedVersion: input.expectedVersion,
    idempotencyKey: input.idempotencyKey,
    command,
    apply: () => {
      if (isPeriodEnded(allowance, command.occurredAt)) return { outcome: "period_ended" };
      if (allowance.available === 0) return { outcome: "allowance_exhausted" };
      return {
        allowance: {
          ...allowance,
          available: allowance.available - 1,
          consumed: allowance.consumed + 1
        }
      };
    }
  });
}

export function consumeReservedAllowance(
  allowance: ClientSubscriptionPeriodAllowance,
  input: {
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
    readonly reservationId: string;
    readonly now: string;
  }
): ClientSubscriptionAllowanceCommandOutcome {
  return executeReservationCommand(allowance, input, "consume_reserved", (index) => ({
    ...allowance,
    reserved: allowance.reserved - 1,
    consumed: allowance.consumed + 1,
    reservations: replaceReservation(allowance.reservations, index, "consumed")
  }));
}

export function releaseReservedAllowance(
  allowance: ClientSubscriptionPeriodAllowance,
  input: {
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
    readonly reservationId: string;
    readonly now: string;
  }
): ClientSubscriptionAllowanceCommandOutcome {
  return executeReservationCommand(allowance, input, "release_reserved", (index) => {
    const ended = isPeriodEnded(allowance, input.now);
    return {
      ...allowance,
      available: allowance.available + (ended ? 0 : 1),
      reserved: allowance.reserved - 1,
      released: allowance.released + (ended ? 1 : 0),
      reservations: replaceReservation(allowance.reservations, index, "released")
    };
  });
}

export function forfeitReservedAllowance(
  allowance: ClientSubscriptionPeriodAllowance,
  input: {
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
    readonly reservationId: string;
    readonly now: string;
  }
): ClientSubscriptionAllowanceCommandOutcome {
  return executeReservationCommand(allowance, input, "forfeit_reserved", (index) => ({
    ...allowance,
    reserved: allowance.reserved - 1,
    released: allowance.released + 1,
    reservations: replaceReservation(allowance.reservations, index, "released")
  }));
}

export function expirePeriodAllowance(
  allowance: ClientSubscriptionPeriodAllowance,
  input: {
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
    readonly now: string;
  }
): ClientSubscriptionAllowanceCommandOutcome {
  const command = normalizeClientSubscriptionAllowanceCommand({
    operation: "expire_available",
    occurredAt: input.now
  });
  return executeCommand(allowance, {
    expectedVersion: input.expectedVersion,
    idempotencyKey: input.idempotencyKey,
    command,
    apply: () =>
      isPeriodEnded(allowance, command.occurredAt)
        ? {
            allowance: {
              ...allowance,
              available: 0,
              released: allowance.released + allowance.available
            }
          }
        : { outcome: "paid_access_not_ended" }
  });
}

function executeReservationCommand(
  allowance: ClientSubscriptionPeriodAllowance,
  input: {
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
    readonly reservationId: string;
    readonly now: string;
  },
  operation: "consume_reserved" | "release_reserved" | "forfeit_reserved",
  transition: (index: number) => ClientSubscriptionPeriodAllowance
): ClientSubscriptionAllowanceCommandOutcome {
  const command = normalizeClientSubscriptionAllowanceCommand({
    operation,
    reservationId: input.reservationId,
    occurredAt: input.now
  });
  return executeCommand(allowance, {
    expectedVersion: input.expectedVersion,
    idempotencyKey: input.idempotencyKey,
    command,
    apply: () => {
      const index = allowance.reservations.findIndex(
        (reservation) => reservation.reservationId === input.reservationId
      );
      if (index < 0) return { outcome: "reservation_not_found" };
      if (allowance.reservations[index]!.state !== "reserved") {
        return { outcome: "reservation_not_active" };
      }
      return { allowance: transition(index) };
    }
  });
}

function executeCommand(
  allowance: ClientSubscriptionPeriodAllowance,
  input: {
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
    readonly command: ClientSubscriptionAllowanceCommand;
    readonly apply: () =>
      | { readonly allowance: ClientSubscriptionPeriodAllowance }
      | Exclude<ClientSubscriptionAllowanceCommandOutcome, { readonly allowance: unknown }>;
  }
): ClientSubscriptionAllowanceCommandOutcome {
  const requestHash = hashClientSubscriptionAllowanceCommand({
    periodId: allowance.periodId,
    expectedVersion: input.expectedVersion,
    command: input.command
  });
  const prior = allowance.receipts.find(
    (receipt) => receipt.idempotencyKey === input.idempotencyKey
  );
  if (prior) {
    if (prior.requestHash !== requestHash) return { outcome: "idempotency_conflict" };
    return { outcome: "idempotent", allowance, receipt: prior };
  }
  if (allowance.version !== input.expectedVersion)
    return versionConflict(allowance, input.expectedVersion);
  const result = input.apply();
  if (!("allowance" in result)) return result;
  const resultVersion = allowance.version + 1;
  const receipt: ClientSubscriptionAllowanceReceipt = {
    idempotencyKey: input.idempotencyKey,
    requestHash,
    operation: input.command.operation,
    command: input.command,
    resultVersion
  };
  const next = assertAllowanceInvariant({
    ...result.allowance,
    version: resultVersion,
    receipts: [...allowance.receipts, receipt]
  });
  return { outcome: "applied", allowance: next, receipt };
}

function replaceReservation(
  reservations: readonly ClientSubscriptionAllowanceReservation[],
  index: number,
  state: ClientSubscriptionAllowanceReservation["state"]
): readonly ClientSubscriptionAllowanceReservation[] {
  return reservations.map((reservation, currentIndex) =>
    currentIndex === index ? { ...reservation, state } : reservation
  );
}

function isPeriodEnded(allowance: ClientSubscriptionPeriodAllowance, now: string): boolean {
  return (
    Temporal.Instant.compare(Temporal.Instant.from(now), Temporal.Instant.from(allowance.endsAt)) >=
    0
  );
}

function versionConflict(
  allowance: ClientSubscriptionPeriodAllowance,
  expectedVersion: number
): ClientSubscriptionAllowanceCommandOutcome {
  return { outcome: "version_conflict", expectedVersion, currentVersion: allowance.version };
}

function assertAllowanceInvariant(
  allowance: ClientSubscriptionPeriodAllowance
): ClientSubscriptionPeriodAllowance {
  if (
    [
      allowance.total,
      allowance.available,
      allowance.reserved,
      allowance.consumed,
      allowance.released
    ].some((value) => !Number.isInteger(value) || value < 0) ||
    allowance.available + allowance.reserved + allowance.consumed + allowance.released !==
      allowance.total
  ) {
    throw new Error("Client subscription allowance invariant violated");
  }
  return allowance;
}
