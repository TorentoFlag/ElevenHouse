import { z } from "@elevenhouse/validation";
import { sha256DigestSchema } from "./calculations";

const uuidSchema = z.string().uuid();

const chartJsonRecordSchema = z.record(z.string(), z.unknown());

export const chartMethodVersions = {
  natal: "chart.natal.kerykeion-5.12.v2",
  astrocartography: "chart.astrocartography.swisseph.v2",
  transit: "chart.transit.kerykeion-5.12.v2",
  synastry: "chart.synastry.kerykeion-5.12.v2",
  composite: "chart.composite.kerykeion-5.12.v2",
  solar_return: "chart.solar-return.kerykeion-5.12.v2",
  progression: "chart.progression.secondary-tropical-year.v2",
  horary: "chart.horary.kerykeion-5.12.v2"
} as const;
export type ChartCalculationMethod = keyof typeof chartMethodVersions;
export type ChartMethodVersion = (typeof chartMethodVersions)[ChartCalculationMethod];

const chartDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).superRefine((value, context) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month! - 1 ||
    date.getUTCDate() !== day
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid calendar date" });
  }
});

const chartTimeSchema = z.string().regex(/^\d{2}:\d{2}$/).superRefine((value, context) => {
  const [hours, minutes] = value.split(":").map(Number);
  if (hours! > 23 || minutes! > 59) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid clock time" });
  }
});

const chartIanaTimeZoneSchema = z.string().trim().min(1).max(100).superRefine((value, context) => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid IANA time zone" });
  }
});

export const chartExecutionProfileSchema = z
  .object({
    provider: z.literal("kerykeion"),
    kerykeionVersion: z.literal("5.12.9"),
    pyswissephVersion: z.literal("2.10.3.2"),
    expectedEphemeris: z.enum(["swiss-ephemeris", "moshier"]),
    expectedEphemerisFlags: z.array(z.string().trim().min(1).max(100)).min(1),
    expectedEphemerisDataRevision: z.string().trim().min(1).max(100).nullable()
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.expectedEphemerisFlags).size !== value.expectedEphemerisFlags.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expectedEphemerisFlags"],
        message: "Expected ephemeris flags must be unique"
      });
    }
    if (value.expectedEphemeris === "moshier" && value.expectedEphemerisDataRevision !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expectedEphemerisDataRevision"],
        message: "Moshier profiles must not declare ephemeris data revision"
      });
    }
    if (value.expectedEphemeris === "swiss-ephemeris" && value.expectedEphemerisDataRevision === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expectedEphemerisDataRevision"],
        message: "Swiss Ephemeris profiles require a data revision"
      });
    }
  });
export type ChartExecutionProfile = z.infer<typeof chartExecutionProfileSchema>;

export const chartSettingsSchema = z
  .object({
    zodiac: z.literal("tropical").optional().default("tropical"),
    houseSystem: z.enum(["placidus", "koch", "whole_sign", "equal", "regiomontanus"]),
    nodeType: z.enum(["true", "mean"]),
    aspectPreset: z.enum(["major", "major_minor"]),
    orbMultiplier: z.number().min(0.5).max(1.5)
  })
  .strict();
export type ChartSettings = z.infer<typeof chartSettingsSchema>;

export const chartNatalJobCreateRequestSchema = z
  .object({
    clientId: uuidSchema,
    settings: chartSettingsSchema
  })
  .strict();
export type ChartNatalJobCreateRequest = z.infer<typeof chartNatalJobCreateRequestSchema>;

export const chartAstrocartographyJobCreateRequestSchema = z
  .object({
    clientId: uuidSchema,
    settings: chartSettingsSchema
  })
  .strict();
export type ChartAstrocartographyJobCreateRequest = z.infer<
  typeof chartAstrocartographyJobCreateRequestSchema
>;

export const chartTransitMomentSchema = z
  .object({
    date: chartDateSchema,
    time: chartTimeSchema,
    timezone: chartIanaTimeZoneSchema.optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional()
  })
  .strict();
export type ChartTransitMoment = z.infer<typeof chartTransitMomentSchema>;

export const chartTransitJobCreateRequestSchema = z
  .object({
    clientId: uuidSchema,
    settings: chartSettingsSchema,
    transit: chartTransitMomentSchema
  })
  .strict();
export type ChartTransitJobCreateRequest = z.infer<typeof chartTransitJobCreateRequestSchema>;

export const chartSynastryJobCreateRequestSchema = z
  .object({
    clientId: uuidSchema,
    partnerClientId: uuidSchema,
    settings: chartSettingsSchema
  })
  .strict();
export type ChartSynastryJobCreateRequest = z.infer<typeof chartSynastryJobCreateRequestSchema>;

export const chartCompositeJobCreateRequestSchema = z
  .object({
    clientId: uuidSchema,
    partnerClientId: uuidSchema,
    settings: chartSettingsSchema
  })
  .strict();
export type ChartCompositeJobCreateRequest = z.infer<typeof chartCompositeJobCreateRequestSchema>;

export const chartSolarReturnJobCreateRequestSchema = z
  .object({
    clientId: uuidSchema,
    year: z.number().int().min(1900).max(2100),
    settings: chartSettingsSchema
  })
  .strict();
export type ChartSolarReturnJobCreateRequest = z.infer<
  typeof chartSolarReturnJobCreateRequestSchema
>;

export const chartProgressionJobCreateRequestSchema = z
  .object({
    clientId: uuidSchema,
    targetDate: chartDateSchema,
    settings: chartSettingsSchema
  })
  .strict();
export type ChartProgressionJobCreateRequest = z.infer<
  typeof chartProgressionJobCreateRequestSchema
>;

export const chartHoraryQuestionCategorySchema = z.enum([
  "relationship",
  "career",
  "money",
  "home",
  "health",
  "travel",
  "other"
]);
export type ChartHoraryQuestionCategory = z.infer<typeof chartHoraryQuestionCategorySchema>;

export const chartHoraryQuestionSnapshotSchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    category: chartHoraryQuestionCategorySchema.optional().default("other"),
    date: chartDateSchema,
    time: chartTimeSchema,
    timezone: chartIanaTimeZoneSchema,
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
  })
  .strict();
export type ChartHoraryQuestionSnapshot = z.infer<typeof chartHoraryQuestionSnapshotSchema>;

export const chartHoraryJobCreateRequestSchema = z
  .object({
    clientId: uuidSchema,
    question: chartHoraryQuestionSnapshotSchema,
    settings: chartSettingsSchema
  })
  .strict();
export type ChartHoraryJobCreateRequest = z.infer<typeof chartHoraryJobCreateRequestSchema>;

export const chartPublicJobStatusSchema = z.enum(["calculating", "succeeded", "failed"]);
export type ChartPublicJobStatus = z.infer<typeof chartPublicJobStatusSchema>;

export const chartJobResponseSchema = z
  .object({
    id: uuidSchema,
    status: chartPublicJobStatusSchema,
    calculationId: uuidSchema.nullable().optional().default(null),
    failureCode: z.string().trim().min(1).max(100).nullable().optional().default(null),
    failureMessage: z.string().trim().min(1).max(500).nullable().optional().default(null)
  })
  .strict();
export type ChartJobResponse = z.infer<typeof chartJobResponseSchema>;

export const chartCalculationResponseSchema = z
  .object({
    calculationId: uuidSchema,
    result: z.unknown()
  })
  .strict();
export type ChartCalculationResponse = z.infer<typeof chartCalculationResponseSchema>;

export const createChartAiDraftRequestSchema = z
  .object({
    expectedResultChecksum: sha256DigestSchema
  })
  .strict();
export type CreateChartAiDraftRequest = z.infer<typeof createChartAiDraftRequestSchema>;

export const chartNatalJobCreateResponseSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("calculating"),
      jobId: uuidSchema
    })
    .strict(),
  z
    .object({
      status: z.literal("succeeded"),
      calculationId: uuidSchema,
      result: z.unknown()
    })
    .strict()
]);
export type ChartNatalJobCreateResponse = z.infer<typeof chartNatalJobCreateResponseSchema>;

export const chartProviderMetadataSchema = z
  .object({
    name: z.literal("kerykeion"),
    version: z.string().trim().min(1).max(100),
    ephemeris: z.string().trim().min(1).max(100)
  })
  .strict();
export type LegacyChartProviderMetadata = z.infer<typeof chartProviderMetadataSchema>;

export const chartProviderMetadataV2Schema = z
  .object({
    name: z.literal("kerykeion"),
    version: z.string().trim().min(1).max(100),
    ephemeris: z.enum(["swiss-ephemeris", "moshier"]),
    pyswissephVersion: z.string().trim().min(1).max(100),
    ephemerisFlags: z.array(z.string().trim().min(1).max(100)),
    ephemerisDataRevision: z.string().trim().min(1).max(100).nullable()
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.ephemerisFlags).size !== value.ephemerisFlags.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ephemerisFlags"],
        message: "Ephemeris flags must be unique"
      });
    }
    if (value.ephemeris === "moshier" && value.ephemerisDataRevision !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ephemerisDataRevision"],
        message: "Moshier results must not declare ephemeris data revision"
      });
    }
  });
export type ChartProviderMetadata = z.infer<typeof chartProviderMetadataV2Schema>;

export const chartProgressionCalculationBasisSchema = z
  .object({
    symbolicInstant: z.string().datetime(),
    elapsedLifeDays: z.number().finite().min(0),
    elapsedYears: z.number().min(0),
    yearLengthDays: z.literal(365.24219),
    dayForYearRatio: z.literal(1)
  })
  .strict();
export type ChartProgressionCalculationBasis = z.infer<
  typeof chartProgressionCalculationBasisSchema
>;

export const chartInputSnapshotSchema = z
  .object({
    birthDate: chartDateSchema,
    birthTime: chartTimeSchema,
    timezone: chartIanaTimeZoneSchema,
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    birthTimePrecision: z.enum(["exact", "approximate"]),
    dstOccurrence: z.enum(["first", "second"]).optional()
  })
  .strict();
export type ChartInputSnapshot = z.infer<typeof chartInputSnapshotSchema>;

export const chartTransitSnapshotSchema = z
  .object({
    date: chartDateSchema,
    time: chartTimeSchema,
    timezone: chartIanaTimeZoneSchema,
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
  })
  .strict();
export type ChartTransitSnapshot = z.infer<typeof chartTransitSnapshotSchema>;

export const chartSolarReturnSnapshotSchema = z
  .object({
    year: z.number().int().min(1900).max(2100),
    returnType: z.literal("solar"),
    location: z
      .object({
        timezone: chartIanaTimeZoneSchema,
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180)
      })
      .strict(),
    resolvedAt: z.string().datetime()
  })
  .strict();
export type ChartSolarReturnSnapshot = z.infer<typeof chartSolarReturnSnapshotSchema>;

export const chartProgressionRequestSnapshotSchema = z
  .object({
    targetDate: chartDateSchema,
    progressionType: z.literal("secondary")
  })
  .strict();
export type ChartProgressionRequestSnapshot = z.infer<typeof chartProgressionRequestSnapshotSchema>;

export const chartProgressionSnapshotSchema = chartProgressionRequestSnapshotSchema
  .extend({
    calculationBasis: z
      .object({
        symbolicDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        ageDays: z.number().int().min(0),
        dayForYearRatio: z.literal(1)
      })
      .strict()
  })
  .strict();
export type ChartProgressionSnapshot = z.infer<typeof chartProgressionSnapshotSchema>;

export const chartNatalCalculationRequestSchema = z
  .object({
    schemaVersion: z.literal("chart-request.v2"),
    method: z.literal("natal"),
    methodVersion: z.literal(chartMethodVersions.natal),
    executionProfile: chartExecutionProfileSchema,
    settings: chartSettingsSchema,
    inputSnapshot: chartInputSnapshotSchema
  })
  .strict()
  .superRefine((value, context) => {
    addPlacidusLatitudeIssue(value.settings.houseSystem, value.inputSnapshot.latitude, ["inputSnapshot", "latitude"], context);
  });
