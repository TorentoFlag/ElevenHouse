import { HttpError } from "../../../common/http/HttpError";

export function isPlatformCapabilityDenied(error: unknown): boolean {
  return (
    error instanceof HttpError &&
    error.status === 403 &&
    typeof error.body === "object" &&
    error.body !== null &&
    "code" in error.body &&
    (error.body.code === "entitlement_required" ||
      error.body.code === "platform_capability_denied")
  );
}
