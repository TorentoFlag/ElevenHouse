import {
  normalizeFiscalBuyerContact,
  type FiscalBuyerContact,
  type VerifiedFiscalBuyerContactReaderPort
} from "@elevenhouse/domain/finance-core";
import { and, eq, isNotNull, sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { authIdentities } from "../../schema/identity/auth-identities.schema";

export class VerifiedFiscalBuyerContactReaderPersistenceError extends Error {
  readonly code = "VERIFIED_FISCAL_BUYER_CONTACT_READER_PERSISTENCE_ERROR" as const;

  constructor(readonly reason: "invalid_input" | "contact_integrity_conflict" | "persistence_failure") {
    super("Fiscal buyer contact could not be verified against client identity");
  }
}

export function createDrizzleVerifiedFiscalBuyerContactReader(
  database: ElevenHouseDatabase
): VerifiedFiscalBuyerContactReaderPort {
  return Object.freeze({
    async findVerifiedFiscalBuyerContact(input) {
      const clientUserId = uuid(input.clientUserId);
      const candidate = candidateValue(input.candidate);
      try {
        const row =
          candidate.kind === "email"
            ? await findVerifiedEmail(database, clientUserId, candidate.value)
            : await findVerifiedPhone(database, clientUserId, candidate.value);
        return row ? mapVerifiedFiscalBuyerContact(row, clientUserId, candidate) : null;
      } catch (error) {
        if (error instanceof VerifiedFiscalBuyerContactReaderPersistenceError) throw error;
        throw new VerifiedFiscalBuyerContactReaderPersistenceError("persistence_failure");
      }
    }
  } satisfies VerifiedFiscalBuyerContactReaderPort);
}

async function findVerifiedEmail(database: ElevenHouseDatabase, userId: string, email: string) {
  const [row] = await database
    .select({
      userId: authIdentities.userId,
      email: authIdentities.email,
      emailVerifiedAt: authIdentities.emailVerifiedAt,
      phoneNumber: authIdentities.phoneNumber,
      phoneVerifiedAt: authIdentities.phoneVerifiedAt
    })
    .from(authIdentities)
    .where(
      and(
        eq(authIdentities.userId, userId),
        isNotNull(authIdentities.emailVerifiedAt),
        sql`lower(${authIdentities.email}) = lower(${email})`
      )
    )
    .limit(1);
  return row ?? null;
}

async function findVerifiedPhone(database: ElevenHouseDatabase, userId: string, phone: string) {
  const [row] = await database
    .select({
      userId: authIdentities.userId,
      email: authIdentities.email,
      emailVerifiedAt: authIdentities.emailVerifiedAt,
      phoneNumber: authIdentities.phoneNumber,
      phoneVerifiedAt: authIdentities.phoneVerifiedAt
    })
    .from(authIdentities)
    .where(
      and(
        eq(authIdentities.userId, userId),
        eq(authIdentities.phoneNumber, phone),
        isNotNull(authIdentities.phoneVerifiedAt)
      )
    )
    .limit(1);
  return row ?? null;
}

export function mapVerifiedFiscalBuyerContact(
  row: Readonly<{
    userId: string;
    email: string | null;
    emailVerifiedAt: Date | null;
    phoneNumber: string | null;
    phoneVerifiedAt: Date | null;
  }>,
  clientUserId: string,
  candidate: FiscalBuyerContact
): FiscalBuyerContact {
  try {
    const normalizedClientUserId = uuid(clientUserId);
    const normalizedCandidate = candidateValue(candidate);
    if (row.userId !== normalizedClientUserId) fail("contact_integrity_conflict");
    if (
      normalizedCandidate.kind === "email" &&
      row.emailVerifiedAt !== null &&
      typeof row.email === "string" &&
      row.email.toLocaleLowerCase("en-US") === normalizedCandidate.value.toLocaleLowerCase("en-US")
    ) {
      return normalizedCandidate;
    }
    if (
      normalizedCandidate.kind === "phone" &&
      row.phoneVerifiedAt !== null &&
      row.phoneNumber === normalizedCandidate.value
    ) {
      return normalizedCandidate;
    }
    fail("contact_integrity_conflict");
  } catch (error) {
    if (error instanceof VerifiedFiscalBuyerContactReaderPersistenceError) throw error;
    fail("contact_integrity_conflict");
  }
}

function candidateValue(value: unknown): FiscalBuyerContact {
  try {
    return normalizeFiscalBuyerContact(value);
  } catch {
    fail("invalid_input");
  }
}

function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    fail("invalid_input");
  }
  return value;
}

function fail(reason: VerifiedFiscalBuyerContactReaderPersistenceError["reason"]): never {
  throw new VerifiedFiscalBuyerContactReaderPersistenceError(reason);
}
