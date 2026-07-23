import type { ConfigService } from "@nestjs/config";
import {
  ChartEngineHttpClient,
  resolveHumanDesignResolvedInput
} from "@elevenhouse/chart-engine-client";
import type {
  ChartPlanetaryPositionsResponse,
  ChartPlanetaryPositionsSettings
} from "@elevenhouse/contracts";
import type { HumanDesignBasePlanetaryLongitudes } from "@elevenhouse/domain";
import type { HumanDesignResolvedInputProvider } from "./human-design.tokens";

const defaultPositionsSettings: ChartPlanetaryPositionsSettings = {
  zodiac: "tropical",
  nodeType: "true"
};

const positionBodyIds = [
  "sun",
  "moon",
  "north_node",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto"
] as const;

export function createChartEngineHumanDesignResolvedInputProvider(
  configService: ConfigService
): HumanDesignResolvedInputProvider {
  const chartEngine = new ChartEngineHttpClient({
    baseUrl: configService.getOrThrow<string>("astrologerApi.chartEngineBaseUrl")
  });
  return {
    resolve: async ({ inputSnapshot }) => {
      const resolved = await resolveHumanDesignResolvedInput({ chartEngine, inputSnapshot });
      return resolved.resolvedLongitudes;
    },
    resolveTransit: async ({ transitSnapshot }) => {
      const positions = await chartEngine.calculatePlanetaryPositions({
        schemaVersion: "chart-positions-request.v1",
        method: "planetary_positions",
        settings: defaultPositionsSettings,
        inputSnapshot: {
          birthDate: transitSnapshot.date,
          birthTime: transitSnapshot.time,
          timezone: transitSnapshot.timezone,
          latitude: transitSnapshot.latitude,
          longitude: transitSnapshot.longitude,
          birthTimePrecision: "exact"
        }
      });
      return toBasePlanetaryLongitudes(positions);
    }
  };
}

function toBasePlanetaryLongitudes(
  response: ChartPlanetaryPositionsResponse
): HumanDesignBasePlanetaryLongitudes {
  return {
    sun: getPositionLongitude(response, "sun"),
    moon: getPositionLongitude(response, "moon"),
    north_node: getPositionLongitude(response, "north_node"),
    mercury: getPositionLongitude(response, "mercury"),
    venus: getPositionLongitude(response, "venus"),
    mars: getPositionLongitude(response, "mars"),
    jupiter: getPositionLongitude(response, "jupiter"),
    saturn: getPositionLongitude(response, "saturn"),
    uranus: getPositionLongitude(response, "uranus"),
    neptune: getPositionLongitude(response, "neptune"),
    pluto: getPositionLongitude(response, "pluto")
  };
}

function getPositionLongitude(
  response: ChartPlanetaryPositionsResponse,
  id: (typeof positionBodyIds)[number]
): number {
  const position = response.positions.find((candidate) => candidate.id === id);
  if (!position) throw new Error(`Chart engine positions response is missing ${id}`);
  return position.longitude;
}
