import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ClockModule } from "../clock/clock.module";
import { CsrfGuard } from "./csrf/csrf.guard";
import { AstrologerCsrfTokenService } from "./csrf/astrologer-csrf-token.service";
import { IdempotencyGuard } from "./idempotency/idempotency.guard";

@Module({
  imports: [ClockModule, ConfigModule],
  providers: [CsrfGuard, IdempotencyGuard, AstrologerCsrfTokenService],
  exports: [CsrfGuard, IdempotencyGuard, AstrologerCsrfTokenService]
})
export class SecurityModule {}
