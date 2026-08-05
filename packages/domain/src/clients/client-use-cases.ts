import { randomUUID } from "node:crypto";
import { inspectChartCivilTime } from "../charts/chart-civil-time";
import { normalizeRequiredString } from "../shared";
import {
  BirthDataValidationError,
  ClientBirthDataRelationshipDeniedError,
  ClientBirthDataRevisionConflictError,
  ClientJoinIntentError
} from "./client-errors";
import type { ClientJoinIntentClaimStore, ClientStore } from "./client-store";
import type {
  AstrologerClientList,
  AstrologerClientListItem,
  ClientAstrologerRelationship,
  ClientBirthData,
  ClientBirthDataInput,
  ClientBirthDataSource,
  ClientBirthTimeDstOccurrence,
  ClientBirthTimePrecision,
  ClientJoinIntentCreated,
  NormalizedClientBirthDataInput
} from "./client-types";

const birthDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const birthTimePattern = /^\d{2}:\d{2}$/;
const countryCodePattern = /^[A-Z]{2}$/;
const birthDataSources: readonly ClientBirthDataSource[] = [
  "client_profile",
  "import",
  "manual"
];
const birthTimePrecisions: readonly ClientBirthTimePrecision[] = [
  "exact",
  "approximate",
  "unknown"
];
const birthTimeDstOccurrences: readonly ClientBirthTimeDstOccurrence[] = ["first", "second"];

export function normalizeClientBirthDataInput(
  input: ClientBirthDataInput
): NormalizedClientBirthDataInput {
  const birthTime = normalizeOptionalToNull(input.birthTime);
  const birthTimePrecision = normalizeBirthTimePrecision(input.birthTimePrecision, birthTime);
  const birthDate = normalizeBirthDate(input.birthDate);
  const birthTimezone = normalizeOptionalToNull(input.birthTimezone);
  const birthTimeDstOccurrence = normalizeRelevantBirthTimeDstOccurrence({
    birthDate,
    birthTime,
    birthTimezone,
    occurrence: normalizeBirthTimeDstOccurrence(input.birthTimeDstOccurrence)
  });
  if (birthTimePrecision === "unknown" && birthTime !== null) {
    throw new BirthDataValidationError("Birth time must be empty when precision is unknown");
  }

  return {
    label: normalizeOptionalToNull(input.label),
    birthDate,
    birthTime: normalizeBirthTime(birthTime),
    birthTimePrecision,
    birthPlaceText: normalizeOptionalToNull(input.birthPlaceText),
    birthCountryCode: normalizeCountryCode(input.birthCountryCode),
    birthCity: normalizeOptionalToNull(input.birthCity),
    birthRegion: normalizeOptionalToNull(input.birthRegion),
    birthTimezone,
    birthTimeDstOccurrence,
    birthLatitude: normalizeCoordinate(input.birthLatitude, -90, 90, "Birth latitude is invalid"),
    birthLongitude: normalizeCoordinate(
      input.birthLongitude,
      -180,
      180,
      "Birth longitude is invalid"
    ),
    source: normalizeBirthDataSource(input.source)
  };
}

function normalizeBirthTimeDstOccurrence(
  value: ClientBirthDataInput["birthTimeDstOccurrence"]
): ClientBirthTimeDstOccurrence | null {
  const normalized = normalizeOptionalToNull(value);
  if (normalized === null) {
    return null;
  }
  if (!birthTimeDstOccurrences.includes(normalized as ClientBirthTimeDstOccurrence)) {
    throw new BirthDataValidationError("Birth time DST occurrence is invalid");
  }
  return normalized as ClientBirthTimeDstOccurrence;
}

