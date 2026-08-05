import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { createAstrologerApiRuntimeConfig } from "./config/runtime-config";
import { AiModule } from "./modules/ai/ai.module";
import { AstroCalendarModule } from "./modules/astro-calendar/astro-calendar.module";
import { AvailabilityModule } from "./modules/availability/availability.module";
import { AstrologerProfileModule } from "./modules/astrologer-profile/astrologer-profile.module";
import { BookingsModule } from "./modules/bookings/bookings.module";
import { CalculationsModule } from "./modules/calculations/calculations.module";
import { CalendarModule } from "./modules/calendar/calendar.module";
import { ChartsModule } from "./modules/charts/charts.module";
import { ClientsModule } from "./modules/clients/clients.module";
import { DatabaseModule } from "./modules/database/database.module";
import { DictionaryAiModule } from "./modules/dictionary-ai/dictionary-ai.module";
import { DictionaryModule } from "./modules/dictionary/dictionary.module";
import { FinanceModule } from "./modules/finance/finance.module";
import { FlowsModule } from "./modules/flows/flows.module";
import { HealthModule } from "./modules/health/health.module";
import { HumanDesignModule } from "./modules/human-design/human-design.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { MediaModule } from "./modules/media/media.module";
import { MatrixModule } from "./modules/matrix/matrix.module";
import { MessagingModule } from "./modules/messaging/messaging.module";
import { NumerologyModule } from "./modules/numerology/numerology.module";
import { AstrologerTariffsModule } from "./modules/platform-tariffs/platform-tariffs.module";
import { ProductsModule } from "./modules/products/products.module";
import { RedisModule } from "./modules/redis/redis.module";
import { VerificationModule } from "./modules/verification/verification.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        () => ({
          astrologerApi: createAstrologerApiRuntimeConfig()
        })
      ]
    }),
    DatabaseModule,
    RedisModule,
    IdentityModule,
    AiModule,
    DictionaryModule,
    DictionaryAiModule,
    FinanceModule,
    FlowsModule,
    MediaModule,
    AstrologerTariffsModule,
    ProductsModule,
    AvailabilityModule,
    AstroCalendarModule,
    CalendarModule,
    BookingsModule,
    VerificationModule,
    CalculationsModule,
    ChartsModule,
    ClientsModule,
    NumerologyModule,
    MatrixModule,
    HumanDesignModule,
    MessagingModule,
    AstrologerProfileModule,
    HealthModule
  ]
})
export class AppModule {}