export type ChartNatalCalculationRequestInput = z.input<typeof chartNatalCalculationRequestSchema>;
export type ChartNatalCalculationRequest = z.infer<typeof chartNatalCalculationRequestSchema>;

export const chartAstrocartographyCalculationRequestSchema = z
  .object({
    schemaVersion: z.literal("chart-request.v2"),
    method: z.literal("astrocartography"),
    methodVersion: z.literal(chartMethodVersions.astrocartography),
    executionProfile: chartExecutionProfileSchema,
    settings: chartSettingsSchema,
    inputSnapshot: chartInputSnapshotSchema
  })
  .strict()
  .superRefine((value, context) => {
    addPlacidusLatitudeIssue(value.settings.houseSystem, value.inputSnapshot.latitude, ["inputSnapshot", "latitude"], context);
  });
export type ChartAstrocartographyCalculationRequestInput = z.input<
  typeof chartAstrocartographyCalculationRequestSchema
>;
export type ChartAstrocartographyCalculationRequest = z.infer<
  typeof chartAstrocartographyCalculationRequestSchema
>;

export const chartTransitCalculationRequestSchema = z
  .object({
    schemaVersion: z.literal("chart-request.v2"),
    method: z.literal("transit"),
    methodVersion: z.literal(chartMethodVersions.transit),
    executionProfile: chartExecutionProfileSchema,
    settings: chartSettingsSchema,
    inputSnapshot: chartInputSnapshotSchema,
    transitSnapshot: chartTransitSnapshotSchema
  })
  .strict()
  .superRefine((value, context) => {
    addPlacidusLatitudeIssue(value.settings.houseSystem, value.inputSnapshot.latitude, ["inputSnapshot", "latitude"], context);
    addPlacidusLatitudeIssue(value.settings.houseSystem, value.transitSnapshot.latitude, ["transitSnapshot", "latitude"], context);
  });
export type ChartTransitCalculationRequestInput = z.input<
  typeof chartTransitCalculationRequestSchema
>;
export type ChartTransitCalculationRequest = z.infer<typeof chartTransitCalculationRequestSchema>;

export const chartSynastryCalculationRequestSchema = z
  .object({
    schemaVersion: z.literal("chart-request.v2"),
    method: z.literal("synastry"),
    methodVersion: z.literal(chartMethodVersions.synastry),
    executionProfile: chartExecutionProfileSchema,
    settings: chartSettingsSchema,
    inputSnapshot: chartInputSnapshotSchema,
    partnerInputSnapshot: chartInputSnapshotSchema,
    relationshipSnapshot: z
      .object({
        primaryClientId: uuidSchema,
        partnerClientId: uuidSchema
      })
      .strict()
  })
  .strict()
  .superRefine((value, context) => {
    addPlacidusLatitudeIssue(value.settings.houseSystem, value.inputSnapshot.latitude, ["inputSnapshot", "latitude"], context);
    addPlacidusLatitudeIssue(value.settings.houseSystem, value.partnerInputSnapshot.latitude, ["partnerInputSnapshot", "latitude"], context);
  });
export type ChartSynastryCalculationRequestInput = z.input<
  typeof chartSynastryCalculationRequestSchema
>;
export type ChartSynastryCalculationRequest = z.infer<typeof chartSynastryCalculationRequestSchema>;

export const chartCompositeCalculationRequestSchema = z
  .object({
    schemaVersion: z.literal("chart-request.v2"),
    method: z.literal("composite"),
    methodVersion: z.literal(chartMethodVersions.composite),
    executionProfile: chartExecutionProfileSchema,
    settings: chartSettingsSchema,
    inputSnapshot: chartInputSnapshotSchema,
    partnerInputSnapshot: chartInputSnapshotSchema,
    relationshipSnapshot: z
      .object({
        primaryClientId: uuidSchema,
        partnerClientId: uuidSchema
      })
      .strict()
  })
  .strict()
  .superRefine((value, context) => {
    addPlacidusLatitudeIssue(value.settings.houseSystem, value.inputSnapshot.latitude, ["inputSnapshot", "latitude"], context);
    addPlacidusLatitudeIssue(value.settings.houseSystem, value.partnerInputSnapshot.latitude, ["partnerInputSnapshot", "latitude"], context);
  });
export type ChartCompositeCalculationRequestInput = z.input<
  typeof chartCompositeCalculationRequestSchema
>;
export type ChartCompositeCalculationRequest = z.infer<
  typeof chartCompositeCalculationRequestSchema
>;

export const chartSolarReturnCalculationRequestSchema = z
  .object({
    schemaVersion: z.literal("chart-request.v2"),
    method: z.literal("solar_return"),
    methodVersion: z.literal(chartMethodVersions.solar_return),
    executionProfile: chartExecutionProfileSchema,
    settings: chartSettingsSchema,
    inputSnapshot: chartInputSnapshotSchema,
    solarReturnSnapshot: z
      .object({
        year: z.number().int().min(1900).max(2100),
        returnType: z.literal("solar"),
        location: z
          .object({
            timezone: chartIanaTimeZoneSchema,
            latitude: z.number().min(-90).max(90),
            longitude: z.number().min(-180).max(180)
          })
          .strict()
      })
      .strict()
  })
  .strict()
  .superRefine((value, context) => {
    addPlacidusLatitudeIssue(value.settings.houseSystem, value.inputSnapshot.latitude, ["inputSnapshot", "latitude"], context);
    addPlacidusLatitudeIssue(value.settings.houseSystem, value.solarReturnSnapshot.location.latitude, ["solarReturnSnapshot", "location", "latitude"], context);
  });
export type ChartSolarReturnCalculationRequestInput = z.input<
  typeof chartSolarReturnCalculationRequestSchema
