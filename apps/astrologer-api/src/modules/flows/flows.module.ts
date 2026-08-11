import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import {
  createDrizzleFlowActivationReviewStore,
  createDrizzleFlowRuntimeAvailabilityReader,
  createDrizzleFlowDefinitionControlStore,
  createDrizzleFlowDefinitionReadStore,
  createDrizzleFlowEnrollmentControlStore,
  createDrizzleFlowEnrollmentQueryStore,
  createDrizzleFlowManualClientEnrollmentStore,
  createDrizzleFlowRunCancellationStore,
  createDrizzleFlowApprovalStore,
  createDrizzleFlowRuntimeStore,
  createDrizzleFlowWorkItemStore
} from "@elevenhouse/db";
import { ClockModule } from "../clock/clock.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { PlatformEntitlementsModule } from "../platform-entitlements/platform-entitlements.module";
import { SecurityModule } from "../security/security.module";
import { FlowApprovalsController } from "./flow-approvals.controller";
import { FlowApprovalsService } from "./flow-approvals.service";
import { FlowActivationReviewController } from "./flow-activation-review.controller";
import { FlowActivationReviewService } from "./flow-activation-review.service";
import { FlowEnrollmentController } from "./flow-enrollment.controller";
import { FlowEnrollmentService } from "./flow-enrollment.service";
import { FlowManualClientRunsController } from "./flow-manual-client-runs.controller";
import { FlowManualClientRunsService } from "./flow-manual-client-runs.service";
import { FlowRunsController } from "./flow-runs.controller";
import { FlowWorkItemsController } from "./flow-work-items.controller";
import { FlowWorkItemsService } from "./flow-work-items.service";
import { FlowTemplatesController, FlowsController } from "./flows.controller";
import { FlowsService } from "./flows.service";
import {
  FLOW_ACTIVATION_REVIEW_STORE,
  FLOW_APPROVAL_STORE,
  FLOW_DEFINITION_CONTROL_STORE,
  FLOW_DEFINITION_READ_STORE,
  FLOW_ENROLLMENT_CONTROL_STORE,
  FLOW_ENROLLMENT_QUERY_STORE,
  FLOW_MANUAL_CLIENT_ENROLLMENT_STORE,
  FLOW_RUN_CANCELLATION_STORE,
  FLOW_RUNTIME_STORE,
  FLOW_RUNTIME_AVAILABILITY_READER,
  FLOW_WORK_ITEM_STORE
} from "./flows.tokens";

@Module({
  imports: [
    ConfigModule,
    ClockModule,
    DatabaseModule,
    IdentityModule,
    PlatformEntitlementsModule,
    SecurityModule
  ],
  controllers: [
    FlowTemplatesController,
    FlowsController,
    FlowActivationReviewController,
    FlowEnrollmentController,
    FlowManualClientRunsController,
    FlowRunsController,
    FlowApprovalsController,
    FlowWorkItemsController
  ],
  providers: [
    FlowsService,
    FlowApprovalsService,
    FlowActivationReviewService,
    FlowEnrollmentService,
    FlowManualClientRunsService,
    FlowWorkItemsService,
    {
      provide: FLOW_DEFINITION_CONTROL_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleFlowDefinitionControlStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: FLOW_DEFINITION_READ_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleFlowDefinitionReadStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: FLOW_RUNTIME_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleFlowRuntimeStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: FLOW_RUNTIME_AVAILABILITY_READER,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleFlowRuntimeAvailabilityReader(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: FLOW_MANUAL_CLIENT_ENROLLMENT_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleFlowManualClientEnrollmentStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: FLOW_ENROLLMENT_CONTROL_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleFlowEnrollmentControlStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: FLOW_ENROLLMENT_QUERY_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleFlowEnrollmentQueryStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: FLOW_ACTIVATION_REVIEW_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleFlowActivationReviewStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: FLOW_RUN_CANCELLATION_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleFlowRunCancellationStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: FLOW_WORK_ITEM_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleFlowWorkItemStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: FLOW_APPROVAL_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleFlowApprovalStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    }
  ],
  exports: [FlowsService]
})
export class FlowsModule {}
