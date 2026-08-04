import { once } from "node:events";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type {
  AstroCalendarGenerationRequestInput,
  ChartExecutionProfile
} from "@elevenhouse/contracts";
import {
  ChartEngineCancelledError,
  ChartEngineConfigurationError,
  ChartEngineHttpClient,
  ChartEnginePermanentError,
  ChartEngineTransientError
} from "./chart-engine-client";

const activeServers = new Set<Server>();

afterEach(async () => {
  await Promise.all(
    [...activeServers].map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        })
    )
  );
  activeServers.clear();
});

describe("ChartEngineHttpClient", () => {
  it("uses native HTTP for all eleven endpoints and returns strict response contracts", async () => {
    const requests: RecordedRequest[] = [];
    const baseUrl = await listen(async (request, response) => {
      const body = await readRequestBody(request);
      requests.push({ method: request.method ?? "", path: request.url ?? "", body });
      respondJson(response, endpointResponses[request.url ?? ""] ?? { unexpected: true });
    });
    const client = new ChartEngineHttpClient({ baseUrl });
    const controller = new AbortController();
    const options = { signal: controller.signal, timeoutMs: 5_000 };

    const results = await Promise.all([
      client.calculateNatal(calculationRequests.natal, options),
      client.calculateAstrocartography(calculationRequests.astrocartography, options),
      client.calculateTransit(calculationRequests.transit, options),
      client.calculateSynastry(calculationRequests.synastry, options),
      client.calculateComposite(calculationRequests.composite, options),
      client.calculateSolarReturn(calculationRequests.solar_return, options),
      client.calculateProgression(calculationRequests.progression, options),
      client.calculateHorary(calculationRequests.horary, options),
      client.calculateAstroCalendarRange(astroCalendarRequest, options),
      client.calculatePlanetaryPositions(positionsRequest, options),
      client.checkReady({ ...options, expectedProfile: executionProfile })
    ]);

    expect(results.slice(0, 8)).toEqual(
      Array.from({ length: 8 }, () => expect.objectContaining({ schemaVersion: "chart-result.v2" }))
    );
    expect(results[8]).toMatchObject({ schemaVersion: "astro-calendar-range.v1" });
    expect(results[9]).toMatchObject({ schemaVersion: "chart-positions-result.v1" });
    expect(results[10]).toEqual(readinessResult);
    const expectedRequests = [
      { method: "POST", path: "/v1/natal" },
      { method: "POST", path: "/v1/astrocartography" },
      { method: "POST", path: "/v1/transits" },
      { method: "POST", path: "/v1/synastry" },
      { method: "POST", path: "/v1/composite" },
      { method: "POST", path: "/v1/solar-return" },
      { method: "POST", path: "/v1/progressions" },
      { method: "POST", path: "/v1/horary" },
      { method: "POST", path: "/v1/astro-calendar/range" },
      { method: "POST", path: "/v1/positions" },
      { method: "GET", path: "/ready" }
    ].map((request) => ({
      ...request,
      body: request.path === "/ready" ? null : expectedRequestBodies[request.path]
    }));
    expect(requests).toHaveLength(expectedRequests.length);
    for (const expected of expectedRequests) expect(requests).toContainEqual(expected);
    for (const request of requests.filter(({ path }) =>
      ["/v1/synastry", "/v1/composite"].includes(path)
    )) {
      const serialized = JSON.stringify(request.body);
      expect(request.body).not.toHaveProperty("relationshipSnapshot");
      expect(serialized).not.toContain("ClientId");
      expect(serialized).not.toContain("00000000-0000-4000-8000-000000000001");
      expect(serialized).not.toContain("00000000-0000-4000-8000-000000000002");
    }
  });

  it.each([
    ["not a url"],
    ["ftp://chart-engine:8012"],
    ["http://user:secret@chart-engine:8012"],
    ["http://chart-engine:8012/private/path"],
    ["http://chart-engine:8012?secret=value"],
    ["http://chart-engine:8012?"],
    ["http://chart-engine:8012#"]
  ])("rejects invalid base URL %s as configuration", (baseUrl) => {
    const error = captureSync(() => new ChartEngineHttpClient({ baseUrl }));
    expectSafeError(error, ChartEngineConfigurationError, "CHART_ENGINE_BASE_URL_INVALID");
  });

  it.each(["http://chart-engine:80", "https://chart-engine:443/", "http://[::1]:8012"])(
    "accepts normalized origin URL %s",
    (baseUrl) => {
      expect(() => new ChartEngineHttpClient({ baseUrl })).not.toThrow();
    }
  );

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])(
    "rejects invalid timeout %s before initiating HTTP",
    async (timeoutMs) => {
      let requestCount = 0;
      const baseUrl = await listen((_request, response) => {
        requestCount += 1;
        respondJson(response, calculationResults.natal);
      });
      const client = new ChartEngineHttpClient({ baseUrl });

      const error = await capture(client.calculateNatal(calculationRequests.natal, { timeoutMs }));
      expectSafeError(error, ChartEngineConfigurationError, "CHART_ENGINE_TIMEOUT_INVALID");
      expect(requestCount).toBe(0);
    }
  );

  it("does not initiate HTTP for a pre-aborted caller on any endpoint", async () => {
    let requestCount = 0;
    const baseUrl = await listen((_request, response) => {
      requestCount += 1;
      respondJson(response, calculationResults.natal);
    });
    const controller = new AbortController();
    controller.abort();
    const client = new ChartEngineHttpClient({ baseUrl });

    const options = { signal: controller.signal };
    const calls = [
      () => client.calculateNatal(calculationRequests.natal, options),
      () => client.calculateAstrocartography(calculationRequests.astrocartography, options),
      () => client.calculateTransit(calculationRequests.transit, options),
      () => client.calculateSynastry(calculationRequests.synastry, options),
      () => client.calculateComposite(calculationRequests.composite, options),
      () => client.calculateSolarReturn(calculationRequests.solar_return, options),
      () => client.calculateProgression(calculationRequests.progression, options),
      () => client.calculateHorary(calculationRequests.horary, options),
      () => client.calculateAstroCalendarRange(astroCalendarRequest, options),
      () => client.calculatePlanetaryPositions(positionsRequest, options),
      () => client.checkReady(options)
    ];
    for (const call of calls) {
      expectSafeError(
        await capture(call()),
        ChartEngineCancelledError,
        "CHART_ENGINE_REQUEST_CANCELLED"
      );
    }
    expect(requestCount).toBe(0);
  });

  it("distinguishes caller cancellation from timeout", async () => {
    let requestReceived!: () => void;
    const received = new Promise<void>((resolve) => {
      requestReceived = resolve;
    });
    const baseUrl = await listen((_request, response) => {
      requestReceived();
      response.on("close", () => response.end());
    });
    const controller = new AbortController();
    const client = new ChartEngineHttpClient({ baseUrl });
    const pending = client.calculateNatal(calculationRequests.natal, {
      signal: controller.signal,
      timeoutMs: 5_000
    });
    await received;

    controller.abort();

    const error = await capture(pending);
    expectSafeError(error, ChartEngineCancelledError, "CHART_ENGINE_REQUEST_CANCELLED");
  });

  it("bounds every request with an internal timeout", async () => {
    const baseUrl = await listen((_request, response) => {
      response.on("close", () => response.end());
    });
    const client = new ChartEngineHttpClient({ baseUrl });

    const error = await capture(
      client.calculateNatal(calculationRequests.natal, { timeoutMs: 40 })
    );
    expectSafeError(error, ChartEngineTransientError, "CHART_ENGINE_REQUEST_TIMEOUT");
  });

  it("does not invent a default timeout when the caller supplies no deadline", async () => {
    const baseUrl = await listen((_request, response) => {
      setTimeout(() => respondJson(response, calculationResults.natal), 80);
    });
    const client = new ChartEngineHttpClient({ baseUrl });

    await expect(client.calculateNatal(calculationRequests.natal)).resolves.toMatchObject({
      schemaVersion: "chart-result.v2"
    });
  });

  it("preserves the first abort cause while consuming a response", async () => {
    let firstChunk!: () => void;
    const chunkStarted = new Promise<void>((resolve) => {
      firstChunk = resolve;
    });
    const baseUrl = await listen((_request, response) => {
      response.writeHead(422, { "content-type": "text/plain" });
      response.write("diagnostic-start");
      firstChunk();
      const interval = setInterval(() => response.write("x".repeat(128)), 5);
      response.on("close", () => clearInterval(interval));
    });
    const caller = new AbortController();
    const client = new ChartEngineHttpClient({ baseUrl });
    const pending = client.calculateNatal(calculationRequests.natal, {
      signal: caller.signal,
      timeoutMs: 500
    });
    await chunkStarted;

    caller.abort();

    expectSafeError(
      await capture(pending),
      ChartEngineCancelledError,
      "CHART_ENGINE_REQUEST_CANCELLED"
    );
  });

  it("classifies a dropped provider socket and a refused connection as transient", async () => {
    const droppingUrl = await listen((request) => {
      request.socket.destroy();
    });
    const droppingClient = new ChartEngineHttpClient({ baseUrl: droppingUrl });
    expectSafeError(
      await capture(droppingClient.calculateNatal(calculationRequests.natal)),
      ChartEngineTransientError,
      "CHART_ENGINE_NETWORK_ERROR"
    );

    const closedServer = createServer();
    closedServer.listen(0, "127.0.0.1");
    await once(closedServer, "listening");
    const address = closedServer.address() as AddressInfo;
    await new Promise<void>((resolve, reject) =>
      closedServer.close((error) => (error ? reject(error) : resolve()))
    );
    const refusedClient = new ChartEngineHttpClient({
      baseUrl: `http://127.0.0.1:${address.port}`
    });
    expectSafeError(
      await capture(refusedClient.calculateNatal(calculationRequests.natal)),
      ChartEngineTransientError,
      "CHART_ENGINE_NETWORK_ERROR"
    );
  });

  it("classifies calculation 4xx as permanent and eligible 5xx as transient", async () => {
    const client4xx = new ChartEngineHttpClient({
      baseUrl: await listen((_request, response) => respondText(response, 422, "invalid"))
    });
    expectSafeError(
      await capture(client4xx.calculateNatal(calculationRequests.natal)),
      ChartEnginePermanentError,
      "CHART_ENGINE_HTTP_422",
      422
    );

    const client5xx = new ChartEngineHttpClient({
      baseUrl: await listen((_request, response) => respondText(response, 503, "unavailable"))
    });
    expectSafeError(
      await capture(client5xx.calculateNatal(calculationRequests.natal)),
      ChartEngineTransientError,
      "CHART_ENGINE_HTTP_503",
      503
    );
  });

  it("classifies non-retryable calculation 5xx as configuration", async () => {
    const client = new ChartEngineHttpClient({
      baseUrl: await listen((_request, response) => respondText(response, 501, "not implemented"))
    });

    expectSafeError(
      await capture(client.calculateNatal(calculationRequests.natal)),
      ChartEngineConfigurationError,
      "CHART_ENGINE_HTTP_501",
      501
    );
  });

  it("classifies invalid calculation JSON and schema as permanent", async () => {
    const invalidJsonClient = new ChartEngineHttpClient({
      baseUrl: await listen((_request, response) => respondText(response, 200, "not-json"))
    });
    expectSafeError(
      await capture(invalidJsonClient.calculateNatal(calculationRequests.natal)),
      ChartEnginePermanentError,
      "CHART_ENGINE_RESPONSE_INVALID_JSON"
    );

    const invalidSchemaClient = new ChartEngineHttpClient({
      baseUrl: await listen((_request, response) =>
        respondJson(response, { schemaVersion: "wrong" })
      )
    });
    expectSafeError(
      await capture(invalidSchemaClient.calculateNatal(calculationRequests.natal)),
      ChartEnginePermanentError,
      "CHART_ENGINE_RESPONSE_INVALID_SCHEMA"
    );
  });

  it("classifies a temporarily unavailable readiness endpoint as transient", async () => {
    const client = new ChartEngineHttpClient({
      baseUrl: await listen((_request, response) => respondText(response, 503, "not ready"))
    });

    expectSafeError(
      await capture(client.checkReady()),
      ChartEngineTransientError,
      "CHART_ENGINE_READY_HTTP_503",
      503
    );
  });

  it("classifies readiness JSON, schema, profile and capability failures as configuration", async () => {
    const responses: Array<readonly [(response: ServerResponse) => void, string, number?]> = [
      [(response) => respondText(response, 200, "not-json"), "CHART_ENGINE_READY_INVALID_JSON"],
      [
        (response) => respondJson(response, { service: "chart-engine", status: "ready" }),
        "CHART_ENGINE_READY_INVALID_SCHEMA"
      ],
      [
        (response) =>
          respondJson(response, {
            ...readinessResult,
            capabilities: readinessResult.capabilities.slice(0, -1)
          }),
        "CHART_ENGINE_READY_INVALID_SCHEMA"
      ]
    ];

    for (const [send, code, status] of responses) {
      const client = new ChartEngineHttpClient({
        baseUrl: await listen((_request, response) => send(response))
      });
      const error = await capture(client.checkReady());
      expectSafeError(error, ChartEngineConfigurationError, code, status);
    }

    const profileMismatchClient = new ChartEngineHttpClient({
      baseUrl: await listen((_request, response) => respondJson(response, readinessResult))
    });
    const profileMismatch = await capture(
      profileMismatchClient.checkReady({
        expectedProfile: {
          ...executionProfile,
          expectedEphemeris: "swiss-ephemeris",
          expectedEphemerisFlags: ["FLG_SPEED", "FLG_SWIEPH"],
          expectedEphemerisDataRevision: `sha256:${"c".repeat(64)}`
        }
      })
    );
    expectSafeError(
      profileMismatch,
      ChartEngineConfigurationError,
      "CHART_ENGINE_READY_PROFILE_MISMATCH"
    );
  });

  it("refuses redirects without following them", async () => {
    let redirectedRequestCount = 0;
    const baseUrl = await listen((request, response) => {
      if (request.url === "/redirected") {
        redirectedRequestCount += 1;
        respondJson(response, calculationResults.natal);
        return;
      }
      response.writeHead(302, { location: "/redirected" });
      response.end();
    });
    const client = new ChartEngineHttpClient({ baseUrl });

    expectSafeError(
      await capture(client.calculateNatal(calculationRequests.natal)),
      ChartEngineConfigurationError,
      "CHART_ENGINE_REDIRECT_REFUSED",
      302
    );
    expect(redirectedRequestCount).toBe(0);
  });

  it("bounds non-2xx diagnosis and never leaks an echoed secret", async () => {
    const secret = "PRIVATE-BIRTH-DATA-AND-TOKEN";
    let bytesWritten = 0;
    let responseClosed!: (bytes: number) => void;
    const closed = new Promise<number>((resolve) => {
      responseClosed = resolve;
    });
    const baseUrl = await listen((_request, response) => {
      response.writeHead(422, { "content-type": "text/plain" });
      const interval = setInterval(() => {
        const chunk = `${secret}:${"x".repeat(480)}`;
        bytesWritten += Buffer.byteLength(chunk);
        response.write(chunk);
        if (bytesWritten >= 64 * 1024) response.end();
      }, 1);
      response.on("close", () => {
        clearInterval(interval);
        responseClosed(bytesWritten);
      });
    });
    const client = new ChartEngineHttpClient({ baseUrl });

    const error = await client.calculateNatal(calculationRequests.natal).catch((caught) => caught);

    expectSafeError(error, ChartEnginePermanentError, "CHART_ENGINE_HTTP_422", 422);
    expect(String(error)).not.toContain(secret);
    expect(JSON.stringify(error)).not.toContain(secret);
    await expect(closed).resolves.toBeLessThan(64 * 1024);
  });

  it("never pulls a native-fetch diagnostic chunk larger than the byte quota", async () => {
    const responseBody = Buffer.alloc(65_536, "x");
    let responseClosed!: () => void;
    const closed = new Promise<void>((resolve) => {
      responseClosed = resolve;
    });
    const baseUrl = await listen((_request, response) => {
      response.on("close", responseClosed);
      response.writeHead(422, {
        "content-length": String(responseBody.byteLength),
        "content-type": "text/plain"
      });
      response.end(responseBody);
    });
    const observedPulls: number[] = [];
    const restoreObservation = observeReadableStreamPulls((byteLength) => {
      observedPulls.push(byteLength);
    });
    const client = new ChartEngineHttpClient({ baseUrl });

    let error: unknown;
    try {
      error = await capture(client.calculateNatal(calculationRequests.natal));
    } finally {
      restoreObservation();
    }

    expectSafeError(error, ChartEnginePermanentError, "CHART_ENGINE_HTTP_422", 422);
    expect(observedPulls.length).toBeGreaterThan(0);
    expect(observedPulls.reduce((total, byteLength) => total + byteLength, 0)).toBeLessThanOrEqual(
      2_048
    );
    expect(Math.max(...observedPulls)).toBeLessThanOrEqual(2_048);
    await closed;
  });

  it("classifies local request validation as permanent without leaking the request", async () => {
    const secret = "PRIVATE-QUESTION-DO-NOT-ECHO";
    const client = new ChartEngineHttpClient({ baseUrl: "http://chart-engine:8012" });
    const invalid = {
      ...calculationRequests.horary,
      questionSnapshot: {
        ...calculationRequests.horary.questionSnapshot,
        question: secret,
        latitude: 70
      }
    };

    const error = await client.calculateHorary(invalid).catch((caught) => caught);

    expectSafeError(error, ChartEnginePermanentError, "CHART_ENGINE_REQUEST_INVALID");
    expect(String(error)).not.toContain(secret);
    expect(JSON.stringify(error)).not.toContain(secret);
  });
});

