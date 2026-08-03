import {
  astroCalendarGenerationRequestSchema,
  astroCalendarRangeResponseSchema,
  chartAstrocartographyCalculationRequestSchema,
  chartAstrocartographyResultV2Schema,
  chartCompositeCalculationRequestSchema,
  chartCompositeResultV2Schema,
  chartEngineReadinessResponseSchema,
  chartExecutionProfileSchema,
  chartHoraryCalculationRequestSchema,
  chartHoraryResultV2Schema,
  chartNatalCalculationRequestSchema,
  chartNatalResultV2Schema,
  chartPlanetaryPositionsRequestSchema,
  chartPlanetaryPositionsResponseSchema,
  chartProgressionCalculationRequestSchema,
  chartProgressionResultV2Schema,
  chartSolarReturnCalculationRequestSchema,
  chartSolarReturnResultV2Schema,
  chartSynastryCalculationRequestSchema,
  chartSynastryResultV2Schema,
  chartTransitCalculationRequestSchema,
  chartTransitResultV2Schema,
  type AstroCalendarGenerationRequestInput,
  type AstroCalendarRangeResponse,
  type ChartAstrocartographyCalculationRequestInput,
  type ChartCompositeCalculationRequestInput,
  type ChartEngineReadinessResponse,
  type ChartExecutionProfile,
  type ChartHoraryCalculationRequestInput,
  type ChartNatalCalculationRequestInput,
  type ChartPlanetaryPositionsRequestInput,
  type ChartPlanetaryPositionsResponse,
  type ChartProgressionCalculationRequestInput,
  type ChartSolarReturnCalculationRequestInput,
  type ChartSynastryCalculationRequestInput,
  type ChartTransitCalculationRequestInput,
  type ReproducibleChartResult
} from "@elevenhouse/contracts";

export type ChartEngineErrorCode =
  | "CHART_ENGINE_BASE_URL_INVALID"
  | "CHART_ENGINE_TIMEOUT_INVALID"
  | "CHART_ENGINE_REQUEST_CANCELLED"
  | "CHART_ENGINE_REQUEST_TIMEOUT"
  | "CHART_ENGINE_NETWORK_ERROR"
  | "CHART_ENGINE_REQUEST_INVALID"
  | "CHART_ENGINE_RESPONSE_INVALID_JSON"
  | "CHART_ENGINE_RESPONSE_INVALID_SCHEMA"
  | "CHART_ENGINE_REDIRECT_REFUSED"
  | "CHART_ENGINE_READY_INVALID_JSON"
  | "CHART_ENGINE_READY_INVALID_SCHEMA"
  | "CHART_ENGINE_READY_EXPECTED_PROFILE_INVALID"
  | "CHART_ENGINE_READY_PROFILE_MISMATCH"
  | `CHART_ENGINE_HTTP_${number}`
  | `CHART_ENGINE_READY_HTTP_${number}`;

export abstract class ChartEngineError extends Error {
  readonly code: ChartEngineErrorCode;
  declare readonly status?: number;

