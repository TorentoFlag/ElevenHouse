import { Injectable, UnauthorizedException } from "@nestjs/common";
import { buildHumanDesignIndividualBaseResult } from "@elevenhouse/domain";
import {
  humanDesignPreviewRequestSchema,
  humanDesignPreviewResponseSchema,
  type HumanDesignPreviewRequest,
  type HumanDesignPreviewResponse
} from "@elevenhouse/contracts";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { humanDesignHttpError, mapHumanDesignError } from "./human-design-http-errors";

@Injectable()
export class HumanDesignService {
  async preview(
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<HumanDesignPreviewResponse> {
    const parsedBody = parseHumanDesignContract<HumanDesignPreviewRequest>(
      humanDesignPreviewRequestSchema,
      body
    );
    requireOwnerUserId(request);
    return mapHumanDesignError(async () =>
      humanDesignPreviewResponseSchema.parse({
        result: buildHumanDesignIndividualBaseResult(parsedBody.resolvedLongitudes)
      })
    );
  }
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
