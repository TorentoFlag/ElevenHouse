import { QueryClient } from "@tanstack/react-query";
import { HttpClient } from "./common/http/HttpClient";

export type ApplicationOptions = {
  readonly csrfReadCookie?: (name: string) => string | null;
  readonly http?: HttpClient;
  readonly publicApiBasePath?: string;
  readonly fetcher?: typeof fetch;
  readonly queryClient?: QueryClient;
};

export class Application {
  readonly http: HttpClient;
  readonly queryClient: QueryClient;

  constructor(options: ApplicationOptions = {}) {
    this.http =
      options.http ??
      new HttpClient({
        basePath: options.publicApiBasePath ?? "/api",
        csrf: {
          cookieName: "elevenhouse_public_csrf",
          headerName: "x-csrf-token",
          ...(options.csrfReadCookie ? { readCookie: options.csrfReadCookie } : {})
        },
        ...(options.fetcher ? { fetcher: options.fetcher } : {})
      });
    this.queryClient = options.queryClient ?? new QueryClient();
  }
}

export const application = new Application();
