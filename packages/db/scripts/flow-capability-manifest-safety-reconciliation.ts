import { createHash } from "node:crypto";

import { flowCapabilityManifestSchema, flowGraphReadSchema } from "@elevenhouse/contracts";
import type { Client, QueryResult } from "pg";

import {
  flowCapabilityManifestSafetyBaselineDdl,
  flowCapabilityManifestSchemaPredicate
} from "./production-baseline-plan";

export type FlowCapabilityManifestSafetyReconciliationResult = "already_current" | "reconciled";

const metadataConstraintName = "flow_versions_v2_metadata_check";
const manifestConstraintName = "flow_versions_capability_manifest_schema_check";
const predecessorMetadataDefinitionHash =
  "d4d6ffbd7080e0f2591b9a284986c9ae8052991bee5eacee92f820844b9e8f50";
const currentManifestDefinitionHash =
  "f72ae4a341a4f98765e5660f269284c36c2930a74f8b06988f4fe01d25aefce7";

type ConstraintEvidence = {
  readonly name: string;
  readonly definitionHash: string;
  readonly validated: boolean;
};

export async function reconcileFlowCapabilityManifestSafety(
  client: Client
): Promise<FlowCapabilityManifestSafetyReconciliationResult> {
  await client.query("LOCK TABLE flow_versions IN ACCESS EXCLUSIVE MODE");
  await assertRequiredColumns(client);
  const constraints = await readConstraintEvidence(client);
  assertPredecessorMetadataConstraint(constraints);

  const manifestConstraint = constraints.find(
    (constraint) => constraint.name === manifestConstraintName
  );
  if (manifestConstraint) {
    if (matchesCurrentManifestConstraint(manifestConstraint)) {
      await assertDomainReadableVersionData(client);
      return "already_current";
    }
    throw driftError(constraints);
  }

  const invalid = await client.query<{ invalid_count: string }>(`
    SELECT count(*)::text AS invalid_count
      FROM flow_versions
     WHERE (${flowCapabilityManifestSchemaPredicate}) IS NOT TRUE
  `);
  if (invalid.rows[0]?.invalid_count !== "0") {
    throw new Error(
      `Approved predecessor Flow capability-manifest data is not losslessly reconcilable; invalid_count=${
        invalid.rows[0]?.invalid_count ?? "unknown"
      }`
    );
  }

  await assertDomainReadableVersionData(client);

  await client.query(flowCapabilityManifestSafetyBaselineDdl);
  await assertFlowCapabilityManifestCatalog(client);
  return "reconciled";
}

async function assertDomainReadableVersionData(client: Client): Promise<void> {
  const unreadable = await readUnreadableVersionEvidence(client);
  if (unreadable.count === 0) return;

  throw new Error(
    `Approved predecessor Flow capability-manifest data is not domain-readable; invalid_count=${unreadable.count}; sample_ids=${unreadable.sampleIds.join(
      ","
    )}`
  );
}

async function readUnreadableVersionEvidence(client: Client): Promise<{
  readonly count: number;
  readonly sampleIds: readonly string[];
}> {
  let afterId: string | null = null;
  let count = 0;
  const sampleIds: string[] = [];

  for (;;) {
    const result: QueryResult<{
      id: string;
      source_revision: number | null;
      graph: unknown;
      capability_manifest: unknown;
    }> = await client.query(
      `SELECT id::text, source_revision, graph, capability_manifest
         FROM flow_versions
        WHERE ($1::uuid IS NULL OR id > $1::uuid)
        ORDER BY id
        LIMIT 200`,
      [afterId]
    );
    if (result.rows.length === 0) break;

    for (const row of result.rows) {
      const graph = flowGraphReadSchema.safeParse(row.graph);
      const manifest =
        row.source_revision === null
          ? { success: row.capability_manifest === null }
          : flowCapabilityManifestSchema.safeParse(row.capability_manifest);
      const expectedGraphVersion = row.source_revision === null ? "flow-graph.v1" : "flow-graph.v2";
      if (
        !graph.success ||
        graph.data.schemaVersion !== expectedGraphVersion ||
        !manifest.success
      ) {
        count += 1;
        if (sampleIds.length < 5) sampleIds.push(row.id);
      }
    }

    afterId = result.rows.at(-1)?.id ?? null;
  }

  return { count, sampleIds };
}

