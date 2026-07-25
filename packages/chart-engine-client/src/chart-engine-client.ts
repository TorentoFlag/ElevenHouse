import {
  astroCalendarGenerationRequestSchema,
  astroCalendarRangeResponseSchema,
  chartAstrocartographyCalculationRequestSchema,
  chartCompositeCalculationRequestSchema,
  chartHoraryCalculationRequestSchema,
  chartNatalCalculationRequestSchema,
  chartPlanetaryPositionsRequestSchema,
  chartPlanetaryPositionsResponseSchema,
  chartProgressionCalculationRequestSchema,
  chartSolarReturnCalculationRequestSchema,
  chartSynastryCalculationRequestSchema,
  chartTransitCalculationRequestSchema,
  storedChartProgressionCalculationPayloadSchema,
  storedChartSolarReturnCalculationPayloadSchema,
  storedChartAstrocartographyCalculationPayloadSchema,
  storedChartHoraryCalculationPayloadSchema,
  storedChartSynastryCalculationPayloadSchema,
  storedChartTransitCalculationPayloadSchema,
  storedChartCalculationPayloadSchema,
  storedChartCompositeCalculationPayloadSchema,
  type AstroCalendarGenerationRequestInput,
  type AstroCalendarRangeResponse,
  type ChartAstrocartographyCalculationRequestInput,
  type ChartCompositeCalculationRequestInput,
  type ChartHoraryCalculationRequestInput,
  type ChartNatalCalculationRequestInput,
  type ChartPlanetaryPositionsRequestInput,
  type ChartPlanetaryPositionsResponse,
  type ChartProgressionCalculationRequestInput,
  type ChartSolarReturnCalculationRequestInput,
  type ChartSynastryCalculationRequestInput,
  type ChartTransitCalculationRequestInput,
  type StoredChartProgressionCalculationPayload,
  type StoredChartSolarReturnCalculationPayload,
  type StoredChartAstrocartographyCalculationPayload,
  type StoredChartHoraryCalculationPayload,
  type StoredChartSynastryCalculationPayload,
  type StoredChartTransitCalculationPayload,
  type StoredChartCompositeCalculationPayload,
  type StoredChartCalculationPayload
} from "@elevenhouse/contracts";

export class ChartEnginePermanentError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ChartEnginePermanentError";
  }
}

export type ChartEngineHttpClientInput = {
  readonly baseUrl: string;
  readonly fetchFn?: typeof fetch;
};

export class ChartEngineHttpClient {
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;

  constructor(input: ChartEngineHttpClientInput) {
    this.baseUrl = input.baseUrl.replace(/\/$/, "");
    this.fetchFn = input.fetchFn ?? fetch;
  }