  constructor(code: ChartEngineErrorCode, status?: number) {
    super(code);
    this.name = new.target.name;
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

export class ChartEngineTransientError extends ChartEngineError {}
export class ChartEngineConfigurationError extends ChartEngineError {}
export class ChartEngineCancelledError extends ChartEngineError {}
export class ChartEnginePermanentError extends ChartEngineError {}

export type ChartEngineRequestOptions = {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
};

export type ChartEngineReadinessOptions = ChartEngineRequestOptions & {
  readonly expectedProfile?: ChartExecutionProfile;
};

export type ChartEngineHttpClientInput = {
  readonly baseUrl: string;
};

type ChartResultFor<Method extends ReproducibleChartResult["method"]> = Extract<
  ReproducibleChartResult,
  { method: Method }
>;

type SafeSchema<T> = {
  safeParse(
    value: unknown
  ): { readonly success: true; readonly data: T } | { readonly success: false };
};

type RequestKind = "calculation" | "readiness";
type AbortKind = "caller" | "timeout";

type RequestInput<TResponse> = {
  readonly path: string;
  readonly method: "GET" | "POST";
  readonly payload?: unknown;
  readonly requestSchema?: SafeSchema<unknown>;
  readonly responseSchema: SafeSchema<TResponse>;
  readonly kind: RequestKind;
  readonly options?: ChartEngineRequestOptions;
};

const ELIGIBLE_CALCULATION_5XX = new Set([500, 502, 503, 504]);
const MAX_DIAGNOSTIC_BYTES = 2_048;

export class ChartEngineHttpClient {
  private readonly baseUrl: string;

  constructor(input: ChartEngineHttpClientInput) {
    this.baseUrl = parseBaseUrl(input.baseUrl);
  }

  calculateNatal(
    payload: ChartNatalCalculationRequestInput,
    options?: ChartEngineRequestOptions
  ): Promise<ChartResultFor<"natal">> {
    return this.request({
      path: "/v1/natal",
      method: "POST",
      payload,
      requestSchema: chartNatalCalculationRequestSchema,
      responseSchema: chartNatalResultV2Schema,
      kind: "calculation",
      options
    });
  }

  calculateAstrocartography(
    payload: ChartAstrocartographyCalculationRequestInput,
    options?: ChartEngineRequestOptions
  ): Promise<ChartResultFor<"astrocartography">> {
    return this.request({
      path: "/v1/astrocartography",
      method: "POST",
      payload,
      requestSchema: chartAstrocartographyCalculationRequestSchema,
      responseSchema: chartAstrocartographyResultV2Schema,
      kind: "calculation",
      options
    });
  }

  calculateTransit(
    payload: ChartTransitCalculationRequestInput,
    options?: ChartEngineRequestOptions
  ): Promise<ChartResultFor<"transit">> {
    return this.request({
      path: "/v1/transits",
      method: "POST",
      payload,
      requestSchema: chartTransitCalculationRequestSchema,
      responseSchema: chartTransitResultV2Schema,
      kind: "calculation",
      options
    });
  }

  calculateSynastry(
    payload: ChartSynastryCalculationRequestInput,
    options?: ChartEngineRequestOptions
  ): Promise<ChartResultFor<"synastry">> {
    return this.request({
      path: "/v1/synastry",
      method: "POST",
      payload,
      requestSchema: chartSynastryCalculationRequestSchema,
      responseSchema: chartSynastryResultV2Schema,
      kind: "calculation",
      options
    });
  }

  calculateComposite(
    payload: ChartCompositeCalculationRequestInput,
    options?: ChartEngineRequestOptions
  ): Promise<ChartResultFor<"composite">> {
    return this.request({
      path: "/v1/composite",
      method: "POST",
      payload,
      requestSchema: chartCompositeCalculationRequestSchema,
      responseSchema: chartCompositeResultV2Schema,
      kind: "calculation",
      options
    });
  }

  calculateSolarReturn(
    payload: ChartSolarReturnCalculationRequestInput,
    options?: ChartEngineRequestOptions
  ): Promise<ChartResultFor<"solar_return">> {
    return this.request({
      path: "/v1/solar-return",
      method: "POST",
      payload,
      requestSchema: chartSolarReturnCalculationRequestSchema,
      responseSchema: chartSolarReturnResultV2Schema,
      kind: "calculation",
      options
    });
  }

  calculateProgression(
    payload: ChartProgressionCalculationRequestInput,
    options?: ChartEngineRequestOptions
  ): Promise<ChartResultFor<"progression">> {
    return this.request({
      path: "/v1/progressions",
      method: "POST",
      payload,
      requestSchema: chartProgressionCalculationRequestSchema,
      responseSchema: chartProgressionResultV2Schema,
      kind: "calculation",
      options
    });
  }

  calculateHorary(
    payload: ChartHoraryCalculationRequestInput,
    options?: ChartEngineRequestOptions
  ): Promise<ChartResultFor<"horary">> {
    return this.request({
      path: "/v1/horary",
      method: "POST",
      payload,
      requestSchema: chartHoraryCalculationRequestSchema,
      responseSchema: chartHoraryResultV2Schema,
      kind: "calculation",
      options
    });
  }

  calculateAstroCalendarRange(
    payload: AstroCalendarGenerationRequestInput,
    options?: ChartEngineRequestOptions
  ): Promise<AstroCalendarRangeResponse> {
    return this.request({
      path: "/v1/astro-calendar/range",
      method: "POST",
      payload,
      requestSchema: astroCalendarGenerationRequestSchema,
      responseSchema: astroCalendarRangeResponseSchema,
      kind: "calculation",
      options
    });
  }

  calculatePlanetaryPositions(
    payload: ChartPlanetaryPositionsRequestInput,
    options?: ChartEngineRequestOptions
  ): Promise<ChartPlanetaryPositionsResponse> {
    return this.request({
      path: "/v1/positions",
      method: "POST",
      payload,
      requestSchema: chartPlanetaryPositionsRequestSchema,
      responseSchema: chartPlanetaryPositionsResponseSchema,
      kind: "calculation",
      options
    });
  }

  async checkReady(
    options: ChartEngineReadinessOptions = {}
  ): Promise<ChartEngineReadinessResponse> {
    const readiness = await this.request({
      path: "/ready",
      method: "GET",
      responseSchema: chartEngineReadinessResponseSchema,
      kind: "readiness",
      options
    });
    if (options.expectedProfile !== undefined) {
      const expectedProfile = chartExecutionProfileSchema.safeParse(options.expectedProfile);
      if (!expectedProfile.success) {
        throw new ChartEngineConfigurationError("CHART_ENGINE_READY_EXPECTED_PROFILE_INVALID");
      }
      if (!providerMatchesProfile(readiness.provider, expectedProfile.data)) {
        throw new ChartEngineConfigurationError("CHART_ENGINE_READY_PROFILE_MISMATCH");
      }
    }
    return readiness;
  }

  private async request<TResponse>(input: RequestInput<TResponse>): Promise<TResponse> {
    const timeoutMs = parseTimeout(input.options?.timeoutMs);
    const callerSignal = input.options?.signal;
    if (callerSignal?.aborted) {
      throw new ChartEngineCancelledError("CHART_ENGINE_REQUEST_CANCELLED");
    }

    const controller = new AbortController();
    let abortKind: AbortKind | null = null;
    const abort = (kind: AbortKind): void => {
      if (abortKind !== null) return;
      abortKind = kind;
      controller.abort();
    };
    const onCallerAbort = (): void => abort("caller");
    callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
    const timer =
      timeoutMs === undefined ? undefined : setTimeout(() => abort("timeout"), timeoutMs);

    try {
      let parsedPayload: unknown;
      if (input.requestSchema !== undefined) {
        const parsed = input.requestSchema.safeParse(input.payload);
        if (!parsed.success) {
          throw new ChartEnginePermanentError("CHART_ENGINE_REQUEST_INVALID");
        }
        parsedPayload = parsed.data;
      }

      const response = await fetch(`${this.baseUrl}${input.path}`, {
        method: input.method,
        headers: parsedPayload === undefined ? undefined : { "content-type": "application/json" },
        body: parsedPayload === undefined ? undefined : JSON.stringify(parsedPayload),
        redirect: "manual",
        signal: controller.signal
      });
      throwIfAborted(abortKind);

      if (response.status >= 300 && response.status <= 399) {
        await consumeBoundedDiagnostic(response);
        throwIfAborted(abortKind);
        throw new ChartEngineConfigurationError("CHART_ENGINE_REDIRECT_REFUSED", response.status);
      }

      if (!response.ok) {
        await consumeBoundedDiagnostic(response);
        throwIfAborted(abortKind);
        throw classifyHttpError(input.kind, response.status);
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throwIfAborted(abortKind);
        throw invalidJsonError(input.kind);
      }
      throwIfAborted(abortKind);

      const parsedResponse = input.responseSchema.safeParse(data);
      if (!parsedResponse.success) {
        throw invalidSchemaError(input.kind);
      }
      throwIfAborted(abortKind);
      return parsedResponse.data;
    } catch (error) {
      throwIfAborted(abortKind);
      if (error instanceof ChartEngineError) throw error;
      throw new ChartEngineTransientError("CHART_ENGINE_NETWORK_ERROR");
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    }
  }
}

function parseBaseUrl(value: string): string {
  try {
    const url = new URL(value);
    const normalizedOrigin = new URL(url.origin);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username !== "" ||
      url.password !== "" ||
      url.href !== normalizedOrigin.href
    ) {
      throw new Error("invalid");
    }
    return normalizedOrigin.origin;
  } catch {
    throw new ChartEngineConfigurationError("CHART_ENGINE_BASE_URL_INVALID");
  }
}

function parseTimeout(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647) {
    throw new ChartEngineConfigurationError("CHART_ENGINE_TIMEOUT_INVALID");
  }
  return value;
}

