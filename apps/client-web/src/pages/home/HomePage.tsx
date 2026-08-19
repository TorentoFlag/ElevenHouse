import { Navigate } from "react-router";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import { clientRouteContract } from "../../router.contract";

export function HomePage() {
  useDocumentTitle("Home");

  return <Navigate to={clientRouteContract.authenticatedProfile} replace />;
}