>;
export type ChartSolarReturnCalculationRequest = z.infer<
  typeof chartSolarReturnCalculationRequestSchema
>;

export const chartProgressionCalculationRequestSchema = z
  .object({
    schemaVersion: z.literal("chart-request.v2"),
    method: z.literal("progression"),
    methodVersion: z.literal(chartMethodVersions.progression),
    executionProfile: chartExecutionProfileSchema,
    settings: chartSettingsSchema,
    inputSnapshot: chartInputSnapshotSchema,
    progressionSnapshot: chartProgressionRequestSnapshotSchema
  })
  .strict()
  .superRefine((value, context) => {
    addPlacidusLatitudeIssue(value.settings.houseSystem, value.inputSnapshot.latitude, ["inputSnapshot", "latitude"], context);
  });
export type ChartProgressionCalculationRequestInput = z.input<
  typeof chartProgressionCalculationRequestSchema
>;
export type ChartProgressionCalculationRequest = z.infer<
  typeof chartProgressionCalculationRequestSchema
>;

export const chartHoraryCalculationRequestSchema = z
  .object({
    schemaVersion: z.literal("chart-request.v2"),
    method: z.literal("horary"),
    methodVersion: z.literal(chartMethodVersions.horary),
    executionProfile: chartExecutionProfileSchema,
    settings: chartSettingsSchema,
    questionSnapshot: chartHoraryQuestionSnapshotSchema
  })
  .strict()
  .superRefine((value, context) => {
    addPlacidusLatitudeIssue(value.settings.houseSystem, value.questionSnapshot.latitude, ["questionSnapshot", "latitude"], context);
  });
export type ChartHoraryCalculationRequestInput = z.input<
  typeof chartHoraryCalculationRequestSchema
>;
export type ChartHoraryCalculationRequest = z.infer<typeof chartHoraryCalculationRequestSchema>;

function addPlacidusLatitudeIssue(
  houseSystem: ChartSettings["houseSystem"],
  latitude: number,
  path: readonly (string | number)[],
  context: z.RefinementCtx
): void {
  if (houseSystem === "placidus" && Math.abs(latitude) > 66) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...path],
      message: "CHART_KERYKEION_PLACIDUS_LATITUDE_UNSUPPORTED"
    });
  }
}

export const chartPointSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(120),
    longitude: z.number().min(0).lt(360),
    sign: z.string().trim().min(1).max(40),
    signDegree: z.number().min(0).lt(30),
    house: z.number().int().min(1).max(12).nullable().optional(),
    retrograde: z.boolean().nullable().optional()
  })
  .strict();
export type ChartPoint = z.infer<typeof chartPointSchema>;

export const chartHouseSchema = z
  .object({
    number: z.number().int().min(1).max(12),
    longitude: z.number().min(0).lt(360),
    sign: z.string().trim().min(1).max(40),
    signDegree: z.number().min(0).lt(30)
  })
  .strict();
export type ChartHouse = z.infer<typeof chartHouseSchema>;

export const chartAspectSchema = z
  .object({
    pointA: z.string().trim().min(1).max(80),
    pointB: z.string().trim().min(1).max(80),
    type: z.string().trim().min(1).max(80),
    angle: z.number().min(0).max(180),
    orb: z.number().min(0),
    applying: z.boolean().nullable().optional(),
    strength: z.number().min(0).max(1).nullable().optional()
  })
  .strict();
export type ChartAspect = z.infer<typeof chartAspectSchema>;

export const chartDistributionsSchema = z
  .object({
    elements: z
      .object({
        fire: z.number().int().min(0),
        earth: z.number().int().min(0),
        air: z.number().int().min(0),
        water: z.number().int().min(0)
      })
      .strict(),
    modalities: z
      .object({
        cardinal: z.number().int().min(0),
        fixed: z.number().int().min(0),
        mutable: z.number().int().min(0)
      })
      .strict(),
    polarity: z
      .object({
        masculine: z.number().int().min(0),
        feminine: z.number().int().min(0)
      })
      .strict()
  })
  .strict();
export type ChartDistributions = z.infer<typeof chartDistributionsSchema>;

export const chartWarningSchema = z
  .object({
    code: z.string().trim().min(1).max(100),
    message: z.string().trim().min(1).max(500)
  })
  .strict();
export type ChartWarning = z.infer<typeof chartWarningSchema>;

export const chartRenderResultSchema = z
  .object({
    points: z.array(chartPointSchema),
    houses: z.array(chartHouseSchema),
    aspects: z.array(chartAspectSchema),
    distributions: chartDistributionsSchema,
    warnings: z.array(chartWarningSchema)
  })
  .strict()
  .superRefine((value, context) => {
    const requiredPoints = [
      "sun",
      "moon",
      "mercury",
      "venus",
      "mars",
      "jupiter",
      "saturn",
      "uranus",
      "neptune",
      "pluto",
      "ascendant",
      "midheaven",
      "north_node",
      "south_node"
    ];
    const pointIds = new Set(value.points.map((point) => point.id));
    if (pointIds.size !== value.points.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["points"],
        message: "Chart point ids must be unique"
      });
    }
    for (const pointId of requiredPoints) {
      if (!pointIds.has(pointId)) {
        context.addIssue({
          code: "custom",
          path: ["points"],
          message: `Missing required chart point ${pointId}`
        });
      }
    }

    const houseNumbers = new Set(value.houses.map((house) => house.number));
    if (houseNumbers.size !== value.houses.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["houses"],
        message: "Chart house numbers must be unique"
      });
    }
    for (let houseNumber = 1; houseNumber <= 12; houseNumber += 1) {
      if (!houseNumbers.has(houseNumber)) {
        context.addIssue({
          code: "custom",
          path: ["houses"],
          message: `Missing house ${houseNumber}`
        });
      }
    }

    const normalizedAspectPairs = new Set<string>();
    for (const [index, aspect] of value.aspects.entries()) {
      if (!pointIds.has(aspect.pointA) || !pointIds.has(aspect.pointB)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["aspects", index],
          message: "Chart aspect must reference known points"
        });
      }
      if (aspect.pointA === aspect.pointB) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["aspects", index],
          message: "Chart aspect cannot reference itself"
        });
      }
      const pair = [aspect.pointA, aspect.pointB].sort().join("|");
      if (normalizedAspectPairs.has(pair)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["aspects", index],
          message: "Chart aspects must not duplicate normalized point pairs"
        });
      }
      normalizedAspectPairs.add(pair);
    }

    const distributionTotals = [
      Object.values(value.distributions.elements),
      Object.values(value.distributions.modalities),
      Object.values(value.distributions.polarity)
    ].map((counts) => counts.reduce((total, count) => total + count, 0));
    if (distributionTotals.some((total) => total !== 10)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["distributions"],
        message: "Chart distributions must each total ten planetary points"
      });
    }
  });
