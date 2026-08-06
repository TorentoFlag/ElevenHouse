import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertDevelopmentDatabaseUrl } from "../src/connection";
import { assertCatalogEquivalent, readApplicationCatalogManifest } from "./migration-catalog-manifest";

const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = integrationDatabaseUrl ? describe : describe.skip;
const databaseName = `elevenhouse_catalog_manifest_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = integrationDatabaseUrl
  ? withDatabaseName(
      assertDevelopmentDatabaseUrl(integrationDatabaseUrl, process.env.NODE_ENV, "test catalog manifest reader"),
      databaseName
    )
  : "";
const adminClient = integrationDatabaseUrl ? new Client({ connectionString: integrationDatabaseUrl }) : undefined;
const databaseClient = isolatedDatabaseUrl ? new Client({ connectionString: isolatedDatabaseUrl }) : undefined;

describeWithDatabase("application catalog manifest", () => {
  beforeAll(async () => {
    await adminClient!.connect();
    await adminClient!.query(`CREATE DATABASE "${databaseName}"`);
    await databaseClient!.connect();
    await databaseClient!.query(`
      CREATE TYPE public.catalog_status AS ENUM ('draft', 'active');
      CREATE TABLE public.catalog_items (
        id uuid PRIMARY KEY,
        status public.catalog_status NOT NULL DEFAULT 'draft',
        amount integer NOT NULL CHECK (amount > 0),
        archived boolean NOT NULL DEFAULT false
      );
      CREATE INDEX catalog_items_active_idx ON public.catalog_items (id) WHERE archived = false;
      CREATE FUNCTION public.catalog_audit_row() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER catalog_items_audit BEFORE INSERT ON public.catalog_items
        FOR EACH ROW EXECUTE FUNCTION public.catalog_audit_row();
    `);
  }, 30_000);

  afterAll(async () => {
    try {
      await databaseClient?.end();
      await adminClient?.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await adminClient?.end();
    }
  }, 30_000);

  it("reads stable definitions for application-owned catalog objects", async () => {
    const first = await readApplicationCatalogManifest(databaseClient!);
    const second = await readApplicationCatalogManifest(databaseClient!);

    expect(first.digest).toBe(second.digest);
    expect(first.types).toEqual(expect.arrayContaining([expect.objectContaining({ name: "catalog_status" })]));
    expect(first.relations).toEqual(expect.arrayContaining([expect.objectContaining({ name: "catalog_items" })]));
    expect(first.columns).toEqual(expect.arrayContaining([expect.objectContaining({ relation: "catalog_items", name: "status", default: "'draft'::catalog_status" })]));
    expect(first.constraints).toEqual(expect.arrayContaining([expect.objectContaining({ relation: "catalog_items", type: "c", definition: "CHECK (amount > 0)" })]));
    expect(first.indexes).toEqual(expect.arrayContaining([expect.objectContaining({ name: "catalog_items_active_idx" })]));
    expect(first.routines).toEqual(expect.arrayContaining([expect.objectContaining({ name: "catalog_audit_row" })]));
    expect(first.triggers).toEqual(expect.arrayContaining([expect.objectContaining({ name: "catalog_items_audit", enabled: "O" })]));
    expect(() => assertCatalogEquivalent(first, second)).not.toThrow();
  }, 30_000);
});

function withDatabaseName(databaseUrl: string, name: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}
