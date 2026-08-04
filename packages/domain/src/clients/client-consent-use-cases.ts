import { randomUUID } from "node:crypto";
import {
  ChartAiConsentRequiredError,
  ClientConsentIntegrityError,
  ClientConsentNotFoundError,
  ClientConsentRelationshipInactiveError,
  ClientConsentRelationshipRequiredError,
  ClientConsentValidationError
} from "./client-consent-errors";
import {
  canonicalChartAiConsentNoticeHashes,
  currentChartAiConsentPolicy,
  getCanonicalChartAiConsentNotice,
  isClientDataConsentLocale,
  resolveClientDataConsentState
} from "./client-consent-policy";
import type {
  ClientConsentAuthorizationEvidence,
  ClientConsentRelationshipEvidence,
  ClientConsentStore
} from "./client-consent-store";
import type {
  AuthorizedChartAiParticipantConsent,
  ChartAiPersistedParticipant,
  ClientConsentRelationshipStatus,
  ClientDataConsentGrantRequest,
  ClientDataConsentList,
  ClientDataConsentListItem,
  ClientDataConsentRecord,
  CurrentClientDataConsent
} from "./client-consent-types";

export async function grantChartAiConsent(input: {
  readonly store: Pick<ClientConsentStore, "grantConsentAtomically">;
  readonly clientUserId: string;
  readonly astrologerUserId: string;
  readonly request: ClientDataConsentGrantRequest;
  readonly now: Date;
  readonly idGenerator?: () => string;
}): Promise<CurrentClientDataConsent> {
  const clientUserId = normalizeRequired(input.clientUserId, "Client user id is required");
  const astrologerUserId = normalizeRequired(
    input.astrologerUserId,
    "Astrologer user id is required"
  );
  const grantedAt = normalizeDate(input.now);
  const noticeLocale = validateGrantRequest(input.request);
  const idGenerator = input.idGenerator ?? randomUUID;
  const consentId = normalizeRequired(idGenerator(), "Consent id is required");
  const auditEntryId = normalizeRequired(idGenerator(), "Consent audit id is required");

  const result = await input.store.grantConsentAtomically({
    consentId,
    auditEntryId,
    clientUserId,
    astrologerUserId,
    purpose: currentChartAiConsentPolicy.purpose,
    policyVersion: currentChartAiConsentPolicy.policyVersion,
    processorCode: currentChartAiConsentPolicy.processorCode,
    noticeLocale,
    noticeSha256: canonicalChartAiConsentNoticeHashes[noticeLocale],
    grantedAt
  });

  if (result.status === "relationship_not_found") {
    throw new ClientConsentRelationshipRequiredError(clientUserId);
  }
  if (result.status === "relationship_inactive") {
    throw new ClientConsentRelationshipInactiveError(clientUserId, result.relationshipStatus);
  }
  if (
    result.status === "granted" &&
    (result.consent.id !== consentId || result.consent.grantedAt !== grantedAt)
  ) {
    throw new ClientConsentIntegrityError("Granted consent does not match the issued command");
  }
  return assertCurrentConsent(result.consent, {
    clientUserId,
    astrologerUserId,
    relationshipId: null
  });
}

export async function revokeClientDataConsent(input: {
  readonly store: Pick<ClientConsentStore, "revokeConsentAtomically">;
  readonly clientUserId: string;
  readonly consentId: string;
  readonly now: Date;
  readonly idGenerator?: () => string;
}): Promise<ClientDataConsentRecord> {
  const clientUserId = normalizeRequired(input.clientUserId, "Client user id is required");
  const consentId = normalizeRequired(input.consentId, "Consent id is required");
  const revokedAt = normalizeDate(input.now);
  const result = await input.store.revokeConsentAtomically({
    consentId,
    auditEntryId: normalizeRequired(
      (input.idGenerator ?? randomUUID)(),
      "Consent audit id is required"
    ),
    clientUserId,
    revokedAt
  });

  if (result.status === "not_found") throw new ClientConsentNotFoundError();
  if (
    result.consent.id !== consentId ||
    result.consent.clientUserId !== clientUserId ||
    result.consent.revokedAt === null ||
    (result.status === "revoked" && result.consent.revokedAt !== revokedAt)
  ) {
    throw new ClientConsentIntegrityError("Revoked consent does not match the owned command");
  }
  return result.consent;
}

