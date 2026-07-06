import { Module } from "@nestjs/common";
import {
  createDrizzleClientJoinProfileReader,
  createDrizzleClientStore
} from "@elevenhouse/db/clients";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { ClientJoinController } from "./client-join.controller";
import { ClientJoinService } from "./client-join.service";
import {
  CLIENT_JOIN_OPTIONS,
  CLIENT_JOIN_PROFILE_READER,
  CLIENT_JOIN_STORE
} from "./client-join.tokens";

@Module({
  imports: [DatabaseModule],
  controllers: [ClientJoinController],
  providers: [
    ClientJoinService,
    {
      provide: CLIENT_JOIN_PROFILE_READER,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleClientJoinProfileReader(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: CLIENT_JOIN_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleClientStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: CLIENT_JOIN_OPTIONS,
      useValue: {
        ttlSeconds: 3600
      }
    }
  ]
})
export class ClientJoinModule {}
