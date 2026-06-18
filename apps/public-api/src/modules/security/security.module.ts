import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { CsrfGuard } from "./csrf/csrf.guard";
import { PublicCsrfTokenService } from "./csrf/public-csrf-token.service";
import { IdempotencyGuard } from "./idempotency/idempotency.guard";

@Module({
  imports: [ConfigModule],
  providers: [CsrfGuard, IdempotencyGuard, PublicCsrfTokenService],
  exports: [CsrfGuard, IdempotencyGuard, PublicCsrfTokenService]
})
export class SecurityModule {}
