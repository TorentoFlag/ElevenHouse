export type NumerologyMethodCode = "pythagorean" | "vedic" | "kabbalistic" | "author";
export type NumerologyCalculationMode = "individual" | "compatibility";
export type NumerologyRelation = "match" | "close" | "different" | "tension";
export type NumerologyDigit = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
export type NumerologyRootNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type MasterNumber = 11 | 22 | 33;

export type MasterNumberSettings =
  | { readonly mode: "preserve_all" }
  | { readonly mode: "reduce_all" }
  | { readonly mode: "preserve_selected"; readonly values: readonly MasterNumber[] };

export type NameNormalizationSettings = {
  readonly yoPolicy: "separate" | "as_e";
  readonly shortIPolicy: "separate" | "as_i";
};

export type NumerologyParticipantInput = {
  readonly fullName: string;
  readonly birthDate: string;
};

export type PythagoreanSettings = {
  readonly masterNumbers: MasterNumberSettings;
  readonly nameNormalization: NameNormalizationSettings;
  readonly includeNameNumbers: boolean;
  readonly includePsychomatrix: boolean;
  readonly includeStrengthLines: boolean;
  readonly forecastDate?: string;
};

export type NumerologyMethodProfile = {
  readonly methodCode: NumerologyMethodCode;
  readonly methodVersion: string;
  readonly supportedModes: readonly NumerologyCalculationMode[];
  readonly letterTable: Readonly<Record<string, NumerologyRootNumber>>;
  readonly vowels: readonly string[];
  readonly strengthLines: readonly {
    readonly code: string;
    readonly label: string;
    readonly cells: readonly NumerologyDigit[];
  }[];
};

export type PythagoreanKeyNumberCode =
  | "lifePath"
  | "birthday"
  | "personalYear"
  | "personalMonth"
  | "personalDay"
  | "expression"
  | "soul"
  | "personality";

export type PythagoreanKeyNumbers = {
  readonly lifePath: number;
  readonly birthday: number;
  readonly personalYear?: number;
  readonly personalMonth?: number;
  readonly personalDay?: number;
  readonly expression?: number;
  readonly soul?: number;
  readonly personality?: number;
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
  readonly cells: readonly NumerologyDigit[];
  readonly value: number;
};

export type PythagoreanIndividualResult = {
  readonly methodCode: "pythagorean";
  readonly methodVersion: string;
  readonly participant: NumerologyParticipantInput;
  readonly keyNumbers: PythagoreanKeyNumbers;
  readonly psychomatrix?: PythagoreanPsychomatrix;
  readonly strengthLines: readonly PythagoreanStrengthLineResult[];
};

export type NumerologyCompatibilityInput = {
  readonly first: NumerologyParticipantInput;
  readonly second: NumerologyParticipantInput;
};

export type NumerologyNumberComparison = {
  readonly code: string;
  readonly valueA: number;
  readonly valueB: number;
  readonly relation: NumerologyRelation;
};

export type NumerologyMatrixComparison = {
  readonly digit: NumerologyDigit;
  readonly countA: number;
  readonly countB: number;
  readonly relation: NumerologyRelation;
};

export type PythagoreanCompatibilityResult = {
  readonly methodCode: "pythagorean";
  readonly methodVersion: string;
  readonly participants: NumerologyCompatibilityInput;
  readonly individuals: readonly [PythagoreanIndividualResult, PythagoreanIndividualResult];
  readonly pairNumber: number;
  readonly keyNumberComparisons: readonly NumerologyNumberComparison[];
  readonly matrixComparisons: readonly NumerologyMatrixComparison[];
  readonly strengthLineComparisons: readonly NumerologyNumberComparison[];
};

export type NumerologyIndividualUseCaseInput = {
  readonly methodCode: "pythagorean";
  readonly participant: NumerologyParticipantInput;
  readonly settings: PythagoreanSettings;
};

export type NumerologyCompatibilityUseCaseInput = {
  readonly methodCode: "pythagorean";
  readonly participants: NumerologyCompatibilityInput;
  readonly settings: PythagoreanSettings;
};
