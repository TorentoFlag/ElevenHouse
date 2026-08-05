export const CHART_COMMAND_STORE = Symbol("CHART_COMMAND_STORE");
export const CHART_JOB_STORE = Symbol("CHART_JOB_STORE");
export const CHART_AI_CONFIG = Symbol("CHART_AI_CONFIG");
export const CHART_AI_DRAFT_COMMAND_STORE = Symbol("CHART_AI_DRAFT_COMMAND_STORE");

export type ChartAiConfig = {
  readonly enabled: boolean;
};
