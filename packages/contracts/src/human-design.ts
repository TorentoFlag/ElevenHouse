import { z } from "@elevenhouse/validation";
import { sha256DigestSchema } from "./calculations";

const longitudeSchema = z.number().min(0).lt(360);
const gateSchema = z.number().int().min(1).max(64);
const lineSchema = z.number().int().min(1).max(6);

const humanDesignMethodCodeSchema = z.literal("human_design_classic");
const humanDesignModeSchema = z.literal("individual");
const humanDesignSchemaVersionSchema = z.literal("human-design-result.v1");
const humanDesignSideSchema = z.enum(["personality", "design"]);
const humanDesignBaseBodySchema = z.enum([
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
const humanDesignActiveBodySchema = z.enum([
  "sun",
  "earth",
  "moon",
  "north_node",
  "south_node",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto"
]);
const humanDesignCenterSchema = z.enum([
  "head",
  "ajna",
  "throat",
  "g",
  "heart",
  "spleen",
  "sacral",
  "solar_plexus",
  "root"
]);
const humanDesignChannelSchema = z.enum([
  "64-47",
  "61-24",
  "63-4",
  "17-62",
  "43-23",
  "11-56",
  "31-7",
  "8-1",
  "33-13",
  "20-10",
  "45-21",
  "35-36",
  "12-22",
  "16-48",
  "20-57",
  "20-34",
  "2-14",
  "15-5",
  "46-29",
  "10-34",
  "25-51",
  "10-57",
  "40-37",
  "26-44",
  "59-6",
  "34-57",
  "27-50",
  "3-60",
  "42-53",
  "9-52",
  "32-54",
  "28-38",
  "18-58",
  "30-41",
  "55-39",
  "49-19"
]);
const humanDesignCircuitSchema = z.enum(["individual", "collective", "tribal", "integration"]);
const humanDesignTypeSchema = z.enum([
  "manifestor",
  "generator",
  "manifesting_generator",
  "projector",
  "reflector"
]);
const humanDesignStrategySchema = z.enum([
  "inform_before_acting",
  "wait_to_respond",
  "wait_for_invitation",
  "wait_lunar_cycle"
]);
const humanDesignSignatureSchema = z.enum(["peace", "satisfaction", "success", "surprise"]);
const humanDesignNotSelfThemeSchema = z.enum([
  "anger",
  "frustration",
  "bitterness",
  "disappointment"
]);
const humanDesignAuthoritySchema = z.enum([
  "emotional",
  "sacral",
  "splenic",
  "ego",
  "self_projected",
  "mental",
  "lunar"
]);
const humanDesignDefinitionSchema = z.enum([
  "no_definition",
  "single",
  "split",
  "triple_split",
  "quadruple_split"
]);

const resolvedLongitudesSideSchema = z
  .object({
    sun: longitudeSchema,
    moon: longitudeSchema,
    north_node: longitudeSchema,
    mercury: longitudeSchema,
    venus: longitudeSchema,
    mars: longitudeSchema,
    jupiter: longitudeSchema,
    saturn: longitudeSchema,
    uranus: longitudeSchema,
    neptune: longitudeSchema,
    pluto: longitudeSchema
  })
  .strict();
export type HumanDesignResolvedLongitudesSide = z.infer<
  typeof resolvedLongitudesSideSchema
>;

export const humanDesignPreviewRequestSchema = z
  .object({
    mode: humanDesignModeSchema,
    methodCode: humanDesignMethodCodeSchema,
    resolvedLongitudes: z
      .object({
        personality: resolvedLongitudesSideSchema,
        design: resolvedLongitudesSideSchema
      })
      .strict()
  })
  .strict();
export type HumanDesignPreviewRequest = z.infer<typeof humanDesignPreviewRequestSchema>;

const checksumMetadataSchema = z
  .object({
    algorithm: z.literal("sha256"),
    canonicalization: z.literal("json-stable-v1"),
    value: sha256DigestSchema
  })
  .strict();

const inputFingerprintSchema = checksumMetadataSchema
  .extend({
    scope: z.literal("human-design-individual-resolved-input.v1")
  })
  .strict();

const activationSchema = z
  .object({
    side: humanDesignSideSchema,
    body: humanDesignActiveBodySchema,
    longitude: longitudeSchema,
    gate: gateSchema,
    line: lineSchema
  })
  .strict();

const definedGateSchema = z
  .object({
    gate: gateSchema,
    activatedBy: z.array(
      z
        .object({
          side: humanDesignSideSchema,
          body: humanDesignActiveBodySchema,
          line: lineSchema
        })
        .strict()
    )
  })
  .strict();

const definedChannelSchema = z
  .object({
    code: humanDesignChannelSchema,
    gates: z.tuple([gateSchema, gateSchema]),
    centers: z.tuple([humanDesignCenterSchema, humanDesignCenterSchema]),
    circuit: humanDesignCircuitSchema
  })
  .strict();

const definedCenterSchema = z
  .object({
    code: humanDesignCenterSchema,
    definedByChannels: z.array(humanDesignChannelSchema)
  })
  .strict();

const profileCodeSchema = z.string().regex(/^[1-6]\/[1-6]$/);
const profileSchema = z
  .object({
    personalityLine: lineSchema,
    designLine: lineSchema,
    code: profileCodeSchema
  })
  .strict();

const typeBasisSchema = z
  .object({
    definedCenterCount: z.number().int().min(0).max(9),
    sacralDefined: z.boolean(),
    throatDefined: z.boolean(),
    throatConnectedMotorCenters: z.array(humanDesignCenterSchema)
  })
  .strict();

const authorityBasisSchema = z
  .object({
    definedCenters: z.array(humanDesignCenterSchema),
    priority: z.array(humanDesignAuthoritySchema),
    selectedBy: z.string().trim().min(1).max(120)
  })
  .strict();

const definitionComponentSchema = z
  .object({
    centers: z.array(humanDesignCenterSchema),
    channels: z.array(humanDesignChannelSchema)
  })
  .strict();

const definitionBasisSchema = z
  .object({
    definedCenterCount: z.number().int().min(0).max(9),
    componentCount: z.number().int().min(0).max(4)
  })
  .strict();

const crossActivationSchema = z
  .object({
    gate: gateSchema,
    line: lineSchema
  })
  .strict();

const incarnationCrossSchema = z
  .object({
    angle: z.enum(["right_angle", "juxtaposition", "left_angle"]),
    profileCode: profileCodeSchema,
    gates: z
      .object({
        personalitySun: crossActivationSchema,
        personalityEarth: crossActivationSchema,
        designSun: crossActivationSchema,
        designEarth: crossActivationSchema
      })
      .strict(),
    gateSequence: z.tuple([gateSchema, gateSchema, gateSchema, gateSchema])
  })
  .strict();

export const humanDesignIndividualResultSchema = z
  .object({
    methodCode: humanDesignMethodCodeSchema,
    engineRevision: z.literal(1),
    schemaVersion: humanDesignSchemaVersionSchema,
    mode: humanDesignModeSchema,
    inputFingerprint: inputFingerprintSchema,
    resultChecksum: checksumMetadataSchema,
    activations: z.array(activationSchema).length(26),
    definedGates: z.array(definedGateSchema),
    definedChannels: z.array(definedChannelSchema),
    definedCenters: z.array(definedCenterSchema),
    type: humanDesignTypeSchema,
    strategy: humanDesignStrategySchema,
    signature: humanDesignSignatureSchema,
    notSelfTheme: humanDesignNotSelfThemeSchema,
    typeBasis: typeBasisSchema,
    authority: humanDesignAuthoritySchema,
    authorityBasis: authorityBasisSchema,
    definition: humanDesignDefinitionSchema,
    definitionComponents: z.array(definitionComponentSchema),
    definitionBasis: definitionBasisSchema,
    incarnationCross: incarnationCrossSchema,
    profile: profileSchema
  })
  .strict();
export type HumanDesignIndividualResult = z.infer<typeof humanDesignIndividualResultSchema>;

export const humanDesignPreviewResponseSchema = z
  .object({
    result: humanDesignIndividualResultSchema
  })
  .strict();
export type HumanDesignPreviewResponse = z.infer<typeof humanDesignPreviewResponseSchema>;
