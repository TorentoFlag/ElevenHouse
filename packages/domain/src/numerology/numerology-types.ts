export type NumerologyMethodCode = "pythagorean";
export type NumerologyCalculationMode = "individual" | "compatibility";
export type NumerologyRelation = "match" | "close" | "different" | "tension";
export type NumerologyDigit = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
export type NumerologyRootNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type NumerologyLineLevel = "absent" | "weak" | "moderate" | "expressed" | "strong";

export type NumerologyParticipantInput = {
  readonly calculationName: string;
  readonly calculationNameSource: "crm_display_name" | "manual_entry";
  readonly birthDate: string;
};

export type PythagoreanPeriodsRequest = {
  readonly personalYear?: { readonly year: number };
  readonly personalMonths?: { readonly year: number };
  readonly personalDay?: { readonly date: string };
};

export type PythagoreanPeriodNumbers = {
  readonly personalYear?: { readonly year: number; readonly value: number };
  readonly personalMonths?: readonly {
    readonly year: number;
    readonly month: number;
    readonly value: number;
  }[];
  readonly personalDay?: { readonly date: string; readonly value: number };
};

export type PythagoreanKeyNumbers = {
  readonly lifePath: number;
  readonly birthday: number;
  readonly expression: number;
  readonly soul: number;
  readonly personality: number;
};

export type PythagoreanPsychomatrixCells = Readonly<Record<NumerologyDigit, string>>;

export type PythagoreanPsychomatrix = {
  readonly sourceDigits: readonly number[];
  readonly workingNumbers: {
    readonly first: number;
    readonly second: number;
    readonly third: number;
    readonly fourth: number;
  };
  readonly cells: PythagoreanPsychomatrixCells;
};

export type PythagoreanStrengthLineResult = {
  readonly code: string;
  readonly label: string;
  readonly cells: readonly NumerologyDigit[];
  readonly value: number;
  readonly level: NumerologyLineLevel;
  readonly levelLabel: string;
};

export type PythagoreanIndividualResult = {
  readonly methodCode: "pythagorean";
  readonly mode: "individual";
  readonly participant: NumerologyParticipantInput;
  readonly keyNumbers: PythagoreanKeyNumbers;
  readonly periods: PythagoreanPeriodNumbers;
  readonly psychomatrix: PythagoreanPsychomatrix;
  readonly strengthLines: readonly PythagoreanStrengthLineResult[];
};

export type NumerologyCompatibilityInput = {
  readonly first: NumerologyParticipantInput;
  readonly second: NumerologyParticipantInput;
};

export type PythagoreanComparisonBlock = "key_numbers" | "psychomatrix" | "strength_lines";

export type PythagoreanComparison = {
  readonly block: PythagoreanComparisonBlock;
  readonly code: string;
  readonly valueA: number;
  readonly valueB: number;
  readonly difference: number;
  readonly relation: NumerologyRelation;
  readonly explanation: string;
};

export type PythagoreanRelationCounts = Readonly<Record<NumerologyRelation, number>>;

export type PythagoreanCompatibilityZone = {
  readonly code: "identity" | "inner_world" | "resources" | "dynamics";
  readonly comparisonCodes: readonly string[];
  readonly counts: PythagoreanRelationCounts;
  readonly relation: NumerologyRelation;
  readonly explanation: string;
};

export type PythagoreanCompatibilityConclusion = {
  readonly code: "harmonious" | "mixed" | "attention";
  readonly matchAndClose: number;
  readonly differentAndTension: number;
  readonly tension: number;
  readonly explanation: string;
};

export type PythagoreanCompatibilityResult = {
  readonly methodCode: "pythagorean";
  readonly mode: "compatibility";
  readonly participants: NumerologyCompatibilityInput;
  readonly individuals: readonly [PythagoreanIndividualResult, PythagoreanIndividualResult];
  readonly pairNumber: number;
  readonly comparisons: readonly PythagoreanComparison[];
  readonly zones: readonly PythagoreanCompatibilityZone[];
  readonly counts: Readonly<
    Record<PythagoreanComparisonBlock | "total", PythagoreanRelationCounts>
  >;
  readonly conclusion: PythagoreanCompatibilityConclusion;
};

export type NumerologyIndividualUseCaseInput = {
  readonly methodCode: NumerologyMethodCode;
  readonly participant: NumerologyParticipantInput;
  readonly periods: PythagoreanPeriodsRequest;
};

export type NumerologyCompatibilityUseCaseInput = {
  readonly methodCode: NumerologyMethodCode;
  readonly participants: NumerologyCompatibilityInput;
  readonly periods: PythagoreanPeriodsRequest;
};

export type NumerologyMethodEngine = {
  readonly methodCode: NumerologyMethodCode;
  readonly calculateIndividual: (input: {
    readonly participant: NumerologyParticipantInput;
    readonly periods: PythagoreanPeriodsRequest;
  }) => PythagoreanIndividualResult;
  readonly calculateCompatibility: (input: {
    readonly participants: NumerologyCompatibilityInput;
    readonly periods: PythagoreanPeriodsRequest;
  }) => PythagoreanCompatibilityResult;
};
