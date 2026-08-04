import type {
  ClientCabinetOverviewResponse,
  ClientDataConsentListResponse,
  ClientDataConsentState
} from "@elevenhouse/contracts";

export type ClientDataConsentCard = {
  readonly astrologerUserId: string;
  readonly publicName: string;
  readonly publicHandle: string;
  readonly state: ClientDataConsentState;
  readonly consentId: string | null;
  readonly grantedAt: string | null;
  readonly revokedAt: string | null;
  readonly canGrant: boolean;
  readonly canRevoke: boolean;
};

export function buildClientDataConsentCards(
  overview: ClientCabinetOverviewResponse,
  response: ClientDataConsentListResponse
): readonly ClientDataConsentCard[] {
  const evidenceByAstrologer = new Map(response.consents.map((consent) => [
    consent.astrologerUserId,
    consent
  ]));
  const activeCards = overview.astrologers.map((astrologer) => {
    const consent = evidenceByAstrologer.get(astrologer.astrologerUserId);
    if (!consent) {
      throw new Error("Consent evidence is missing for an active astrologer relationship");
    }
    if (
      consent.relationshipStatus !== "active" ||
      consent.publicHandle !== astrologer.publicHandle ||
      consent.publicName !== astrologer.publicName
    ) {
      throw new Error(
        "Consent relationship evidence contradicts the active cabinet relationship"
      );
    }
    evidenceByAstrologer.delete(astrologer.astrologerUserId);
    return toConsentCard(consent);
  });

  const inactiveCards = [...evidenceByAstrologer.values()].map((consent) => {
    if (consent.relationshipStatus === "active") {
      throw new Error("Consent evidence contains an unknown active astrologer relationship");
    }
    return toConsentCard(consent);
  });

  return [...activeCards, ...inactiveCards];
}

function toConsentCard(
  consent: ClientDataConsentListResponse["consents"][number]
): ClientDataConsentCard {
  return {
    astrologerUserId: consent.astrologerUserId,
    publicName: consent.publicName,
    publicHandle: consent.publicHandle,
    state: consent.state,
    consentId: consent.consentId,
    grantedAt: consent.grantedAt,
    revokedAt: consent.revokedAt,
    canGrant: consent.relationshipStatus === "active" && consent.state !== "granted",
    canRevoke: consent.consentId !== null && consent.revokedAt === null
  };
}
