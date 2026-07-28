import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import {
  createDrizzleMessagingReadStore,
  createDrizzleMessagingStore
} from "@elevenhouse/db/messaging";
import { ClockModule } from "../clock/clock.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { MediaModule } from "../media/media.module";
import { SecurityModule } from "../security/security.module";
import { MessagingController } from "./messaging.controller";
import { MessagingEventsController } from "./messaging-events.controller";
import { MessagingWebhooksController } from "./messaging-webhooks.controller";
import { MessagingService } from "./messaging.service";
import {
  MESSAGING_READ_STORE,
  MESSAGING_STORE,
  TELEGRAM_BUSINESS_CONNECTION_LOOKUP
} from "./messaging.tokens";
import {
  TelegramBusinessBotApiConnectionLookup,
  type TelegramBusinessConnectionLookupOptions
} from "./telegram-business-connection-lookup";

@Module({
  imports: [ConfigModule, ClockModule, DatabaseModule, IdentityModule, MediaModule, SecurityModule],
  controllers: [MessagingController, MessagingEventsController, MessagingWebhooksController],
  providers: [
    MessagingService,
    {
      provide: MESSAGING_STORE,
      useFactory: (runtime: PostgresRuntimeService) => createDrizzleMessagingStore(runtime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: MESSAGING_READ_STORE,
      useFactory: (runtime: PostgresRuntimeService) => createDrizzleMessagingReadStore(runtime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: TELEGRAM_BUSINESS_CONNECTION_LOOKUP,
      useFactory: (configService: ConfigService) => {
        const options = configService.get<TelegramBusinessConnectionLookupOptions | null>(
          "astrologerApi.telegramBusinessBotApi"
        );
        return options ? new TelegramBusinessBotApiConnectionLookup(options) : null;
      },
      inject: [ConfigService]
    }
  ]
})
export class MessagingModule {}
