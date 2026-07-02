import { Module } from "@nestjs/common";
import { createDrizzleDictionaryStore } from "@elevenhouse/db/dictionary";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { DICTIONARY_STORE } from "./dictionary.tokens";

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: DICTIONARY_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleDictionaryStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    }
  ],
  exports: [DICTIONARY_STORE]
})
export class DictionaryStoreModule {}
