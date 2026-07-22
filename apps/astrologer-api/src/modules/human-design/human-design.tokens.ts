import type { ChartInputSnapshot } from "@elevenhouse/contracts";
import type { BuildHumanDesignActivationsInput } from "@elevenhouse/domain";

export const HUMAN_DESIGN_RESOLVED_INPUT_PROVIDER = Symbol(
  "HUMAN_DESIGN_RESOLVED_INPUT_PROVIDER"
);

export type HumanDesignResolvedInputProvider = {
  readonly resolve: (input: {
    readonly inputSnapshot: ChartInputSnapshot;
  }) => Promise<BuildHumanDesignActivationsInput>;
};
