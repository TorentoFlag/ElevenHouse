import { applyDecorators, SetMetadata, UseGuards } from "@nestjs/common";
import { CsrfGuard } from "../csrf/csrf.guard";
import { IdempotencyGuard } from "../idempotency/idempotency.guard";
import {
  csrfRequiredMetadataKey,
  idempotencyRequiredMetadataKey,
  type IdempotencyRequirement
} from "./route-security-metadata";

export function RequireCsrf() {
  return applyDecorators(SetMetadata(csrfRequiredMetadataKey, true), UseGuards(CsrfGuard));
}

export function RequireIdempotency(requirement: IdempotencyRequirement) {
  return applyDecorators(
    SetMetadata(idempotencyRequiredMetadataKey, requirement),
    UseGuards(IdempotencyGuard)
  );
}
