import { nonEmptyStringSchema, z } from "@elevenhouse/validation";
import { astrologerPublicHandleSchema } from "./astrologer-profile";
import { clientRelationshipStatusSchema } from "./clients";

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime();

export const clientDataConsentPurpose = "external_chart_ai_interpretation" as const;
export const chartAiConsentPolicyVersion = "chart-ai-external-processing.v1" as const;
export const chartAiConsentProcessorCode = "openai" as const;

export const clientDataConsentLocaleSchema = z.enum(["ru", "en"]);
export type ClientDataConsentLocale = z.infer<typeof clientDataConsentLocaleSchema>;

export const chartAiConsentNoticeSha256ByLocale = {
  ru: "sha256:a64936b4efaa5b559c8aed2f0cb66926902708e36e7a2c7ba6236ab4f327216b",
  en: "sha256:9730fb95b7f4c8ce35a4b150d3360383cdea3dfdae097518e7dcea8efd51103f"
} as const satisfies Record<ClientDataConsentLocale, `sha256:${string}`>;

export const currentChartAiConsentPolicy = deepFreeze({
  purpose: clientDataConsentPurpose,
  policyVersion: chartAiConsentPolicyVersion,
  processorCode: chartAiConsentProcessorCode
});

export const canonicalChartAiConsentNotices = deepFreeze({
  ru: {
    locale: "ru",
    purpose: clientDataConsentPurpose,
    policyVersion: chartAiConsentPolicyVersion,
    processor: { code: chartAiConsentProcessorCode, name: "OpenAI" },
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
  en: {
    locale: "en",
    purpose: clientDataConsentPurpose,
    policyVersion: chartAiConsentPolicyVersion,
    processor: { code: chartAiConsentProcessorCode, name: "OpenAI" },
    title: "Consent to external AI chart interpretation",
    summary:
      "I allow ElevenHouse to send OpenAI only calculated chart data to prepare an editable interpretation draft.",
    relationshipScope:
      "This consent applies only to AI drafts requested by the specified astrologer within our explicit relationship.",
    dataSent: [
      { code: "calculated_positions", label: "Calculated planet and point positions" },
      { code: "calculated_houses", label: "Calculated houses" },
      { code: "calculated_aspects", label: "Calculated aspects" },
      { code: "calculation_settings", label: "Calculation settings" },
      { code: "calculation_warnings", label: "Calculation warnings" },
      {
        code: "bounded_dictionary_excerpts",
        label: "Bounded excerpts from the ElevenHouse Dictionary"
      }
    ],
    dataExcluded: [
      { code: "identity", label: "Name and other identifiers" },
      { code: "contacts", label: "Contact details" },
      { code: "birth_data", label: "Birth date and time" },
      { code: "coordinates", label: "Birth coordinates and place" },
      { code: "crm_data", label: "CRM data and astrologer notes" },
      { code: "calculation_id", label: "Calculation identifier" },
      { code: "result_checksum", label: "Result checksum" }
    ],
    withdrawal:
      "I can withdraw this consent at any time as easily as I granted it. After withdrawal, new external AI requests will be blocked."
  }
} as const);

export const clientDataConsentSha256Schema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/, "Expected a lowercase SHA-256 digest");
export type ClientDataConsentSha256 = z.infer<typeof clientDataConsentSha256Schema>;

export const clientDataConsentStateSchema = z.enum(["missing", "granted", "revoked", "stale"]);
export type ClientDataConsentState = z.infer<typeof clientDataConsentStateSchema>;

export const currentChartAiConsentPolicySchema = z
  .object({
    purpose: z.literal(clientDataConsentPurpose),
    policyVersion: z.literal(chartAiConsentPolicyVersion),
    processorCode: z.literal(chartAiConsentProcessorCode)
  })
  .strict();
export type CurrentChartAiConsentPolicy = z.infer<typeof currentChartAiConsentPolicySchema>;

const noticeItem = <Code extends string>(code: Code) =>
  z
    .object({
      code: z.literal(code),
      label: nonEmptyStringSchema.max(500)
    })
    .strict();

export const clientDataConsentNoticeSchema = z
  .object({
    locale: clientDataConsentLocaleSchema,
    purpose: z.literal(clientDataConsentPurpose),
    policyVersion: z.literal(chartAiConsentPolicyVersion),
    processor: z
      .object({
        code: z.literal(chartAiConsentProcessorCode),
        name: z.literal("OpenAI")
      })
      .strict(),
    title: nonEmptyStringSchema.max(500),
    summary: nonEmptyStringSchema.max(2_000),
    relationshipScope: nonEmptyStringSchema.max(2_000),
    dataSent: z.tuple([
      noticeItem("calculated_positions"),
      noticeItem("calculated_houses"),
      noticeItem("calculated_aspects"),
      noticeItem("calculation_settings"),
      noticeItem("calculation_warnings"),
      noticeItem("bounded_dictionary_excerpts")
    ]),
    dataExcluded: z.tuple([
      noticeItem("identity"),
      noticeItem("contacts"),
      noticeItem("birth_data"),
      noticeItem("coordinates"),
      noticeItem("crm_data"),
      noticeItem("calculation_id"),
      noticeItem("result_checksum")
    ]),
    withdrawal: nonEmptyStringSchema.max(2_000)
  })
  .strict()
  .superRefine((value, context) => {
    if (JSON.stringify(value) !== JSON.stringify(canonicalChartAiConsentNotices[value.locale])) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Consent notice must match the canonical locale object"
      });
    }
  });
export type ClientDataConsentNotice =
  (typeof canonicalChartAiConsentNotices)[ClientDataConsentLocale];

