import { QueryClient } from "@tanstack/react-query";
import type { AuthenticatedCustomerAccountResponse } from "@elevenhouse/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { application } from "../../../Application";
import { authQueryKeys } from "./authQueryKeys";
import { currentAccountQueryOptions } from "./useCurrentAccountQuery";
import { logoutMutationOptions } from "./useLogoutMutation";

const accountResponse = {
  account: {
    id: "8e14390f-3db1-4d1c-9344-55679c778427",
    status: "active",
    roles: ["client"]
  }
} satisfies AuthenticatedCustomerAccountResponse;

describe("auth queries", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses stable query keys for the current account", () => {
    expect(authQueryKeys.currentAccount()).toEqual(["auth", "current-account"]);
  });

  it("loads the current account through the auth API", async () => {
    vi.spyOn(application.http, "get").mockResolvedValue(accountResponse);
    const options = currentAccountQueryOptions();

    expect(options.queryKey).toEqual(authQueryKeys.currentAccount());
    await expect(options.queryFn()).resolves.toEqual(accountResponse);
  });

  it("clears the cached current account after logout succeeds", async () => {
    const queryClient = new QueryClient();
    const options = logoutMutationOptions(queryClient);
    queryClient.setQueryData(authQueryKeys.currentAccount(), accountResponse);

    await options.onSuccess?.();

    expect(queryClient.getQueryData(authQueryKeys.currentAccount())).toBeNull();
  });
});
