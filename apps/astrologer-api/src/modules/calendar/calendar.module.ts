import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import {
  createDrizzleCalendarReadStore,
  createDrizzleManualBlockCommandStore
} from "@elevenhouse/db/scheduling";
import { AvailabilityModule } from "../availability/availability.module";
import { ClockModule } from "../clock/clock.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { CalendarController } from "./calendar.controller";
import { CalendarService } from "./calendar.service";
import { CALENDAR_READ_STORE, MANUAL_BLOCK_COMMAND_STORE } from "./calendar.tokens";

@Module({
  imports: [
    AvailabilityModule,
    ClockModule,
    ConfigModule,
    DatabaseModule,
    IdentityModule,
    SecurityModule
  ],
  controllers: [CalendarController],
  providers: [
    CalendarService,
    {
      provide: CALENDAR_READ_STORE,
      useFactory: (runtime: PostgresRuntimeService) => createDrizzleCalendarReadStore(runtime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: MANUAL_BLOCK_COMMAND_STORE,
      useFactory: (runtime: PostgresRuntimeService) =>
        createDrizzleManualBlockCommandStore(runtime.database),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class CalendarModule {}