export type ChartRenderResult = z.infer<typeof chartRenderResultSchema>;

export const chartTransitAspectSchema = z
  .object({
    transitPoint: z.string().trim().min(1).max(80),
    natalPoint: z.string().trim().min(1).max(80),
    type: z.string().trim().min(1).max(80),
    angle: z.number().min(0).max(180),
    orb: z.number().min(0),
    applying: z.boolean().nullable().optional(),
    strength: z.number().min(0).max(1).nullable().optional()
  })
  .strict();
export type ChartTransitAspect = z.infer<typeof chartTransitAspectSchema>;

export const chartTransitRenderResultSchema = z
  .object({
    natal: chartRenderResultSchema,
    transit: chartRenderResultSchema,
    aspectsToNatal: z.array(chartTransitAspectSchema),
    warnings: z.array(chartWarningSchema)
  })
  .strict();
export type ChartTransitRenderResult = z.infer<typeof chartTransitRenderResultSchema>;

export const chartSolarReturnAspectSchema = z
  .object({
    solarReturnPoint: z.string().trim().min(1).max(80),
    natalPoint: z.string().trim().min(1).max(80),
    type: z.string().trim().min(1).max(80),
    angle: z.number().min(0).max(180),
    orb: z.number().min(0),
    applying: z.boolean().nullable().optional(),
    strength: z.number().min(0).max(1).nullable().optional()
  })
  .strict();
export type ChartSolarReturnAspect = z.infer<typeof chartSolarReturnAspectSchema>;

export const chartSolarReturnRenderResultSchema = z
  .object({
    natal: chartRenderResultSchema,
    solarReturn: chartRenderResultSchema,
    aspectsToNatal: z.array(chartSolarReturnAspectSchema),
    warnings: z.array(chartWarningSchema)
  })
  .strict();
export type ChartSolarReturnRenderResult = z.infer<typeof chartSolarReturnRenderResultSchema>;

export const chartProgressionAspectSchema = z
  .object({
    progressedPoint: z.string().trim().min(1).max(80),
    natalPoint: z.string().trim().min(1).max(80),
    type: z.string().trim().min(1).max(80),
    angle: z.number().min(0).max(180),
    orb: z.number().min(0),
    applying: z.boolean().nullable().optional(),
    strength: z.number().min(0).max(1).nullable().optional()
  })
  .strict();
export type ChartProgressionAspect = z.infer<typeof chartProgressionAspectSchema>;

export const chartProgressionRenderResultSchema = z
  .object({
    natal: chartRenderResultSchema,
    progressed: chartRenderResultSchema,
    aspectsToNatal: z.array(chartProgressionAspectSchema),
    warnings: z.array(chartWarningSchema)
  })
  .strict();
export type ChartProgressionRenderResult = z.infer<typeof chartProgressionRenderResultSchema>;

export const chartSynastryAspectSchema = z
  .object({
    primaryPoint: z.string().trim().min(1).max(80),
    partnerPoint: z.string().trim().min(1).max(80),
    type: z.string().trim().min(1).max(80),
    angle: z.number().min(0).max(180),
    orb: z.number().min(0),
    applying: z.boolean().nullable().optional(),
    strength: z.number().min(0).max(1).nullable().optional()
  })
  .strict();
export type ChartSynastryAspect = z.infer<typeof chartSynastryAspectSchema>;

export const chartSynastryHouseOverlaySchema = z
  .object({
    owner: z.enum(["primary", "partner"]),
    point: z.string().trim().min(1).max(80),
    projectedHouseOwner: z.enum(["primary", "partner"]),
    projectedHouse: z.number().int().min(1).max(12)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.owner === value.projectedHouseOwner) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["projectedHouseOwner"],
        message: "Synastry house overlay must project into the other participant's houses"
      });
    }
  });
export type ChartSynastryHouseOverlay = z.infer<typeof chartSynastryHouseOverlaySchema>;

export const chartSynastryRelationshipScoreSchema = z
  .object({
    value: z.number().min(0),
    label: z.string().trim().min(1).max(80),
    breakdown: z.array(
      z
        .object({
          code: z.string().trim().min(1).max(120),
          points: z.number()
        })
        .strict()
    )
  })
  .strict();
export type ChartSynastryRelationshipScore = z.infer<typeof chartSynastryRelationshipScoreSchema>;

export const chartAstrocartographyPointSchema = z.enum([
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto"
]);
export type ChartAstrocartographyPoint = z.infer<typeof chartAstrocartographyPointSchema>;

export const chartAstrocartographyAngleSchema = z.enum(["asc", "dsc", "mc", "ic"]);
export type ChartAstrocartographyAngle = z.infer<typeof chartAstrocartographyAngleSchema>;

export const chartAstrocartographyPathPointSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
  })
  .strict();
export type ChartAstrocartographyPathPoint = z.infer<
  typeof chartAstrocartographyPathPointSchema
>;

export const chartAstrocartographyLineSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    point: chartAstrocartographyPointSchema,
    angle: chartAstrocartographyAngleSchema,
    label: z.string().trim().min(1).max(120),
    path: z.array(chartAstrocartographyPathPointSchema).min(2)
  })
  .strict()
  .superRefine((value, context) => {
    const expectedId = `${value.point}_${value.angle}`;
    if (value.id !== expectedId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["id"],
        message: `Astrocartography line id must be ${expectedId}`
      });
    }
  });
