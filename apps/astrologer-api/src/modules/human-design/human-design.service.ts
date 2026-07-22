import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import {
  assertChartBirthDataReady,
  buildHumanDesignIndividualBaseResult,
  ChartBirthDataReadinessError,
  type ChartReadyBirthData,
  type ClientStore
} from "@elevenhouse/domain";
import {
  humanDesignPreviewRequestSchema,
  humanDesignPreviewResponseSchema,
  type HumanDesignPreviewRequest,
  type HumanDesignPreviewResponse
} from "@elevenhouse/contracts";
import { CLIENT_STORE } from "../clients/clients.tokens";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { humanDesignHttpError, mapHumanDesignError } from "./human-design-http-errors";
import {
  HUMAN_DESIGN_RESOLVED_INPUT_PROVIDER,
  type HumanDesignResolvedInputProvider
} from "./human-design.tokens";

@Injectable()
export class HumanDesignService {
  constructor(
    @Inject(CLIENT_STORE) private readonly clientStore: ClientStore,
    @Inject(HUMAN_DESIGN_RESOLVED_INPUT_PROVIDER)
    private readonly resolvedInputProvider: HumanDesignResolvedInputProvider
  ) {}

  async preview(
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<HumanDesignPreviewResponse> {
    const parsedBody = parseHumanDesignContract<HumanDesignPreviewRequest>(
      humanDesignPreviewRequestSchema,
      body
    );
    const ownerUserId = requireOwnerUserId(request);
    return mapHumanDesignError(async () => {
      const resolvedLongitudes =
        "resolvedLongitudes" in parsedBody
          ? parsedBody.resolvedLongitudes
          : await this.resolveClientLongitudes({ ownerUserId, request: parsedBody });
      return humanDesignPreviewResponseSchema.parse({
        result: buildHumanDesignIndividualBaseResult(resolvedLongitudes)
      });
    });
  }

  private async resolveClientLongitudes(input: {
    readonly ownerUserId: string;
    readonly request: Extract<HumanDesignPreviewRequest, { source: "client" }>;
  }) {
    const client = await this.clientStore.getAstrologerClient({
      astrologerUserId: input.ownerUserId,
      clientUserId: input.request.clientId
    });
    if (!client?.birthData) {
      throw humanDesignHttpError(404, "HUMAN_DESIGN_CLIENT_NOT_FOUND", "Client was not found");
    }

    try {
      const readyBirthData = assertChartBirthDataReady(client.birthData);
      const resolved = await this.resolvedInputProvider.resolve({
        inputSnapshot: toChartInputSnapshot(readyBirthData)
      });
      return resolved;
    } catch (error) {
      if (error instanceof ChartBirthDataReadinessError) {
        throw humanDesignHttpError(
          409,
          "HUMAN_DESIGN_BIRTH_DATA_NOT_READY",
          "Client birth data is not ready for Human Design calculation"
        );
      }
      throw humanDesignHttpError(
        502,
        "HUMAN_DESIGN_PROVIDER_FAILED",
        "Human Design positions provider failed"
      );
    }
  }
}

function toChartInputSnapshot(input: ChartReadyBirthData) {
  return {
    birthDate: input.birthDate,
    birthTime: input.birthTime,
    timezone: input.birthTimezone,
    latitude: input.birthLatitude,
    longitude: input.birthLongitude,
    birthTimePrecision: input.birthTimePrecision,
    ...(input.birthTimeDstOccurrence ? { dstOccurrence: input.birthTimeDstOccurrence } : {})
  };
}

function parseHumanDesignContract<T>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } },
  value: unknown
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw humanDesignHttpError(
      400,
      "HUMAN_DESIGN_VALIDATION_FAILED",
      "Invalid Human Design preview request"
    );
  }
  return result.data as T;
}

function requireOwnerUserId(request: AstrologerSessionRequest): string {
  const ownerUserId = request.currentAstrologerAccount?.account.id;
  if (!ownerUserId) {
    throw new UnauthorizedException("Valid astrologer session is required");
  }
  return ownerUserId;
}
