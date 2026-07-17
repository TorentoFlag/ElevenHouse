import { manualBlockParamsSchema, manualBlockResponseSchema } from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function releaseManualBlock(blockId: string) {
  const params = manualBlockParamsSchema.parse({ blockId });

  return manualBlockResponseSchema.parse(
    await application.http.delete(`/calendar/blocks/${params.blockId}`, { csrf: true })
  );
}
