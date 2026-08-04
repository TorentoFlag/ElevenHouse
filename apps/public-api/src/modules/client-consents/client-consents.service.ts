import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException
} from "@nestjs/common";
import {
  ChartAiConsentRequiredError,
  ClientConsentIntegrityError,
  ClientConsentNotFoundError,
  ClientConsentRelationshipInactiveError,
  ClientConsentRelationshipRequiredError,
  ClientConsentValidationError,
  grantChartAiConsent,
  listClientDataConsents,
  revokeClientDataConsent,
  type ClientConsentStore,
  type CurrentClientDataConsent
} from "@elevenhouse/domain";
import {
  clientDataConsentListQuerySchema,
  clientDataConsentListResponseSchema,
  grantChartAiConsentParamsSchema,
  grantChartAiConsentRequestSchema,
  grantChartAiConsentResponseSchema,
  revokeClientDataConsentParamsSchema,
  revokeClientDataConsentRequestSchema,
  revokeClientDataConsentResponseSchema,
  type ClientDataConsentListQuery,
  type ClientDataConsentListResponse,
  type GrantChartAiConsentRequest,
  type GrantChartAiConsentResponse,
  type RevokeClientDataConsentRequest,
  type RevokeClientDataConsentResponse
} from "@elevenhouse/contracts";
import type { ZodType } from "@elevenhouse/validation";
import { SystemClock } from "../../common/system-clock.js";
import { CLIENT_CONSENT_ID_GENERATOR, CLIENT_CONSENT_STORE } from "./client-consents.tokens";

@Injectable()
export class ClientConsentsService {
  constructor(
    @Inject(CLIENT_CONSENT_STORE) private readonly store: ClientConsentStore,
    @Inject(SystemClock) private readonly clock: Pick<SystemClock, "now">,
    @Inject(CLIENT_CONSENT_ID_GENERATOR) private readonly idGenerator: () => string
  ) {}

  async list(clientUserId: string, query: unknown): Promise<ClientDataConsentListResponse> {
    const parsedQuery = parseContract<ClientDataConsentListQuery>(
      clientDataConsentListQuerySchema,
      query
    );
    return mapConsentErrors(async () =>
      clientDataConsentListResponseSchema.parse(
        await listClientDataConsents({
          store: this.store,
          clientUserId,
          locale: parsedQuery.locale
        })
      )
    );
  }

  async grant(
    clientUserId: string,
    astrologerUserId: string,
    body: unknown
  ): Promise<GrantChartAiConsentResponse> {
    const params = parseContract(grantChartAiConsentParamsSchema, { astrologerUserId });
    const request = parseContract<GrantChartAiConsentRequest>(grantChartAiConsentRequestSchema, body);
    return mapConsentErrors(async () => {
      const consent = await grantChartAiConsent({
        store: this.store,
        clientUserId,
        astrologerUserId: params.astrologerUserId,
        request,
        now: this.clock.now(),
        idGenerator: this.idGenerator
      });
      return grantChartAiConsentResponseSchema.parse({
        state: "granted",
        consent: toCurrentConsentResponse(consent)
      });
    });
  }

  async revoke(
    clientUserId: string,
    consentId: string,
    body: unknown
  ): Promise<RevokeClientDataConsentResponse> {
    const params = parseContract(revokeClientDataConsentParamsSchema, { consentId });
    parseContract<RevokeClientDataConsentRequest>(
      revokeClientDataConsentRequestSchema,
      body === undefined ? {} : body
    );
    return mapConsentErrors(async () => {
      const consent = await revokeClientDataConsent({
        store: this.store,
        clientUserId,
        consentId: params.consentId,
        now: this.clock.now(),
        idGenerator: this.idGenerator
      });
      return revokeClientDataConsentResponseSchema.parse({
        state: "revoked",
        consentId: consent.id,
        revokedAt: consent.revokedAt
      });
    });
  }
}

function toCurrentConsentResponse(consent: CurrentClientDataConsent) {
  return {
    id: consent.id,
    clientUserId: consent.clientUserId,
    astrologerUserId: consent.astrologerUserId,
    purpose: consent.purpose,
    policyVersion: consent.policyVersion,
    processorCode: consent.processorCode,
    noticeLocale: consent.noticeLocale,
    noticeSha256: consent.noticeSha256,
    grantedAt: consent.grantedAt
  };
}

function parseContract<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new BadRequestException("Invalid client consent request");
  return parsed.data;
}

async function mapConsentErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ClientConsentValidationError) {
      throw new BadRequestException(error.message);
    }
    if (
      error instanceof ClientConsentNotFoundError ||
      error instanceof ClientConsentRelationshipRequiredError
    ) {
      throw new NotFoundException("Client consent relationship was not found");
    }
    if (error instanceof ClientConsentRelationshipInactiveError) {
      throw new ConflictException("Client consent relationship is inactive");
    }
    if (error instanceof ChartAiConsentRequiredError) {
      throw new ConflictException("Current client consent is required");
    }
    if (error instanceof ClientConsentIntegrityError) {
      throw new InternalServerErrorException("Client consent evidence is inconsistent");
    }
    throw error;
  }
}
