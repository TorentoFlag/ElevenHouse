import { Module } from "@nestjs/common";
import { createDrizzleDictionaryStore } from "@elevenhouse/db/dictionary";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { SecurityModule } from "../security/security.module";
import { DictionaryController } from "./dictionary.controller";
import { DictionaryService } from "./dictionary.service";
import { DICTIONARY_STORE } from "./dictionary.tokens";

@Module({
  imports: [DatabaseModule, SecurityModule],
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
