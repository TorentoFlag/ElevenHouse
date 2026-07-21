import { describe, expect, it } from "vitest";
import {
  HUMAN_DESIGN_METHOD_CODE,
  HUMAN_DESIGN_METHOD_PASSPORT,
  deriveDefinedChannels
} from "../index";

describe("Human Design module exports", () => {
  it("exports the foundation API from the root domain index", () => {
    expect(HUMAN_DESIGN_METHOD_CODE).toBe("human_design_classic");
    expect(HUMAN_DESIGN_METHOD_PASSPORT.channels).toHaveLength(36);
    expect(typeof deriveDefinedChannels).toBe("function");
  });
});
