import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { createDrizzleFlowStore } from "@elevenhouse/db";
import { ClockModule } from "../clock/clock.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { FlowTemplatesController, FlowsController } from "./flows.controller";
import { FlowsService } from "./flows.service";
import { FLOW_STORE } from "./flows.tokens";

@Module({
  imports: [ConfigModule, ClockModule, DatabaseModule, IdentityModule, SecurityModule],
  controllers: [FlowTemplatesController, FlowsController],
  providers: [
    FlowsService,
    {
      provide: FLOW_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleFlowStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class FlowsModule {}
