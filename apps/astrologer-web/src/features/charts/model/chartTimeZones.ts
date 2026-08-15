export type ChartTimeZoneGroup = {
  readonly label: string;
  readonly timeZones: readonly string[];
};

export function getChartTimeZoneGroups(selectedTimeZone: string): readonly ChartTimeZoneGroup[] {
  const timeZones = new Set(["UTC", ...getBrowserTimeZones()]);
  const selected = selectedTimeZone.trim();
  if (selected) timeZones.add(selected);

  const groups = new Map<string, string[]>();
  for (const timeZone of [...timeZones].sort((left, right) => left.localeCompare(right, "en"))) {
    const label = timeZone === "UTC" ? "UTC" : (timeZone.split("/", 1)[0] ?? "Other");
    const group = groups.get(label) ?? [];
    group.push(timeZone);
    groups.set(label, group);
  }

  return [...groups]
    .sort(([left], [right]) => {
      if (left === "UTC") return -1;
      if (right === "UTC") return 1;
      return left.localeCompare(right, "en");
    })
    .map(([label, timeZones]) => ({ label, timeZones }));
}

function getBrowserTimeZones(): readonly string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [];
  }
}
