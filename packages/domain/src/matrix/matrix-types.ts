export const MATRIX_METHOD_CODE = "ladini_22" as const;
export const MATRIX_ENGINE_REVISION = 1 as const;
export const MATRIX_INTERPRETATION_REVISION = 1 as const;
export const MATRIX_POINT_CODES = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "tl",
  "tr",
  "br",
  "bl",
  "A1",
  "B1",
  "C1",
  "D1",
  "tl1",
  "tr1",
  "br1",
  "bl1"
] as const;
export const MATRIX_AGE_ORDER = ["A", "tl", "B", "tr", "C", "br", "D", "bl"] as const;

export type MatrixMethodCode = typeof MATRIX_METHOD_CODE;
export type MatrixPointCode = (typeof MATRIX_POINT_CODES)[number];
export type MatrixAgePointCode = (typeof MATRIX_AGE_ORDER)[number];
export type MatrixPoints = Readonly<Record<MatrixPointCode, number>>;
export type MatrixParticipantInput = {
  readonly displayName: string;
  readonly birthDate: string;
};
export type MatrixPurposes = {
  readonly earth: number;
  readonly sky: number;
  readonly male: number;
  readonly female: number;
  readonly personal: number;
  readonly social: number;
  readonly spiritual: number;
};
export type MatrixZones = {
  readonly purpose: number;
  readonly money: number;
  readonly love: number;
  readonly energy: number;
};
export type MatrixEnergyRowCode =
  | "sahasrara"
  | "ajna"
  | "vishuddha"
  | "anahata"
  | "manipura"
  | "svadhisthana"
  | "muladhara";
export type MatrixEnergyRow = {
  readonly code: MatrixEnergyRowCode;
  readonly physical: number;
  readonly energy: number;
  readonly emotions: number;
};
export type MatrixEnergyMap = {
  readonly rows: readonly [
    MatrixEnergyRow,
    MatrixEnergyRow,
    MatrixEnergyRow,
    MatrixEnergyRow,
    MatrixEnergyRow,
    MatrixEnergyRow,
    MatrixEnergyRow
  ];
  readonly totals: {
    readonly physical: number;
    readonly energy: number;
    readonly emotions: number;
  };
};
export type MatrixData = {
  readonly points: MatrixPoints;
  readonly purposes: MatrixPurposes;
  readonly zones: MatrixZones;
  readonly energyMap: MatrixEnergyMap;
};
export type MatrixIndividualBaseResult = {
  readonly methodCode: MatrixMethodCode;
  readonly engineRevision: typeof MATRIX_ENGINE_REVISION;
  readonly interpretationRevision: typeof MATRIX_INTERPRETATION_REVISION;
  readonly mode: "individual";
  readonly participant: MatrixParticipantInput;
  readonly matrix: MatrixData;
};
export type MatrixCompatibilityBaseResult = {
  readonly methodCode: MatrixMethodCode;
  readonly engineRevision: typeof MATRIX_ENGINE_REVISION;
  readonly interpretationRevision: typeof MATRIX_INTERPRETATION_REVISION;
  readonly mode: "compatibility";
  readonly participants: {
    readonly first: MatrixParticipantInput;
    readonly second: MatrixParticipantInput;
  };
  readonly individuals: readonly [MatrixIndividualBaseResult, MatrixIndividualBaseResult];
  readonly composite: MatrixData;
};
export type MatrixBaseResult = MatrixIndividualBaseResult | MatrixCompatibilityBaseResult;
export type MatrixAgeCycle = {
  readonly age: number;
  readonly cycleAge: number;
  readonly decadeIndex: number;
  readonly pointCode: MatrixAgePointCode;
  readonly arcana: number;
};
export type MatrixYearForecast = {
  readonly year: number;
  readonly personalYear: number;
  readonly challenge: number;
  readonly resource: number;
};
export type MatrixDerivedProjection = {
  readonly methodCode: MatrixMethodCode;
  readonly engineRevision: typeof MATRIX_ENGINE_REVISION;
  readonly timezone: string;
  readonly currentDate: string;
  readonly participant: MatrixParticipantInput;
  readonly ageCycle: MatrixAgeCycle;
  readonly yearForecast: MatrixYearForecast;
};
export type MatrixMethodEngine = {
  readonly methodCode: MatrixMethodCode;
  readonly engineRevision: typeof MATRIX_ENGINE_REVISION;
  readonly calculateIndividual: (input: {
    readonly participant: MatrixParticipantInput;
  }) => MatrixIndividualBaseResult;
  readonly calculateCompatibility: (input: {
    readonly first: MatrixParticipantInput;
    readonly second: MatrixParticipantInput;
  }) => MatrixCompatibilityBaseResult;
  readonly calculateProjection: (input: {
    readonly participant: MatrixParticipantInput;
    readonly matrix: MatrixData;
    readonly selectedYear: number;
    readonly currentDate: string;
    readonly timezone: string;
  }) => MatrixDerivedProjection;
};
