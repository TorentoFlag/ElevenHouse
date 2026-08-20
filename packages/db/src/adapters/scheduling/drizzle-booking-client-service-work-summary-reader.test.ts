import { describe, expect, it } from "vitest";

import { createDrizzleBookingClientServiceWorkSummaryReader } from "./drizzle-booking-client-service-work-summary-reader";

describe("Drizzle booking client service-work summary reader source projection", () => {
  it("does not select whole booking rows into the Clients CRM projection", () => {
    const source = createDrizzleBookingClientServiceWorkSummaryReader.toString();

    expect(source).not.toContain(".select({ booking: bookings })");
    expect(source).toContain("productTitle");
    expect(source).toContain("timeZone");
  });
});
