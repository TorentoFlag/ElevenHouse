import type { HumanDesignPreviewRequest } from "@elevenhouse/contracts";
import { previewHumanDesign } from "../api/humanDesignApi";

export const humanDesignQueryKeys = {
  all: () => ["human-design"] as const,
  preview: () => ["human-design", "preview"] as const
};

export const previewHumanDesignMutationOptions = () => ({
  mutationFn: (body: HumanDesignPreviewRequest) => previewHumanDesign(body)
});
