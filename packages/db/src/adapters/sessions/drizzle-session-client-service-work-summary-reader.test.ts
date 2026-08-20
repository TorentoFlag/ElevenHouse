import { describe, expect, it } from "vitest";

import { createDrizzleSessionClientServiceWorkSummaryReader } from "./drizzle-session-client-service-work-summary-reader";

describe("Drizzle session client service-work summary reader source projection", () => {
  it("does not select whole session rows or provider fields into the Clients CRM projection", () => {
    const source = createDrizzleSessionClientServiceWorkSummaryReader.toString();

    expect(source).not.toContain(".select({ session: sessions })");
    expect(source).not.toContain("providerRoomName");
    expect(source).toContain("productTitle");
    expect(source).toContain("timeZone");
  });
});
