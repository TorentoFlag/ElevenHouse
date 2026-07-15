export type CalculationPdfCleanupMedia = {
  readonly id: string;
  readonly purpose: "calculation_report_pdf";
  readonly visibility: "private";
  readonly storageBucket: string;
  readonly storageKey: string;
};

export type CalculationPdfCleanupStore = {
  readonly findByMediaAssetId: (input: {
    readonly mediaAssetId: string;
  }) => Promise<CalculationPdfCleanupMedia | null>;
  readonly deleteIfUnreferenced: (input: {
    readonly mediaAssetId: string;
    readonly expectedStorageBucket: string;
    readonly expectedStorageKey: string;
  }) => Promise<boolean>;
};