export async function listClientDataConsents(input: {
  readonly store: Pick<ClientConsentStore, "listRelationshipConsentsForClient">;
  readonly clientUserId: string;
  readonly locale: string;
}): Promise<ClientDataConsentList> {
  const clientUserId = normalizeRequired(input.clientUserId, "Client user id is required");
  if (!isClientDataConsentLocale(input.locale)) {
    throw new ClientConsentValidationError("Consent notice locale is unsupported");
  }
  const canonicalNotice = getCanonicalChartAiConsentNotice(input.locale);
  const evidence = await input.store.listRelationshipConsentsForClient({ clientUserId });
  const seenAstrologers = new Set<string>();
  const consents = evidence.map((item): ClientDataConsentListItem => {
    assertRelationshipEvidence(item.relationship, { clientUserId, astrologerUserId: null });
    if (seenAstrologers.has(item.relationship.astrologerUserId)) {
      throw new ClientConsentIntegrityError("Consent list repeats an astrologer relationship");
    }
    seenAstrologers.add(item.relationship.astrologerUserId);
    if (item.consent) {
      assertConsentIdentity(item.consent, {
        clientUserId,
        astrologerUserId: item.relationship.astrologerUserId,
        relationshipId: item.relationship.id
      });
    }
    const state = resolveClientDataConsentState({
      relationshipStatus: item.relationship.status,
      consent: item.consent
    });
    return {
      astrologerUserId: item.relationship.astrologerUserId,
      publicHandle: item.relationship.publicHandle,
      publicName: item.relationship.publicName,
      relationshipStatus: item.relationship.status,
      state,
      consentId: item.consent?.id ?? null,
      noticeLocale:
        item.consent && isClientDataConsentLocale(item.consent.noticeLocale)
          ? item.consent.noticeLocale
          : null,
      grantedAt: item.consent?.grantedAt ?? null,
      revokedAt: item.consent?.revokedAt ?? null
    };
  });

  return {
    policy: currentChartAiConsentPolicy,
    notice: canonicalNotice.notice,
    noticeSha256: canonicalNotice.noticeSha256,
    consents
  };
}

export async function authorizeChartAiParticipants(input: {
  readonly store: Pick<ClientConsentStore, "findChartAiConsentEvidence">;
  readonly astrologerUserId: string;
  readonly participants: readonly ChartAiPersistedParticipant[];
}): Promise<readonly AuthorizedChartAiParticipantConsent[]> {
  const astrologerUserId = normalizeRequired(
    input.astrologerUserId,
    "Astrologer user id is required"
  );
  if (input.participants.length === 0) {
    throw new ClientConsentValidationError("Persisted chart participants are required");
  }
  const participants = input.participants.map((participant) => ({
    clientUserId: normalizeRequired(
      participant.clientUserId,
      "Persisted participant client user id is required"
    )
  }));
  const clientUserIds = [...new Set(participants.map(({ clientUserId }) => clientUserId))];
  const evidence = await input.store.findChartAiConsentEvidence({
    astrologerUserId,
    clientUserIds
  });
  const byClientUserId = indexAuthorizationEvidence({
    evidence,
    astrologerUserId,
    requestedClientUserIds: clientUserIds
  });

  return participants.map(({ clientUserId }) => {
    const item = byClientUserId.get(clientUserId);
    if (!item) throw new ClientConsentRelationshipRequiredError(clientUserId);
    if (item.relationship.status !== "active") {
      throw new ClientConsentRelationshipInactiveError(clientUserId, item.relationship.status);
    }
    if (item.consent) {
      assertConsentIdentity(item.consent, {
        clientUserId,
        astrologerUserId,
        relationshipId: item.relationship.id
      });
    }
    const state = resolveClientDataConsentState({
      relationshipStatus: item.relationship.status,
      consent: item.consent
    });
    if (state !== "granted") throw new ChartAiConsentRequiredError(clientUserId, state);
    return { clientUserId, consentId: item.consent!.id };
  });
}

