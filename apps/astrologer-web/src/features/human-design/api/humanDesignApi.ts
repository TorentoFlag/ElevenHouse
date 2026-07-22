import {
  humanDesignPreviewRequestSchema,
  humanDesignPreviewResponseSchema,
  type HumanDesignPreviewRequest,
  type HumanDesignPreviewResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function previewHumanDesign(
  input: HumanDesignPreviewRequest
): Promise<HumanDesignPreviewResponse> {
  const body = humanDesignPreviewRequestSchema.parse(input);

  return humanDesignPreviewResponseSchema.parse(
    await application.http.post("/human-design/preview", body)
  );
}
