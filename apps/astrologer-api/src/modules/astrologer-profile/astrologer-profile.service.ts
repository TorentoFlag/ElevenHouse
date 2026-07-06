import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import {
  AstrologerProfileHandleConflictError,
  AstrologerProfileValidationError,
  assertUsableMediaForOwner,
  getAstrologerProfile,
  MediaNotFoundError,
  MediaValidationError,
  upsertAstrologerProfile,
  type AstrologerProfile,
  type AstrologerProfileStore,
  type AstrologerProfileUpsertInput,
  type MediaAssetStore
} from "@elevenhouse/domain";
import {
  astrologerProfileResponseSchema,
  getAstrologerProfileResponseSchema,
  upsertAstrologerProfileRequestSchema,
  type AstrologerProfileIntegrityIssueResponse,
  type AstrologerProfileResponse,
  type GetAstrologerProfileResponse,
  type MediaAssetResponse,
  type UpsertAstrologerProfileRequest
} from "@elevenhouse/contracts";
import type { ZodType } from "@elevenhouse/validation";
import { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { toMediaAssetResponse, type MediaPublicUrlResolver } from "../media/media-response.mapper";
import { MEDIA_ASSET_STORE, MEDIA_PUBLIC_URL_RESOLVER } from "../media/media.tokens";
import { ASTROLOGER_PROFILE_STORE } from "./astrologer-profile.tokens";

@Injectable()
export class AstrologerProfileService {
  constructor(
    @Inject(ASTROLOGER_PROFILE_STORE) private readonly store: AstrologerProfileStore,
    @Inject(MEDIA_ASSET_STORE) private readonly mediaStore: MediaAssetStore,
    @Inject(MEDIA_PUBLIC_URL_RESOLVER) private readonly publicUrlResolver: MediaPublicUrlResolver,
    private readonly clock: SystemClock
  ) {}

  async getCurrentProfile(
    request: AstrologerSessionRequest
  ): Promise<GetAstrologerProfileResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const profile = await getAstrologerProfile({
      store: this.store,
      ownerUserId
    });

    if (!profile) {
      return getAstrologerProfileResponseSchema.parse({
        profile: null,
        integrityIssues: []
      });
    }

    return getAstrologerProfileResponseSchema.parse(
      await this.toProfileReadResponse(ownerUserId, profile)
    );
  }

  async upsertCurrentProfile(
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<AstrologerProfileResponse> {
    const parsedBody = parseContract(upsertAstrologerProfileRequestSchema, body);
    const ownerUserId = requireOwnerUserId(request);

    return mapAstrologerProfileErrors(async () => {
      await this.assertProfileMedia(ownerUserId, parsedBody.avatarMediaId, "profile_avatar");
      await this.assertProfileMedia(ownerUserId, parsedBody.coverMediaId, "profile_cover");

      const profile = await upsertAstrologerProfile({
        store: this.store,
        ownerUserId,
        input: toUpsertInput(parsedBody),
        now: this.clock.now()
      });

      return this.toProfileResponse(ownerUserId, profile);
    });
  }

  private async assertProfileMedia(
    ownerUserId: string,
    mediaId: string | null | undefined,
    purpose: "profile_avatar" | "profile_cover"
  ): Promise<void> {
    if (!mediaId) return;

    await assertUsableMediaForOwner({
      store: this.mediaStore,
      ownerUserId,
      mediaId,
      purpose
    });
  }

  private async toProfileResponse(
    ownerUserId: string,
    profile: AstrologerProfile
  ): Promise<AstrologerProfileResponse> {
    const [avatarMedia, coverMedia] = await Promise.all([
      this.getProfileMedia(ownerUserId, profile.avatarMediaId, "profile_avatar"),
      this.getProfileMedia(ownerUserId, profile.coverMediaId, "profile_cover")
    ]);

    return astrologerProfileResponseSchema.parse({
      ...profile,
      avatarMedia,
      coverMedia,
      consultationLanguages: [...profile.consultationLanguages]
    });
  }

  private async toProfileReadResponse(
    ownerUserId: string,
    profile: AstrologerProfile
  ): Promise<GetAstrologerProfileResponse> {
    const [avatarMediaState, coverMediaState] = await Promise.all([
      this.getProfileMediaState(ownerUserId, profile.avatarMediaId, "profile_avatar"),
      this.getProfileMediaState(ownerUserId, profile.coverMediaId, "profile_cover")
    ]);

    return {
      profile: {
        ...profile,
        avatarMedia: avatarMediaState.media,
        coverMedia: coverMediaState.media,
        consultationLanguages: [...profile.consultationLanguages],
        specializations: [...profile.specializations],
        methods: [...profile.methods]
      },
      integrityIssues: [avatarMediaState.issue, coverMediaState.issue].filter(
        (issue): issue is AstrologerProfileIntegrityIssueResponse => Boolean(issue)
      )
    };
  }

  private async getProfileMedia(
    ownerUserId: string,
    mediaId: string | null,
    purpose: "profile_avatar" | "profile_cover"
  ): Promise<MediaAssetResponse | null> {
    if (!mediaId) return null;

    const asset = await this.mediaStore.findByOwnerAndId({ ownerUserId, mediaId });
    if (!asset || asset.purpose !== purpose || asset.status !== "ready") {
      return null;
    }

    return toMediaAssetResponse(asset, this.publicUrlResolver);
  }

  private async getProfileMediaState(
    ownerUserId: string,
    mediaId: string | null,
    purpose: "profile_avatar" | "profile_cover"
  ): Promise<{
    readonly media: MediaAssetResponse | null;
    readonly issue: AstrologerProfileIntegrityIssueResponse | null;
  }> {
    if (!mediaId) {
      return { media: null, issue: null };
    }

    const asset = await this.mediaStore.findByOwnerAndId({ ownerUserId, mediaId });
    if (asset && asset.purpose === purpose && asset.status === "ready") {
      return {
        media: toMediaAssetResponse(asset, this.publicUrlResolver),
        issue: null
      };
    }

    return {
      media: null,
      issue:
        purpose === "profile_avatar"
          ? {
              code: "avatar_media_unavailable",
              severity: "warning",
              field: "avatarMediaId",
              mediaId,
              message: "Profile avatar media is missing, has wrong purpose or is not ready"
            }
          : {
              code: "cover_media_unavailable",
              severity: "warning",
              field: "coverMediaId",
              mediaId,
              message: "Profile cover media is missing, has wrong purpose or is not ready"
            }
    };
  }
}

function toUpsertInput(body: UpsertAstrologerProfileRequest): AstrologerProfileUpsertInput {
  return {
    publicHandle: body.publicHandle,
    publicName: body.publicName,
    headline: body.headline ?? null,
    bio: body.bio ?? null,
    timezone: body.timezone,
    locale: body.locale,
    avatarMediaId: body.avatarMediaId ?? null,
    coverMediaId: body.coverMediaId ?? null,
    consultationLanguages: body.consultationLanguages,
    visibilityStatus: body.visibilityStatus,
    professionalExperienceYears: body.professionalExperienceYears,
    professionalSchool: body.professionalSchool,
    specializations: body.specializations,
    methods: body.methods,
    socialLinks: body.socialLinks,
    ownBirthData: body.ownBirthData
  };
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
    throw new BadRequestException("Invalid astrologer profile request");
  }

  return result.data;
}

async function mapAstrologerProfileErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AstrologerProfileHandleConflictError) {
      throw new ConflictException("Astrologer profile public handle is already used");
    }
    if (error instanceof AstrologerProfileValidationError) {
      throw new BadRequestException("Invalid astrologer profile state");
    }
    if (error instanceof MediaNotFoundError || error instanceof MediaValidationError) {
      throw new BadRequestException("Invalid astrologer profile media");
    }
    throw error;
  }
}
