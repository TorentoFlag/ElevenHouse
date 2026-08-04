import { describe, expect, it } from "vitest";
import type {
  ClientCabinetOverviewResponse,
  ClientDataConsentListResponse
} from "@elevenhouse/contracts";
import { buildClientDataConsentCards } from "./clientDataConsentModel";

const astrologerUserId = "22222222-2222-4222-8222-222222222222";

describe("client data consent model", () => {
  it.each([
    ["missing", true, false],
    ["granted", false, true],
    ["revoked", true, false],
    ["stale", true, true]
  ] as const)("derives explicit actions for %s", (state, canGrant, canRevoke) => {
    const cards = buildClientDataConsentCards(overview(), consentList(state));
    expect(cards).toEqual([
      expect.objectContaining({
        astrologerUserId,
        publicName: "Алиса Вега",
        state,
        canGrant,
        canRevoke
      })
    ]);
  });

  it("fails closed when the consent API omits or contradicts an active relationship", () => {
    expect(() =>
      buildClientDataConsentCards(overview(), { ...consentList("missing"), consents: [] })
    ).toThrow("Consent evidence is missing for an active astrologer relationship");
    expect(() =>
      buildClientDataConsentCards(overview(), {
        ...consentList("missing"),
        consents: [
          {
            ...consentList("missing").consents[0]!,
            relationshipStatus: "archived"
          }
        ]
      })
    ).toThrow("Consent relationship evidence contradicts the active cabinet relationship");
  });

  it("keeps inactive explicit relationships visible for withdrawal without allowing re-grant", () => {
    const archivedAstrologerUserId = "33333333-3333-4333-8333-333333333333";
    const archivedConsentId = "55555555-5555-4555-8555-555555555555";
    const response = consentList("granted");

    expect(
      buildClientDataConsentCards(overview(), {
        ...response,
        consents: [
          response.consents[0]!,
          {
            astrologerUserId: archivedAstrologerUserId,
            publicName: "Михаил Север",
            publicHandle: "mikhail-sever",
            relationshipStatus: "archived",
            state: "stale",
            consentId: archivedConsentId,
            noticeLocale: "ru",
            grantedAt: "2026-08-02T12:00:00.000Z",
            revokedAt: null
          }
        ]
      })
    ).toEqual([
      expect.objectContaining({ astrologerUserId, canGrant: false, canRevoke: true }),
      expect.objectContaining({
        astrologerUserId: archivedAstrologerUserId,
        publicName: "Михаил Север",
        publicHandle: "mikhail-sever",
        state: "stale",
        canGrant: false,
        canRevoke: true
      })
    ]);
  });
});

function overview(): ClientCabinetOverviewResponse {
  return {
    astrologers: [
      {
        astrologerUserId,
        publicHandle: "alisa-vega",
        publicName: "Алиса Вега",
        relationshipStatus: "active",
        firstLinkedAt: "2026-08-03T10:00:00.000Z",
        lastLinkedAt: "2026-08-03T10:00:00.000Z"
      }
    ],
    birthProfiles: [],
    summary: {
      directLinkOnly: true,
      upcomingBookingCount: 0,
      availableMaterialCount: 0,
      unreadNotificationCount: 0,
      activeSubscriptionCount: 0
    }
  };
}

function consentList(
  state: "missing" | "granted" | "revoked" | "stale"
): ClientDataConsentListResponse {
  const hasRecord = state !== "missing";
  return {
    policy: {
      purpose: "external_chart_ai_interpretation",
      policyVersion: "chart-ai-external-processing.v1",
      processorCode: "openai"
    },
    notice: {
      locale: "ru",
      purpose: "external_chart_ai_interpretation",
      policyVersion: "chart-ai-external-processing.v1",
      processor: { code: "openai", name: "OpenAI" },
      title: "Согласие на внешнюю AI-интерпретацию карты",
      summary:
        "Я разрешаю ElevenHouse передавать OpenAI только рассчитанные данные карты для подготовки редактируемого черновика интерпретации.",
      relationshipScope:
        "Согласие действует только для AI-черновиков, которые запрашивает указанный астролог в рамках нашей явной связи.",
      dataSent: [
        { code: "calculated_positions", label: "Рассчитанные положения планет и точек" },
        { code: "calculated_houses", label: "Рассчитанные дома" },
        { code: "calculated_aspects", label: "Рассчитанные аспекты" },
        { code: "calculation_settings", label: "Настройки расчёта" },
        { code: "calculation_warnings", label: "Предупреждения расчёта" },
        {
          code: "bounded_dictionary_excerpts",
          label: "Ограниченные выдержки из Словаря ElevenHouse"
        }
      ],
      dataExcluded: [
        { code: "identity", label: "Имя и иные идентификаторы" },
        { code: "contacts", label: "Контактные данные" },
        { code: "birth_data", label: "Дата и время рождения" },
        { code: "coordinates", label: "Координаты и место рождения" },
        { code: "crm_data", label: "Данные CRM и заметки астролога" },
        { code: "calculation_id", label: "Идентификатор расчёта" },
        { code: "result_checksum", label: "Контрольная сумма результата" }
      ],
      withdrawal:
        "Я могу отозвать согласие в любой момент так же просто, как предоставить его. После отзыва новые внешние AI-запросы будут запрещены."
    },
    noticeSha256: "sha256:a64936b4efaa5b559c8aed2f0cb66926902708e36e7a2c7ba6236ab4f327216b",
    consents: [
      {
        astrologerUserId,
        publicHandle: "alisa-vega",
        publicName: "Алиса Вега",
        relationshipStatus: "active",
        state,
        consentId: hasRecord ? "44444444-4444-4444-8444-444444444444" : null,
        noticeLocale: hasRecord ? "ru" : null,
        grantedAt: hasRecord ? "2026-08-03T12:00:00.000Z" : null,
        revokedAt: state === "revoked" ? "2026-08-03T12:05:00.000Z" : null
      }
    ]
  };
}
