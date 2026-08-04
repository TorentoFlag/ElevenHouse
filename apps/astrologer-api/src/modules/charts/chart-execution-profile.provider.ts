import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { resolveChartExecutionProfile, type ChartExecutionProfile } from "@elevenhouse/domain";

const chartExecutionProfileKeys = [
  "NODE_ENV",
  "CHART_ENGINE_EXPECTED_EPHEMERIS",
  "CHART_ENGINE_EXPECTED_EPHEMERIS_FLAGS",
  "CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION",
  "CHART_ENGINE_EXPECTED_KERYKEION_VERSION",
  "CHART_ENGINE_EXPECTED_PYSWISSEPH_VERSION"
] as const;

@Injectable()
export class ChartExecutionProfileProvider {
  private readonly profile: ChartExecutionProfile;

  constructor(config: ConfigService) {
    const source = Object.fromEntries(
      chartExecutionProfileKeys.map((key) => [key, config.get<string>(key)])
    );
    const resolved = resolveChartExecutionProfile(source);
    this.profile = Object.freeze({
      ...resolved,
      expectedEphemerisFlags: Object.freeze([...resolved.expectedEphemerisFlags])
    }) as ChartExecutionProfile;
  }

  getProfile(): ChartExecutionProfile {
    return this.profile;
  }
}
