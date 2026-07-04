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
  getAstrologerProfile,
  upsertAstrologerProfile,
  type AstrologerProfile,
  type AstrologerProfileStore,
  type AstrologerProfileUpsertInput
} from "@elevenhouse/domain";
import {
  astrologerProfileResponseSchema,
  getAstrologerProfileResponseSchema,
  upsertAstrologerProfileRequestSchema,
  type AstrologerProfileResponse,
  type GetAstrologerProfileResponse,
  type UpsertAstrologerProfileRequest
} from "@elevenhouse/contracts";
import type { ZodType } from "@elevenhouse/validation";
import { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { ASTROLOGER_PROFILE_STORE } from "./astrologer-profile.tokens";

@Injectable()
export class AstrologerProfileService {
  constructor(
    @Inject(ASTROLOGER_PROFILE_STORE) private readonly store: AstrologerProfileStore,
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

    return getAstrologerProfileResponseSchema.parse({
      profile: profile ? toProfileResponse(profile) : null
    });
  }

  async upsertCurrentProfile(
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<AstrologerProfileResponse> {
    const parsedBody = parseContract(upsertAstrologerProfileRequestSchema, body);
    const ownerUserId = requireOwnerUserId(request);

    return mapAstrologerProfileErrors(async () => {
      const profile = await upsertAstrologerProfile({
        store: this.store,
        ownerUserId,
        input: toUpsertInput(parsedBody),
        now: this.clock.now()
      });

      return toProfileResponse(profile);
    });
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

function toProfileResponse(profile: AstrologerProfile): AstrologerProfileResponse {
  return astrologerProfileResponseSchema.parse({
    ...profile,
    consultationLanguages: [...profile.consultationLanguages]
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
    throw error;
  }
}
