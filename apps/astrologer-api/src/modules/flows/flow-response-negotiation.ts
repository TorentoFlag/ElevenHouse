import {
  FLOW_DEFINITION_VALIDATION_V2_MEDIA_TYPE,
  FLOW_PUBLICATION_V3_MEDIA_TYPE
} from "@elevenhouse/contracts";

export type FlowValidationResponseVersion = "legacy_v1" | "current_v2";
export type FlowPublicationResponseVersion = "legacy_v2" | "current_v3";

export type FlowNegotiatedResponse = {
  readonly getHeader: (name: string) => number | string | readonly string[] | undefined;
  readonly setHeader: (name: string, value: string) => void;
};

export function negotiateFlowValidationResponse(
  accept: string | undefined
): FlowValidationResponseVersion {
  return explicitlyAccepts(accept, FLOW_DEFINITION_VALIDATION_V2_MEDIA_TYPE)
    ? "current_v2"
    : "legacy_v1";
}

export function negotiateFlowPublicationResponse(
  accept: string | undefined
): FlowPublicationResponseVersion {
  return explicitlyAccepts(accept, FLOW_PUBLICATION_V3_MEDIA_TYPE) ? "current_v3" : "legacy_v2";
}

export function setFlowNegotiatedResponseHeaders(
  response: FlowNegotiatedResponse,
  contentType: string
): void {
  appendVary(response, "Accept");
  response.setHeader("Content-Type", contentType);
}

function appendVary(response: FlowNegotiatedResponse, field: string): void {
  const current = response.getHeader("Vary");
  const fields = (Array.isArray(current) ? current : current === undefined ? [] : [String(current)])
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  if (fields.includes("*")) return;
  if (!fields.some((value) => value.toLowerCase() === field.toLowerCase())) fields.push(field);
  response.setHeader("Vary", fields.join(", "));
}

function explicitlyAccepts(accept: string | undefined, mediaType: string): boolean {
  if (!accept) return false;
  const expected = mediaType.toLowerCase();
  return accept.split(",").some((mediaRange) => {
    const [rawType, ...rawParameters] = mediaRange.split(";");
    if (rawType?.trim().toLowerCase() !== expected) return false;
    const qualityParameter = rawParameters.find(
      (parameter) => parameter.split("=", 1)[0]?.trim().toLowerCase() === "q"
    );
    if (!qualityParameter) return true;
    const [, rawQuality] = qualityParameter.split("=", 2);
    const quality = Number(rawQuality?.trim());
    return Number.isFinite(quality) && quality > 0 && quality <= 1;
  });
}