function normalizeRelevantBirthTimeDstOccurrence(input: {
  readonly birthDate: string | null;
  readonly birthTime: string | null;
  readonly birthTimezone: string | null;
  readonly occurrence: ClientBirthTimeDstOccurrence | null;
}): ClientBirthTimeDstOccurrence | null {
  if (!input.birthDate || !input.birthTime || !input.birthTimezone || !input.occurrence) {
    return null;
  }
  try {
    return inspectChartCivilTime({
      date: input.birthDate,
      time: input.birthTime,
      timeZone: input.birthTimezone
    }).kind === "ambiguous"
      ? input.occurrence
      : null;
  } catch {
    return null;
  }
}

export async function createClientJoinIntent(input: {
  readonly store: ClientStore;
  readonly astrologerUserId: string;
  readonly publicHandleSnapshot: string;
  readonly tokenGenerator?: () => string;
  readonly tokenHasher: (token: string) => string;
  readonly idGenerator?: () => string;
  readonly now: Date;
  readonly expiresAt: Date;
}): Promise<ClientJoinIntentCreated> {
  const token = normalizeRequiredString(
    input.tokenGenerator?.() ?? randomUUID(),
    "Client join intent token is required"
  );
  const tokenHash = normalizeRequiredString(
    input.tokenHasher(token),
    "Client join intent token hash is required"
  );
  const intent = await input.store.createJoinIntent({
    id: input.idGenerator?.() ?? randomUUID(),
    astrologerUserId: normalizeRequiredString(
      input.astrologerUserId,
      "Client join intent astrologer user id is required"
    ),
    tokenHash,
    publicHandleSnapshot: normalizeRequiredString(
      input.publicHandleSnapshot,
      "Client join intent public handle snapshot is required"
    ),
    expiresAt: input.expiresAt.toISOString(),
    now: input.now.toISOString()
  });

  return { ...intent, token };
}

export async function claimClientJoinIntent(input: {
  readonly store: ClientJoinIntentClaimStore;
  readonly token: string;
  readonly tokenHasher: (token: string) => string;
  readonly clientUserId: string;
  readonly now: Date;
}): Promise<ClientAstrologerRelationship> {
  const token = normalizeRequiredString(input.token, "Client join intent token is required");
  const clientUserId = normalizeRequiredString(
    input.clientUserId,
    "Client join intent client user id is required"
  );
  const tokenHash = normalizeRequiredString(
    input.tokenHasher(token),
    "Client join intent token hash is required"
  );
  const intent = await input.store.findJoinIntentByTokenHash({ tokenHash });
  if (!intent) {
    throw new ClientJoinIntentError("Client join intent was not found");
  }
  if (intent.status === "claimed" && intent.claimedByClientUserId !== clientUserId) {
    throw new ClientJoinIntentError("Client join intent is already claimed");
  }
  if (intent.status === "expired") {
    throw new ClientJoinIntentError("Client join intent is expired");
  }

  const now = input.now.toISOString();
  if (new Date(intent.expiresAt).getTime() <= input.now.getTime()) {
    throw new ClientJoinIntentError("Client join intent is expired");
  }

  const claimedIntent = await input.store.markJoinIntentClaimed({
    intentId: intent.id,
    clientUserId,
    now
  });
  if (
    !claimedIntent ||
    claimedIntent.status !== "claimed" ||
    claimedIntent.claimedByClientUserId !== clientUserId
  ) {
    throw new ClientJoinIntentError("Client join intent is already claimed");
  }

  const relationship = await input.store.ensureRelationship({
    clientUserId,
    astrologerUserId: claimedIntent.astrologerUserId,
    source: "direct_link",
    now
  });

  return relationship;
}

export async function writeClientBirthProfile(input: {
  readonly store: Pick<ClientStore, "writeClientBirthProfile">;
  readonly clientUserId: string;
  readonly actor: {
    readonly userId: string;
    readonly role: "client" | "astrologer";
  };
  readonly expectedRevision: number | null;
  readonly data: ClientBirthDataInput;
  readonly now: Date;
}): Promise<ClientBirthData> {
  const result = await input.store.writeClientBirthProfile({
    clientUserId: normalizeRequiredString(input.clientUserId, "Client user id is required"),
    actor: {
      userId: normalizeRequiredString(input.actor.userId, "Birth-data editor user id is required"),
      role: input.actor.role
    },
    expectedRevision: normalizeExpectedBirthDataRevision(input.expectedRevision),
    data: normalizeClientBirthDataInput(input.data),
    now: input.now.toISOString()
  });
  if (result.kind === "conflict") {
    throw new ClientBirthDataRevisionConflictError();
  }
  if (result.kind === "not_related") {
    throw new ClientBirthDataRelationshipDeniedError();
  }
  return result.profile;
}

