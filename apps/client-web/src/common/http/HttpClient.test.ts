import { describe, expect, it, vi } from "vitest";
import { HttpClient } from "./HttpClient";
import { HttpError } from "./HttpError";

describe("HttpClient", () => {
  it("sends JSON requests through the configured base path with included credentials", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ ok: true }));
    const http = new HttpClient({
      basePath: "/api",
      fetcher
    });

    await http.post("/identity/passwordless/request-code", {
      channel: "email",
      identifier: "client@example.com",
      roles: ["client"]
    });

    expect(fetcher).toHaveBeenCalledWith("/api/identity/passwordless/request-code", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        channel: "email",
        identifier: "client@example.com",
        roles: ["client"]
      })
    });
  });

  it("returns parsed JSON for successful responses", async () => {
    const http = new HttpClient({
      basePath: "/api",
      fetcher: vi.fn(async () => jsonResponse({ account: { id: "account_1" } }))
    });

    await expect(http.get("/identity/me")).resolves.toEqual({
      account: { id: "account_1" }
    });
  });

  it("forwards an AbortSignal so stale autocomplete requests can be cancelled", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async () => jsonResponse({ candidates: [] }));
    const http = new HttpClient({ basePath: "/api", fetcher });

    await http.get("/me/birth-places?query=Rome", { signal: controller.signal });

    expect(fetcher).toHaveBeenCalledWith("/api/me/birth-places?query=Rome", {
      method: "GET",
      credentials: "include",
      signal: controller.signal
    });
  });

  it("returns undefined for empty successful responses", async () => {
    const http = new HttpClient({
      basePath: "/api",
      fetcher: vi.fn(async () => new Response(null, { status: 204 }))
    });

    await expect(http.post("/identity/logout")).resolves.toBeUndefined();
  });

  it("throws HttpError with parsed response body for failed responses", async () => {
    const http = new HttpClient({
      basePath: "/api",
      fetcher: vi.fn(async () =>
        jsonResponse({ message: "Valid public session is required" }, { status: 401 })
      )
    });

    await expect(http.get("/identity/me")).rejects.toMatchObject({
      status: 401,
      body: {
        message: "Valid public session is required"
      }
    });
    await expect(http.get("/identity/me")).rejects.toBeInstanceOf(HttpError);
  });

  it("adds a CSRF header from the configured cookie when requested", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    const http = new HttpClient({
      basePath: "/api",
      csrf: {
        cookieName: "elevenhouse_public_csrf",
        headerName: "x-csrf-token",
        readCookie: () => "signed-token"
      },
      fetcher
    });

    await http.post("/identity/logout", undefined, { csrf: true });

    expect(fetcher).toHaveBeenCalledWith("/api/identity/logout", {
      method: "POST",
      credentials: "include",
      headers: {
        "x-csrf-token": "signed-token"
      }
    });
  });

  it("does not add a CSRF header to unprotected requests", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ ok: true }));
    const http = new HttpClient({
      basePath: "/api",
      csrf: {
        cookieName: "elevenhouse_public_csrf",
        headerName: "x-csrf-token",
        readCookie: () => "signed-token"
      },
      fetcher
    });

    await http.post("/identity/passwordless/request-code", {
      channel: "email",
      identifier: "client@example.com",
      roles: ["client"]
    });

    expect(fetcher).toHaveBeenCalledWith("/api/identity/passwordless/request-code", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        channel: "email",
        identifier: "client@example.com",
        roles: ["client"]
      })
    });
  });

  it("sends CSRF-protected DELETE requests with an explicit JSON body", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ state: "revoked" }));
    const http = new HttpClient({
      basePath: "/api",
      csrf: {
        cookieName: "elevenhouse_public_csrf",
        headerName: "x-csrf-token",
        readCookie: () => "signed-token"
      },
      fetcher
    });

    await http.delete("/me/consents/consent-id", {}, { csrf: true });

    expect(fetcher).toHaveBeenCalledWith("/api/me/consents/consent-id", {
      method: "DELETE",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": "signed-token"
      },
      body: "{}"
    });
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json"
    }
  });
}
