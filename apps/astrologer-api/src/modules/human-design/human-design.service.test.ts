import { HttpException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { humanDesignPreviewResponseSchema } from "@elevenhouse/contracts";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { HumanDesignService } from "./human-design.service";

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
    const response = await new HumanDesignService().preview(previewBody(), request());

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

  it("rejects invalid preview bodies with a stable safe error code", async () => {
    await expectHttpCode(
      new HumanDesignService().preview(
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
      new HumanDesignService().preview(previewBody(), { headers: {} })
    ).rejects.toThrow(UnauthorizedException);
  });
});

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
