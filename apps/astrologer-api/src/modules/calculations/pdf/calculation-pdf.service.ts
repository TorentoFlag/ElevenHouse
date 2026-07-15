import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  calculationPdfDownloadResponseSchema,
  calculationPdfJobResponseSchema,
  type CalculationPdfDownloadResponse,
  type CalculationPdfJobResponse
} from "@elevenhouse/contracts";
import {
  assertCalculationPdfTargetsCurrentResult,
  calculationPdfDocumentFingerprint,
  publicCalculationPdfFailureReason,
  type CalculationPdfJob,
  type CalculationPdfJobStore,
  type CalculationPdfLocale,
  type CalculationPdfSourceLocator,
  type CalculationRecord,
  type CalculationStore,
  type MediaAssetStore,
  type PrivateObjectStoragePort
} from "@elevenhouse/domain";
import { SystemClock } from "../../clock/system-clock.service";
import { MEDIA_ASSET_STORE, MEDIA_PRIVATE_OBJECT_STORAGE } from "../../media/media.tokens";
import { CALCULATION_STORE } from "../calculations.tokens";
import {
  CalculationPdfNotFoundError,
  CalculationPdfNotReadyError,
  CalculationPdfResultChangedError
} from "./calculation-pdf.errors";
import { CALCULATION_PDF_ID_GENERATOR, CALCULATION_PDF_JOB_STORE } from "./calculation-pdf.tokens";

type CalculationMediaStorageConfig = {
  readonly privateBucket: string;
};

@Injectable()
export class CalculationPdfService {
  constructor(
    @Inject(CALCULATION_STORE) private readonly calculationStore: CalculationStore,
    @Inject(CALCULATION_PDF_JOB_STORE) private readonly pdfJobStore: CalculationPdfJobStore,
    @Inject(MEDIA_ASSET_STORE) private readonly mediaStore: MediaAssetStore,
    @Inject(MEDIA_PRIVATE_OBJECT_STORAGE)
    private readonly privateStorage: PrivateObjectStoragePort,
    private readonly configService: ConfigService,
    private readonly clock: SystemClock,
    @Inject(CALCULATION_PDF_ID_GENERATOR) private readonly idGenerator: () => string
  ) {}

  async latest(input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly locale: CalculationPdfLocale;
  }): Promise<CalculationPdfJobResponse> {
    const { calculation, job } = await this.latestJob(input);
    return calculationPdfJobResponseSchema.parse({
      job: job ? toCalculationPdfJobResponse(job) : null,
      currentResultChecksum: calculation.resultChecksum
    });
  }

  async latestJob(input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly locale: CalculationPdfLocale;
  }): Promise<{ readonly calculation: CalculationRecord; readonly job: CalculationPdfJob | null }> {
    const calculation = await this.currentCalculation(input.ownerUserId, input.calculationId);
    const job = await this.pdfJobStore.findLatestByCalculation(input);
    return {
      calculation,
      job: job?.resultChecksum === calculation.resultChecksum ? job : null
    };
  }

  async request(input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly expectedResultChecksum: string;
    readonly locale: CalculationPdfLocale;
    readonly sourceLocator: CalculationPdfSourceLocator;
    readonly renderContract: string;
    readonly originalFileName: string;
  }): Promise<CalculationPdfJobResponse> {
    const calculation = await this.currentCalculation(input.ownerUserId, input.calculationId);
    try {
      assertCalculationPdfTargetsCurrentResult({
        currentResultChecksum: calculation.resultChecksum,
        expectedResultChecksum: input.expectedResultChecksum
      });
    } catch {
      throw new CalculationPdfResultChangedError();
    }
    const documentFingerprint = calculationPdfDocumentFingerprint({
      resultChecksum: calculation.resultChecksum,
      locale: input.locale,
      sourceLocator: input.sourceLocator,
      renderContract: input.renderContract
    });
    const id = this.idGenerator();
    const mediaAssetId = this.idGenerator();
    const artifactId = this.idGenerator();
    const outboxEventId = this.idGenerator();
    const storage = this.configService.getOrThrow<CalculationMediaStorageConfig>(
      "astrologerApi.mediaStorage"
    );
    const job = await this.pdfJobStore.enqueue({
      id,
      mediaAssetId,
      artifactId,
      outboxEventId,
      ownerUserId: calculation.ownerUserId,
      calculationId: calculation.id,
      module: calculation.module,
      methodCode: calculation.methodCode,
      resultChecksum: calculation.resultChecksum,
      locale: input.locale,
      sourceLocator: input.sourceLocator,
      documentFingerprint,
      privateStorageBucket: storage.privateBucket,
      storageKey: `${calculation.ownerUserId}/calculation_report_pdf/${id}/report.pdf`,
      originalFileName: input.originalFileName,
      now: this.clock.now().toISOString()
    });
    if (!job) throw new CalculationPdfResultChangedError();
    return calculationPdfJobResponseSchema.parse({
      job: toCalculationPdfJobResponse(job),
      currentResultChecksum: calculation.resultChecksum
    });
  }

  async download(input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly jobId: string;
  }): Promise<CalculationPdfDownloadResponse> {
    const calculation = await this.currentCalculation(input.ownerUserId, input.calculationId);
    const job = await this.pdfJobStore.findById(input);
    if (!job) throw new CalculationPdfNotFoundError();
    if (
      job.resultChecksum !== calculation.resultChecksum ||
      job.module !== calculation.module ||
      job.methodCode !== calculation.methodCode
    ) {
      throw new CalculationPdfResultChangedError();
    }
    if (job.status !== "ready") throw new CalculationPdfNotReadyError();
    const asset = await this.mediaStore.findByOwnerAndId({
      ownerUserId: input.ownerUserId,
      mediaId: job.mediaAssetId
    });
    if (
      !asset ||
      asset.status !== "ready" ||
      asset.purpose !== "calculation_report_pdf" ||
      asset.visibility !== "private"
    ) {
      throw new CalculationPdfNotFoundError();
    }
    return calculationPdfDownloadResponseSchema.parse(
      await this.privateStorage.createPresignedDownload({
        storageBucket: asset.storageBucket,
        storageKey: asset.storageKey,
        fileName: asset.originalFileName
      })
    );
  }

  private async currentCalculation(
    ownerUserId: string,
    calculationId: string
  ): Promise<CalculationRecord> {
    const calculation = await this.calculationStore.findByOwnerAndId({
      ownerUserId,
      calculationId
    });
    if (!calculation || calculation.status === "archived") {
      throw new CalculationPdfNotFoundError();
    }
    return calculation;
  }
}

function toCalculationPdfJobResponse(job: CalculationPdfJob) {
  return {
    id: job.id,
    calculationId: job.calculationId,
    resultChecksum: job.resultChecksum,
    locale: job.locale,
    status: job.status,
    artifactId: job.artifactId,
    mediaAssetId: job.mediaAssetId,
    failureReason: publicCalculationPdfFailureReason(job),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}