export async function assertFlowCapabilityManifestSafety(client: Client): Promise<void> {
  await assertFlowCapabilityManifestCatalog(client);
  await assertDomainReadableVersionData(client);
}

async function assertFlowCapabilityManifestCatalog(client: Client): Promise<void> {
  await assertRequiredColumns(client);
  const constraints = await readConstraintEvidence(client);
  assertPredecessorMetadataConstraint(constraints);
  const manifestConstraint = constraints.find(
    (constraint) => constraint.name === manifestConstraintName
  );
  if (manifestConstraint && matchesCurrentManifestConstraint(manifestConstraint)) return;
  throw new Error(
    `Current Flow capability-manifest safety constraint drifted; actual=${formatConstraints(
      constraints
    )}`
  );
}

async function assertRequiredColumns(client: Client): Promise<void> {
  const result = await client.query<{
    column_name: string;
    udt_name: string;
    is_nullable: string;
  }>(`
    SELECT column_name, udt_name, is_nullable
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'flow_versions'
       AND column_name IN (
         'source_revision', 'graph_schema_version', 'graph', 'presentation',
         'capability_manifest'
       )
     ORDER BY column_name
  `);
  const actual = result.rows.map((row) => `${row.column_name}|${row.udt_name}|${row.is_nullable}`);
  const expected = [
    "capability_manifest|jsonb|YES",
    "graph|jsonb|NO",
    "graph_schema_version|text|YES",
    "presentation|jsonb|YES",
    "source_revision|int4|YES"
  ];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Flow capability-manifest safety columns are partial or drifted; expected=${JSON.stringify(
        expected
      )} actual=${JSON.stringify(actual)}`
    );
  }
}

async function readConstraintEvidence(client: Client): Promise<readonly ConstraintEvidence[]> {
  const result = await client.query<{
    name: string;
    definition: string;
    validated: boolean;
  }>(
    `SELECT conname AS name,
            pg_get_constraintdef(oid, false) AS definition,
            convalidated AS validated
       FROM pg_constraint
      WHERE conrelid = 'flow_versions'::regclass
        AND conname = ANY($1::text[])
      ORDER BY conname`,
    [[metadataConstraintName, manifestConstraintName]]
  );
  return result.rows.map((row) => ({
    name: row.name,
    definitionHash: createHash("sha256").update(normalizeDefinition(row.definition)).digest("hex"),
    validated: row.validated
  }));
}

function assertPredecessorMetadataConstraint(constraints: readonly ConstraintEvidence[]): void {
  const metadata = constraints.find((constraint) => constraint.name === metadataConstraintName);
  if (
    !metadata ||
    metadata.definitionHash !== predecessorMetadataDefinitionHash ||
    !metadata.validated
  ) {
    throw driftError(constraints);
  }
}

function matchesCurrentManifestConstraint(constraint: ConstraintEvidence): boolean {
  return constraint.definitionHash === currentManifestDefinitionHash && constraint.validated;
}

function driftError(constraints: readonly ConstraintEvidence[]): Error {
  return new Error(
    `Refusing to reconcile a partial or drifted Flow capability-manifest safety catalog: ${formatConstraints(
      constraints
    )}`
  );
}

function formatConstraints(constraints: readonly ConstraintEvidence[]): string {
  return constraints
    .map(
      (constraint) =>
        `${constraint.name}:${constraint.definitionHash}:validated=${constraint.validated}`
    )
    .join(",");
}

function normalizeDefinition(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
