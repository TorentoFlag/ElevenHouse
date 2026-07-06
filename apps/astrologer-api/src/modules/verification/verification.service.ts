import { BadRequestException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import {
  assertUsableMediaForOwner,
  getCurrentAstrologerVerification,
  MediaNotFoundError,
  MediaValidationError,
  submitAstrologerVerificationApplication,
  VerificationValidationError,
  type AstrologerVerificationApplication,
  type MediaAssetStore,
  type VerificationApplicationStore
} from "@elevenhouse/domain";
import {
  getAstrologerVerificationResponseSchema,
  submitAstrologerVerificationRequestSchema,
  verificationApplicationResponseSchema,
  type GetAstrologerVerificationResponse,
  type VerificationApplicationResponse
} from "@elevenhouse/contracts";
import type { ZodType } from "@elevenhouse/validation";
import { mediaPurposeUploadLimits } from "@elevenhouse/validation/media";
import { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { MEDIA_ASSET_STORE } from "../media/media.tokens";
import { VERIFICATION_APPLICATION_STORE, VERIFICATION_ID_GENERATOR } from "./verification.tokens";

const verificationRequirements = {
  maxQualificationDocuments: 5,
  allowedMimeTypes: [
    ...mediaPurposeUploadLimits.verification_identity_document.allowedMimeTypes
  ],
  maxSizeBytes: mediaPurposeUploadLimits.verification_identity_document.maxSizeBytes
} as const;

@Injectable()
export class VerificationService {
  constructor(
    @Inject(VERIFICATION_APPLICATION_STORE) private readonly store: VerificationApplicationStore,
    @Inject(MEDIA_ASSET_STORE) private readonly mediaStore: MediaAssetStore,
    private readonly clock: SystemClock,
    @Inject(VERIFICATION_ID_GENERATOR) private readonly idGenerator: () => string
  ) {}

  async getCurrentVerification(
    request: AstrologerSessionRequest
  ): Promise<GetAstrologerVerificationResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const current = await getCurrentAstrologerVerification({
      store: this.store,
      ownerUserId
    });

    return getAstrologerVerificationResponseSchema.parse({
      status: current.status,
      application: current.application ? toApplicationResponse(current.application) : null,
      requirements: verificationRequirements
    });
  }

  async submitApplication(
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<VerificationApplicationResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedBody = parseContract(submitAstrologerVerificationRequestSchema, body);

    return mapVerificationErrors(async () => {
      await assertUsableMediaForOwner({
        store: this.mediaStore,
        ownerUserId,
        mediaId: parsedBody.identityDocumentMediaId,
        purpose: "verification_identity_document"
      });
      await Promise.all(
        parsedBody.qualificationDocumentMediaIds.map((mediaId) =>
          assertUsableMediaForOwner({
            store: this.mediaStore,
            ownerUserId,
            mediaId,
            purpose: "verification_qualification_document"
          })
        )
      );

      return toApplicationResponse(
        await submitAstrologerVerificationApplication({
          store: this.store,
          ownerUserId,
          input: parsedBody,
          idGenerator: this.idGenerator,
          now: this.clock.now()
        })
      );
    });
  }
}

function toApplicationResponse(
  application: AstrologerVerificationApplication
): VerificationApplicationResponse {
  return verificationApplicationResponseSchema.parse({
    id: application.id,
    ownerUserId: application.ownerUserId,
    status: application.status,
    rejectionReason: application.rejectionReason,
    submittedAt: application.submittedAt,
    reviewedAt: application.reviewedAt,
    documents: application.documents,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt
  });
}

function requireOwnerUserId(request: AstrologerSessionRequest): string {
  const ownerUserId = request.currentAstrologerAccount?.account.id;
  if (!ownerUserId) {
    throw new UnauthorizedException("Valid astrologer session is required");
  }

  return ownerUserId;
}

function parseContract<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException("Invalid verification request");
  }

  return result.data;
}

async function mapVerificationErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof VerificationValidationError ||
      error instanceof MediaNotFoundError ||
      error instanceof MediaValidationError
    ) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}
