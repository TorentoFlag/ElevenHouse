import { Navigate, Outlet } from "react-router";
import { useCurrentAccountQuery } from "../model/useCurrentAccountQuery";
import { resolveCurrentAccountRouteAccess } from "./currentAccountRouteAccess";

export function RequireCurrentAccount() {
  const currentAccountQuery = useCurrentAccountQuery();
  const decision = resolveCurrentAccountRouteAccess({
    isPending: currentAccountQuery.isPending,
    isError: currentAccountQuery.isError,
    isSuccess: currentAccountQuery.isSuccess,
    data: currentAccountQuery.data,
    error: currentAccountQuery.error
  });

  if (decision.state === "pending") {
    return null;
  }

  if (decision.state === "redirect") {
    return <Navigate to={decision.to} replace />;
  }

  if (decision.state === "error") {
    throw decision.error;
  }

  return <Outlet />;
}
