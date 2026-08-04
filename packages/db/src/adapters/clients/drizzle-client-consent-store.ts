import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import {
  ClientConsentIntegrityError,
  clientDataConsentPurpose,
  type ClientConsentAuthorizationEvidence,
  type ClientConsentGrantAtomicInput,
  type ClientConsentGrantAtomicResult,
  type ClientConsentRelationshipEvidence,
  type ClientConsentRevokeAtomicInput,
  type ClientConsentRevokeAtomicResult,
  type ClientConsentStore,
  type ClientDataConsentRecord
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  astrologerProfiles,
  auditLogEntries,
  clientAstrologerRelationships,
  clientDataConsents
} from "../../schema";
import { insertReturningOne } from "../../shared";

type ClientConsentRow = typeof clientDataConsents.$inferSelect;
type ClientRelationshipRow = typeof clientAstrologerRelationships.$inferSelect;
type ClientConsentTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type ClientConsentDatabase = ElevenHouseDatabase | ClientConsentTransaction;

export function createDrizzleClientConsentStore(database: ElevenHouseDatabase): ClientConsentStore {
  return {
    listRelationshipConsentsForClient: ({ clientUserId }) =>
      listRelationshipConsents(database, { clientUserId, astrologerUserId: null }),
    findChartAiConsentEvidence: ({ astrologerUserId, clientUserIds }) =>
      listRelationshipConsents(database, { astrologerUserId, clientUserIds }),
    grantConsentAtomically: (input) => grantConsentAtomically(database, input),
    revokeConsentAtomically: (input) => revokeConsentAtomically(database, input)
  };
}

async function grantConsentAtomically(
  database: ElevenHouseDatabase,
  input: ClientConsentGrantAtomicInput
): Promise<ClientConsentGrantAtomicResult> {
  return database.transaction(async (transaction) => {
    const [relationship] = await transaction
      .select()
      .from(clientAstrologerRelationships)
      .where(
        and(
          eq(clientAstrologerRelationships.clientUserId, input.clientUserId),
          eq(clientAstrologerRelationships.astrologerUserId, input.astrologerUserId)
        )
      )
      .limit(1)
      .for("update");
    if (!relationship) return { status: "relationship_not_found" };
    if (relationship.status !== "active") {
      return {
        status: "relationship_inactive",
        relationshipStatus: relationship.status as "archived" | "blocked"
      };
    }

    const [current] = await transaction
      .select()
      .from(clientDataConsents)
      .where(
        and(
          eq(clientDataConsents.relationshipId, relationship.id),
          eq(clientDataConsents.purpose, input.purpose),
          isNull(clientDataConsents.revokedAt)
        )
      )
      .limit(1)
      .for("update");
    if (current && consentMatchesGrant(current, input)) {
      return { status: "already_current", consent: toClientDataConsentRecord(current) };
    }
    let latestRevoked: ClientConsentRow | undefined;
    if (!current) {
      [latestRevoked] = await transaction
        .select()
        .from(clientDataConsents)
        .where(
          and(
            eq(clientDataConsents.relationshipId, relationship.id),
            eq(clientDataConsents.purpose, input.purpose),
            isNotNull(clientDataConsents.revokedAt)
          )
        )
        .orderBy(desc(clientDataConsents.grantedAt), desc(clientDataConsents.id))
        .limit(1)
        .for("update");
    }

    const grantedAt = new Date(input.grantedAt);
    if (current) {
      await transaction
        .update(clientDataConsents)
        .set({ revokedAt: grantedAt })
        .where(and(eq(clientDataConsents.id, current.id), isNull(clientDataConsents.revokedAt)));
    }
    const row = await insertReturningOne(
      () =>
        transaction
          .insert(clientDataConsents)
          .values({
            id: input.consentId,
            relationshipId: relationship.id,
            clientUserId: relationship.clientUserId,
            astrologerUserId: relationship.astrologerUserId,
            purpose: input.purpose,
            policyVersion: input.policyVersion,
            processorCode: input.processorCode,
            noticeLocale: input.noticeLocale,
            noticeSha256: input.noticeSha256,
            grantedAt,
            revokedAt: null
          })
          .returning(),
      "client_data_consents"
    );
    await insertConsentAudit(transaction, {
      id: input.auditEntryId,
      actorUserId: relationship.clientUserId,
      action: "client.consent.granted",
      consent: row,
      supersededConsentId: (current ?? latestRevoked)?.id ?? null,
      occurredAt: grantedAt
    });
    return { status: "granted", consent: toClientDataConsentRecord(row) };
  });
}

