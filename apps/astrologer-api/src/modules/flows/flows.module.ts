import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import {
  createDrizzleFlowDefinitionControlStore,
  createDrizzleFlowDefinitionQueryStore,
  createDrizzleFlowRuntimeStore,
  createDrizzleFlowStore
} from "@elevenhouse/db";
import { ClockModule } from "../clock/clock.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { FlowApprovalsController } from "./flow-approvals.controller";
import { FlowRunsController } from "./flow-runs.controller";
import { FlowTemplatesController, FlowsController } from "./flows.controller";
import { FlowsService } from "./flows.service";
import {
  FLOW_DEFINITION_CONTROL_STORE,
  FLOW_DEFINITION_QUERY_STORE,
  FLOW_RUNTIME_STORE,
  FLOW_STORE
} from "./flows.tokens";

@Module({
  imports: [ConfigModule, ClockModule, DatabaseModule, IdentityModule, SecurityModule],
  controllers: [
    FlowTemplatesController,
    FlowsController,
    FlowRunsController,
    FlowApprovalsController
  ],
  providers: [
    FlowsService,
    {
      provide: FLOW_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleFlowStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: FLOW_DEFINITION_CONTROL_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleFlowDefinitionControlStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: FLOW_DEFINITION_QUERY_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleFlowDefinitionQueryStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: FLOW_RUNTIME_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleFlowRuntimeStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    }
  ],
  exports: [FlowsService]
})
export class FlowsModule {}
