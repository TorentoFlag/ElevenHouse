import { z } from "@elevenhouse/validation";

const uuidSchema = z.string().uuid();

const chartJsonRecordSchema = z.record(z.string(), z.unknown());

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

export const chartTransitMomentSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    timezone: z.string().trim().min(1).max(100).optional(),
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
export type ChartSynastryJobCreateRequest = z.infer<
  typeof chartSynastryJobCreateRequestSchema
>;

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
export type ChartProviderMetadata = z.infer<typeof chartProviderMetadataSchema>;

export const chartInputSnapshotSchema = z
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
export type ChartInputSnapshot = z.infer<typeof chartInputSnapshotSchema>;

export const chartTransitSnapshotSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    timezone: z.string().trim().min(1).max(100),
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
        timezone: z.string().trim().min(1).max(100),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180)
      })
      .strict(),
    resolvedAt: z.string().datetime()
  })
  .strict();
export type ChartSolarReturnSnapshot = z.infer<typeof chartSolarReturnSnapshotSchema>;

export const chartNatalCalculationRequestSchema = z
  .object({
    schemaVersion: z.literal("chart-request.v1"),
    method: z.literal("natal"),
    settings: chartSettingsSchema,
    inputSnapshot: chartInputSnapshotSchema
  })
  .strict();
export type ChartNatalCalculationRequestInput = z.input<
  typeof chartNatalCalculationRequestSchema
>;
export type ChartNatalCalculationRequest = z.infer<typeof chartNatalCalculationRequestSchema>;

export const chartTransitCalculationRequestSchema = z
  .object({
    schemaVersion: z.literal("chart-request.v1"),
    method: z.literal("transit"),
    settings: chartSettingsSchema,
    inputSnapshot: chartInputSnapshotSchema,
    transitSnapshot: chartTransitSnapshotSchema
  })
  .strict();
export type ChartTransitCalculationRequestInput = z.input<
  typeof chartTransitCalculationRequestSchema
>;
export type ChartTransitCalculationRequest = z.infer<typeof chartTransitCalculationRequestSchema>;

export const chartSynastryCalculationRequestSchema = z
  .object({
    schemaVersion: z.literal("chart-request.v1"),
    method: z.literal("synastry"),
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
  .strict();
export type ChartSynastryCalculationRequestInput = z.input<
  typeof chartSynastryCalculationRequestSchema
>;
export type ChartSynastryCalculationRequest = z.infer<
  typeof chartSynastryCalculationRequestSchema
>;

export const chartSolarReturnCalculationRequestSchema = z
  .object({
    schemaVersion: z.literal("chart-request.v1"),
    method: z.literal("solar_return"),
    settings: chartSettingsSchema,
    inputSnapshot: chartInputSnapshotSchema,
    solarReturnSnapshot: z
      .object({
        year: z.number().int().min(1900).max(2100),
        returnType: z.literal("solar"),
        location: z
          .object({
            timezone: z.string().trim().min(1).max(100),
            latitude: z.number().min(-90).max(90),
            longitude: z.number().min(-180).max(180)
          })
          .strict()
      })
      .strict()
  })
  .strict();
export type ChartSolarReturnCalculationRequestInput = z.input<
  typeof chartSolarReturnCalculationRequestSchema
>;
export type ChartSolarReturnCalculationRequest = z.infer<
  typeof chartSolarReturnCalculationRequestSchema
>;

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
    for (let houseNumber = 1; houseNumber <= 12; houseNumber += 1) {
      if (!houseNumbers.has(houseNumber)) {
        context.addIssue({
          code: "custom",
          path: ["houses"],
          message: `Missing house ${houseNumber}`
        });
      }
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
export type ChartSynastryRelationshipScore = z.infer<
  typeof chartSynastryRelationshipScoreSchema
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

export const storedChartNatalCalculationPayloadSchema = z
  .object({
    schemaVersion: z.literal("chart-result.v1"),
    method: z.literal("natal"),
    provider: chartProviderMetadataSchema,
    settings: chartSettingsSchema,
    inputSnapshot: chartInputSnapshotSchema,
    result: chartRenderResultSchema
  })
  .strict();
export type StoredChartNatalCalculationPayload = z.infer<
  typeof storedChartNatalCalculationPayloadSchema
>;

export const storedChartTransitCalculationPayloadSchema = z
  .object({
    schemaVersion: z.literal("chart-result.v1"),
    method: z.literal("transit"),
    provider: chartProviderMetadataSchema,
    settings: chartSettingsSchema,
    inputSnapshot: chartInputSnapshotSchema,
    transitSnapshot: chartTransitSnapshotSchema,
    result: chartTransitRenderResultSchema
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
    inputSnapshot: chartInputSnapshotSchema,
    partnerInputSnapshot: chartInputSnapshotSchema,
    relationshipSnapshot: z
      .object({
        primaryClientId: uuidSchema,
        partnerClientId: uuidSchema
      })
      .strict(),
    result: chartSynastryRenderResultSchema
  })
  .strict();
export type StoredChartSynastryCalculationPayload = z.infer<
  typeof storedChartSynastryCalculationPayloadSchema
>;

export const storedChartSolarReturnCalculationPayloadSchema = z
  .object({
    schemaVersion: z.literal("chart-result.v1"),
    method: z.literal("solar_return"),
    provider: chartProviderMetadataSchema,
    settings: chartSettingsSchema,
    inputSnapshot: chartInputSnapshotSchema,
    solarReturnSnapshot: chartSolarReturnSnapshotSchema,
    result: chartSolarReturnRenderResultSchema
  })
  .strict();
export type StoredChartSolarReturnCalculationPayload = z.infer<
  typeof storedChartSolarReturnCalculationPayloadSchema
>;

export const storedChartCalculationPayloadSchema = z.discriminatedUnion("method", [
  storedChartNatalCalculationPayloadSchema,
  storedChartTransitCalculationPayloadSchema,
  storedChartSynastryCalculationPayloadSchema,
  storedChartSolarReturnCalculationPayloadSchema
]);
export type StoredChartCalculationPayload = z.infer<typeof storedChartCalculationPayloadSchema>;

export const chartCalculationResultRecordSchema = chartJsonRecordSchema;

export const chartPlanetaryPositionsSettingsSchema = z
  .object({
    zodiac: z.literal("tropical").optional().default("tropical"),
    nodeType: z.enum(["true", "mean"])
  })
  .strict();
export type ChartPlanetaryPositionsSettings = z.infer<
  typeof chartPlanetaryPositionsSettingsSchema
>;

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
export type ChartPlanetaryPositionsRequest = z.infer<
  typeof chartPlanetaryPositionsRequestSchema
>;

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
export type ChartPlanetaryPositionsResponse = z.infer<
  typeof chartPlanetaryPositionsResponseSchema
>;
