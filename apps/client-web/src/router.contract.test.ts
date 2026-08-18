import { describe, expect, it } from "vitest";
import { clientAstroDiaryPath, clientRouteContract } from "./router.contract";

describe("client AstroDiary route contract", () => {
  it("keeps AstroDiary under one explicit related astrologer", () => {
    expect(clientRouteContract.authenticatedAstroDiary).toBe(
      "/me/astrologers/:astrologerId/journal"
    );
    expect(clientAstroDiaryPath("41111111-1111-4111-8111-111111111111")).toBe(
      "/me/astrologers/41111111-1111-4111-8111-111111111111/journal"
    );
  });
});
