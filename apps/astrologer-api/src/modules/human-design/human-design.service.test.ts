import { HttpException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { humanDesignPreviewResponseSchema } from "@elevenhouse/contracts";
import type { ClientBirthData, ClientStore } from "@elevenhouse/domain";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { HumanDesignService } from "./human-design.service";
import type { HumanDesignResolvedInputProvider } from "./human-design.tokens";

const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";

const longitudes = {
  sun: 302,
  moon: 60.125,
  north_node: 10,
  mercury: 240.125,
  venus: 10,
  mars: 20,
  jupiter: 30,
  saturn: 40,
  uranus: 50,
  neptune: 60,
  pluto: 70
} as const;

describe("HumanDesignService", () => {
  it("previews deterministic individual mechanics from resolved longitudes", async () => {
    const { service } = createService();
    const response = await service.preview(previewBody(), request());

    humanDesignPreviewResponseSchema.parse(response);
    expect(response.result).toMatchObject({
      methodCode: "human_design_classic",
      schemaVersion: "human-design-result.v1",
      mode: "individual",
      type: "manifesting_generator",
      strategy: "wait_to_respond",
      authority: "sacral",
      definition: "single",
      profile: { code: "1/3" },
      incarnationCross: {
        angle: "right_angle",
        gateSequence: [41, 31, 34, 20]
      }
    });
    expect(response.result.inputFingerprint.value).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(response.result.resultChecksum.value).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("previews deterministic individual mechanics from owner-scoped CRM birth data", async () => {
    const { service, clientStore, resolvedInputProvider } = createService();

    const response = await service.preview(
      {
        mode: "individual",
        methodCode: "human_design_classic",
        source: "client",
        clientId: clientUserId
      },
      request()
    );

    humanDesignPreviewResponseSchema.parse(response);
    expect(clientStore.getAstrologerClient).toHaveBeenCalledWith({
      astrologerUserId: ownerUserId,
      clientUserId
    });
    expect(resolvedInputProvider.resolve).toHaveBeenCalledWith({
      inputSnapshot: {
        birthDate: "1990-07-15",
        birthTime: "10:30",
        timezone: "Europe/Rome",
        latitude: 41.9,
        longitude: 12.49,
        birthTimePrecision: "exact"
      }
    });
    expect(response.result).toMatchObject({
      methodCode: "human_design_classic",
      type: "manifesting_generator",
      authority: "sacral"
    });
  });

  it("returns a stable not-found code when the CRM client has no birth data", async () => {
    const { service } = createService({ birthData: null });

    await expectHttpCode(
      service.preview(
        {
          mode: "individual",
          methodCode: "human_design_classic",
          source: "client",
          clientId: clientUserId
        },
        request()
      ),
      404,
      "HUMAN_DESIGN_CLIENT_NOT_FOUND"
    );
  });

  it("returns a stable readiness code when CRM birth data cannot be calculated", async () => {
    const { service } = createService({
      birthData: { ...readyBirthData(), birthTime: null, birthTimePrecision: "unknown" }
    });

    await expectHttpCode(
      service.preview(
        {
          mode: "individual",
          methodCode: "human_design_classic",
          source: "client",
          clientId: clientUserId
        },
        request()
      ),
      409,
      "HUMAN_DESIGN_BIRTH_DATA_NOT_READY"
    );
  });

  it("maps positions provider failures to a stable safe code", async () => {
    const { service } = createService({
      resolve: async () => {
        throw new Error("CHART_ENGINE_HTTP_503");
      }
    });

    await expectHttpCode(
      service.preview(
        {
          mode: "individual",
          methodCode: "human_design_classic",
          source: "client",
          clientId: clientUserId
        },
        request()
      ),
      502,
      "HUMAN_DESIGN_PROVIDER_FAILED"
    );
  });

  it("rejects invalid preview bodies with a stable safe error code", async () => {
    await expectHttpCode(
      createService().service.preview(
        {
          ...previewBody(),
          birthDate: "1990-07-15"
        },
        request()
      ),
      400,
      "HUMAN_DESIGN_VALIDATION_FAILED"
    );
  });

  it("requires an authenticated astrologer session", async () => {
    await expect(
      createService().service.preview(previewBody(), { headers: {} })
    ).rejects.toThrow(UnauthorizedException);
  });
});

const clientUserId = "df3192f4-3d67-4b70-8c1a-6a14bd9a51af";

function previewBody() {
  return {
    mode: "individual",
    methodCode: "human_design_classic",
    resolvedLongitudes: {
      personality: longitudes,
      design: { ...longitudes, sun: 242 }
    }
  };
}

function request(): AstrologerSessionRequest {
  return {
    headers: {},
    currentAstrologerAccount: {
      account: {
        id: ownerUserId,
        status: "active",
        roles: ["astrologer"]
      }
    }
  };
}

function createService(
  input: {
    readonly birthData?: ClientBirthData | null;
    readonly resolve?: HumanDesignResolvedInputProvider["resolve"];
  } = {}
) {
  const clientStore = createClientStore(input.birthData);
  const resolvedInputProvider: HumanDesignResolvedInputProvider = {
    resolve:
      input.resolve ??
      vi.fn(async () => ({
        personality: longitudes,
        design: { ...longitudes, sun: 242 }
      }))
  };
  return {
    service: new HumanDesignService(clientStore, resolvedInputProvider),
    clientStore,
    resolvedInputProvider
  };
}

function createClientStore(birthData: ClientBirthData | null = readyBirthData()): ClientStore {
  return {
    createJoinIntent: vi.fn(async () => raise()),
    findJoinIntentByTokenHash: vi.fn(async () => raise()),
    markJoinIntentClaimed: vi.fn(async () => raise()),
    ensureRelationship: vi.fn(async () => raise()),
    upsertClientProfile: vi.fn(async () => raise()),
    upsertClientBirthData: vi.fn(async () => raise()),
    listAstrologerClients: vi.fn(async () => raise()),
    getAstrologerClient: vi.fn(async () => ({
      clientUserId,
      displayName: "Client",
      relationshipStatus: "active" as const,
      firstLinkedAt: "2026-01-01T00:00:00.000Z",
      lastLinkedAt: "2026-01-01T00:00:00.000Z",
      birthData
    }))
  };
}

function readyBirthData(): ClientBirthData {
  return {
    id: "birth-data-1",
    clientUserId,
    label: "Natal",
    birthDate: "1990-07-15",
    birthTime: "10:30",
    birthTimePrecision: "exact",
    birthPlaceText: "Rome, Italy",
    birthCountryCode: "IT",
    birthCity: "Rome",
    birthRegion: null,
    birthTimezone: "Europe/Rome",
    birthTimeDstOccurrence: null,
    birthLatitude: 41.9,
    birthLongitude: 12.49,
    source: "manual",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function raise(): never {
  throw new Error("Unexpected test dependency call");
}

async function expectHttpCode(
  promise: Promise<unknown>,
  status: number,
  code: string
): Promise<void> {
  try {
    await promise;
    throw new Error("Expected promise to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    const exception = error as HttpException;
    expect(exception.getStatus()).toBe(status);
    expect(exception.getResponse()).toMatchObject({ code });
  }
}