async function revokeConsentAtomically(
  database: ElevenHouseDatabase,
  input: ClientConsentRevokeAtomicInput
): Promise<ClientConsentRevokeAtomicResult> {
  return database.transaction(async (transaction) => {
    const [current] = await transaction
      .select()
      .from(clientDataConsents)
      .where(
        and(
          eq(clientDataConsents.id, input.consentId),
          eq(clientDataConsents.clientUserId, input.clientUserId)
        )
      )
      .limit(1)
      .for("update");
    if (!current) return { status: "not_found" };
    if (current.revokedAt) {
      return { status: "already_revoked", consent: toClientDataConsentRecord(current) };
    }
    const revokedAt = new Date(input.revokedAt);
    const row = await insertReturningOne(
      () =>
        transaction
          .update(clientDataConsents)
          .set({ revokedAt })
          .where(and(eq(clientDataConsents.id, current.id), isNull(clientDataConsents.revokedAt)))
          .returning(),
      "client_data_consents revoke"
    );
    await insertConsentAudit(transaction, {
      id: input.auditEntryId,
      actorUserId: current.clientUserId,
      action: "client.consent.revoked",
      consent: row,
      supersededConsentId: null,
      occurredAt: revokedAt
    });
    return { status: "revoked", consent: toClientDataConsentRecord(row) };
  });
}

async function listRelationshipConsents(
  database: ClientConsentDatabase,
  scope:
    | { readonly clientUserId: string; readonly astrologerUserId: null }
    | { readonly astrologerUserId: string; readonly clientUserIds: readonly string[] }
): Promise<readonly ClientConsentAuthorizationEvidence[]> {
  if ("clientUserIds" in scope && scope.clientUserIds.length === 0) return [];
  const scopeFilter =
    "clientUserIds" in scope
      ? and(
          eq(clientAstrologerRelationships.astrologerUserId, scope.astrologerUserId),
          inArray(clientAstrologerRelationships.clientUserId, [...scope.clientUserIds])
        )
      : eq(clientAstrologerRelationships.clientUserId, scope.clientUserId);
  const rows = await database
    .select({
      relationship: clientAstrologerRelationships,
      profile: {
        publicHandle: astrologerProfiles.publicHandle,
        publicName: astrologerProfiles.publicName
      },
      consent: clientDataConsents
    })
    .from(clientAstrologerRelationships)
    .innerJoin(
      astrologerProfiles,
      eq(astrologerProfiles.ownerUserId, clientAstrologerRelationships.astrologerUserId)
    )
    .leftJoin(
      clientDataConsents,
      and(
        eq(clientDataConsents.relationshipId, clientAstrologerRelationships.id),
        eq(clientDataConsents.purpose, clientDataConsentPurpose)
      )
    )
    .where(scopeFilter)
    .orderBy(
      asc(clientAstrologerRelationships.id),
      desc(clientDataConsents.grantedAt),
      desc(clientDataConsents.id)
    );

  return selectRelationshipConsentEvidence(
    rows.map((row) => ({
      relationship: toRelationshipEvidence(row.relationship, row.profile),
      consent: row.consent ? toClientDataConsentRecord(row.consent) : null
    }))
  );
}

/**
 * Collapse immutable consent history without trusting application timestamps to
 * identify the currently-authoritative row. A current row always wins over
 * revoked history, and multiple current rows are treated as integrity failure
 * even if a database constraint was disabled or drifted in production.
 */
