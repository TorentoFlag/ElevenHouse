import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SystemClock } from "../../common/system-clock.js";
import { AdminCsrfTokenService } from "./csrf/admin-csrf-token.service";
import { CsrfGuard } from "./csrf/csrf.guard";

@Module({
  imports: [ConfigModule],
  providers: [CsrfGuard, AdminCsrfTokenService, SystemClock],
  exports: [CsrfGuard, AdminCsrfTokenService, SystemClock]
})
export class SecurityModule {}
