import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { CsrfGuard } from "./csrf/csrf.guard";
import { AstrologerCsrfTokenService } from "./csrf/astrologer-csrf-token.service";

@Module({
  imports: [ConfigModule],
  providers: [CsrfGuard, AstrologerCsrfTokenService],
  exports: [CsrfGuard, AstrologerCsrfTokenService]
})
export class SecurityModule {}
