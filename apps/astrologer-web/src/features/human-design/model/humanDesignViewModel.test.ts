import { describe, expect, it } from "vitest";
import type {
  HumanDesignCompatibilityResult,
  HumanDesignIndividualResult
} from "@elevenhouse/contracts";
import {
  createHumanDesignViewModel,
  getHumanDesignDetail
} from "./humanDesignViewModel";

describe("humanDesignViewModel", () => {
  it("maps server mechanics to Russian display labels without recalculating the chart", () => {
    const model = createHumanDesignViewModel(result());

    expect(model.properties).toEqual([
      { key: "type", label: "Тип", value: "Генератор" },
      { key: "strategy", label: "Стратегия", value: "Откликаться", accent: true },
      { key: "authority", label: "Авторитет", value: "Сакральный" },
      { key: "profile", label: "Профиль", value: "1/3" },
      { key: "definition", label: "Определение", value: "Единичное" }
    ]);
    expect(model.definedCenterCodes).toEqual(["throat", "sacral"]);
    expect(model.centers.find((center) => center.code === "sacral")).toMatchObject({
      label: "Сакрал",
      stateLabel: "опр.",
      defined: true
    });
    expect(model.centers.find((center) => center.code === "head")).toMatchObject({
      stateLabel: "откр.",
      defined: false
    });
    expect(model.channels).toEqual([
      { code: "20-34", label: "20–34", name: "Харизмы", gates: [20, 34] }
    ]);
  });

  it("returns detail text for properties, centers and channels", () => {
    const model = createHumanDesignViewModel(result());

    expect(getHumanDesignDetail(model, "type")).toMatchObject({
      title: "Генератор",
      subtitle: "Тип"
    });
    expect(getHumanDesignDetail(model, "sacral")).toMatchObject({
      title: "Сакрал",
      subtitle: "Определён"
    });
    expect(getHumanDesignDetail(model, "ch:20-34")).toMatchObject({
      title: "Канал 20–34 · Харизмы",
      subtitle: "Определён"
    });
    expect(getHumanDesignDetail(model, "ch:64-47")).toMatchObject({
      title: "Канал 64–47 · Абстракции",
      subtitle: "Не активирован"
    });
  });

  it("maps compatibility results to partner summary and connection groups", () => {
    const model = createHumanDesignViewModel(compatibilityResult());

    expect(model.mode).toBe("compatibility");
    expect(model.compatibility?.partner).toMatchObject({
      type: "Генератор",
      authority: "Сакральный",
      profile: "1/3"
    });
    expect(model.compatibility?.dynamicGroups.find((group) => group.dynamic === "electromagnetic"))
      .toMatchObject({
        label: "Электромагнитика",
        count: 1,
        channels: [
          {
            key: "conn:electromagnetic:43-23",
            label: "43–23",
            name: "Структурирования"
          }
        ]
      });
    expect(getHumanDesignDetail(model, "compatibility:summary")).toMatchObject({
      title: "Партнёрский разбор",
      subtitle: "Connection dynamics"
    });
  });
});

function result(): HumanDesignIndividualResult {
  const checksum = `sha256:${"b".repeat(64)}`;
  const bodies = [
    "sun",
    "earth",
    "moon",
    "north_node",
    "south_node",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto"
  ] as const;

  return {
    methodCode: "human_design_classic",
    engineRevision: 1,
    schemaVersion: "human-design-result.v1",
    mode: "individual",
    inputFingerprint: {
      algorithm: "sha256",
      canonicalization: "json-stable-v1",
      scope: "human-design-individual-resolved-input.v1",
      value: checksum
    },
    resultChecksum: {
      algorithm: "sha256",
      canonicalization: "json-stable-v1",
      value: checksum
    },
    activations: bodies.flatMap((body, index) => [
      {
        side: "personality" as const,
        body,
        longitude: index,
        gate: index === 0 ? 20 : index + 1,
        line: ((index % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6
      },
      {
        side: "design" as const,
        body,
        longitude: index + 20,
        gate: index === 0 ? 34 : index + 20,
        line: (((index + 1) % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6
      }
    ]),
    definedGates: [
      { gate: 20, activatedBy: [{ side: "personality", body: "sun", line: 1 }] },
      { gate: 34, activatedBy: [{ side: "design", body: "sun", line: 2 }] }
    ],
    definedChannels: [
      {
        code: "20-34",
        gates: [20, 34],
        centers: ["throat", "sacral"],
        circuit: "integration"
      }
    ],
    definedCenters: [
      { code: "throat", definedByChannels: ["20-34"] },
      { code: "sacral", definedByChannels: ["20-34"] }
    ],
    type: "generator",
    strategy: "wait_to_respond",
    signature: "satisfaction",
    notSelfTheme: "frustration",
    typeBasis: {
      definedCenterCount: 2,
      sacralDefined: true,
      throatDefined: true,
      throatConnectedMotorCenters: ["sacral"]
    },
    authority: "sacral",
    authorityBasis: {
      definedCenters: ["sacral", "throat"],
      priority: ["emotional", "sacral"],
      selectedBy: "sacral"
    },
    definition: "single",
    definitionComponents: [{ centers: ["throat", "sacral"], channels: ["20-34"] }],
    definitionBasis: {
      definedCenterCount: 2,
      componentCount: 1
    },
    incarnationCross: {
      angle: "right_angle",
      profileCode: "1/3",
      gates: {
        personalitySun: { gate: 20, line: 1 },
        personalityEarth: { gate: 1, line: 2 },
        designSun: { gate: 34, line: 2 },
        designEarth: { gate: 2, line: 3 }
      },
      gateSequence: [20, 1, 34, 2]
    },
    profile: {
      personalityLine: 1,
      designLine: 3,
      code: "1/3"
    }
  };
}

function compatibilityResult(): HumanDesignCompatibilityResult {
  const subject = result();
  const partner = {
    ...result(),
    inputFingerprint: {
      algorithm: "sha256" as const,
      canonicalization: "json-stable-v1" as const,
      scope: "human-design-individual-resolved-input.v1" as const,
      value: `sha256:${"d".repeat(64)}`
    },
    resultChecksum: {
      algorithm: "sha256" as const,
      canonicalization: "json-stable-v1" as const,
      value: `sha256:${"e".repeat(64)}`
    }
  };
  return {
    methodCode: "human_design_classic",
    engineRevision: 1,
    schemaVersion: "human-design-compatibility-result.v1",
    mode: "compatibility",
    participants: { subject, partner },
    connectionChannels: [
      {
        code: "43-23",
        gates: [43, 23],
        centers: ["ajna", "throat"],
        circuit: "individual",
        dynamic: "electromagnetic",
        subjectGateState: "hanging",
        partnerGateState: "hanging"
      }
    ],
    dynamicCounts: {
      electromagnetic: 1,
      companionship: 0,
      dominance: 0,
      compromise: 0
    },
    sharedDefinedCenters: ["throat"],
    bridgedCenters: ["ajna"],
    inputFingerprint: {
      algorithm: "sha256",
      canonicalization: "json-stable-v1",
      scope: "human-design-compatibility-input.v1",
      value: `sha256:${"f".repeat(64)}`
    },
    resultChecksum: {
      algorithm: "sha256",
      canonicalization: "json-stable-v1",
      value: `sha256:${"f".repeat(64)}`
    }
  };
}
