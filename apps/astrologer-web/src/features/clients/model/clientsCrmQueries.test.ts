import { keepPreviousData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  clientsCrmActivityQueryOptions,
  clientsCrmDetailQueryOptions,
  clientsCrmListQueryOptions,
  clientsCrmQueryKeys
} from "./clientsCrmQueries";

describe("clientsCrmQueries", () => {
  it("builds stable list keys from normalized search, filters, cursor, and sort", () => {
    const firstKey = clientsCrmQueryKeys.list({
      query: "  Ada   Lovelace ",
      cursor: "cursor-1",
      lifecycle: "active",
      source: "booking"
    });
    const secondKey = clientsCrmQueryKeys.list({
      source: "booking",
      lifecycle: "active",
      cursor: "cursor-1",
      query: "Ada Lovelace"
    });

    expect(firstKey).toEqual(secondKey);
    expect(firstKey).toEqual([
      "clients",
      "crm",
      "list",
      {
        query: "Ada Lovelace",
        cursor: "cursor-1",
        limit: 20,
        lifecycle: "active",
        source: "booking",
        sort: "last_linked_at_desc"
      }
    ]);
  });

  it("keeps the prior CRM list visible while a cursor or filter changes", () => {
    expect(clientsCrmListQueryOptions({ cursor: "cursor-2" }).placeholderData).toBe(
      keepPreviousData
    );
  });

  it("keeps detail and first activity queries relationship-scoped without activity pagination", () => {
    const clientUserId = "11111111-1111-4111-8111-111111111111";
    const detailOptions = clientsCrmDetailQueryOptions(clientUserId);
    const activityOptions = clientsCrmActivityQueryOptions(clientUserId);

    expect(detailOptions.queryKey).toEqual(clientsCrmQueryKeys.detail(clientUserId));
    expect(activityOptions.queryKey).toEqual(clientsCrmQueryKeys.activity(clientUserId));
    expect(activityOptions).not.toHaveProperty("initialPageParam");
    expect(activityOptions).not.toHaveProperty("getNextPageParam");
  });
});
