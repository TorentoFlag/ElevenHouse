import { HttpError } from "./HttpError";

export type HttpClientOptions = {
  readonly basePath: string;
  readonly csrf?: HttpClientCsrfOptions;
  readonly credentials?: RequestCredentials;
  readonly fetcher?: typeof fetch;
};

export type HttpClientCsrfOptions = {
  readonly cookieName: string;
  readonly headerName: string;
  readonly readCookie?: (name: string) => string | null;
};

export type HttpRequestOptions = {
  readonly method?: "GET" | "POST" | "PUT";
  readonly body?: unknown;
  readonly csrf?: boolean;
};

export class HttpClient {
  private readonly basePath: string;
  private readonly csrf: HttpClientCsrfOptions | null;
  private readonly credentials: RequestCredentials;
  private readonly fetcher: typeof fetch;

  constructor(options: HttpClientOptions) {
    this.basePath = normalizeBasePath(options.basePath);
    this.csrf = options.csrf ?? null;
    this.credentials = options.credentials ?? "include";
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  }

  get<TResponse>(path: string): Promise<TResponse> {
    return this.request<TResponse>(path, {
      method: "GET"
    });
  }

  post<TResponse>(
    path: string,
    body?: unknown,
    options: Omit<HttpRequestOptions, "method" | "body"> = {}
  ): Promise<TResponse> {
    return this.request<TResponse>(path, {
      method: "POST",
      ...options,
      ...(body === undefined ? {} : { body })
    });
  }

  put<TResponse>(
    path: string,
    body?: unknown,
    options: Omit<HttpRequestOptions, "method" | "body"> = {}
  ): Promise<TResponse> {
    return this.request<TResponse>(path, {
      method: "PUT",
      ...options,
      ...(body === undefined ? {} : { body })
    });
  }

  async request<TResponse>(path: string, options: HttpRequestOptions = {}): Promise<TResponse> {
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
    const headers = this.createHeaders(options);

    return {
      method,
      credentials: this.credentials,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ...(options.body === undefined
        ? {}
        : {
            body: JSON.stringify(options.body)
          })
    };
  }

  private createHeaders(options: HttpRequestOptions): Record<string, string> {
    const headers: Record<string, string> = {};

    if (options.body !== undefined) {
      headers["content-type"] = "application/json";
    }

    if (options.csrf && this.csrf) {
      const token = (this.csrf.readCookie ?? readDocumentCookie)(this.csrf.cookieName);

      if (token) {
        headers[this.csrf.headerName] = token;
      }
    }

    return headers;
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

function readDocumentCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  for (const cookie of document.cookie.split(";")) {
    const [rawName, ...rawValueParts] = cookie.split("=");

    if (rawName?.trim() !== name) {
      continue;
    }

    const value = rawValueParts.join("=").trim();
    return value ? decodeURIComponent(value) : null;
  }

  return null;
}