export function listAstrologerClients(input: {
  readonly store: ClientStore;
  readonly astrologerUserId: string;
  readonly query?: string | null;
  readonly limit: number;
  readonly offset: number;
}): Promise<AstrologerClientList> {
  return input.store.listAstrologerClients({
    astrologerUserId: normalizeRequiredString(
      input.astrologerUserId,
      "Astrologer user id is required"
    ),
    query: normalizeOptionalToNull(input.query) ?? "",
    limit: normalizeListLimit(input.limit),
    offset: normalizeListOffset(input.offset)
  });
}

export function getAstrologerClient(input: {
  readonly store: ClientStore;
  readonly astrologerUserId: string;
  readonly clientUserId: string;
}): Promise<AstrologerClientListItem | null> {
  return input.store.getAstrologerClient({
    astrologerUserId: normalizeRequiredString(
      input.astrologerUserId,
      "Astrologer user id is required"
    ),
    clientUserId: normalizeRequiredString(input.clientUserId, "Client user id is required")
  });
}

function normalizeExpectedBirthDataRevision(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 1) {
    throw new BirthDataValidationError("Birth-data revision is invalid");
  }
  return value;
}

function normalizeBirthDate(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalToNull(value);
  if (normalized === null) {
    return null;
  }
  if (!birthDatePattern.test(normalized)) {
    throw new BirthDataValidationError("Birth date must use YYYY-MM-DD format");
  }
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw new BirthDataValidationError("Birth date is invalid");
  }
  return normalized;
}

function normalizeBirthTime(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  if (!birthTimePattern.test(value)) {
    throw new BirthDataValidationError("Birth time must use HH:mm format");
  }
  const [hoursPart, minutesPart] = value.split(":");
  const hours = Number(hoursPart);
  const minutes = Number(minutesPart);
  if (hours > 23 || minutes > 59) {
    throw new BirthDataValidationError("Birth time is invalid");
  }
  return value;
}

function normalizeBirthTimePrecision(
  value: ClientBirthTimePrecision | null | undefined,
  birthTime: string | null
): ClientBirthTimePrecision {
  const precision = normalizeOptionalToNull(value) ?? (birthTime ? "exact" : "unknown");
  if (!isOneOf(birthTimePrecisions, precision)) {
    throw new BirthDataValidationError("Birth time precision is unsupported");
  }
  return precision;
}

function normalizeCountryCode(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalToNull(value)?.toUpperCase() ?? null;
  if (normalized !== null && !countryCodePattern.test(normalized)) {
    throw new BirthDataValidationError("Birth country code must use ISO alpha-2 format");
  }
  return normalized;
}

function normalizeCoordinate(
  value: number | null | undefined,
  min: number,
  max: number,
  message: string
): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new BirthDataValidationError(message);
  }
  return value;
}

function normalizeBirthDataSource(value: ClientBirthDataSource): ClientBirthDataSource {
  if (!isOneOf(birthDataSources, value)) {
    throw new BirthDataValidationError("Client birth data source is unsupported");
  }
  return value;
}

function normalizeListLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    throw new BirthDataValidationError("Client list limit must be between 1 and 100");
  }
  return value;
}

function normalizeListOffset(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BirthDataValidationError("Client list offset must be zero or greater");
  }
  return value;
}

function normalizeOptionalToNull(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function isOneOf<T extends string>(values: readonly T[], value: string): value is T {
  return values.includes(value as T);
}