function throwIfAborted(kind: AbortKind | null): void {
  if (kind === "caller") {
    throw new ChartEngineCancelledError("CHART_ENGINE_REQUEST_CANCELLED");
  }
  if (kind === "timeout") {
    throw new ChartEngineTransientError("CHART_ENGINE_REQUEST_TIMEOUT");
  }
}

async function consumeBoundedDiagnostic(response: Response): Promise<void> {
  if (response.body === null) return;
  const reader = response.body.getReader({ mode: "byob" });
  let consumedBytes = 0;
  try {
    while (consumedBytes < MAX_DIAGNOSTIC_BYTES) {
      const chunk = await reader.read(new Uint8Array(MAX_DIAGNOSTIC_BYTES - consumedBytes));
      if (chunk.done) return;
      consumedBytes += chunk.value.byteLength;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Cancelling an already-failed diagnostic stream is a secondary failure.
    }
    reader.releaseLock();
  }
}

function classifyHttpError(kind: RequestKind, status: number): ChartEngineError {
  if (kind === "readiness") {
    return new ChartEngineConfigurationError(`CHART_ENGINE_READY_HTTP_${status}`, status);
  }
  if (status >= 400 && status <= 499) {
    return new ChartEnginePermanentError(`CHART_ENGINE_HTTP_${status}`, status);
  }
  if (ELIGIBLE_CALCULATION_5XX.has(status)) {
    return new ChartEngineTransientError(`CHART_ENGINE_HTTP_${status}`, status);
  }
  return new ChartEngineConfigurationError(`CHART_ENGINE_HTTP_${status}`, status);
}

