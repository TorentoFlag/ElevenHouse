import { Module } from "@nestjs/common";
import { createDrizzleAstroCalendarGenerationStore } from "@elevenhouse/db/astro-calendar";
import { ClientsModule } from "../clients/clients.module";
import { ClockModule } from "../clock/clock.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { AstroCalendarController } from "./astro-calendar.controller";
import { AstroCalendarService } from "./astro-calendar.service";
import { ASTRO_CALENDAR_GENERATION_STORE } from "./astro-calendar.tokens";

@Module({
  imports: [ClientsModule, ClockModule, DatabaseModule, IdentityModule, SecurityModule],
  controllers: [AstroCalendarController],
  providers: [
    AstroCalendarService,
    {
      provide: ASTRO_CALENDAR_GENERATION_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleAstroCalendarGenerationStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class AstroCalendarModule {}
