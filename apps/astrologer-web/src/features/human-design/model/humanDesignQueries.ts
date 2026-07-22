import type {
  HumanDesignPreviewRequest,
  PersistHumanDesignCalculationRequest
} from "@elevenhouse/contracts";
import { createHumanDesignCalculation, previewHumanDesign } from "../api/humanDesignApi";

export const humanDesignQueryKeys = {
  all: () => ["human-design"] as const,
  preview: () => ["human-design", "preview"] as const
};

export const previewHumanDesignMutationOptions = () => ({
  mutationFn: (body: HumanDesignPreviewRequest) => previewHumanDesign(body)
});

export const createHumanDesignCalculationMutationOptions = () => ({
  mutationFn: (body: PersistHumanDesignCalculationRequest) => createHumanDesignCalculation(body)
});
