import { applyDecorators, SetMetadata, UseGuards } from "@nestjs/common";
import { CsrfGuard } from "../csrf/csrf.guard";
import { AdminIdempotencyGuard } from "../idempotency/admin-idempotency.guard";
import { csrfRequiredMetadataKey } from "./route-security-metadata";

export const adminIdempotencyRequiredMetadataKey = "admin-idempotency-required";

export function RequireCsrf() {
  return applyDecorators(SetMetadata(csrfRequiredMetadataKey, true), UseGuards(CsrfGuard));
}

export function RequireIdempotency() {
  return applyDecorators(
    SetMetadata(adminIdempotencyRequiredMetadataKey, true),
    UseGuards(AdminIdempotencyGuard)
  );
}
