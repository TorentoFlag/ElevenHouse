import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import {
  completeMediaUpload,
  createMediaUploadIntent,
  MediaNotFoundError,
  MediaStorageObjectMissingError,
  MediaValidationError,
  type MediaAssetStore,
  type ObjectStoragePort
} from "@elevenhouse/domain";
import {
  completeMediaUploadRequestSchema,
  createMediaUploadIntentRequestSchema,
  mediaAssetResponseSchema,
  mediaUploadIntentResponseSchema,
  type MediaAssetResponse,
  type MediaUploadIntentResponse
} from "@elevenhouse/contracts";
import { z, type ZodType } from "@elevenhouse/validation";
import { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import {
  MEDIA_ASSET_STORE,
  MEDIA_ID_GENERATOR,
  MEDIA_OBJECT_STORAGE,
  MEDIA_PUBLIC_URL_RESOLVER
} from "./media.tokens";
import { toMediaAssetResponse, type MediaPublicUrlResolver } from "./media-response.mapper";

const mediaIdParamSchema = z.string().uuid();

@Injectable()
export class MediaService {
  constructor(
    @Inject(MEDIA_ASSET_STORE) private readonly store: MediaAssetStore,
    @Inject(MEDIA_OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(MEDIA_PUBLIC_URL_RESOLVER) private readonly publicUrlResolver: MediaPublicUrlResolver,
    private readonly clock: SystemClock,
    @Inject(MEDIA_ID_GENERATOR) private readonly idGenerator: () => string
  ) {}

  async createUploadIntent(
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<MediaUploadIntentResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedBody = parseContract(createMediaUploadIntentRequestSchema, body);

    return mapMediaErrors(async () =>
      mediaUploadIntentResponseSchema.parse(
        await createMediaUploadIntent({
          store: this.store,
          storage: this.storage,
          ownerUserId,
          input: parsedBody,
          idGenerator: this.idGenerator,
          now: this.clock.now()
        })
      )
    );
  }

  async completeUpload(
    mediaId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<MediaAssetResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const parsedMediaId = parseContract(mediaIdParamSchema, mediaId);
    const parsedBody = parseContract(completeMediaUploadRequestSchema, body ?? {});

    return mapMediaErrors(async () =>
      mediaAssetResponseSchema.parse(
        toMediaAssetResponse(
          await completeMediaUpload({
            store: this.store,
            storage: this.storage,
            ownerUserId,
            mediaId: parsedMediaId,
            input: parsedBody,
            now: this.clock.now()
          }),
          this.publicUrlResolver
        )
      )
    );
  }
}

function requireOwnerUserId(request: AstrologerSessionRequest): string {
  const ownerUserId = request.currentAstrologerAccount?.account.id;
  if (!ownerUserId) {
    throw new UnauthorizedException("Valid astrologer session is required");
  }

  return ownerUserId;
}

function parseContract<T>(schema: ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new BadRequestException({
      message: "Invalid request",
      issues: error instanceof Error ? error.message : "Unknown validation error"
    });
  }
}

async function mapMediaErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof MediaNotFoundError) {
      throw new NotFoundException(error.message);
    }
    if (error instanceof MediaValidationError || error instanceof MediaStorageObjectMissingError) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}
