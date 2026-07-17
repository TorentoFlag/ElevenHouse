import { describe, expect, it } from "vitest";
import { ianaTimeZoneSchema } from "./time-zone";

describe("ianaTimeZoneSchema", () => {
  it.each(["Europe/Moscow", "America/New_York", "Etc/GMT-3", "UTC"])("accepts %s", (timeZone) => {
    expect(ianaTimeZoneSchema.parse(timeZone)).toBe(timeZone);
  });

  it.each(["UTC+3", "GMT+3", "Mars/Olympus", ""])("rejects %s", (timeZone) => {
    expect(() => ianaTimeZoneSchema.parse(timeZone)).toThrow();
  });
});
