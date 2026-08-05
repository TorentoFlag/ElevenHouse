import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AiModule } from "../ai/ai.module";
import { DictionaryStoreModule } from "../dictionary/dictionary-store.module";
import { IdentityModule } from "../identity/identity.module";
import { PlatformEntitlementsModule } from "../platform-entitlements/platform-entitlements.module";
import { SecurityModule } from "../security/security.module";
import { DictionaryAiController } from "./dictionary-ai.controller";
import { DictionaryAiService } from "./dictionary-ai.service";

@Module({
  imports: [
    AiModule,
    ConfigModule,
    DictionaryStoreModule,
    IdentityModule,
    PlatformEntitlementsModule,
    SecurityModule
  ],
  controllers: [DictionaryAiController],
  providers: [DictionaryAiService]
})
export class DictionaryAiModule {}