function invalidJsonError(kind: RequestKind): ChartEngineError {
  return kind === "readiness"
    ? new ChartEngineConfigurationError("CHART_ENGINE_READY_INVALID_JSON")
    : new ChartEnginePermanentError("CHART_ENGINE_RESPONSE_INVALID_JSON");
}

function invalidSchemaError(kind: RequestKind): ChartEngineError {
  return kind === "readiness"
    ? new ChartEngineConfigurationError("CHART_ENGINE_READY_INVALID_SCHEMA")
    : new ChartEnginePermanentError("CHART_ENGINE_RESPONSE_INVALID_SCHEMA");
}

function providerMatchesProfile(
  provider: ChartEngineReadinessResponse["provider"],
  profile: ChartExecutionProfile
): boolean {
  return (
    provider.name === profile.provider &&
    provider.version === profile.kerykeionVersion &&
    provider.pyswissephVersion === profile.pyswissephVersion &&
    provider.ephemeris === profile.expectedEphemeris &&
    equalStringSets(provider.ephemerisFlags, profile.expectedEphemerisFlags) &&
    provider.ephemerisDataRevision === profile.expectedEphemerisDataRevision
  );
}

function equalStringSets(left: readonly string[], right: readonly string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size && [...leftSet].every((value) => rightSet.has(value));
}
