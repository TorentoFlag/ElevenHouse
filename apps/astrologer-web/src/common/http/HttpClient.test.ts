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

    await http.post("/identity/astrologer/passwordless/request-code", {
      channel: "email",
      identifier: "astrologer@example.com"
    });

    expect(fetcher).toHaveBeenCalledWith("/api/identity/astrologer/passwordless/request-code", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        channel: "email",
        identifier: "astrologer@example.com"
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
        jsonResponse({ message: "Valid astrologer session is required" }, { status: 401 })
      )
    });

    await expect(http.get("/identity/me")).rejects.toMatchObject({
      status: 401,
      body: {
        message: "Valid astrologer session is required"
      }
    });
    await expect(http.get("/identity/me")).rejects.toBeInstanceOf(HttpError);
  });

  it("adds a CSRF header from the configured cookie when requested", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    const http = new HttpClient({
      basePath: "/api",
      csrf: {
        cookieName: "elevenhouse_astrologer_csrf",
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

  it("sends protected DELETE requests through the configured base path", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    const http = new HttpClient({
      basePath: "/api",
      csrf: {
        cookieName: "elevenhouse_astrologer_csrf",
        headerName: "x-csrf-token",
        readCookie: () => "signed-token"
      },
      fetcher
    });

    await http.delete("/dictionary/entries", { csrf: true });

    expect(fetcher).toHaveBeenCalledWith("/api/dictionary/entries", {
      method: "DELETE",
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
        cookieName: "elevenhouse_astrologer_csrf",
        headerName: "x-csrf-token",
        readCookie: () => "signed-token"
      },
      fetcher
    });

    await http.post("/identity/astrologer/passwordless/request-code", {
      channel: "email",
      identifier: "astrologer@example.com"
    });

    expect(fetcher).toHaveBeenCalledWith("/api/identity/astrologer/passwordless/request-code", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        channel: "email",
        identifier: "astrologer@example.com"
      })
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
