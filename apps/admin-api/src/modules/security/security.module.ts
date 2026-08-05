import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SystemClock } from "../../common/system-clock.js";
import { AdminCsrfTokenService } from "./csrf/admin-csrf-token.service";
import { CsrfGuard } from "./csrf/csrf.guard";
import { AdminIdempotencyGuard } from "./idempotency/admin-idempotency.guard";

@Module({
  imports: [ConfigModule],
  providers: [CsrfGuard, AdminIdempotencyGuard, AdminCsrfTokenService, SystemClock],
  exports: [CsrfGuard, AdminIdempotencyGuard, AdminCsrfTokenService, SystemClock]
})
export class SecurityModule {}
