import type { CalculationRecordResponse } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import { resolveChartCalculationIdentity } from "./chartCalculationIdentity";

const clientId = "22222222-2222-4222-8222-222222222222";
const partnerClientId = "55555555-5555-4555-8555-555555555555";
const relatedProfileId = "99999999-9999-4999-8999-999999999999";

describe("chartCalculationIdentity", () => {
  it("withholds the result while authoritative calculation participants are loading", () => {
    expect(
      resolveChartCalculationIdentity({
        calculation: undefined,
        mode: "natal",
        selectedClientId: clientId,
        selectedPartnerClientId: null
      })
    ).toEqual({ kind: "pending" });
  });

  it("resolves authoritative subject and ordered partner identity", () => {
    expect(
      resolveChartCalculationIdentity({
        calculation: calculation("synastry"),
        mode: "synastry",
        selectedClientId: clientId,
        selectedPartnerClientId: partnerClientId
      })
    ).toEqual({
      kind: "ready",
      subjectClientId: clientId,
      partnerClientId
    });
  });

  it("resolves a client related profile partner without requiring a second CRM client", () => {
    expect(
      resolveChartCalculationIdentity({
        calculation: calculation("synastry", {
          participants: [subjectParticipant(), relatedProfileParticipant()]
        }),
        mode: "synastry",
        selectedClientId: clientId,
        selectedPartnerClientId: null
      })
    ).toEqual({
      kind: "ready",
      subjectClientId: clientId,
      partnerClientId: null
    });
  });

  it("types subject and partner mismatches instead of falling back to browser selection", () => {
    const pair = calculation("composite");

    expect(
      resolveChartCalculationIdentity({
        calculation: pair,
        mode: "composite",
        selectedClientId: "66666666-6666-4666-8666-666666666666",
        selectedPartnerClientId: partnerClientId
      })
    ).toEqual({ kind: "client_mismatch" });
    expect(
      resolveChartCalculationIdentity({
        calculation: pair,
        mode: "composite",
        selectedClientId: clientId,
        selectedPartnerClientId: "66666666-6666-4666-8666-666666666666"
      })
    ).toEqual({ kind: "partner_mismatch" });
  });

  it.each(["synastry", "composite"] as const)(
    "restores authoritative identity for a real pre-v2 %s row",
    (method) => {
      const legacy = legacyPairCalculation(method);

      expect(
        resolveChartCalculationIdentity({
          calculation: legacy,
          mode: method,
          selectedClientId: clientId,
          selectedPartnerClientId: partnerClientId
        })
      ).toEqual({ kind: "ready", subjectClientId: clientId, partnerClientId });
    }
  );

  it("fails closed when legacy persisted relationship identities disagree", () => {
    const legacy = legacyPairCalculation("synastry");

    expect(
      resolveChartCalculationIdentity({
        calculation: {
          ...legacy,
          resultData: {
            ...legacy.resultData,
            relationshipSnapshot: {
              primaryClientId: clientId,
              partnerClientId: "66666666-6666-4666-8666-666666666666"
            }
          }
        },
        mode: "synastry",
        selectedClientId: clientId,
        selectedPartnerClientId: partnerClientId
      })
    ).toEqual({ kind: "unavailable" });
  });

  it("does not let repaired participant rows bypass legacy relationship identity proof", () => {
    const legacy = legacyPairCalculation("synastry");

    expect(
      resolveChartCalculationIdentity({
        calculation: {
          ...legacy,
          mode: "compatibility",
          participants: [subjectParticipant(), partnerParticipant()],
          resultData: {
            ...legacy.resultData,
            relationshipSnapshot: {
              primaryClientId: clientId,
              partnerClientId: "66666666-6666-4666-8666-666666666666"
            }
          }
        },
        mode: "synastry",
        selectedClientId: clientId,
        selectedPartnerClientId: partnerClientId
      })
    ).toEqual({ kind: "unavailable" });
  });

  it.each([
    ["natal", "transit"],
    ["child_chart", "transit"],
    ["transit", "natal"],
    ["progression", "natal"],
    ["synastry", "composite"],
    ["composite", "synastry"],
    ["solar_return", "natal"],
    ["astrocartography", "natal"],
    ["horary", "natal"]
  ] as const)("rejects %s UI state backed by a %s result", (mode, method) => {
    expect(
      resolveChartCalculationIdentity({
        calculation: calculation(method),
        mode,
        selectedClientId: clientId,
        selectedPartnerClientId: null
      })
    ).toEqual({ kind: "unavailable" });
  });

  it.each([
    null,
    calculation("natal", { module: "numerology" }),
    calculation("natal", { status: "archived" }),
    calculation("synastry", { participants: [subjectParticipant()] }),
    calculation("synastry", {
      participants: [
        subjectParticipant(),
        { ...relatedProfileParticipant(), relatedProfileId: "not-a-uuid" }
      ]
    }),
    calculation("natal", {
      participants: [{ ...subjectParticipant(), source: "manual", clientId: null }]
    })
  ])("fails closed for unavailable or malformed calculation identity", (calculationValue) => {
    expect(
      resolveChartCalculationIdentity({
        calculation: calculationValue,
        mode: "synastry",
        selectedClientId: clientId,
        selectedPartnerClientId: partnerClientId
      })
    ).toEqual({ kind: "unavailable" });
  });
});

function calculation(
  methodCode: string,
  overrides: Partial<
    Pick<
      CalculationRecordResponse,
      "module" | "status" | "mode" | "participants" | "inputData" | "resultData"
    >
  > = {}
): Pick<
  CalculationRecordResponse,
  "module" | "status" | "methodCode" | "mode" | "participants" | "inputData" | "resultData"
> {
  const pair = methodCode === "synastry" || methodCode === "composite";
  return {
    module: "chart",
    status: "calculated",
    methodCode,
    mode: pair ? "compatibility" : "individual",
    participants: pair ? [subjectParticipant(), partnerParticipant()] : [subjectParticipant()],
    inputData: {},
    resultData: { schemaVersion: "chart-result.v2", method: methodCode },
    ...overrides
  };
}

function subjectParticipant(): CalculationRecordResponse["participants"][number] {
  return { role: "subject", source: "crm_client", clientId, displayName: "Анна" };
}

function partnerParticipant(): CalculationRecordResponse["participants"][number] {
  return {
    role: "partner",
    source: "crm_client",
    clientId: partnerClientId,
    displayName: "Мария"
  };
}

function relatedProfileParticipant(): CalculationRecordResponse["participants"][number] {
  return {
    role: "partner",
    source: "client_related_profile",
    clientId,
    relatedProfileId,
    displayName: "Иванов Иван Иванович · муж"
  };
}

function legacyPairCalculation(method: "synastry" | "composite") {
  const relationshipSnapshot = { primaryClientId: clientId, partnerClientId };
  return {
    ...calculation(method),
    mode: "individual" as const,
    participants: [subjectParticipant()],
    inputData: {
      inputSnapshot: {
        inputSnapshot: { birthDate: "1990-07-15" },
        partnerInputSnapshot: { birthDate: "1992-08-11" },
        relationshipSnapshot
      },
      settings: {}
    },
    resultData: {
      schemaVersion: "chart-result.v1",
      method,
      relationshipSnapshot
    }
  };
}
