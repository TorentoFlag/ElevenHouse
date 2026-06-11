const allowedPostgresProtocols = new Set(["postgres:", "postgresql:"]);
const localDatabaseHosts = new Set(["localhost", "127.0.0.1", "::1"]);

export * from "./schema";

export type PostgresConnectionConfig = {
  readonly connectionString: string;
};

export function assertPostgresDatabaseUrl(value: string): string {
  const url = new URL(value);

  if (!allowedPostgresProtocols.has(url.protocol)) {
    throw new Error(`Unsupported database protocol: ${url.protocol}`);
  }

  return value;
}

export function createPostgresConnectionConfig(
  source: Record<string, string | undefined> = process.env
): PostgresConnectionConfig {
  const databaseUrl = source.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return {
    connectionString: assertPostgresDatabaseUrl(databaseUrl)
  };
}

export function assertDevelopmentDatabaseUrl(
  value: string,
  nodeEnv: string | undefined = process.env.NODE_ENV
): string {
  if (nodeEnv === "production") {
    throw new Error("Refusing to reset a production database");
  }

  const url = new URL(assertPostgresDatabaseUrl(value));

  if (!localDatabaseHosts.has(url.hostname)) {
    throw new Error(`Refusing to reset a non-local database host: ${url.hostname}`);
  }

  return value;
}
