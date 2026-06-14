import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  createPostgresConnectionConfig,
  type PostgresConnectionConfig
} from "../connection";
import * as schema from "../schema";

export type ElevenHouseDatabase = NodePgDatabase<typeof schema>;

export type PostgresRuntime = {
  readonly pool: Pool;
  readonly database: ElevenHouseDatabase;
  readonly close: () => Promise<void>;
};

export function createPostgresPool(config: PostgresConnectionConfig): Pool {
  return new Pool({
    connectionString: config.connectionString
  });
}

export function createDrizzleDatabase(pool: Pool): ElevenHouseDatabase {
  return drizzle(pool, { schema });
}

export function createPostgresRuntime(
  source: Record<string, string | undefined> = process.env
): PostgresRuntime {
  const pool = createPostgresPool(createPostgresConnectionConfig(source));
  const database = createDrizzleDatabase(pool);

  return {
    pool,
    database,
    close: () => pool.end()
  };
}
