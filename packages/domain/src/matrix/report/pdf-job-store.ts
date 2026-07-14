import type { MatrixPdfJob, MatrixPdfRenderClaim } from "./pdf-job-types";
import type { MatrixReportLocale } from "./report-types";

export type MatrixPdfJobStore = {
  readonly findLatestByCalculation: (input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
  }) => Promise<MatrixPdfJob | null>;
  readonly findById: (input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly jobId: string;
  }) => Promise<MatrixPdfJob | null>;
  /** Worker lookup by globally unique job id. Never expose this unscoped method through HTTP. */
  readonly findByJobId: (input: { readonly jobId: string }) => Promise<MatrixPdfJob | null>;
  /** Atomically validates report/calculation state and creates or reuses the idempotent job. */
  readonly enqueue: (input: {
    readonly id: string;
    readonly mediaAssetId: string;
    readonly artifactId: string;
    readonly outboxEventId: string;
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly reportId: string;
    readonly reportRevision: number;
    readonly resultChecksum: string;
    readonly locale: MatrixReportLocale;
    readonly privateStorageBucket: string;
    readonly storageKey: string;
    readonly originalFileName: string;
    readonly now: string;
  }) => Promise<MatrixPdfJob | null>;
  /** Claims a job idempotently and returns an immutable render snapshot, or null if invalid/stale. */
  readonly claimForRendering: (input: {
    readonly jobId: string;
    readonly now: string;
  }) => Promise<MatrixPdfRenderClaim | null>;
  readonly complete: (input: {
    readonly jobId: string;
    readonly checksumSha256: string;
    readonly sizeBytes: number;
    readonly now: string;
  }) => Promise<MatrixPdfJob | null>;
  readonly fail: (input: {
    readonly jobId: string;
    readonly reason: string;
    readonly now: string;
  }) => Promise<MatrixPdfJob | null>;
};