export function selectRelationshipConsentEvidence(
  evidence: readonly ClientConsentAuthorizationEvidence[]
): readonly ClientConsentAuthorizationEvidence[] {
  const selected = new Map<string, ClientConsentAuthorizationEvidence>();
  for (const candidate of evidence) {
    const relationshipId = candidate.relationship.id;
    const current = selected.get(relationshipId);
    if (!current) {
      selected.set(relationshipId, candidate);
      continue;
    }
    if (!sameRelationship(current.relationship, candidate.relationship)) {
      throw new ClientConsentIntegrityError(
        "Consent history contains conflicting relationship identity"
      );
    }

    const currentIsAuthoritative = current.consent?.revokedAt === null;
    const candidateIsAuthoritative = candidate.consent?.revokedAt === null;
    if (currentIsAuthoritative && candidateIsAuthoritative) {
      throw new ClientConsentIntegrityError(
        "Consent history contains more than one current consent"
      );
    }
    if (candidateIsAuthoritative) {
      selected.set(relationshipId, candidate);
      continue;
    }
    if (currentIsAuthoritative || !candidate.consent) continue;
    if (!current.consent || compareHistoricalConsent(candidate.consent, current.consent) > 0) {
      selected.set(relationshipId, candidate);
    }
  }
  return [...selected.values()].sort((left, right) =>
    left.relationship.id.localeCompare(right.relationship.id)
  );
}

function sameRelationship(
  left: ClientConsentRelationshipEvidence,
  right: ClientConsentRelationshipEvidence
): boolean {
  return (
    left.id === right.id &&
    left.clientUserId === right.clientUserId &&
    left.astrologerUserId === right.astrologerUserId &&
    left.publicHandle === right.publicHandle &&
    left.publicName === right.publicName &&
    left.status === right.status
  );
}

function compareHistoricalConsent(
  left: ClientDataConsentRecord,
  right: ClientDataConsentRecord
): number {
  const grantedAtOrder = left.grantedAt.localeCompare(right.grantedAt);
  return grantedAtOrder === 0 ? left.id.localeCompare(right.id) : grantedAtOrder;
}

async function insertConsentAudit(
  database: ClientConsentDatabase,
  input: {
    readonly id: string;
    readonly actorUserId: string;
    readonly action: "client.consent.granted" | "client.consent.revoked";
    readonly consent: ClientConsentRow;
    readonly supersededConsentId: string | null;
    readonly occurredAt: Date;
  }
): Promise<void> {
  await database.insert(auditLogEntries).values({
    id: input.id,
    actorUserId: input.actorUserId,
    action: input.action,
    targetType: "client_data_consent",
    targetId: input.consent.id,
    occurredAt: input.occurredAt,
    metadata: {
      relationshipId: input.consent.relationshipId,
      clientUserId: input.consent.clientUserId,
      astrologerUserId: input.consent.astrologerUserId,
      purpose: input.consent.purpose,
      policyVersion: input.consent.policyVersion,
      processorCode: input.consent.processorCode,
      noticeLocale: input.consent.noticeLocale,
      noticeSha256: input.consent.noticeSha256,
      supersededConsentId: input.supersededConsentId
    }
  });
}

function consentMatchesGrant(row: ClientConsentRow, input: ClientConsentGrantAtomicInput): boolean {
  return (
    row.clientUserId === input.clientUserId &&
    row.astrologerUserId === input.astrologerUserId &&
    row.purpose === input.purpose &&
    row.policyVersion === input.policyVersion &&
    row.processorCode === input.processorCode &&
    row.noticeLocale === input.noticeLocale &&
    row.noticeSha256 === input.noticeSha256 &&
    row.revokedAt === null
  );
}

function toRelationshipEvidence(
  row: ClientRelationshipRow,
  profile: { readonly publicHandle: string; readonly publicName: string }
): ClientConsentRelationshipEvidence {
  return {
    id: row.id,
    clientUserId: row.clientUserId,
    astrologerUserId: row.astrologerUserId,
    publicHandle: profile.publicHandle,
    publicName: profile.publicName,
    status: row.status as ClientConsentRelationshipEvidence["status"]
  };
}

function toClientDataConsentRecord(row: ClientConsentRow): ClientDataConsentRecord {
  return {
    id: row.id,
    relationshipId: row.relationshipId,
    clientUserId: row.clientUserId,
    astrologerUserId: row.astrologerUserId,
    purpose: row.purpose,
    policyVersion: row.policyVersion,
    processorCode: row.processorCode,
    noticeLocale: row.noticeLocale,
    noticeSha256: row.noticeSha256,
    grantedAt: toIsoString(row.grantedAt),
    revokedAt: row.revokedAt ? toIsoString(row.revokedAt) : null
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
