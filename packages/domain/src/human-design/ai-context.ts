import type { HumanDesignCompatibilityResult } from "./compatibility";
import type { HumanDesignIndividualBaseResult } from "./individual";
import type { HumanDesignTransitResult } from "./transit";

export type HumanDesignAiLocale = "ru" | "en";
export type HumanDesignAiBaseResult =
  | HumanDesignIndividualBaseResult
  | HumanDesignCompatibilityResult;

export type HumanDesignAiContext = {
  readonly locale: HumanDesignAiLocale;
  readonly methodCode: "human_design_classic";
  readonly engineRevision: 1;
  readonly resultChecksum: string;
  readonly mode: "individual" | "compatibility";
  readonly subject: HumanDesignAiIndividualSummary;
  readonly partner: HumanDesignAiIndividualSummary | null;
  readonly compatibility: HumanDesignAiCompatibilitySummary | null;
  readonly transit: HumanDesignAiTransitSummary | null;
};

export type HumanDesignAiIndividualSummary = {
  readonly type: HumanDesignIndividualBaseResult["type"];
  readonly strategy: HumanDesignIndividualBaseResult["strategy"];
  readonly authority: HumanDesignIndividualBaseResult["authority"];
  readonly profile: HumanDesignIndividualBaseResult["profile"]["code"];
  readonly definition: HumanDesignIndividualBaseResult["definition"];
  readonly signature: HumanDesignIndividualBaseResult["signature"];
  readonly notSelfTheme: HumanDesignIndividualBaseResult["notSelfTheme"];
  readonly incarnationCross: {
    readonly angle: HumanDesignIndividualBaseResult["incarnationCross"]["angle"];
    readonly profileCode: HumanDesignIndividualBaseResult["incarnationCross"]["profileCode"];
    readonly gateSequence: HumanDesignIndividualBaseResult["incarnationCross"]["gateSequence"];
  };
  readonly definedCenters: readonly HumanDesignIndividualBaseResult["definedCenters"][number]["code"][];
  readonly definedChannels: readonly HumanDesignIndividualBaseResult["definedChannels"][number]["code"][];
  readonly definedGates: readonly number[];
};

export type HumanDesignAiCompatibilitySummary = {
  readonly dynamicCounts: HumanDesignCompatibilityResult["dynamicCounts"];
  readonly sharedDefinedCenters: HumanDesignCompatibilityResult["sharedDefinedCenters"];
  readonly bridgedCenters: HumanDesignCompatibilityResult["bridgedCenters"];
  readonly connectionChannels: readonly {
    readonly code: HumanDesignCompatibilityResult["connectionChannels"][number]["code"];
    readonly dynamic: HumanDesignCompatibilityResult["connectionChannels"][number]["dynamic"];
    readonly subjectGateState: HumanDesignCompatibilityResult["connectionChannels"][number]["subjectGateState"];
    readonly partnerGateState: HumanDesignCompatibilityResult["connectionChannels"][number]["partnerGateState"];
  }[];
};

export type HumanDesignAiTransitSummary = {
  readonly snapshot: Pick<HumanDesignTransitResult["transitSnapshot"], "instant" | "date" | "time" | "timezone">;
  readonly summary: HumanDesignTransitResult["summary"];
  readonly transitDefinedGates: readonly number[];
  readonly completedChannels: readonly {
    readonly code: HumanDesignTransitResult["completedChannels"][number]["code"];
    readonly natalGate: HumanDesignTransitResult["completedChannels"][number]["natalGate"];
    readonly transitGate: HumanDesignTransitResult["completedChannels"][number]["transitGate"];
  }[];
  readonly temporarilyDefinedCenters: readonly HumanDesignTransitResult["temporarilyDefinedCenters"][number]["code"][];
};

export function buildHumanDesignAiContext(input: {
  readonly locale: HumanDesignAiLocale;
  readonly result: HumanDesignAiBaseResult;
  readonly resultChecksum: string;
  readonly transit?: HumanDesignTransitResult | null;
}): HumanDesignAiContext {
  if (!/^sha256:[a-f0-9]{64}$/.test(input.resultChecksum)) {
    throw new Error("Human Design AI result checksum is invalid");
  }
  if (input.result.resultChecksum.value !== input.resultChecksum) {
    throw new Error("Human Design AI result checksum is stale");
  }
  if (input.transit && input.result.mode !== "individual") {
    throw new Error("Human Design transit AI context requires an individual natal result");
  }
  if (input.transit && input.transit.natal.resultChecksum.value !== input.resultChecksum) {
    throw new Error("Human Design transit AI context is not bound to the natal result");
  }

  const subject =
    input.result.mode === "compatibility" ? input.result.participants.subject : input.result;
  const partner = input.result.mode === "compatibility" ? input.result.participants.partner : null;

  return {
    locale: input.locale,
    methodCode: input.result.methodCode,
    engineRevision: input.result.engineRevision,
    resultChecksum: input.resultChecksum,
    mode: input.result.mode,
    subject: summarizeIndividual(subject),
    partner: partner ? summarizeIndividual(partner) : null,
    compatibility:
      input.result.mode === "compatibility" ? summarizeCompatibility(input.result) : null,
    transit: input.transit ? summarizeTransit(input.transit) : null
  };
}

function summarizeIndividual(
  result: HumanDesignIndividualBaseResult
): HumanDesignAiIndividualSummary {
  return {
    type: result.type,
    strategy: result.strategy,
    authority: result.authority,
    profile: result.profile.code,
    definition: result.definition,
    signature: result.signature,
    notSelfTheme: result.notSelfTheme,
    incarnationCross: {
      angle: result.incarnationCross.angle,
      profileCode: result.incarnationCross.profileCode,
      gateSequence: result.incarnationCross.gateSequence
    },
    definedCenters: result.definedCenters.map((center) => center.code),
    definedChannels: result.definedChannels.map((channel) => channel.code),
    definedGates: result.definedGates.map((gate) => gate.gate).sort((left, right) => left - right)
  };
}

function summarizeCompatibility(
  result: HumanDesignCompatibilityResult
): HumanDesignAiCompatibilitySummary {
  return {
    dynamicCounts: result.dynamicCounts,
    sharedDefinedCenters: result.sharedDefinedCenters,
    bridgedCenters: result.bridgedCenters,
    connectionChannels: result.connectionChannels.map((channel) => ({
      code: channel.code,
      dynamic: channel.dynamic,
      subjectGateState: channel.subjectGateState,
      partnerGateState: channel.partnerGateState
    }))
  };
}

function summarizeTransit(result: HumanDesignTransitResult): HumanDesignAiTransitSummary {
  return {
    snapshot: {
      instant: result.transitSnapshot.instant,
      date: result.transitSnapshot.date,
      time: result.transitSnapshot.time,
      timezone: result.transitSnapshot.timezone
    },
    summary: result.summary,
    transitDefinedGates: result.transitDefinedGates
      .map((gate) => gate.gate)
      .sort((left, right) => left - right),
    completedChannels: result.completedChannels.map((channel) => ({
      code: channel.code,
      natalGate: channel.natalGate,
      transitGate: channel.transitGate
    })),
    temporarilyDefinedCenters: result.temporarilyDefinedCenters.map((center) => center.code)
  };
}
