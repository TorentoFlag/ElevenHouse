export const matrixReportSourceValues = ["manual", "ai"] as const;
export const matrixReportStatusValues = ["draft", "ready"] as const;
export const matrixReportLocaleValues = ["ru", "en"] as const;
export const matrixPdfJobStatusValues = ["queued", "processing", "ready", "failed"] as const;

export function formatMatrixSqlValues(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}
