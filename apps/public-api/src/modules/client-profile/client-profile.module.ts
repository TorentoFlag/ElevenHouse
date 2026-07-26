import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import {
  createDrizzleClientProfileReader,
  createDrizzleClientStore
} from "@elevenhouse/db/clients";
import { SystemClock } from "../../common/system-clock.js";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { ClientProfileController } from "./client-profile.controller";
import { ClientProfileService } from "./client-profile.service";
import { CLIENT_PROFILE_READER, CLIENT_PROFILE_STORE } from "./client-profile.tokens";

@Module({
  imports: [ConfigModule, DatabaseModule, IdentityModule, SecurityModule],
  controllers: [ClientProfileController],
  providers: [
    ClientProfileService,
    SystemClock,
    {
      provide: CLIENT_PROFILE_READER,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleClientProfileReader(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: CLIENT_PROFILE_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleClientStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class ClientProfileModule {}
