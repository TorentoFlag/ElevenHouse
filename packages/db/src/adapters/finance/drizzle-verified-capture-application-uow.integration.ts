import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolveRepositoryRoot(process.cwd());
const capturePortPath = resolve(
  repositoryRoot,
  "packages/domain/src/finance-core/ports/verified-capture-application-uow.ts"
);
const financeOutboxContractPath = resolve(
  repositoryRoot,
  "packages/domain/src/finance-core/finance-outbox-events.ts"
);
const sealedWalletAdapterPath = resolve(
  repositoryRoot,
  "packages/db/src/adapters/finance/drizzle-sealed-wallet-journal-commit-uow.ts"
);
const financeSchemaRoot = resolve(repositoryRoot, "packages/db/src/schema/finance");

describe("verified capture application prerequisite contracts", () => {
  it("carries exact wallet+journal, journal-only and zero-amount no-posting variants", () => {
    const source = readFileSync(capturePortPath, "utf8");
    expect(source).toMatch(/\bSealedWalletJournalMutationCommand\b/u);
    expect(source).toMatch(/\bSealedJournalMutationCommand\b/u);
    expect(source).toContain('kind: "no_posting"');
    expect(source).toContain('reason: "zero_amount_platform_card_setup"');
  });

  it("exposes the sealed wallet writer inside a caller-owned finance transaction", () => {
    const source = sourceFile(sealedWalletAdapterPath);
    const transactionScopedExports = source.statements
      .filter(ts.isFunctionDeclaration)
      .filter(isExported)
      .filter((declaration) =>
        declaration.parameters.some((parameter) =>
          parameter.type?.getText(source).includes("FinanceTransaction")
        )
      )
      .map((declaration) => declaration.name?.text ?? "<anonymous>");

    expect(transactionScopedExports).not.toEqual([]);
  });

  it("has immutable persisted owners for every root payable-lot authority", () => {
    const declaredTables = new Set(
      readdirSync(financeSchemaRoot)
        .filter((fileName) => fileName.endsWith(".schema.ts"))
        .flatMap((fileName) => pgTableNames(sourceFile(resolve(financeSchemaRoot, fileName))))
    );

    expect([...declaredTables]).toEqual(
      expect.arrayContaining([
        "finance_order_economics_snapshots",
        "finance_risk_policy_versions",
        "finance_paid_product_fulfillment_decisions"
      ])
    );
  });

  it("defines a normalized IDs-only capture outbox contract in finance-core", () => {
    const source = sourceFile(financeOutboxContractPath);
    const exportedCaptureDeclarations = source.statements
      .filter(isExported)
      .map(declarationName)
      .filter((name): name is string => name !== null && /capture/i.test(name));

    expect(exportedCaptureDeclarations).not.toEqual([]);
  });
});

function sourceFile(fileName: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    readFileSync(fileName, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
}

function isExported(statement: ts.Statement): boolean {
  return (
    ts.canHaveModifiers(statement) &&
    ts
      .getModifiers(statement)
      ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true
  );
}

function declarationName(statement: ts.Statement): string | null {
  if (
    ts.isTypeAliasDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isFunctionDeclaration(statement)
  ) {
    return statement.name?.text ?? null;
  }
  if (!ts.isVariableStatement(statement)) return null;
  const declaration = statement.declarationList.declarations[0];
  return declaration && ts.isIdentifier(declaration.name) ? declaration.name.text : null;
}

function pgTableNames(source: ts.SourceFile): string[] {
  const names: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "pgTable"
    ) {
      const tableName = node.arguments[0];
      if (tableName && ts.isStringLiteral(tableName)) names.push(tableName.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
}

function resolveRepositoryRoot(currentDirectory: string): string {
  for (const candidate of [currentDirectory, resolve(currentDirectory, "../..")]) {
    try {
      const manifest = JSON.parse(readFileSync(resolve(candidate, "package.json"), "utf8")) as {
        readonly name?: unknown;
      };
      if (manifest.name === "elevenhouse") return candidate;
    } catch {
      // Try the next bounded workspace candidate.
    }
  }
  throw new Error("Could not resolve the ElevenHouse repository root");
}