export type ChartAstrocartographyLine = z.infer<typeof chartAstrocartographyLineSchema>;

export const chartAstrocartographyRenderResultSchema = z
  .object({
    lines: z.array(chartAstrocartographyLineSchema),
    warnings: z.array(chartWarningSchema)
  })
  .strict()
  .superRefine((value, context) => {
    const lineIds = new Set(value.lines.map((line) => line.id));
    for (const point of chartAstrocartographyPointSchema.options) {
      for (const angle of chartAstrocartographyAngleSchema.options) {
        const lineId = `${point}_${angle}`;
        if (!lineIds.has(lineId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["lines"],
            message: `Missing astrocartography line ${lineId}`
          });
        }
      }
    }
  });
export type ChartAstrocartographyRenderResult = z.infer<
  typeof chartAstrocartographyRenderResultSchema
>;

export const chartSynastryRenderResultSchema = z
  .object({
    primary: chartRenderResultSchema,
    partner: chartRenderResultSchema,
    aspectsBetween: z.array(chartSynastryAspectSchema),
    houseOverlays: z.array(chartSynastryHouseOverlaySchema),
    relationshipScore: chartSynastryRelationshipScoreSchema.optional(),
    warnings: z.array(chartWarningSchema)
  })
  .strict();
export type ChartSynastryRenderResult = z.infer<typeof chartSynastryRenderResultSchema>;

const legacyChartInputSnapshotSchema = z
  .object({
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    birthTime: z.string().regex(/^\d{2}:\d{2}$/),
    timezone: z.string().trim().min(1).max(100),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    birthTimePrecision: z.enum(["exact", "approximate"]),
    dstOccurrence: z.enum(["first", "second"]).optional()
  })
  .strict();

const legacyChartTransitSnapshotSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    timezone: z.string().trim().min(1).max(100),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
  })
  .strict();

const legacyChartSolarReturnSnapshotSchema = z
  .object({
    year: z.number().int().min(1900).max(2100),
    returnType: z.literal("solar"),
    location: z
      .object({
        timezone: z.string().trim().min(1).max(100),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180)
      })
      .strict(),
    resolvedAt: z.string().datetime()
  })
  .strict();

const legacyChartProgressionSnapshotSchema = z
  .object({
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    progressionType: z.literal("secondary"),
    calculationBasis: z
      .object({
        symbolicDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        ageDays: z.number().int().min(0),
        dayForYearRatio: z.literal(1)
      })
      .strict()
  })
  .strict();

const legacyChartHoraryQuestionSnapshotSchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    category: chartHoraryQuestionCategorySchema.optional().default("other"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    timezone: z.string().trim().min(1).max(100),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
  })
  .strict();

const legacyChartRenderResultSchema = z
  .object({
    points: z.array(chartPointSchema),
    houses: z.array(chartHouseSchema),
    aspects: z.array(chartAspectSchema),
    distributions: chartDistributionsSchema,
    warnings: z.array(chartWarningSchema)
  })
  .strict()
  .superRefine((value, context) => {
    const requiredPoints = [
      "sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune",
      "pluto", "ascendant", "midheaven", "north_node", "south_node"
    ];
    const pointIds = new Set(value.points.map((point) => point.id));
    for (const pointId of requiredPoints) {
      if (!pointIds.has(pointId)) {
        context.addIssue({ code: "custom", path: ["points"], message: `Missing required chart point ${pointId}` });
      }
    }
    const houseNumbers = new Set(value.houses.map((house) => house.number));
    for (let houseNumber = 1; houseNumber <= 12; houseNumber += 1) {
      if (!houseNumbers.has(houseNumber)) {
        context.addIssue({ code: "custom", path: ["houses"], message: `Missing house ${houseNumber}` });
      }
    }
  });

const legacyChartTransitRenderResultSchema = z
  .object({
    natal: legacyChartRenderResultSchema,
    transit: legacyChartRenderResultSchema,
    aspectsToNatal: z.array(chartTransitAspectSchema),
    warnings: z.array(chartWarningSchema)
  })
  .strict();

const legacyChartSolarReturnRenderResultSchema = z
  .object({
    natal: legacyChartRenderResultSchema,
    solarReturn: legacyChartRenderResultSchema,
    aspectsToNatal: z.array(chartSolarReturnAspectSchema),
    warnings: z.array(chartWarningSchema)
  })
  .strict();

const legacyChartProgressionRenderResultSchema = z
  .object({
    natal: legacyChartRenderResultSchema,
    progressed: legacyChartRenderResultSchema,
    aspectsToNatal: z.array(chartProgressionAspectSchema),
    warnings: z.array(chartWarningSchema)
  })
  .strict();

const legacyChartAstrocartographyLineSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    point: chartAstrocartographyPointSchema,
    angle: chartAstrocartographyAngleSchema,
    label: z.string().trim().min(1).max(120),
    path: z.array(chartAstrocartographyPathPointSchema).min(2)
  })
  .strict();

const legacyChartAstrocartographyRenderResultSchema = z
  .object({
    lines: z.array(legacyChartAstrocartographyLineSchema),
    warnings: z.array(chartWarningSchema)
  })
  .strict();

const legacyChartSynastryHouseOverlaySchema = z
  .object({
    owner: z.enum(["primary", "partner"]),
    point: z.string().trim().min(1).max(80),
    projectedHouseOwner: z.enum(["primary", "partner"]),
    projectedHouse: z.number().int().min(1).max(12)
  })
  .strict();

const legacyChartSynastryRenderResultSchema = z
  .object({
    primary: legacyChartRenderResultSchema,
    partner: legacyChartRenderResultSchema,
    aspectsBetween: z.array(chartSynastryAspectSchema),
    houseOverlays: z.array(legacyChartSynastryHouseOverlaySchema),
    relationshipScore: chartSynastryRelationshipScoreSchema.optional(),
    warnings: z.array(chartWarningSchema)
  })
  .strict();

