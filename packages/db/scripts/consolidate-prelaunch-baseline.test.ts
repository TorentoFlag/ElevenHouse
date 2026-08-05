import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  clearPrelaunchBaselineArtifacts,
  mergePrelaunchBaselineSnapshot,
  mergePrelaunchBaselineSql
} from "./consolidate-prelaunch-baseline";

describe("pre-launch baseline consolidation", () => {
  it("places generated schema DDL before managed integrity blocks", () => {
    const merged = mergePrelaunchBaselineSql(
      `CREATE TABLE "users" ("id" uuid);\n--> statement-breakpoint\n-- ElevenHouse Flows integrity objects: begin\nSELECT 1;\n-- ElevenHouse Flows integrity objects: end\n`,
      `CREATE TABLE "finance_example" ("id" uuid);\n--> statement-breakpoint\nALTER TABLE "finance_example" ADD CONSTRAINT "finance_example_user_fk" FOREIGN KEY ("id") REFERENCES "users"("id");`
    );

    expect(merged.indexOf('CREATE TABLE "finance_example"')).toBeLessThan(
      merged.indexOf("-- ElevenHouse Flows integrity objects: begin")
    );
  });

  it("places a type correction before pre-existing foreign keys", () => {
    const merged = mergePrelaunchBaselineSql(
      `CREATE TABLE "wallet_receipts" ("id" varchar(200) PRIMARY KEY);
--> statement-breakpoint
CREATE TABLE "refund_receipts" ("wallet_receipt_id" uuid);
--> statement-breakpoint
ALTER TABLE "refund_receipts" ADD CONSTRAINT "refund_receipts_wallet_fk" FOREIGN KEY ("wallet_receipt_id") REFERENCES "wallet_receipts"("id");
--> statement-breakpoint
-- ElevenHouse finance integrity objects: begin
SELECT 1;
-- ElevenHouse finance integrity objects: end
`,
      `ALTER TABLE "refund_receipts" ALTER COLUMN "wallet_receipt_id" SET DATA TYPE varchar(200);`
    );

    expect(merged.indexOf('ALTER COLUMN "wallet_receipt_id" SET DATA TYPE varchar(200)')).toBeLessThan(
      merged.indexOf('ADD CONSTRAINT "refund_receipts_wallet_fk"')
    );
  });

  it("places a generated supporting unique constraint before a generated foreign key that needs it", () => {
    const merged = mergePrelaunchBaselineSql(
      `CREATE TABLE "parents" ("id" uuid PRIMARY KEY);\n--> statement-breakpoint\nCREATE TABLE "children" ("parent_id" uuid, "owner_id" uuid);\n--> statement-breakpoint\n-- ElevenHouse finance integrity objects: begin\nSELECT 1;\n-- ElevenHouse finance integrity objects: end\n`,
      `ALTER TABLE "children" ADD CONSTRAINT "children_parent_owner_fk" FOREIGN KEY ("parent_id", "owner_id") REFERENCES "parents"("id", "owner_id");\n--> statement-breakpoint\nALTER TABLE "parents" ADD CONSTRAINT "parents_id_owner_unique" UNIQUE("id", "owner_id");`
    );

    expect(merged.indexOf('ADD CONSTRAINT "parents_id_owner_unique"')).toBeLessThan(
      merged.indexOf('ADD CONSTRAINT "children_parent_owner_fk"')
    );
  });

  it("keeps the root snapshot identity while adopting the complete generated schema", () => {
    const root = JSON.stringify({
      id: "root-id",
      prevId: "00000000-0000-0000-0000-000000000000",
      version: "7",
      dialect: "postgresql",
      tables: { "public.users": {} }
    });
    const delta = JSON.stringify({
      id: "delta-id",
      prevId: "root-id",
      version: "7",
      dialect: "postgresql",
      tables: { "public.users": {}, "public.finance_example": {} }
    });

    expect(JSON.parse(mergePrelaunchBaselineSnapshot(root, delta))).toMatchObject({
      id: "root-id",
      prevId: "00000000-0000-0000-0000-000000000000",
      tables: { "public.finance_example": {} }
    });
  });

  it("rejects a delta that already owns managed integrity SQL", () => {
    expect(() =>
      mergePrelaunchBaselineSql(
        `CREATE TABLE "users" ("id" uuid);\n--> statement-breakpoint\n-- ElevenHouse Flows integrity objects: begin\nSELECT 1;\n-- ElevenHouse Flows integrity objects: end\n`,
        `CREATE TABLE "finance_example" ("id" uuid);\n-- ElevenHouse finance integrity objects: begin\nSELECT 1;`
      )
    ).toThrow("generated delta owns an integrity block");
  });

  it("clears only the three generated root artifacts before a clean pre-launch rebuild", async () => {
    const directory = await mkdtemp(join(tmpdir(), "elevenhouse-baseline-"));
    const metadataDirectory = join(directory, "meta");
    await mkdir(metadataDirectory);
    await Promise.all([
      writeFile(join(directory, ".gitkeep"), ""),
      writeFile(join(directory, "0000_sticky_rictor.sql"), "old baseline"),
      writeFile(join(metadataDirectory, "0000_snapshot.json"), "{}"),
      writeFile(join(metadataDirectory, "_journal.json"), "{}")
    ]);

    try {
      await clearPrelaunchBaselineArtifacts(directory);

      await expect(readFile(join(directory, ".gitkeep"), "utf8")).resolves.toBe("");
      await expect(readFile(join(directory, "0000_sticky_rictor.sql"), "utf8")).rejects.toThrow();
      await expect(readFile(join(metadataDirectory, "0000_snapshot.json"), "utf8")).rejects.toThrow();
      await expect(readFile(join(metadataDirectory, "_journal.json"), "utf8")).resolves.toBe(
        '{\n  "version": "7",\n  "dialect": "postgresql",\n  "entries": []\n}\n'
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("refuses to clear a directory containing another migration artifact", async () => {
    const directory = await mkdtemp(join(tmpdir(), "elevenhouse-baseline-"));
    const metadataDirectory = join(directory, "meta");
    await mkdir(metadataDirectory);
    await writeFile(join(directory, "0001_unexpected.sql"), "unexpected");

    try {
      await expect(clearPrelaunchBaselineArtifacts(directory)).rejects.toThrow(
        "unexpected SQL migrations"
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