export const currentClientDataConsentSchema = z
  .object({
    id: uuidSchema,
    clientUserId: uuidSchema,
    astrologerUserId: uuidSchema,
    purpose: z.literal(clientDataConsentPurpose),
    policyVersion: z.literal(chartAiConsentPolicyVersion),
    processorCode: z.literal(chartAiConsentProcessorCode),
    noticeLocale: clientDataConsentLocaleSchema,
    noticeSha256: clientDataConsentSha256Schema,
    grantedAt: timestampSchema
  })
  .strict()
  .superRefine((value, context) => {
    addNoticeHashLocaleIssue(value, context);
  });
export type CurrentClientDataConsent = z.infer<typeof currentClientDataConsentSchema>;

export const clientDataConsentListQuerySchema = z
  .object({ locale: clientDataConsentLocaleSchema })
  .strict();
export type ClientDataConsentListQuery = z.infer<typeof clientDataConsentListQuerySchema>;

export const grantChartAiConsentParamsSchema = z.object({ astrologerUserId: uuidSchema }).strict();
export type GrantChartAiConsentParams = z.infer<typeof grantChartAiConsentParamsSchema>;

export const grantChartAiConsentRequestSchema = z
  .object({
    accepted: z.literal(true),
    policyVersion: z.literal(chartAiConsentPolicyVersion),
    noticeSha256: clientDataConsentSha256Schema,
    locale: clientDataConsentLocaleSchema
  })
  .strict()
  .superRefine((value, context) => {
    addNoticeHashLocaleIssue(value, context);
  });
export type GrantChartAiConsentRequest = z.infer<typeof grantChartAiConsentRequestSchema>;

export const revokeClientDataConsentParamsSchema = z.object({ consentId: uuidSchema }).strict();
export type RevokeClientDataConsentParams = z.infer<typeof revokeClientDataConsentParamsSchema>;

export const revokeClientDataConsentRequestSchema = z.object({}).strict();
export type RevokeClientDataConsentRequest = z.infer<typeof revokeClientDataConsentRequestSchema>;

export const clientDataConsentListItemSchema = z
  .object({
    astrologerUserId: uuidSchema,
    publicHandle: astrologerPublicHandleSchema,
    publicName: nonEmptyStringSchema.min(2).max(200),
    relationshipStatus: clientRelationshipStatusSchema,
    state: clientDataConsentStateSchema,
    consentId: uuidSchema.nullable(),
    noticeLocale: clientDataConsentLocaleSchema.nullable(),
    grantedAt: timestampSchema.nullable(),
    revokedAt: timestampSchema.nullable()
  })
  .strict()
  .superRefine((value, context) => {
    const hasAnyConsentEvidence =
      value.consentId !== null ||
      value.noticeLocale !== null ||
      value.grantedAt !== null ||
      value.revokedAt !== null;
    const hasPersistedConsent = value.consentId !== null && value.grantedAt !== null;
    if (value.state === "missing" && hasAnyConsentEvidence) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Missing consent cannot contain persisted consent evidence"
      });
    }
    if (value.state !== "missing" && !hasPersistedConsent) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Persisted consent state requires a consent snapshot"
      });
    }
    if (value.state === "revoked" && value.revokedAt === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["revokedAt"],
        message: "Revoked consent requires a revocation timestamp"
      });
    }
    if (value.state !== "revoked" && value.revokedAt !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["revokedAt"],
        message: "Only revoked consent can contain a revocation timestamp"
      });
    }
    if (value.state === "granted" && value.noticeLocale === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["noticeLocale"],
        message: "Granted consent requires its canonical notice locale"
      });
    }
    if (value.state === "granted" && value.relationshipStatus !== "active") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["relationshipStatus"],
        message: "Granted consent requires an active relationship"
      });
    }
  });
export type ClientDataConsentListItem = z.infer<typeof clientDataConsentListItemSchema>;

export const clientDataConsentListResponseSchema = z
  .object({
    policy: currentChartAiConsentPolicySchema,
    notice: clientDataConsentNoticeSchema,
    noticeSha256: clientDataConsentSha256Schema,
    consents: z.array(clientDataConsentListItemSchema)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.noticeSha256 !== chartAiConsentNoticeSha256ByLocale[value.notice.locale]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["noticeSha256"],
        message: "Consent notice hash does not match its locale"
      });
    }
    const seen = new Set<string>();
    value.consents.forEach((item, index) => {
      if (seen.has(item.astrologerUserId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["consents", index, "astrologerUserId"],
          message: "Consent list cannot repeat an astrologer relationship"
        });
      }
      seen.add(item.astrologerUserId);
    });
  });
export type ClientDataConsentListResponse = z.infer<typeof clientDataConsentListResponseSchema>;

export const grantChartAiConsentResponseSchema = z
  .object({
    state: z.literal("granted"),
    consent: currentClientDataConsentSchema
  })
  .strict();
export type GrantChartAiConsentResponse = z.infer<typeof grantChartAiConsentResponseSchema>;

export const revokeClientDataConsentResponseSchema = z
  .object({
    state: z.literal("revoked"),
    consentId: uuidSchema,
    revokedAt: timestampSchema
  })
  .strict();
export type RevokeClientDataConsentResponse = z.infer<typeof revokeClientDataConsentResponseSchema>;

function addNoticeHashLocaleIssue(
  value: {
    readonly locale?: ClientDataConsentLocale;
    readonly noticeLocale?: ClientDataConsentLocale;
    readonly noticeSha256: string;
  },
  context: z.RefinementCtx
): void {
  const locale = value.locale ?? value.noticeLocale;
  if (locale && value.noticeSha256 !== chartAiConsentNoticeSha256ByLocale[locale]) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["noticeSha256"],
      message: "Consent notice hash does not match its locale"
    });
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