  async calculateNatal(
    payload: ChartNatalCalculationRequestInput
  ): Promise<StoredChartCalculationPayload> {
    const parsedPayload = chartNatalCalculationRequestSchema.parse(payload);
    const response = await this.fetchFn(`${this.baseUrl}/v1/natal`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsedPayload)
    });
    if (!response.ok) {
      throw new Error(`CHART_ENGINE_HTTP_${response.status}`);
    }
    const data: unknown = await response.json();
    const parsed = storedChartCalculationPayloadSchema.safeParse(data);
    if (!parsed.success) {
      throw new ChartEnginePermanentError("Chart engine returned invalid result", {
        cause: parsed.error
      });
    }
    return parsed.data;
  }

  async calculateTransit(
    payload: ChartTransitCalculationRequestInput
  ): Promise<StoredChartTransitCalculationPayload> {
    const parsedPayload = chartTransitCalculationRequestSchema.parse(payload);
    const response = await this.fetchFn(`${this.baseUrl}/v1/transits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsedPayload)
    });
    if (!response.ok) {
      throw new Error(`CHART_ENGINE_HTTP_${response.status}`);
    }
    const data: unknown = await response.json();
    const parsed = storedChartTransitCalculationPayloadSchema.safeParse(data);
    if (!parsed.success) {
      throw new ChartEnginePermanentError("Chart engine returned invalid transit result", {
        cause: parsed.error
      });
    }
    return parsed.data;
  }

  async calculateSynastry(
    payload: ChartSynastryCalculationRequestInput
  ): Promise<StoredChartSynastryCalculationPayload> {
    const parsedPayload = chartSynastryCalculationRequestSchema.parse(payload);
    const response = await this.fetchFn(`${this.baseUrl}/v1/synastry`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsedPayload)
    });
    if (!response.ok) {
      throw new Error(`CHART_ENGINE_HTTP_${response.status}`);
    }
    const data: unknown = await response.json();
    const parsed = storedChartSynastryCalculationPayloadSchema.safeParse(data);
    if (!parsed.success) {
      throw new ChartEnginePermanentError("Chart engine returned invalid synastry result", {
        cause: parsed.error
      });
    }
    return parsed.data;
  }

  async calculateComposite(
    payload: ChartCompositeCalculationRequestInput
  ): Promise<StoredChartCompositeCalculationPayload> {
    const parsedPayload = chartCompositeCalculationRequestSchema.parse(payload);
    const response = await this.fetchFn(`${this.baseUrl}/v1/composite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsedPayload)
    });
    if (!response.ok) {
      throw new Error(`CHART_ENGINE_HTTP_${response.status}`);
    }
    const data: unknown = await response.json();
    const parsed = storedChartCompositeCalculationPayloadSchema.safeParse(data);
    if (!parsed.success) {
      throw new ChartEnginePermanentError("Chart engine returned invalid composite result", {
        cause: parsed.error
      });
    }
    return parsed.data;
  }

  async calculateSolarReturn(
    payload: ChartSolarReturnCalculationRequestInput
  ): Promise<StoredChartSolarReturnCalculationPayload> {
    const parsedPayload = chartSolarReturnCalculationRequestSchema.parse(payload);
    const response = await this.fetchFn(`${this.baseUrl}/v1/solar-return`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsedPayload)
    });
    if (!response.ok) {
      throw new Error(`CHART_ENGINE_HTTP_${response.status}`);
    }
    const data: unknown = await response.json();
    const parsed = storedChartSolarReturnCalculationPayloadSchema.safeParse(data);
    if (!parsed.success) {
      throw new ChartEnginePermanentError("Chart engine returned invalid solar return result", {
        cause: parsed.error
      });
    }
    return parsed.data;
  }

  async calculateProgression(
    payload: ChartProgressionCalculationRequestInput
  ): Promise<StoredChartProgressionCalculationPayload> {
    const parsedPayload = chartProgressionCalculationRequestSchema.parse(payload);
    const response = await this.fetchFn(`${this.baseUrl}/v1/progressions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsedPayload)
    });
    if (!response.ok) {
      throw new Error(`CHART_ENGINE_HTTP_${response.status}`);
    }
    const data: unknown = await response.json();
    const parsed = storedChartProgressionCalculationPayloadSchema.safeParse(data);
    if (!parsed.success) {
      throw new ChartEnginePermanentError("Chart engine returned invalid progression result", {
        cause: parsed.error
      });
    }
    return parsed.data;
  }

  async calculateHorary(
    payload: ChartHoraryCalculationRequestInput
  ): Promise<StoredChartHoraryCalculationPayload> {
    const parsedPayload = chartHoraryCalculationRequestSchema.parse(payload);
    const response = await this.fetchFn(`${this.baseUrl}/v1/horary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsedPayload)
    });
    if (!response.ok) {
      throw new Error(`CHART_ENGINE_HTTP_${response.status}`);
    }
    const data: unknown = await response.json();
    const parsed = storedChartHoraryCalculationPayloadSchema.safeParse(data);
    if (!parsed.success) {
      throw new ChartEnginePermanentError("Chart engine returned invalid horary result", {
        cause: parsed.error
      });
    }
    return parsed.data;
  }

  async calculateAstrocartography(
    payload: ChartAstrocartographyCalculationRequestInput
  ): Promise<StoredChartAstrocartographyCalculationPayload> {
    const parsedPayload = chartAstrocartographyCalculationRequestSchema.parse(payload);
    const response = await this.fetchFn(`${this.baseUrl}/v1/astrocartography`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsedPayload)
    });
    if (!response.ok) {
      throw new Error(`CHART_ENGINE_HTTP_${response.status}`);
    }
    const data: unknown = await response.json();
    const parsed = storedChartAstrocartographyCalculationPayloadSchema.safeParse(data);
    if (!parsed.success) {
      throw new ChartEnginePermanentError("Chart engine returned invalid astrocartography result", {
        cause: parsed.error
      });
    }
    return parsed.data;
  }

  async calculateAstroCalendarRange(
    payload: AstroCalendarGenerationRequestInput
  ): Promise<AstroCalendarRangeResponse> {
    const parsedPayload = astroCalendarGenerationRequestSchema.parse(payload);
    const response = await this.fetchFn(`${this.baseUrl}/v1/astro-calendar/range`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsedPayload)
    });
    if (!response.ok) {
      throw new Error(`CHART_ENGINE_HTTP_${response.status}`);
    }
    const data: unknown = await response.json();
    const parsed = astroCalendarRangeResponseSchema.safeParse(data);
    if (!parsed.success) {
      throw new ChartEnginePermanentError("Chart engine returned invalid astro calendar result", {
        cause: parsed.error
      });
    }
    return parsed.data;
  }

  async calculatePlanetaryPositions(
    payload: ChartPlanetaryPositionsRequestInput
  ): Promise<ChartPlanetaryPositionsResponse> {
    const parsedPayload = chartPlanetaryPositionsRequestSchema.parse(payload);
    const response = await this.fetchFn(`${this.baseUrl}/v1/positions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsedPayload)
    });
    if (!response.ok) {
      throw new Error(`CHART_ENGINE_HTTP_${response.status}`);
    }
    const data: unknown = await response.json();
    const parsed = chartPlanetaryPositionsResponseSchema.safeParse(data);
    if (!parsed.success) {
      throw new ChartEnginePermanentError("Chart engine returned invalid positions result", {
        cause: parsed.error
      });
    }
    return parsed.data;
  }

  async checkReady(): Promise<void> {
    const response = await this.fetchFn(`${this.baseUrl}/ready`, { method: "GET" });
    if (!response.ok) throw new Error(`CHART_ENGINE_READY_HTTP_${response.status}`);
  }
}
