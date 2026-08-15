import { describe, expect, it } from "vitest";
import { getChartTimeZoneGroups } from "./chartTimeZones";

describe("getChartTimeZoneGroups", () => {
  it("returns UTC first, groups canonical IANA zones, and keeps the selected legacy value", () => {
    const groups = getChartTimeZoneGroups("Etc/GMT-3");

    expect(groups[0]).toEqual({ label: "UTC", timeZones: ["UTC"] });
    expect(groups.find((group) => group.label === "America")?.timeZones).toContain(
      "America/New_York"
    );
    expect(groups.find((group) => group.label === "Europe")?.timeZones).toContain("Europe/Moscow");
    expect(groups.find((group) => group.label === "Etc")?.timeZones).toContain("Etc/GMT-3");
  });
});