type RecordedRequest = {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
};

function observeReadableStreamPulls(onPull: (byteLength: number) => void): () => void {
  const prototype = ReadableStream.prototype;
  const originalDescriptor = Object.getOwnPropertyDescriptor(prototype, "getReader");
  if (originalDescriptor?.value === undefined) throw new Error("ReadableStream.getReader missing");
  const originalGetReader = originalDescriptor.value as typeof prototype.getReader;

  Object.defineProperty(prototype, "getReader", {
    ...originalDescriptor,
    value(this: ReadableStream<Uint8Array>, options?: { mode?: "byob" }) {
      const reader =
        options?.mode === "byob"
          ? originalGetReader.call(this, { mode: "byob" })
          : originalGetReader.call(this);
      const originalRead = reader.read.bind(reader) as unknown as (
        ...args: readonly unknown[]
      ) => Promise<{ readonly done: boolean; readonly value?: { readonly byteLength: number } }>;
      Object.defineProperty(reader, "read", {
        configurable: true,
        value: async (...args: readonly unknown[]) => {
          const result = await originalRead(...args);
          if (!result.done && result.value !== undefined) onPull(result.value.byteLength);
          return result;
        }
      });
      return reader;
    }
  });

  return () => Object.defineProperty(prototype, "getReader", originalDescriptor);
}

