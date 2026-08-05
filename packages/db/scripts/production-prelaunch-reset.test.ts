import { describe, expect, it } from "vitest";

import { parseProductionPrelaunchResetTarget } from "./production-prelaunch-reset";

describe("parseProductionPrelaunchResetTarget", () => {
  const source = {
    DATABASE_URL: "postgresql://elevenhouse:secret@postgres:5432/elevenhouse",
    PRELAUNCH_RESET_EXPECTED_DATABASE_HOST: "postgres",
    PRELAUNCH_RESET_EXPECTED_DATABASE_NAME: "elevenhouse",
    PRELAUNCH_RESET_RELEASE: "0123456789abcdef0123456789abcdef01234567"
  };

  it("accepts only the release-bound confirmation for the exact compose database", () => {
    expect(
      parseProductionPrelaunchResetTarget(source, [
        "--confirm-prelaunch-reset=0123456789abcdef0123456789abcdef01234567:postgres:5432/elevenhouse"
      ])
    ).toMatchObject({
      databaseName: "elevenhouse",
      host: "postgres",
      port: "5432",
      release: "0123456789abcdef0123456789abcdef01234567"
    });
  });

  it("accepts the standard pnpm argument separator before the exact confirmation", () => {
    expect(
      parseProductionPrelaunchResetTarget(source, [
        "--",
        "--confirm-prelaunch-reset=0123456789abcdef0123456789abcdef01234567:postgres:5432/elevenhouse"
      ])
    ).toMatchObject({
      databaseName: "elevenhouse",
      host: "postgres"
    });
  });

  it("rejects a reset confirmation that is not bound to the release and target", () => {
    expect(() =>
      parseProductionPrelaunchResetTarget(source, [
        "--confirm-prelaunch-reset=other:postgres:5432/elevenhouse"
      ])
    ).toThrow(
      "Exact confirmation is required: --confirm-prelaunch-reset=0123456789abcdef0123456789abcdef01234567:postgres:5432/elevenhouse"
    );
  });

  it("rejects a production reset against a host other than the declared compose target", () => {
    expect(() =>
      parseProductionPrelaunchResetTarget(
        { ...source, DATABASE_URL: "postgresql://elevenhouse:secret@localhost:5432/elevenhouse" },
        ["--confirm-prelaunch-reset=0123456789abcdef0123456789abcdef01234567:postgres:5432/elevenhouse"]
      )
    ).toThrow("Pre-launch reset target host does not match expected host");
  });
});
