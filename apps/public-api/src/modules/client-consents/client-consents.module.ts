import { Module } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createDrizzleClientConsentStore } from "@elevenhouse/db/clients";
import { SystemClock } from "../../common/system-clock.js";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { ClientConsentsController } from "./client-consents.controller";
import { ClientConsentsService } from "./client-consents.service";
import { CLIENT_CONSENT_ID_GENERATOR, CLIENT_CONSENT_STORE } from "./client-consents.tokens";

@Module({
  imports: [DatabaseModule, IdentityModule, SecurityModule],
  controllers: [ClientConsentsController],
  providers: [
    ClientConsentsService,
    SystemClock,
    {
      provide: CLIENT_CONSENT_ID_GENERATOR,
      useValue: randomUUID
    },
    {
      provide: CLIENT_CONSENT_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleClientConsentStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class ClientConsentsModule {}
