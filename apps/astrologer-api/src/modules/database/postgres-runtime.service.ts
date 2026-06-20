import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import {
  createPostgresRuntime,
  type ElevenHouseDatabase,
  type PostgresRuntime
} from "@elevenhouse/db/runtime";

@Injectable()
export class PostgresRuntimeService implements OnApplicationShutdown {
  private readonly runtime: PostgresRuntime = createPostgresRuntime();

  get database(): ElevenHouseDatabase {
    return this.runtime.database;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.runtime.close();
  }
}
