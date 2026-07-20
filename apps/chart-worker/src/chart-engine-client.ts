import {
  chartNatalCalculationRequestSchema,
  storedChartCalculationPayloadSchema,
  type ChartNatalCalculationRequestInput,
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

  async checkReady(): Promise<void> {
    const response = await this.fetchFn(`${this.baseUrl}/ready`, { method: "GET" });
    if (!response.ok) throw new Error(`CHART_ENGINE_READY_HTTP_${response.status}`);
  }
}