export const storedChartNatalCalculationPayloadSchema = z
  .object({
    schemaVersion: z.literal("chart-result.v1"),
    method: z.literal("natal"),
    provider: chartProviderMetadataSchema,
    settings: chartSettingsSchema,
    inputSnapshot: legacyChartInputSnapshotSchema,
    result: legacyChartRenderResultSchema
  })
  .strict();
export type StoredChartNatalCalculationPayload = z.infer<
  typeof storedChartNatalCalculationPayloadSchema
>;

export const storedChartAstrocartographyCalculationPayloadSchema = z
  .object({
    schemaVersion: z.literal("chart-result.v1"),
    method: z.literal("astrocartography"),
    provider: chartProviderMetadataSchema,
    settings: chartSettingsSchema,
    inputSnapshot: legacyChartInputSnapshotSchema,
    result: legacyChartAstrocartographyRenderResultSchema
  })
  .strict();
export type StoredChartAstrocartographyCalculationPayload = z.infer<
  typeof storedChartAstrocartographyCalculationPayloadSchema
>;

export const storedChartTransitCalculationPayloadSchema = z
  .object({
    schemaVersion: z.literal("chart-result.v1"),
    method: z.literal("transit"),
    provider: chartProviderMetadataSchema,
    settings: chartSettingsSchema,
    inputSnapshot: legacyChartInputSnapshotSchema,
    transitSnapshot: legacyChartTransitSnapshotSchema,
    result: legacyChartTransitRenderResultSchema
  })
  .strict();
export type StoredChartTransitCalculationPayload = z.infer<
  typeof storedChartTransitCalculationPayloadSchema
>;

export const storedChartSynastryCalculationPayloadSchema = z
  .object({
    schemaVersion: z.literal("chart-result.v1"),
    method: z.literal("synastry"),
    provider: chartProviderMetadataSchema,
    settings: chartSettingsSchema,
    inputSnapshot: legacyChartInputSnapshotSchema,
    partnerInputSnapshot: legacyChartInputSnapshotSchema,
    relationshipSnapshot: z
      .object({
        primaryClientId: uuidSchema,
        partnerClientId: uuidSchema
      })
      .strict(),
    result: legacyChartSynastryRenderResultSchema
  })
  .strict();
export type StoredChartSynastryCalculationPayload = z.infer<
  typeof storedChartSynastryCalculationPayloadSchema
>;

export const storedChartCompositeCalculationPayloadSchema = z
  .object({
    schemaVersion: z.literal("chart-result.v1"),
    method: z.literal("composite"),
    provider: chartProviderMetadataSchema,
    settings: chartSettingsSchema,
    inputSnapshot: legacyChartInputSnapshotSchema,
    partnerInputSnapshot: legacyChartInputSnapshotSchema,
    relationshipSnapshot: z
      .object({
        primaryClientId: uuidSchema,
        partnerClientId: uuidSchema
      })
      .strict(),
    result: legacyChartRenderResultSchema
  })
  .strict();
export type StoredChartCompositeCalculationPayload = z.infer<
  typeof storedChartCompositeCalculationPayloadSchema
>;

export const storedChartSolarReturnCalculationPayloadSchema = z
  .object({
    schemaVersion: z.literal("chart-result.v1"),
    method: z.literal("solar_return"),
    provider: chartProviderMetadataSchema,
    settings: chartSettingsSchema,
    inputSnapshot: legacyChartInputSnapshotSchema,
    solarReturnSnapshot: legacyChartSolarReturnSnapshotSchema,
    result: legacyChartSolarReturnRenderResultSchema
  })
  .strict();
export type StoredChartSolarReturnCalculationPayload = z.infer<
  typeof storedChartSolarReturnCalculationPayloadSchema
>;

export const storedChartProgressionCalculationPayloadSchema = z
  .object({
    schemaVersion: z.literal("chart-result.v1"),
    method: z.literal("progression"),
    provider: chartProviderMetadataSchema,
    settings: chartSettingsSchema,
    inputSnapshot: legacyChartInputSnapshotSchema,
    progressionSnapshot: legacyChartProgressionSnapshotSchema,
    result: legacyChartProgressionRenderResultSchema
  })
  .strict();
export type StoredChartProgressionCalculationPayload = z.infer<
  typeof storedChartProgressionCalculationPayloadSchema
>;

export const storedChartHoraryCalculationPayloadSchema = z
  .object({
    schemaVersion: z.literal("chart-result.v1"),
    method: z.literal("horary"),
    provider: chartProviderMetadataSchema,
    settings: chartSettingsSchema,
    questionSnapshot: legacyChartHoraryQuestionSnapshotSchema,
    result: legacyChartRenderResultSchema
  })
  .strict();
export type StoredChartHoraryCalculationPayload = z.infer<
  typeof storedChartHoraryCalculationPayloadSchema
>;

export const storedChartCalculationPayloadSchema = z.discriminatedUnion("method", [
  storedChartNatalCalculationPayloadSchema,
  storedChartAstrocartographyCalculationPayloadSchema,
  storedChartTransitCalculationPayloadSchema,
  storedChartSynastryCalculationPayloadSchema,
  storedChartCompositeCalculationPayloadSchema,
  storedChartSolarReturnCalculationPayloadSchema,
  storedChartProgressionCalculationPayloadSchema,
  storedChartHoraryCalculationPayloadSchema
]);
export type StoredChartCalculationPayload = z.infer<typeof storedChartCalculationPayloadSchema>;

const reproducibleChartResultFields = {
  schemaVersion: z.literal("chart-result.v2"),
  provider: chartProviderMetadataV2Schema,
  reproducibilityFingerprint: sha256DigestSchema
} as const;

