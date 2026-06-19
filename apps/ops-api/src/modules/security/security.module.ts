import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { CsrfGuard } from "./csrf/csrf.guard";
import { OpsCsrfTokenService } from "./csrf/ops-csrf-token.service";

@Module({
  imports: [ConfigModule],
  providers: [CsrfGuard, OpsCsrfTokenService],
  exports: [CsrfGuard, OpsCsrfTokenService]
})
export class SecurityModule {}
