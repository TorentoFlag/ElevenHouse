import { HttpError } from "./HttpError";

export type HttpClientOptions = {
  readonly basePath: string;
  readonly credentials?: RequestCredentials;
  readonly fetcher?: typeof fetch;
};

export type HttpRequestOptions = {
  readonly method?: "GET" | "POST";
  readonly body?: unknown;
};

export class HttpClient {
  private readonly basePath: string;
  private readonly credentials: RequestCredentials;
  private readonly fetcher: typeof fetch;

  constructor(options: HttpClientOptions) {
    this.basePath = normalizeBasePath(options.basePath);
    this.credentials = options.credentials ?? "include";
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  }

  get<TResponse>(path: string): Promise<TResponse> {
    return this.request<TResponse>(path, {
      method: "GET"
    });
  }

  post<TResponse>(path: string, body?: unknown): Promise<TResponse> {
    return this.request<TResponse>(path, {
      method: "POST",
      ...(body === undefined ? {} : { body })
    });
  }

  async request<TResponse>(
    path: string,
    options: HttpRequestOptions = {}
  ): Promise<TResponse> {
    const response = await this.fetcher(this.createUrl(path), this.createRequestInit(options));
    const responseBody = await readResponseBody(response);

    if (!response.ok) {
      throw new HttpError(response.status, responseBody);
    }

    return responseBody as TResponse;
  }

  private createUrl(path: string): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    return `${this.basePath}${normalizedPath}`;
  }

  private createRequestInit(options: HttpRequestOptions): RequestInit {
    const method = options.method ?? "GET";

    return {
      method,
      credentials: this.credentials,
      ...(options.body === undefined
        ? {}
        : {
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify(options.body)
          })
    };
  }
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const contentType = response.headers.get("content-type");

  if (contentType?.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();

  return text ? text : undefined;
}

function normalizeBasePath(basePath: string): string {
  const normalized = basePath.trim().replace(/\/+$/, "");

  return normalized ? normalized : "/";
}
