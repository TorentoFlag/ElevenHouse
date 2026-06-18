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
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json"
    }
  });
}
