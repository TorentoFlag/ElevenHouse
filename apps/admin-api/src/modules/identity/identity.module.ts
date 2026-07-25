import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { createDrizzleAuthSessionAuthenticationStore } from "@elevenhouse/db/auth-sessions";
import { SystemClock } from "../../common/system-clock.js";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { AdminSessionAuthGuard } from "./auth/identity-auth.guard";
import { AUTH_SESSION_AUTHENTICATION_STORE } from "./auth/identity-auth.tokens";
import { IdentityCurrentSessionService } from "./session/identity-current-session.service";

@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: [
    SystemClock,
    IdentityCurrentSessionService,
    AdminSessionAuthGuard,
    {
      provide: AUTH_SESSION_AUTHENTICATION_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleAuthSessionAuthenticationStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    }
  ],
  exports: [IdentityCurrentSessionService, AdminSessionAuthGuard]
})
export class IdentityModule {}
