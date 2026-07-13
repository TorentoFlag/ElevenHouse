export type CalculationModule = "numerology" | "chart" | "matrix" | "human_design";
export type CalculationModuleFilter = CalculationModule | "all";
export type CalculationMode = "individual" | "compatibility";
export type CalculationStatus = "calculated" | "linked" | "published" | "archived";
export type CalculationStatusFilter = CalculationStatus | "all";
export type CalculationParticipantRole = "subject" | "partner";
export type CalculationParticipantSource = "crm_client" | "manual";
export type CalculationClientVisibility = "private_to_astrologer" | "visible_to_client";
export type CalculationInterpretationSource = "ai" | "manual";
export type CalculationInterpretationStatus = "draft" | "approved";

export type CalculationParticipant = {
  readonly role: CalculationParticipantRole;
  readonly source: CalculationParticipantSource;
  readonly clientId: string | null;
  readonly displayName: string;
};

export type CalculationSavedData = {
  readonly requestFingerprint: string;
  readonly inputData: unknown;
  readonly resultData: unknown;
  readonly resultSummary: unknown;
  readonly resultChecksum: string;
};

export type CalculationClientLink = {
  readonly clientId: string;
  readonly visibility: CalculationClientVisibility;
  readonly linkedAt: string;
  readonly publishedAt: string | null;
};

export type CalculationInterpretation = {
  readonly id: string;
  readonly source: CalculationInterpretationSource;
  readonly status: CalculationInterpretationStatus;
  readonly text: string;
  readonly modelId: string | null;
  readonly promptVersion: string | null;
  readonly approvedAt: string | null;
};

export type CalculationArtifact = {
  readonly id: string;
  readonly mediaAssetId: string;
  readonly artifactType: "pdf";
  readonly status: "generating" | "ready" | "failed";
};
