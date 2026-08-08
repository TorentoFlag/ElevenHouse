import { Module } from "@nestjs/common";
import {
  createDrizzleFlowRuntimeControlCommandStore,
  createDrizzleFlowRuntimeControlReader
} from "@elevenhouse/db";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { FlowRuntimeControlController } from "./flow-runtime-control.controller";
import { FlowRuntimeControlService } from "./flow-runtime-control.service";
import { FLOW_RUNTIME_CONTROL_COMMAND_STORE, FLOW_RUNTIME_CONTROL_READER } from "./flow-runtime-control.tokens";

@Module({
  imports: [DatabaseModule, IdentityModule, SecurityModule],
  controllers: [FlowRuntimeControlController],
  providers: [
    FlowRuntimeControlService,
    {
      provide: FLOW_RUNTIME_CONTROL_READER,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleFlowRuntimeControlReader(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: FLOW_RUNTIME_CONTROL_COMMAND_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleFlowRuntimeControlCommandStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class FlowRuntimeControlModule {}
