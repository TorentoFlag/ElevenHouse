import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SystemClock } from "../../common/system-clock.js";
import { CsrfGuard } from "./csrf/csrf.guard";
import { PublicCsrfTokenService } from "./csrf/public-csrf-token.service";
import { IdempotencyGuard } from "./idempotency/idempotency.guard";

@Module({
  imports: [ConfigModule],
  providers: [CsrfGuard, IdempotencyGuard, PublicCsrfTokenService, SystemClock],
  exports: [CsrfGuard, IdempotencyGuard, PublicCsrfTokenService, SystemClock]
})
export class SecurityModule {}
