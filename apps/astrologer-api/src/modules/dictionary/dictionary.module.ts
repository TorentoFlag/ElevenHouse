import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { createDrizzleDictionaryStore } from "@elevenhouse/db/dictionary";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { DictionaryController } from "./dictionary.controller";
import { DictionaryService } from "./dictionary.service";
import { DICTIONARY_STORE } from "./dictionary.tokens";

@Module({
  imports: [ConfigModule, DatabaseModule, IdentityModule, SecurityModule],
  controllers: [DictionaryController],
  providers: [
    DictionaryService,
    {
      provide: DICTIONARY_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleDictionaryStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class DictionaryModule {}