function validateGrantRequest(request: ClientDataConsentGrantRequest) {
  if (request.accepted !== true) {
    throw new ClientConsentValidationError("Explicit consent acceptance is required");
  }
  if (request.policyVersion !== currentChartAiConsentPolicy.policyVersion) {
    throw new ClientConsentValidationError("Consent policy version is stale");
  }
  if (!isClientDataConsentLocale(request.locale)) {
    throw new ClientConsentValidationError("Consent notice locale is unsupported");
  }
  if (request.noticeSha256 !== canonicalChartAiConsentNoticeHashes[request.locale]) {
    throw new ClientConsentValidationError("Consent notice hash does not match its locale");
  }
  return request.locale;
}

function indexAuthorizationEvidence(input: {
  readonly evidence: readonly ClientConsentAuthorizationEvidence[];
  readonly astrologerUserId: string;
  readonly requestedClientUserIds: readonly string[];
}): ReadonlyMap<string, ClientConsentAuthorizationEvidence> {
  const requested = new Set(input.requestedClientUserIds);
  const indexed = new Map<string, ClientConsentAuthorizationEvidence>();
  for (const item of input.evidence) {
    assertRelationshipEvidence(item.relationship, {
      clientUserId: null,
      astrologerUserId: input.astrologerUserId
    });
    if (!requested.has(item.relationship.clientUserId)) {
      throw new ClientConsentIntegrityError("Consent authorization returned an unrequested client");
    }
    if (indexed.has(item.relationship.clientUserId)) {
      throw new ClientConsentIntegrityError("Consent authorization repeated a relationship");
    }
    indexed.set(item.relationship.clientUserId, item);
  }
  return indexed;
}

function assertCurrentConsent(
  consent: ClientDataConsentRecord,
  expected: {
    readonly clientUserId: string;
    readonly astrologerUserId: string;
    readonly relationshipId: string | null;
  }
): CurrentClientDataConsent {
  assertConsentIdentity(consent, expected);
  if (
    resolveClientDataConsentState({ relationshipStatus: "active", consent }) !== "granted" ||
    !isClientDataConsentLocale(consent.noticeLocale)
  ) {
    throw new ClientConsentIntegrityError("Grant did not return current consent evidence");
  }
  return consent as CurrentClientDataConsent;
}

function assertRelationshipEvidence(
  relationship: ClientConsentRelationshipEvidence,
  expected: {
    readonly clientUserId: string | null;
    readonly astrologerUserId: string | null;
  }
): void {
  if (
    !isRelationshipStatus(relationship.status) ||
    (expected.clientUserId !== null && relationship.clientUserId !== expected.clientUserId) ||
    (expected.astrologerUserId !== null &&
      relationship.astrologerUserId !== expected.astrologerUserId)
  ) {
    throw new ClientConsentIntegrityError("Relationship evidence does not match its owner scope");
  }
}

function assertConsentIdentity(
  consent: ClientDataConsentRecord,
  expected: {
    readonly clientUserId: string;
    readonly astrologerUserId: string;
    readonly relationshipId: string | null;
  }
): void {
  if (
    consent.clientUserId !== expected.clientUserId ||
    consent.astrologerUserId !== expected.astrologerUserId ||
    (expected.relationshipId !== null && consent.relationshipId !== expected.relationshipId)
  ) {
    throw new ClientConsentIntegrityError("Consent evidence does not match its relationship scope");
  }
}

function isRelationshipStatus(value: string): value is ClientConsentRelationshipStatus {
  return value === "active" || value === "archived" || value === "blocked";
}

function normalizeRequired(value: string, message: string): string {
  const normalized = value.trim();
  if (!normalized) throw new ClientConsentValidationError(message);
  return normalized;
}

function normalizeDate(value: Date): string {
  if (Number.isNaN(value.getTime()))
    throw new ClientConsentValidationError("Consent time is invalid");
  return value.toISOString();
}
