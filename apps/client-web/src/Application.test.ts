import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { Application, application } from "./Application";
import { HttpClient } from "./common/http/HttpClient";

describe("Application", () => {
  it("exposes the public API HTTP client", () => {
    const application = new Application();

    expect(application.http).toBeInstanceOf(HttpClient);
  });

  it("configures the public API CSRF cookie/header names", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    const application = new Application({
      csrfReadCookie: () => "signed-token",
      fetcher
    });

    await application.http.post("/identity/logout", undefined, { csrf: true });

    expect(fetcher).toHaveBeenCalledWith("/api/identity/logout", {
      method: "POST",
      credentials: "include",
      headers: {
        "x-csrf-token": "signed-token"
      }
    });
  });

  it("exports the runtime application instance", () => {
    expect(application).toBeInstanceOf(Application);
    expect(application.http).toBeInstanceOf(HttpClient);
  });

  it("exposes the server-state query client", () => {
    const application = new Application();

    expect(application.queryClient).toBeInstanceOf(QueryClient);
  });
});
