import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ClockModule } from "../clock/clock.module";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { DictionaryStoreModule } from "./dictionary-store.module";
import { DictionaryController } from "./dictionary.controller";
import { DictionaryService } from "./dictionary.service";

@Module({
  imports: [ConfigModule, ClockModule, DictionaryStoreModule, IdentityModule, SecurityModule],
  controllers: [DictionaryController],
  providers: [DictionaryService]
})
export class DictionaryModule {}
