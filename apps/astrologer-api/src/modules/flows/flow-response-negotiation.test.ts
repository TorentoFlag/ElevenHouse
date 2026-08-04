import {
  FLOW_DEFINITION_VALIDATION_V2_MEDIA_TYPE,
  FLOW_PUBLICATION_V3_MEDIA_TYPE
} from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";

import {
  negotiateFlowPublicationResponse,
  negotiateFlowValidationResponse,
  setFlowNegotiatedResponseHeaders
} from "./flow-response-negotiation";

describe("Flow response negotiation", () => {
  it.each([
    undefined,
    "*/*",
    "application/json",
    `${FLOW_DEFINITION_VALIDATION_V2_MEDIA_TYPE};q=0`
  ])("keeps validation on the legacy envelope without explicit opt-in: %s", (accept) => {
    expect(negotiateFlowValidationResponse(accept)).toBe("legacy_v1");
  });

  it("selects validation V2 only for an explicit positive vendor media range", () => {
    expect(
      negotiateFlowValidationResponse(
        `${FLOW_DEFINITION_VALIDATION_V2_MEDIA_TYPE}, application/json;q=0.9`
      )
    ).toBe("current_v2");
    expect(
      negotiateFlowValidationResponse(FLOW_DEFINITION_VALIDATION_V2_MEDIA_TYPE.toUpperCase())
    ).toBe("current_v2");
  });

  it.each([undefined, "*/*", "application/json", `${FLOW_PUBLICATION_V3_MEDIA_TYPE}; q=0.000`])(
    "keeps publication on the legacy envelope without explicit opt-in: %s",
    (accept) => {
      expect(negotiateFlowPublicationResponse(accept)).toBe("legacy_v2");
    }
  );

  it("selects publication V3 only for an explicit positive vendor media range", () => {
    expect(
      negotiateFlowPublicationResponse(
        `application/json;q=0.9, ${FLOW_PUBLICATION_V3_MEDIA_TYPE};q=1`
      )
    ).toBe("current_v3");
  });

  it("appends Accept to an existing Vary header without duplicates", () => {
    let vary: string | undefined = "Origin";
    let contentType: string | undefined;
    const response = {
      getHeader: (name: string) => (name === "Vary" ? vary : undefined),
      setHeader: (name: string, value: string) => {
        if (name === "Vary") vary = value;
        if (name === "Content-Type") contentType = value;
      }
    };

    setFlowNegotiatedResponseHeaders(response, FLOW_PUBLICATION_V3_MEDIA_TYPE);
    setFlowNegotiatedResponseHeaders(response, FLOW_PUBLICATION_V3_MEDIA_TYPE);

    expect(vary).toBe("Origin, Accept");
    expect(contentType).toBe(FLOW_PUBLICATION_V3_MEDIA_TYPE);
  });

  it("preserves wildcard Vary semantics", () => {
    let vary = "*";
    const response = {
      getHeader: () => vary,
      setHeader: (name: string, value: string) => {
        if (name === "Vary") vary = value;
      }
    };

    setFlowNegotiatedResponseHeaders(response, "application/json");

    expect(vary).toBe("*");
  });
});
