import { applyDecorators, SetMetadata, UseGuards } from "@nestjs/common";
import { CsrfGuard } from "../csrf/csrf.guard";
import { csrfRequiredMetadataKey } from "./route-security-metadata";

export function RequireCsrf() {
  return applyDecorators(SetMetadata(csrfRequiredMetadataKey, true), UseGuards(CsrfGuard));
}
