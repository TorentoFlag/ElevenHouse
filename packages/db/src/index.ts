const allowedPostgresProtocols = new Set(["postgres:", "postgresql:"]);

export function assertPostgresDatabaseUrl(value: string): string {
  const url = new URL(value);

  if (!allowedPostgresProtocols.has(url.protocol)) {
    throw new Error(`Unsupported database protocol: ${url.protocol}`);
  }

  return value;
}
