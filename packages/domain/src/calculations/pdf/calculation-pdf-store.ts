import type {
  CalculationPdfJob,
  CalculationPdfLocale,
  CalculationPdfSourceLocator
} from "./calculation-pdf-types";
import type { CalculationModule } from "../calculation-types";

export type EnqueueCalculationPdfInput = {
  readonly id: string;
  readonly mediaAssetId: string;
  readonly artifactId: string;
  readonly outboxEventId: string;
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly module: CalculationModule;
  readonly methodCode: string;
  readonly resultChecksum: string;
  readonly locale: CalculationPdfLocale;
  readonly sourceLocator: CalculationPdfSourceLocator;
  readonly documentFingerprint: string;
  readonly privateStorageBucket: string;
  readonly storageKey: string;
  readonly originalFileName: string;
  readonly now: string;
};

export type CalculationPdfJobStore = {
  readonly findLatestByCalculation: (input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly locale: CalculationPdfLocale;
  }) => Promise<CalculationPdfJob | null>;
  readonly findById: (input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly jobId: string;
  }) => Promise<CalculationPdfJob | null>;
  /** Worker lookup by globally unique id. Never expose it through HTTP. */
  readonly findByJobId: (input: { readonly jobId: string }) => Promise<CalculationPdfJob | null>;
  /** Atomically creates job, Media, artifact, and outbox or reuses a live identity. */
  readonly enqueue: (input: EnqueueCalculationPdfInput) => Promise<CalculationPdfJob | null>;
  readonly claimForRendering: (input: {
    readonly jobId: string;
    readonly now: string;
  }) => Promise<CalculationPdfJob | null>;
  readonly complete: (input: {
    readonly jobId: string;
    readonly checksumSha256: string;
    readonly sizeBytes: number;
    readonly pageCount: number;
    readonly now: string;
  }) => Promise<CalculationPdfJob | null>;
  readonly fail: (input: {
    readonly jobId: string;
    readonly code: string;
    readonly reason: string;
    readonly now: string;
  }) => Promise<CalculationPdfJob | null>;
};
