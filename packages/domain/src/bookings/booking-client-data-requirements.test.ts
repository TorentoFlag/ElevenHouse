import { describe, expect, it } from "vitest";

import {
  bookingClientDataRequirementsSchemaVersion,
  parseBookingClientDataRequirementsSnapshot
} from "./booking-types";

describe("booking client-data requirements snapshot", () => {
  it("parses an exact immutable product-requirements snapshot", () => {
    expect(
      parseBookingClientDataRequirementsSnapshot({
        schemaVersion: bookingClientDataRequirementsSchemaVersion,
        executionMode: "live",
        participantMode: "solo",
        requiredClientData: ["chart1", "question"],
        methods: ["natal"]
      })
    ).toEqual({
      schemaVersion: bookingClientDataRequirementsSchemaVersion,
      executionMode: "live",
      participantMode: "solo",
      requiredClientData: ["chart1", "question"],
      methods: ["natal"]
    });
  });

  it.each([
    null,
    {},
    {
      schemaVersion: bookingClientDataRequirementsSchemaVersion,
      executionMode: "live",
      participantMode: "solo",
      requiredClientData: ["chart1", "chart1"],
      methods: ["natal"]
    },
    {
      schemaVersion: bookingClientDataRequirementsSchemaVersion,
      executionMode: "live",
      participantMode: "solo",
      requiredClientData: ["chart1"],
      methods: ["unknown"]
    },
    {
      schemaVersion: "booking-client-data-requirements.legacy-unavailable.v1",
      reasonCode: "LEGACY_BOOKING_REQUIREMENTS_NOT_SNAPSHOTTED"
    }
  ])("rejects malformed, duplicate, unsupported or expanded persisted content", (value) => {
    expect(() => parseBookingClientDataRequirementsSnapshot(value)).toThrow(
      "Persisted booking client-data requirements snapshot is invalid"
    );
  });
});
