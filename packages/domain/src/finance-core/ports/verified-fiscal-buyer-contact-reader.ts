import type { FiscalBuyerContact } from "../fiscal-profile";

/**
 * Receipt contact is selected explicitly by the client, then proved against an already verified
 * identity. It is never inferred from an unverified profile field or an arbitrary order payload.
 */
export type VerifiedFiscalBuyerContactReaderPort = Readonly<{
  findVerifiedFiscalBuyerContact(input: Readonly<{
    clientUserId: string;
    candidate: FiscalBuyerContact;
  }>): Promise<FiscalBuyerContact | null>;
}>;