async function listen(
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
): Promise<string> {
  const server = createServer((request, response) => {
    void Promise.resolve(handler(request, response)).catch(() => response.destroy());
  });
  activeServers.add(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function readRequestBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function capture(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error("Expected promise to reject");
  } catch (error) {
    return error;
  }
}

function captureSync(operation: () => unknown): unknown {
  try {
    operation();
    throw new Error("Expected operation to throw");
  } catch (error) {
    return error;
  }
}

function expectSafeError(
  error: unknown,
  errorType: new (...args: never[]) => Error,
  code: string,
  status?: number
): void {
  expect(error).toBeInstanceOf(errorType);
  expect(error).toMatchObject({ code });
  if (status === undefined) {
    expect(error).not.toHaveProperty("status");
  } else {
    expect(error).toHaveProperty("status", status);
  }
  expect(error).not.toHaveProperty("cause");
  expect(String(error)).toBe(`${errorType.name}: ${code}`);
}

function respondJson(response: ServerResponse, value: unknown, status = 200): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function respondText(response: ServerResponse, status: number, value: string): void {
  response.writeHead(status, { "content-type": "text/plain" });
  response.end(value);
}

const executionProfile: ChartExecutionProfile = {
  provider: "kerykeion",
  kerykeionVersion: "5.12.9",
  pyswissephVersion: "2.10.3.2",
  expectedEphemeris: "moshier",
  expectedEphemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
  expectedEphemerisDataRevision: null
};

const provider = {
  name: "kerykeion" as const,
  version: "5.12.9",
  ephemeris: "moshier" as const,
  pyswissephVersion: "2.10.3.2",
  ephemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
  ephemerisDataRevision: null
};

const settings = {
  zodiac: "tropical" as const,
  houseSystem: "placidus" as const,
  nodeType: "true" as const,
  aspectPreset: "major" as const,
  orbMultiplier: 1
};

const inputSnapshot = {
  birthDate: "1990-07-15",
  birthTime: "10:30",
  timezone: "Europe/Rome",
  latitude: 41.9028,
  longitude: 12.4964,
  birthTimePrecision: "exact" as const
};

const partnerInputSnapshot = {
  ...inputSnapshot,
  birthDate: "1992-08-11",
  birthTime: "22:15",
  timezone: "Europe/Moscow",
  latitude: 55.7558,
  longitude: 37.6173
};

const calculationRequests = {
  natal: {
    schemaVersion: "chart-request.v2" as const,
    method: "natal" as const,
    methodVersion: "chart.natal.kerykeion-5.12.v2" as const,
    executionProfile,
    settings,
    inputSnapshot
  },
  astrocartography: {
    schemaVersion: "chart-request.v2" as const,
    method: "astrocartography" as const,
    methodVersion: "chart.astrocartography.swisseph.v2" as const,
    executionProfile,
    settings,
    inputSnapshot
  },
  transit: {
    schemaVersion: "chart-request.v2" as const,
    method: "transit" as const,
    methodVersion: "chart.transit.kerykeion-5.12.v2" as const,
    executionProfile,
    settings,
    inputSnapshot,
    transitSnapshot: {
      date: "2026-07-22",
      time: "14:30",
      timezone: "Europe/Rome",
      latitude: 41.9028,
      longitude: 12.4964
    }
  },
  synastry: {
    schemaVersion: "chart-request.v2" as const,
    method: "synastry" as const,
    methodVersion: "chart.synastry.kerykeion-5.12.v2" as const,
    executionProfile,
    settings,
    inputSnapshot,
    partnerInputSnapshot
  },
  composite: {
    schemaVersion: "chart-request.v2" as const,
    method: "composite" as const,
    methodVersion: "chart.composite.kerykeion-5.12.v2" as const,
    executionProfile,
    settings,
    inputSnapshot,
    partnerInputSnapshot
  },
  solar_return: {
    schemaVersion: "chart-request.v2" as const,
    method: "solar_return" as const,
    methodVersion: "chart.solar-return.kerykeion-5.12.v2" as const,
    executionProfile,
    settings,
    inputSnapshot,
    solarReturnSnapshot: {
      year: 2026,
      returnType: "solar" as const,
      location: {
        timezone: "Europe/Rome",
        latitude: 41.9028,
        longitude: 12.4964
      }
    }
  },
  progression: {
    schemaVersion: "chart-request.v2" as const,
    method: "progression" as const,
    methodVersion: "chart.progression.secondary-tropical-year.v2" as const,
    executionProfile,
    settings,
    inputSnapshot,
    progressionSnapshot: {
      targetDate: "2026-07-23",
      progressionType: "secondary" as const
    }
  },
  horary: {
    schemaVersion: "chart-request.v2" as const,
    method: "horary" as const,
    methodVersion: "chart.horary.kerykeion-5.12.v2" as const,
    executionProfile,
    settings,
    questionSnapshot: {
      question: "Should I sign the contract?",
      category: "career" as const,
      date: "2026-07-23",
      time: "14:30",
      timezone: "Europe/Moscow",
      latitude: 55.7558,
      longitude: 37.6173
    }
  }
};

const renderResult = {
  points: [
    "sun",
    "moon",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto",
    "ascendant",
    "midheaven",
    "north_node",
    "south_node"
  ].map((id, index) => ({
    id,
    label: id,
    longitude: index * 20,
    sign: "aries",
    signDegree: index % 29,
    house: index < 12 ? index + 1 : null,
    retrograde: false
  })),
  houses: Array.from({ length: 12 }, (_, index) => ({
    number: index + 1,
    longitude: index * 30,
    sign: "aries",
    signDegree: 0
  })),
  aspects: [],
  distributions: {
    elements: { fire: 3, earth: 2, air: 3, water: 2 },
    modalities: { cardinal: 4, fixed: 3, mutable: 3 },
    polarity: { masculine: 6, feminine: 4 }
  },
  warnings: []
};

const resultBase = {
  schemaVersion: "chart-result.v2" as const,
  provider,
  reproducibilityFingerprint: `sha256:${"a".repeat(64)}`,
  settings
};

const calculationResults = {
  natal: {
    ...resultBase,
    method: "natal" as const,
    methodVersion: "chart.natal.kerykeion-5.12.v2" as const,
    inputSnapshot,
    result: renderResult
  },
  astrocartography: {
    ...resultBase,
    method: "astrocartography" as const,
    methodVersion: "chart.astrocartography.swisseph.v2" as const,
    inputSnapshot,
    result: { lines: completeAstrocartographyLines(), warnings: [] }
  },
  transit: {
    ...resultBase,
    method: "transit" as const,
    methodVersion: "chart.transit.kerykeion-5.12.v2" as const,
    inputSnapshot,
    transitSnapshot: calculationRequests.transit.transitSnapshot,
    result: { natal: renderResult, transit: renderResult, aspectsToNatal: [], warnings: [] }
  },
  synastry: {
    ...resultBase,
    method: "synastry" as const,
    methodVersion: "chart.synastry.kerykeion-5.12.v2" as const,
    inputSnapshot,
    partnerInputSnapshot,
    result: {
      primary: renderResult,
      partner: renderResult,
      aspectsBetween: [],
      houseOverlays: [],
      warnings: []
    }
  },
  composite: {
    ...resultBase,
    method: "composite" as const,
    methodVersion: "chart.composite.kerykeion-5.12.v2" as const,
    inputSnapshot,
    partnerInputSnapshot,
    result: renderResult
  },
  solar_return: {
    ...resultBase,
    method: "solar_return" as const,
    methodVersion: "chart.solar-return.kerykeion-5.12.v2" as const,
    inputSnapshot,
    solarReturnSnapshot: {
      ...calculationRequests.solar_return.solarReturnSnapshot,
      resolvedAt: "2026-07-15T01:20:01.000Z"
    },
    result: { natal: renderResult, solarReturn: renderResult, aspectsToNatal: [], warnings: [] }
  },
  progression: {
    ...resultBase,
    method: "progression" as const,
    methodVersion: "chart.progression.secondary-tropical-year.v2" as const,
    inputSnapshot,
    progressionSnapshot: {
      ...calculationRequests.progression.progressionSnapshot,
      calculationBasis: { symbolicDate: "1990-08-20", ageDays: 36, dayForYearRatio: 1 as const }
    },
    calculationBasis: {
      symbolicInstant: "1990-08-20T09:02:38Z",
      elapsedLifeDays: 13157,
      elapsedYears: 36.02267306523378,
      yearLengthDays: 365.24219 as const,
      dayForYearRatio: 1 as const
    },
    result: { natal: renderResult, progressed: renderResult, aspectsToNatal: [], warnings: [] }
  },
  horary: {
    ...resultBase,
    method: "horary" as const,
    methodVersion: "chart.horary.kerykeion-5.12.v2" as const,
    questionSnapshot: calculationRequests.horary.questionSnapshot,
    result: renderResult
  }
};

const astroCalendarRequest: AstroCalendarGenerationRequestInput = {
  start: "2026-07-01",
  end: "2026-07-31",
  timeZone: "Europe/Moscow",
  scope: "client",
  clientIds: ["22222222-2222-4222-8222-222222222222"],
  eventTypes: ["client.birthday"],
  clients: [
    {
      clientId: "22222222-2222-4222-8222-222222222222",
      displayName: "Maria Ivanova",
      initials: "MI",
      birthDate: "1990-07-15",
      birthTime: "14:30",
      birthTimePrecision: "exact",
      birthTimezone: "Europe/Moscow",
      birthLatitude: 55.7558,
      birthLongitude: 37.6173
    }
  ],
  settings
};

const astroCalendarResult = {
  schemaVersion: "astro-calendar-range.v1",
  timeZone: "Europe/Moscow",
  range: { start: "2026-07-01", end: "2026-07-31" },
  generation: {
    status: "ready",
    generationId: "77777777-7777-4777-8777-777777777777",
    fingerprint: `sha256:${"b".repeat(64)}`,
    generatedAt: "2026-07-25T12:00:00.000Z",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "moshier" }
  },
  events: [],
  readiness: {
    clientsTotal: 0,
    clientsReady: 0,
    clientsWithMissingBirthData: 0,
    clientsWithUnknownBirthTime: 0,
    clientsWithApproximateBirthTime: 0
  },
  summary: {
    eventCount: 0,
    globalEventCount: 0,
    clientEventCount: 0,
    byType: {},
    byTone: {}
  },
  dictionaryCodes: [],
  warnings: []
};

