import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { renderRouteInventory } from "./generate-route-inventory.mjs";

test("renders HTTP methods and controller paths from Nest controllers", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "elevenhouse-route-inventory-"));
  const controllerPath = path.join(
    rootDir,
    "apps/public-api/src/modules/orders/orders.controller.ts"
  );
  await mkdir(path.dirname(controllerPath), { recursive: true });
  await writeFile(
    controllerPath,
    [
      'import { Controller, Get, Post } from "@nestjs/common";',
      "",
      '@Controller("orders")',
      "export class OrdersController {",
      "  @Get()",
      "  list() {}",
      "",
      '  @Post(":orderId/disputes")',
      "  submitDispute() {}",
      "}",
      ""
    ].join("\n"),
    "utf8"
  );

  const inventory = await renderRouteInventory({ rootDir });

  assert.match(inventory, /## public-api/);
  assert.match(inventory, /\| GET \| `\/orders` \|/);
  assert.match(inventory, /\| POST \| `\/orders\/:orderId\/disputes` \|/);
});

test("renders an unprefixed controller route", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "elevenhouse-route-inventory-"));
  const controllerPath = path.join(
    rootDir,
    "apps/admin-api/src/modules/health/health.controller.ts"
  );
  await mkdir(path.dirname(controllerPath), { recursive: true });
  await writeFile(
    controllerPath,
    [
      'import { Controller, Get } from "@nestjs/common";',
      "",
      "@Controller()",
      "export class HealthController {",
      '  @Get("health")',
      "  health() {}",
      "}",
      ""
    ].join("\n"),
    "utf8"
  );

  const inventory = await renderRouteInventory({ rootDir });

  assert.match(inventory, /## admin-api/);
  assert.match(inventory, /\| GET \| `\/health` \|/);
});

test("assigns routes to each controller when a source file exports multiple controllers", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "elevenhouse-route-inventory-"));
  const controllerPath = path.join(
    rootDir,
    "apps/astrologer-api/src/modules/flows/flows.controller.ts"
  );
  await mkdir(path.dirname(controllerPath), { recursive: true });
  await writeFile(
    controllerPath,
    [
      'import { Controller, Get, Post } from "@nestjs/common";',
      "",
      '@Controller("flow-templates")',
      "export class FlowTemplatesController {",
      "  @Get()",
      "  list() {}",
      "}",
      "",
      '@Controller("flows")',
      "export class FlowsController {",
      '  @Post(":flowId/next-draft")',
      "  createNextDraft() {}",
      "}",
      ""
    ].join("\n"),
    "utf8"
  );

  const inventory = await renderRouteInventory({ rootDir });

  assert.match(inventory, /\| GET \| `\/flow-templates` \|/);
  assert.match(inventory, /\| POST \| `\/flows\/:flowId\/next-draft` \|/);
  assert.doesNotMatch(inventory, /\/flow-templates\/:flowId\/next-draft/);
});
