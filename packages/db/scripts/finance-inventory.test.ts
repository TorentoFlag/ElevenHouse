import { describe, expect, it, vi } from "vitest";
import { runFinanceInventoryCli, type FinanceInventoryCliClient } from "./finance-inventory";
import { approvedLineage } from "./production-baseline-plan";

describe("finance inventory CLI", () => {
  it.each([
    {
      name: "missing DATABASE_URL",
      source: {},
      args: ["--confirm-read-only-target=elevenhouse"],
      expected: "DATABASE_URL is required"
    },
    {
      name: "non-PostgreSQL DATABASE_URL",
      source: { DATABASE_URL: "mysql://user:secret@db.example/elevenhouse" },
      args: ["--confirm-read-only-target=elevenhouse"],
      expected: "Unsupported database protocol: mysql:"
    },
    {
      name: "missing confirmation",
      source: { DATABASE_URL: "postgresql://user:secret@db.example/elevenhouse" },
      args: [],
      expected: "Exact confirmation is required: --confirm-read-only-target=elevenhouse"
    },
    {
      name: "wrong confirmation",
      source: { DATABASE_URL: "postgresql://user:secret@db.example/elevenhouse" },
      args: ["--confirm-read-only-target=production"],
      expected: "Exact confirmation is required: --confirm-read-only-target=elevenhouse"
    }
  ])("rejects $name before creating a client", async ({ source, args, expected }) => {
    const stderr: string[] = [];
    const createClient = vi.fn(() => {
      throw new Error("must not connect");
    });

    const exitCode = await runFinanceInventoryCli({
      source,
      args,
      stdout: () => undefined,
      stderr: (value) => stderr.push(value),
      createClient,
      now: () => "2026-08-03T09:00:00.000Z"
    });

    expect(exitCode).toBe(1);
    expect(createClient).not.toHaveBeenCalled();
    expect(stderr.join("\n")).toContain(expected);
    expect(stderr.join("\n")).not.toContain("user");
    expect(stderr.join("\n")).not.toContain("secret");
  });

  it("uses a read-only connection and session for the current baseline report", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const statements: { readonly text: string; readonly values: readonly unknown[] }[] = [];
    let connected = false;
    let ended = false;
    const client: FinanceInventoryCliClient = {
      connect: async () => {
        connected = true;
      },
      end: async () => {
        ended = true;
      },
      query: async <Row extends Record<string, unknown>>(
        text: string,
        values: readonly unknown[] = []
      ) => {
        statements.push({ text, values });
        if (text === "SHOW transaction_read_only") {
          return { rows: [{ transaction_read_only: "on" }] as unknown as readonly Row[] };
        }
        if (text.includes("finance_inventory:migration_ledger")) {
          return {
            rows: [
              ...approvedLineage.map((migration) => ({ hash: migration.hash, created_at: migration.createdAt }))
            ] as unknown as readonly Row[]
          };
        }
        return { rows: [] };
      }
    };
    const createClient = vi.fn(() => client);

    const exitCode = await runFinanceInventoryCli({
      source: {
        DATABASE_URL:
          "postgresql://finance_user:top-secret@finance-db.internal:5433/elevenhouse?sslmode=require"
      },
      args: ["--confirm-read-only-target=elevenhouse"],
      stdout: (value) => stdout.push(value),
      stderr: (value) => stderr.push(value),
      createClient,
      now: () => "2026-08-03T09:00:00.000Z"
    });

    expect(exitCode).toBe(0);
    expect(connected).toBe(true);
    expect(ended).toBe(true);
    expect(createClient).toHaveBeenCalledWith({
      connectionString:
        "postgresql://finance_user:top-secret@finance-db.internal:5433/elevenhouse?sslmode=require",
      application_name: "elevenhouse_finance_inventory",
      options: "-c default_transaction_read_only=on"
    });
    expect(statements.slice(0, 2)).toEqual([
      { text: "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY", values: [] },
      { text: "SHOW transaction_read_only", values: [] }
    ]);
    expect(statements[2]?.text).toContain("finance_inventory:migration_ledger");
    expect(statements[3]).toEqual({
      text: "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      values: []
    });
    expect(statements.at(-1)).toEqual({ text: "COMMIT", values: [] });
    expect(stdout).toHaveLength(1);
    expect(JSON.parse(stdout[0]!)).toMatchObject({
      schemaVersion: "finance-inventory-report.v1",
      generatedAt: "2026-08-03T09:00:00.000Z",
      targetIdentityDigest:
        "sha256:d8a2eafbb7bfabf4ee611ebf717de97abab783098490eb8cb5840e0749caf522",
      status: "passed"
    });
    expect(stderr.join("\n")).toContain(
      "Read-only target: postgresql://finance-db.internal:5433/elevenhouse"
    );
    expect(stderr.join("\n")).not.toContain("finance_user");
    expect(stderr.join("\n")).not.toContain("top-secret");
    expect(stderr.join("\n")).not.toContain("sslmode");
  });

  it("uses canonical immutable finance tables for the approved current baseline", async () => {
    const stdout: string[] = [];
    const statements: { readonly text: string; readonly values: readonly unknown[] }[] = [];
    const client: FinanceInventoryCliClient = {
      connect: async () => undefined,
      end: async () => undefined,
      query: async <Row extends Record<string, unknown>>(
        text: string,
        values: readonly unknown[] = []
      ) => {
        statements.push({ text, values });
        if (text === "SHOW transaction_read_only") {
          return { rows: [{ transaction_read_only: "on" }] as unknown as readonly Row[] };
        }
        if (text.includes("finance_inventory:migration_ledger")) {
          return {
            rows: approvedLineage.map((migration) => ({
              hash: migration.hash,
              created_at: migration.createdAt
            })) as unknown as readonly Row[]
          };
        }
        return { rows: [] };
      }
    };

    const exitCode = await runFinanceInventoryCli({
      source: { DATABASE_URL: "postgresql://u:p@localhost:5432/elevenhouse" },
      args: ["--confirm-read-only-target=elevenhouse"],
      stdout: (value) => stdout.push(value),
      stderr: () => undefined,
      createClient: () => client,
      now: () => "2026-08-05T09:00:00.000Z"
    });

    expect(exitCode).toBe(0);
    expect(statements.some((statement) => statement.text.includes("finance_inventory:canonical_"))).toBe(
      true
    );
    expect(JSON.parse(stdout[0]!).status).toBe("passed");
  });

  it("binds artifacts to host, port, and database without credential or query dependence", async () => {
    const inventory = async (databaseUrl: string): Promise<string> => {
      const stdout: string[] = [];
      const client: FinanceInventoryCliClient = {
        connect: async () => undefined,
        end: async () => undefined,
        query: async <Row extends Record<string, unknown>>(text: string) => ({
          rows:
            text === "SHOW transaction_read_only"
              ? ([{ transaction_read_only: "on" }] as unknown as readonly Row[])
              : text.includes("finance_inventory:migration_ledger")
                ? ([
                    ...approvedLineage.map((migration) => ({ hash: migration.hash, created_at: migration.createdAt }))
                  ] as unknown as readonly Row[])
              : []
        })
      };

      const exitCode = await runFinanceInventoryCli({
        source: { DATABASE_URL: databaseUrl },
        args: ["--confirm-read-only-target=elevenhouse"],
        stdout: (value) => stdout.push(value),
        stderr: () => undefined,
        createClient: () => client,
        now: () => "2026-08-03T09:00:00.000Z"
      });

      expect(exitCode).toBe(0);
      return (JSON.parse(stdout[0]!) as { readonly targetIdentityDigest: string })
        .targetIdentityDigest;
    };

    const first = await inventory(
      "postgresql://alice:first-secret@finance-db.internal:5433/elevenhouse?sslmode=require"
    );
    const second = await inventory(
      "postgres://bob:second-secret@finance-db.internal:5433/elevenhouse?application_name=ignored"
    );

    expect(first).toBe("sha256:d8a2eafbb7bfabf4ee611ebf717de97abab783098490eb8cb5840e0749caf522");
    expect(second).toBe(first);
  });

  it("fails closed when the server does not confirm a read-only session", async () => {
    let ended = false;
    const client: FinanceInventoryCliClient = {
      connect: async () => undefined,
      end: async () => {
        ended = true;
      },
      query: async <Row extends Record<string, unknown>>(text: string) => ({
        rows:
          text === "SHOW transaction_read_only"
            ? ([{ transaction_read_only: "off" }] as unknown as readonly Row[])
            : []
      })
    };
    const stderr: string[] = [];

    const exitCode = await runFinanceInventoryCli({
      source: { DATABASE_URL: "postgres://u:p@db.example/elevenhouse" },
      args: ["--confirm-read-only-target=elevenhouse"],
      stdout: () => undefined,
      stderr: (value) => stderr.push(value),
      createClient: () => client,
      now: () => "2026-08-03T09:00:00.000Z"
    });

    expect(exitCode).toBe(1);
    expect(ended).toBe(true);
    expect(stderr.join("\n")).toContain("PostgreSQL session did not enter read-only mode");
    expect(stderr.join("\n")).not.toContain("postgres://u:p");
  });
});