export const chartNatalResultV2Schema = storedChartNatalCalculationPayloadSchema.extend({
  ...reproducibleChartResultFields,
  methodVersion: z.literal(chartMethodVersions.natal),
  inputSnapshot: chartInputSnapshotSchema,
  result: chartRenderResultSchema
});
export const chartAstrocartographyResultV2Schema = storedChartAstrocartographyCalculationPayloadSchema.extend({
  ...reproducibleChartResultFields,
  methodVersion: z.literal(chartMethodVersions.astrocartography),
  inputSnapshot: chartInputSnapshotSchema,
  result: chartAstrocartographyRenderResultSchema
});
export const chartTransitResultV2Schema = storedChartTransitCalculationPayloadSchema.extend({
  ...reproducibleChartResultFields,
  methodVersion: z.literal(chartMethodVersions.transit),
  inputSnapshot: chartInputSnapshotSchema,
  transitSnapshot: chartTransitSnapshotSchema,
  result: chartTransitRenderResultSchema
});
export const chartSynastryResultV2Schema = storedChartSynastryCalculationPayloadSchema.extend({
  ...reproducibleChartResultFields,
  methodVersion: z.literal(chartMethodVersions.synastry),
  inputSnapshot: chartInputSnapshotSchema,
  partnerInputSnapshot: chartInputSnapshotSchema,
  result: chartSynastryRenderResultSchema
});
export const chartCompositeResultV2Schema = storedChartCompositeCalculationPayloadSchema.extend({
  ...reproducibleChartResultFields,
  methodVersion: z.literal(chartMethodVersions.composite),
  inputSnapshot: chartInputSnapshotSchema,
  partnerInputSnapshot: chartInputSnapshotSchema,
  result: chartRenderResultSchema
});
export const chartSolarReturnResultV2Schema = storedChartSolarReturnCalculationPayloadSchema.extend({
  ...reproducibleChartResultFields,
  methodVersion: z.literal(chartMethodVersions.solar_return),
  inputSnapshot: chartInputSnapshotSchema,
  solarReturnSnapshot: chartSolarReturnSnapshotSchema,
  result: chartSolarReturnRenderResultSchema
});
export const chartProgressionResultV2Schema = storedChartProgressionCalculationPayloadSchema.extend({
  ...reproducibleChartResultFields,
  methodVersion: z.literal(chartMethodVersions.progression),
  inputSnapshot: chartInputSnapshotSchema,
  progressionSnapshot: chartProgressionSnapshotSchema,
  result: chartProgressionRenderResultSchema,
  calculationBasis: chartProgressionCalculationBasisSchema
});
export const chartHoraryResultV2Schema = storedChartHoraryCalculationPayloadSchema.extend({
  ...reproducibleChartResultFields,
  methodVersion: z.literal(chartMethodVersions.horary),
  questionSnapshot: chartHoraryQuestionSnapshotSchema,
  result: chartRenderResultSchema
});

export const reproducibleChartResultSchema = z.union([
  chartNatalResultV2Schema,
  chartAstrocartographyResultV2Schema,
  chartTransitResultV2Schema,
  chartSynastryResultV2Schema,
  chartCompositeResultV2Schema,
  chartSolarReturnResultV2Schema,
  chartProgressionResultV2Schema,
  chartHoraryResultV2Schema
]);

export type ReproducibleChartResult = {
  readonly schemaVersion: "chart-result.v2";
  readonly methodVersion: ChartMethodVersion;
  readonly provider: ChartProviderMetadata;
  readonly reproducibilityFingerprint: `sha256:${string}`;
  readonly calculationBasis?: ChartProgressionCalculationBasis;
};

export const chartResultSchema = z.union([
  storedChartCalculationPayloadSchema,
  reproducibleChartResultSchema
]);
export type ChartResult = z.infer<typeof chartResultSchema>;

export function isReproducibleChartResult(value: unknown): value is ReproducibleChartResult {
  return reproducibleChartResultSchema.safeParse(value).success;
}

export const chartCalculationResultRecordSchema = chartJsonRecordSchema;

export const chartPlanetaryPositionsSettingsSchema = z
  .object({
    zodiac: z.literal("tropical").optional().default("tropical"),
    nodeType: z.enum(["true", "mean"])
  })
  .strict();
export type ChartPlanetaryPositionsSettings = z.infer<typeof chartPlanetaryPositionsSettingsSchema>;

export const chartPlanetaryPositionsRequestSchema = z
  .object({
    schemaVersion: z.literal("chart-positions-request.v1"),
    method: z.literal("planetary_positions"),
    settings: chartPlanetaryPositionsSettingsSchema,
    inputSnapshot: chartInputSnapshotSchema
  })
  .strict();
export type ChartPlanetaryPositionsRequestInput = z.input<
  typeof chartPlanetaryPositionsRequestSchema
>;
export type ChartPlanetaryPositionsRequest = z.infer<typeof chartPlanetaryPositionsRequestSchema>;

const chartPlanetaryPositionBodySchema = z.enum([
  "sun",
  "moon",
  "north_node",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto"
]);

export const chartPlanetaryPositionSchema = z
  .object({
    id: chartPlanetaryPositionBodySchema,
    longitude: z.number().min(0).lt(360),
    retrograde: z.boolean().nullable().optional()
  })
  .strict();
export type ChartPlanetaryPosition = z.infer<typeof chartPlanetaryPositionSchema>;

export const chartPlanetaryPositionsResponseSchema = z
  .object({
    schemaVersion: z.literal("chart-positions-result.v1"),
    method: z.literal("planetary_positions"),
    provider: chartProviderMetadataSchema,
    settings: chartPlanetaryPositionsSettingsSchema,
    inputSnapshot: chartInputSnapshotSchema,
    positions: z.array(chartPlanetaryPositionSchema)
  })
  .strict()
  .superRefine((value, context) => {
    const positionIds = new Set(value.positions.map((position) => position.id));
    for (const body of chartPlanetaryPositionBodySchema.options) {
      if (!positionIds.has(body)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["positions"],
          message: `Missing required planetary position ${body}`
        });
      }
    }
  });
export type ChartPlanetaryPositionsResponse = z.infer<typeof chartPlanetaryPositionsResponseSchema>;
