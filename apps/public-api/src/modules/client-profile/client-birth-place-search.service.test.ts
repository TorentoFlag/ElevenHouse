import {
  BadRequestException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException
} from "@nestjs/common";
import {
  BirthPlaceSearchRateLimitError,
  BirthPlaceSearchUnavailableError,
  type BirthPlaceSearchProvider
} from "@elevenhouse/birth-place-search";
import { describe, expect, it, vi } from "vitest";
import { ClientBirthPlaceSearchService } from "./client-birth-place-search.service";

describe("ClientBirthPlaceSearchService", () => {
  it("normalizes a strict query and scopes Redis/provider control to the authenticated client", async () => {
    const provider: BirthPlaceSearchProvider = {
      search: vi.fn(async () => ({ candidates: [] }))
    };
    const service = new ClientBirthPlaceSearchService(provider);

    await expect(
      service.search("11111111-1111-4111-8111-111111111111", {
        query: "  Rome   Italy  ",
        limit: "3"
      })
    ).resolves.toEqual({ candidates: [] });
    expect(provider.search).toHaveBeenCalledWith({
      ownerUserId: "11111111-1111-4111-8111-111111111111",
      query: "Rome Italy",
      limit: 3
    });
  });

  it("rejects invalid browser queries before Redis or provider access", async () => {
    const provider: BirthPlaceSearchProvider = {
      search: vi.fn(async () => ({ candidates: [] }))
    };
    const service = new ClientBirthPlaceSearchService(provider);

    await expect(
      service.search("11111111-1111-4111-8111-111111111111", { query: "Ри" })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(provider.search).not.toHaveBeenCalled();
  });

  it("translates shared rate-limit and availability failures into stable HTTP errors", async () => {
    const rateLimited = new ClientBirthPlaceSearchService({
      search: vi.fn(async () => {
        throw new BirthPlaceSearchRateLimitError(17);
      })
    });
    const unavailable = new ClientBirthPlaceSearchService({
      search: vi.fn(async () => {
        throw new BirthPlaceSearchUnavailableError();
      })
    });

    let thrown: unknown;
    try {
      await rateLimited.search("11111111-1111-4111-8111-111111111111", {
        query: "Rome"
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(HttpException);
    expect((thrown as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect((thrown as HttpException).getResponse()).toEqual({
      message: "Birth place search rate limit exceeded",
      retryAfterSeconds: 17
    });

    await expect(
      unavailable.search("11111111-1111-4111-8111-111111111111", { query: "Rome" })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
