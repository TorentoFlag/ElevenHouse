import { Module, ServiceUnavailableException } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { createDrizzleSessionCommandStore, createDrizzleSessionReadStore } from "@elevenhouse/db";
import type { MediaRoomProviderPort } from "@elevenhouse/domain";
import { LiveKitMediaRoomProvider } from "@elevenhouse/session-infrastructure";
import type { AstrologerApiRuntimeConfig } from "../../config/runtime-config";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { SessionsController, SessionsWebhookController } from "./sessions.controller";
import { SessionsService } from "./sessions.service";
import { SESSION_COMMAND_STORE, SESSION_MEDIA_ROOM_PROVIDER, SESSION_READ_STORE } from "./sessions.tokens";

@Module({
  imports: [ConfigModule, DatabaseModule, IdentityModule, SecurityModule],
  controllers: [SessionsController, SessionsWebhookController],
  providers: [
    SessionsService,
    { provide: SESSION_READ_STORE, useFactory: (runtime: PostgresRuntimeService) => createDrizzleSessionReadStore(runtime.database), inject: [PostgresRuntimeService] },
    { provide: SESSION_COMMAND_STORE, useFactory: (runtime: PostgresRuntimeService) => createDrizzleSessionCommandStore(runtime.database), inject: [PostgresRuntimeService] },
    {
      provide: SESSION_MEDIA_ROOM_PROVIDER,
      useFactory: (config: ConfigService): MediaRoomProviderPort => {
        const options = config.get<AstrologerApiRuntimeConfig["mediaRoom"]>("astrologerApi.mediaRoom");
        return options ? new LiveKitMediaRoomProvider(options) : unavailableProvider();
      },
      inject: [ConfigService]
    }
  ]
})
export class SessionsModule {}

function unavailableProvider(): MediaRoomProviderPort {
  const unavailable = async (): Promise<never> => {
    throw new ServiceUnavailableException({ code: "SESSION_PROVIDER_NOT_CONFIGURED" });
  };
  return { createJoinCredential: unavailable, removeParticipant: unavailable, endRoom: unavailable, parseWebhook: unavailable, readiness: async () => ({ ready: false, code: "not_configured" }) };
}
