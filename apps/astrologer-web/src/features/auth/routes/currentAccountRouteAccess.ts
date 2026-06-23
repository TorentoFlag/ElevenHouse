import type { AuthenticatedAstrologerAccountResponse } from "@elevenhouse/contracts";
import { HttpError } from "../../../common/http/HttpError";

export type CurrentAccountRouteAccessInput = {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly isSuccess: boolean;
  readonly data: AuthenticatedAstrologerAccountResponse | null | undefined;
  readonly error: Error | null;
};

export type CurrentAccountRouteAccessDecision =
  | { readonly state: "pending" }
  | { readonly state: "redirect"; readonly to: "/auth" }
  | { readonly state: "allowed" }
  | { readonly state: "error"; readonly error: Error };

export function resolveCurrentAccountRouteAccess(
  input: CurrentAccountRouteAccessInput
): CurrentAccountRouteAccessDecision {
  if (input.isPending) {
    return { state: "pending" };
  }

  if (input.isSuccess && input.data) {
    return { state: "allowed" };
  }

  if (input.isError && input.error instanceof HttpError && input.error.status === 401) {
    return { state: "redirect", to: "/auth" };
  }

  if (input.error) {
    return { state: "error", error: input.error };
  }

  return { state: "redirect", to: "/auth" };
}
