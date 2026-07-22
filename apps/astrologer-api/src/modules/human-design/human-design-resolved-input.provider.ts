import type { ConfigService } from "@nestjs/config";
import {
  ChartEngineHttpClient,
  resolveHumanDesignResolvedInput
} from "@elevenhouse/chart-engine-client";
import type { HumanDesignResolvedInputProvider } from "./human-design.tokens";

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
    }
  };
}
