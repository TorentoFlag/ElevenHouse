import { Inject, Injectable } from "@nestjs/common";
import {
  calculationIdParamSchema,
  calculationPdfJobIdParamSchema,
  calculationPdfLatestQuerySchema,
  requestCalculationPdfSchema,
  type CalculationPdfDownloadResponse,
  type CalculationPdfJobResponse,
  type CalculationPdfLatestQuery,
  type RequestCalculationPdf
} from "@elevenhouse/contracts";
import type { CalculationRecord, CalculationStore } from "@elevenhouse/domain";
import { selectCurrentApprovedCalculationInterpretation } from "@elevenhouse/domain";
import { requireOwnerUserId } from "../calculations/calculations.service";
import { CALCULATION_STORE } from "../calculations/calculations.tokens";
import {
  CalculationPdfNotFoundError,
  CalculationPdfNotReadyError,
  CalculationPdfResultChangedError
} from "../calculations/pdf/calculation-pdf.errors";
import { CalculationPdfService } from "../calculations/pdf/calculation-pdf.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { humanDesignHttpError } from "./human-design-http-errors";

@Injectable()
export class HumanDesignPdfService {
  constructor(
    @Inject(CALCULATION_STORE) private readonly calculationStore: CalculationStore,
    private readonly calculationPdf: CalculationPdfService
  ) {}

  async latest(
    calculationId: string,
    query: unknown,
    request: AstrologerSessionRequest
  ): Promise<CalculationPdfJobResponse> {
    const params = parseCalculationId(calculationId);
    const parsedQuery = parseLatestQuery(query);
    const ownerUserId = requireOwnerUserId(request);
    return mapHumanDesignPdfErrors(async () => {
      await this.ownedHumanDesign(ownerUserId, params.calculationId);
      return this.calculationPdf.latest({
        ownerUserId,
        calculationId: params.calculationId,
        locale: parsedQuery.locale
      });
    });
  }

  async enqueue(
    calculationId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<CalculationPdfJobResponse> {
    const params = parseCalculationId(calculationId);
    const parsedBody = parseRequest(body);
    const ownerUserId = requireOwnerUserId(request);
    return mapHumanDesignPdfErrors(async () => {
      const calculation = await this.ownedHumanDesign(ownerUserId, params.calculationId);
      const interpretation = selectCurrentApprovedCalculationInterpretation(
        calculation.interpretations
      );
      return this.calculationPdf.request({
        ownerUserId,
        calculationId: calculation.id,
        expectedResultChecksum: parsedBody.expectedResultChecksum,
        locale: parsedBody.locale,
        sourceLocator: {
          kind: "approved_interpretation",
          interpretationId: interpretation?.id ?? null
        },
        renderContract: "human-design-classic-v1",
        originalFileName:
          parsedBody.locale === "ru" ? "Дизайн человека.pdf" : "Human Design.pdf"
      });
    });
  }

  async download(
    calculationId: string,
    jobId: string,
    request: AstrologerSessionRequest
  ): Promise<CalculationPdfDownloadResponse> {
    const parsed = calculationPdfJobIdParamSchema.safeParse({ calculationId, jobId });
    if (!parsed.success) {
      throw humanDesignHttpError(
        400,
        "HUMAN_DESIGN_VALIDATION_FAILED",
        "Invalid Human Design PDF request"
      );
    }
    const ownerUserId = requireOwnerUserId(request);
    return mapHumanDesignPdfErrors(async () => {
      await this.ownedHumanDesign(ownerUserId, parsed.data.calculationId);
      return this.calculationPdf.download({
        ownerUserId,
        calculationId: parsed.data.calculationId,
        jobId: parsed.data.jobId
      });
    });
  }

  private async ownedHumanDesign(
    ownerUserId: string,
    calculationId: string
  ): Promise<CalculationRecord> {
    const calculation = await this.calculationStore.findByOwnerAndId({
      ownerUserId,
      calculationId
    });
    if (!calculation) {
      throw humanDesignHttpError(404, "HUMAN_DESIGN_PDF_NOT_FOUND", "Calculation not found");
    }
    if (
      calculation.status === "archived" ||
      calculation.module !== "human_design" ||
      calculation.methodCode !== "human_design_classic"
    ) {
      throw humanDesignHttpError(
        409,
        "HUMAN_DESIGN_CALCULATION_MISMATCH",
        "Calculation is not a supported Human Design record"
      );
    }
    return calculation;
  }
}

function parseCalculationId(calculationId: string): { readonly calculationId: string } {
  const parsed = calculationIdParamSchema.safeParse({ calculationId });
  if (!parsed.success) {
    throw humanDesignHttpError(
      400,
      "HUMAN_DESIGN_VALIDATION_FAILED",
      "Invalid Human Design PDF request"
    );
  }
  return parsed.data;
}

function parseLatestQuery(query: unknown): CalculationPdfLatestQuery {
  const parsed = calculationPdfLatestQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw humanDesignHttpError(
      400,
      "HUMAN_DESIGN_VALIDATION_FAILED",
      "Invalid Human Design PDF query"
    );
  }
  return parsed.data;
}

function parseRequest(body: unknown): RequestCalculationPdf {
  const parsed = requestCalculationPdfSchema.safeParse(body);
  if (!parsed.success) {
    throw humanDesignHttpError(
      400,
      "HUMAN_DESIGN_VALIDATION_FAILED",
      "Invalid Human Design PDF request"
    );
  }
  return parsed.data;
}

async function mapHumanDesignPdfErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof CalculationPdfResultChangedError) {
      throw humanDesignHttpError(409, "HUMAN_DESIGN_RESULT_INTEGRITY_FAILED", error.message);
    }
    if (error instanceof CalculationPdfNotReadyError) {
      throw humanDesignHttpError(409, "HUMAN_DESIGN_PDF_NOT_READY", error.message);
    }
    if (error instanceof CalculationPdfNotFoundError) {
      throw humanDesignHttpError(404, "HUMAN_DESIGN_PDF_NOT_FOUND", error.message);
    }
    throw error;
  }
}
