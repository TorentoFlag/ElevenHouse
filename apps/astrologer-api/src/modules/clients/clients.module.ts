import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { createDrizzleClientStore } from "@elevenhouse/db/clients";
import { ClockModule } from "../clock/clock.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { ClientsController } from "./clients.controller";
import { ClientsService } from "./clients.service";
import { CLIENT_STORE } from "./clients.tokens";

@Module({
  imports: [ConfigModule, ClockModule, DatabaseModule, IdentityModule, SecurityModule],
  controllers: [ClientsController],
  providers: [
    ClientsService,
    {
      provide: CLIENT_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleClientStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    }
  ],
  exports: [CLIENT_STORE]
})
export class ClientsModule {}
