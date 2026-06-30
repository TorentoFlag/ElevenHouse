import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ClockModule } from "../clock/clock.module";
import { CsrfGuard } from "./csrf/csrf.guard";
import { AstrologerCsrfTokenService } from "./csrf/astrologer-csrf-token.service";

@Module({
  imports: [ClockModule, ConfigModule],
  providers: [CsrfGuard, AstrologerCsrfTokenService],
  exports: [CsrfGuard, AstrologerCsrfTokenService]
})
export class SecurityModule {}