const positionsRequest = {
  schemaVersion: "chart-positions-request.v1" as const,
  method: "planetary_positions" as const,
  settings: { zodiac: "tropical" as const, nodeType: "true" as const },
  inputSnapshot
};

const positionsResult = {
  schemaVersion: "chart-positions-result.v1",
  method: "planetary_positions",
  provider: { name: "kerykeion", version: "5.12.9", ephemeris: "moshier" },
  settings: positionsRequest.settings,
  inputSnapshot,
  positions: [
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
  ].map((id, index) => ({ id, longitude: index * 20, retrograde: false }))
};

const readinessResult = {
  service: "chart-engine",
  status: "ready",
  provider,
  capabilities: [
    "natal",
    "astrocartography",
    "transit",
    "synastry",
    "composite",
    "solar_return",
    "progression",
    "horary",
    "planetary_positions",
    "astro_calendar"
  ]
} as const;

const endpointResponses: Record<string, unknown> = {
  "/v1/natal": calculationResults.natal,
  "/v1/astrocartography": calculationResults.astrocartography,
  "/v1/transits": calculationResults.transit,
  "/v1/synastry": calculationResults.synastry,
  "/v1/composite": calculationResults.composite,
  "/v1/solar-return": calculationResults.solar_return,
  "/v1/progressions": calculationResults.progression,
  "/v1/horary": calculationResults.horary,
  "/v1/astro-calendar/range": astroCalendarResult,
  "/v1/positions": positionsResult,
  "/ready": readinessResult
};

const expectedRequestBodies: Record<string, unknown> = {
  "/v1/natal": calculationRequests.natal,
  "/v1/astrocartography": calculationRequests.astrocartography,
  "/v1/transits": calculationRequests.transit,
  "/v1/synastry": calculationRequests.synastry,
  "/v1/composite": calculationRequests.composite,
  "/v1/solar-return": calculationRequests.solar_return,
  "/v1/progressions": calculationRequests.progression,
  "/v1/horary": calculationRequests.horary,
  "/v1/astro-calendar/range": astroCalendarRequest,
  "/v1/positions": positionsRequest
};

function completeAstrocartographyLines() {
  const points = [
    "sun",
    "moon",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto"
  ];
  const angles = ["mc", "ic", "asc", "dsc"];
  return points.flatMap((point, pointIndex) =>
    angles.map((angle, angleIndex) => ({
      id: `${point}_${angle}`,
      point,
      angle,
      label: `${point} ${angle}`,
      path: [
        { latitude: -66, longitude: -90 + pointIndex * 8 + angleIndex },
        { latitude: 0, longitude: -90 + pointIndex * 8 + angleIndex },
        { latitude: 66, longitude: -90 + pointIndex * 8 + angleIndex }
      ]
    }))
  );
}
