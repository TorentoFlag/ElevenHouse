import { Navigate } from "react-router";

export function NotFoundPage() {
  return <Navigate to="/auth" replace />;
}
