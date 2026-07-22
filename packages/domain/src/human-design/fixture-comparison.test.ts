import { describe, expect, it } from "vitest";
import { HUMAN_DESIGN_APPROVED_FIXTURES } from "./fixtures/approved-fixtures";
import { buildHumanDesignIndividualBaseResult } from "./individual";

describe("Human Design approved external fixtures", () => {
  it("matches approved external calculator output for gates, channels and core mechanics", () => {
    expect(HUMAN_DESIGN_APPROVED_FIXTURES.length).toBeGreaterThanOrEqual(3);
    expect(
      HUMAN_DESIGN_APPROVED_FIXTURES.some(
        (fixture) => fixture.source.mode === "reference_boundary_case"
      )
    ).toBe(true);

    for (const fixture of HUMAN_DESIGN_APPROVED_FIXTURES) {
      expect(fixture.source.approval).toBe("approved");

      const result = buildHumanDesignIndividualBaseResult(fixture.input);

      expect(result.type).toBe(fixture.expected.type);
      expect(result.profile.code).toBe(fixture.expected.profile);
      expect(result.authority).toBe(fixture.expected.derivedAuthority);
      if (fixture.expected.externalAuthorityLabel) {
        expect(fixture.expected.externalAuthorityLabel).not.toHaveLength(0);
      }
      expect(result.definition).toBe(fixture.expected.derivedDefinition);
      expect(result.definedChannels.map((channel) => channel.code)).toEqual(
        fixture.expected.definedChannels
      );
      expect(result.definedCenters.map((center) => center.code)).toEqual(
        fixture.expected.definedCenters
      );
      expect(result.incarnationCross).toMatchObject(fixture.expected.incarnationCross);

      for (const expectedActivation of fixture.expected.activations) {
        const activation = result.activations.find(
          (candidate) =>
            candidate.side === expectedActivation.side &&
            candidate.body === expectedActivation.body
        );

        expect(activation, `${fixture.id}:${expectedActivation.side}.${expectedActivation.body}`).toMatchObject({
          gate: expectedActivation.gate,
          line: expectedActivation.line
        });
      }
    }
  });
});
