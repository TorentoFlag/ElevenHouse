# Destiny Matrix Backend Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` to implement this plan task-by-task. Do not use
> subagents for this repository task.

**Goal:** Build the production backend core for one canonical Ladini 22 Matrix
engine: CRM-only preview, linked persistence, explicit recalculation,
compatibility, current age cycle, and read-only annual forecast.

**Architecture:** Add a pure typed `Matrix` bounded context to
`packages/domain`, strict shared schemas to `packages/contracts`, and a Nest
`MatrixModule` in `astrologer-api`. Reuse existing `Clients` hydration and
generic `Calculations` ownership/link/checksum persistence. Saved calculations
contain only invariant base results; current age and selected-year forecast are
derived read-only views and never invalidate the saved result.

**Tech Stack:** TypeScript 6, Zod via `@elevenhouse/validation`, NestJS 11,
Drizzle-backed `CalculationStore`, Vitest, pnpm/turbo.

## Global Constraints

- The only method code is `ladini_22`; internal `engineRevision` is `1`.
- Participants are existing active CRM clients only; no manual input or inline
  client editing.
- Individual requires one CRM client; compatibility requires two distinct CRM
  clients and links both atomically.
- Preview and projection routes are authenticated read-only operations with no
  CSRF requirement and no persistence.
- `Привязать расчёт` maps to Matrix calculation creation and is the only save
  action.
- Saved `inputData`, `resultData`, fingerprint, and checksum contain only the
  invariant base Matrix. Forecast year and current age are not persisted.
- Recalculation rehydrates the record's existing CRM participant IDs and cannot
  change participant identity.
- The server is the only arithmetic authority; frontend arithmetic is outside
  this plan and prohibited.
- Matrix exposes no publication, consultation, messaging, notes, AI, report, or
  PDF behavior in this first independently testable backend slice.
- All mutations use the existing route CSRF metadata; all records and clients
  are owner-scoped.
- RU and EN contract readiness is preserved, but this plan contains no
  interpretation copy.

---

## File Map

### Shared deterministic serialization

- Create `packages/domain/src/calculations/canonical-json.ts`: canonical JSON
  type, stable serialization, SHA-256 helper.
- Create `packages/domain/src/calculations/canonical-json.test.ts`: recursive
  key ordering, array ordering, UTF-8, and finite-number tests.
- Modify `packages/domain/src/calculations/index.ts`: export canonical JSON
  utilities.
- Modify `apps/astrologer-api/src/modules/numerology/numerology.service.ts`:
  import shared utilities.
- Delete `apps/astrologer-api/src/modules/numerology/numerology-digests.ts` and
  its test after parity is proven.

### Matrix contracts

- Create `packages/contracts/src/matrix.ts`: request, base result, projection,
  preview, calculation, and projection response schemas.
- Create `packages/contracts/src/matrix.test.ts`: strict CRM-only contracts and
  response integrity tests.
- Modify `packages/contracts/src/index.ts`: export Matrix contracts.

### Matrix domain

- Create `packages/domain/src/matrix/matrix-types.ts`: method, point, result,
  projection, and engine types.
- Create `packages/domain/src/matrix/matrix-errors.ts`: validation and unknown
  method errors.
- Create `packages/domain/src/matrix/reduce22.ts` and `reduce22.test.ts`.
- Create `packages/domain/src/matrix/ladini-22/individual.ts` and
  `individual.test.ts`.
- Create `packages/domain/src/matrix/ladini-22/compatibility.ts` and
  `compatibility.test.ts`.
- Create `packages/domain/src/matrix/ladini-22/projection.ts` and
  `projection.test.ts`.
- Create `packages/domain/src/matrix/ladini-22/golden-fixtures.ts`.
- Create `packages/domain/src/matrix/ladini-22/engine.ts`.
- Create `packages/domain/src/matrix/method-registry.ts` and
  `method-registry.test.ts`.
- Create `packages/domain/src/matrix/index.ts`.
- Modify `packages/domain/src/index.ts`: export Matrix domain.

### Astrologer API

- Create `apps/astrologer-api/src/modules/matrix/matrix.tokens.ts` only if a
  Matrix-specific injected port becomes necessary; the backend core should
  otherwise reuse `CALCULATION_STORE` and `CLIENT_STORE`.
- Create `apps/astrologer-api/src/modules/matrix/matrix-http-errors.ts`.
- Create `apps/astrologer-api/src/modules/matrix/matrix.service.ts` and
  `matrix.service.test.ts`.
- Create `apps/astrologer-api/src/modules/matrix/matrix.controller.ts`.
- Create `apps/astrologer-api/src/modules/matrix/matrix.module.ts`.
- Create `apps/astrologer-api/src/modules/matrix/matrix.e2e.test.ts`.
- Modify `apps/astrologer-api/src/app.module.ts`: import `MatrixModule`.

### Canonical documentation

- Modify `docs/architecture/backend-modules.md`: mark Matrix backend core ready.
- Modify `docs/api/api-boundaries.md`: list Matrix routes and persistence rules.
- Modify `docs/architecture/design-reference-inventory.md`: mark backend core
  ready while frontend/notes/AI/PDF remain missing.

---

### Task 1: Extract Canonical JSON Digests Into The Calculation Domain

**Files:**

- Create: `packages/domain/src/calculations/canonical-json.test.ts`
- Create: `packages/domain/src/calculations/canonical-json.ts`
- Modify: `packages/domain/src/calculations/index.ts`
- Modify: `apps/astrologer-api/src/modules/numerology/numerology.service.ts`
- Delete: `apps/astrologer-api/src/modules/numerology/numerology-digests.test.ts`
- Delete: `apps/astrologer-api/src/modules/numerology/numerology-digests.ts`

**Interfaces:**

- Produces:
  `CanonicalJson`, `stableJson(value): string`, and
  `sha256CanonicalJson(value): \`sha256:${string}\``exported from`@elevenhouse/domain`.
- Preserves: Numerology fingerprints and checksums byte-for-byte.

- [ ] **Step 1: Write the shared failing tests**

```ts
import { describe, expect, it } from "vitest";
import { sha256CanonicalJson, stableJson } from "./canonical-json";

describe("canonical calculation JSON", () => {
  it("sorts object keys recursively while preserving array order", () => {
    expect(stableJson({ z: 1, nested: { b: 2, a: 1 }, items: ["б", "а"] })).toBe(
      '{"items":["б","а"],"nested":{"a":1,"b":2},"z":1}'
    );
    expect(sha256CanonicalJson({ b: 2, a: 1 })).toBe(sha256CanonicalJson({ a: 1, b: 2 }));
    expect(sha256CanonicalJson(["а", "б"])).not.toBe(sha256CanonicalJson(["б", "а"]));
  });

  it("rejects non-finite numbers and hashes UTF-8 explicitly", () => {
    expect(() => stableJson({ value: Number.NaN })).toThrow(
      "Canonical JSON numbers must be finite"
    );
    expect(sha256CanonicalJson({ name: "Голубев Антон" })).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing module failure**

Run:

```bash
pnpm test packages/domain/src/calculations/canonical-json.test.ts
```

Expected: FAIL because `./canonical-json` does not exist.

- [ ] **Step 3: Move the exact canonical implementation into domain**

```ts
import { createHash } from "node:crypto";

export type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJson[]
  | { readonly [key: string]: CanonicalJson };

export function sha256CanonicalJson(value: CanonicalJson): `sha256:${string}` {
  const hex = createHash("sha256").update(stableJson(value), "utf8").digest("hex");
  return `sha256:${hex}`;
}

export function stableJson(value: CanonicalJson): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON numbers must be finite");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as { readonly [key: string]: CanonicalJson };
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key]!)}`)
    .join(",")}}`;
}
```

Export it from `packages/domain/src/calculations/index.ts`, change Numerology to
import the three symbols from `@elevenhouse/domain`, then delete the app-local
implementation and test.

- [ ] **Step 4: Prove shared behavior and Numerology parity**

Run:

```bash
pnpm test packages/domain/src/calculations/canonical-json.test.ts apps/astrologer-api/src/modules/numerology/numerology-digests.test.ts apps/astrologer-api/src/modules/numerology/numerology.service.test.ts
```

Before deleting the old test, expected: PASS for both implementations and
Numerology. After deletion, rerun without the deleted test and expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/calculations apps/astrologer-api/src/modules/numerology
git commit -m "refactor: share canonical calculation digests"
```

---

### Task 2: Define Strict Matrix Contracts

**Files:**

- Create: `packages/contracts/src/matrix.test.ts`
- Create: `packages/contracts/src/matrix.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**

- Produces request schemas:
  `previewMatrixRequestSchema`, `persistMatrixCalculationRequestSchema`,
  `recalculateMatrixCalculationRequestSchema`, `matrixProjectionQuerySchema`.
- Produces response schemas:
  `matrixBaseResultSchema`, `matrixProjectionResponseSchema`,
  `matrixPreviewResponseSchema`, `matrixCalculationResponseSchema`.
- Consumed by Tasks 3–6.

- [ ] **Step 1: Write failing contract tests for CRM-only requests**

```ts
import { describe, expect, it } from "vitest";
import {
  matrixCalculationResponseSchema,
  matrixPreviewResponseSchema,
  persistMatrixCalculationRequestSchema,
  previewMatrixRequestSchema,
  recalculateMatrixCalculationRequestSchema
} from "./matrix";

const clientA = "00000000-0000-4000-8000-000000000001";
const clientB = "00000000-0000-4000-8000-000000000002";

describe("Matrix contracts", () => {
  it("accepts one CRM participant for individual preview", () => {
    expect(
      previewMatrixRequestSchema.parse({
        methodCode: "ladini_22",
        mode: "individual",
        participants: [{ role: "subject", source: "crm_client", clientId: clientA }],
        projection: { kind: "explicit_year", year: 2026 }
      })
    ).toMatchObject({ mode: "individual" });
  });

  it("rejects manual participants, caller birth dates and duplicate partners", () => {
    expect(() =>
      previewMatrixRequestSchema.parse({
        methodCode: "ladini_22",
        mode: "individual",
        participants: [
          { role: "subject", source: "manual", displayName: "Анна", birthDate: "1990-03-14" }
        ]
      })
    ).toThrow();
    expect(() =>
      persistMatrixCalculationRequestSchema.parse({
        methodCode: "ladini_22",
        mode: "compatibility",
        participants: [
          { role: "subject", source: "crm_client", clientId: clientA },
          { role: "partner", source: "crm_client", clientId: clientA }
        ]
      })
    ).toThrow();
  });

  it("keeps persistence projection-free and recalculation body empty", () => {
    expect(() =>
      persistMatrixCalculationRequestSchema.parse({
        methodCode: "ladini_22",
        mode: "individual",
        participants: [{ role: "subject", source: "crm_client", clientId: clientA }],
        projection: { kind: "current_year" }
      })
    ).toThrow();
    expect(recalculateMatrixCalculationRequestSchema.parse({})).toEqual({});
    expect(() => recalculateMatrixCalculationRequestSchema.parse({ force: true })).toThrow();
  });

  it("exports parseable preview and calculation response schemas", () => {
    expect(matrixPreviewResponseSchema).toBeDefined();
    expect(matrixCalculationResponseSchema).toBeDefined();
    expect(clientB).not.toBe(clientA);
  });
});
```

- [ ] **Step 2: Run contracts test and confirm missing exports**

Run:

```bash
pnpm test packages/contracts/src/matrix.test.ts
```

Expected: FAIL because `packages/contracts/src/matrix.ts` does not exist.

- [ ] **Step 3: Implement strict request and result schemas**

Create `matrix.ts` with these exact public constants and discriminators:

```ts
import { z } from "@elevenhouse/validation";
import { calculationRecordResponseSchema } from "./calculations";

export const matrixMethodCodeSchema = z.literal("ladini_22");
export const matrixEngineRevisionSchema = z.literal(1);
export const matrixArcanaSchema = z.number().int().min(1).max(22);
export const matrixPointCodeSchema = z.enum([
  "A",
  "B",
  "C",
  "D",
  "E",
  "tl",
  "tr",
  "br",
  "bl",
  "A1",
  "B1",
  "C1",
  "D1",
  "tl1",
  "tr1",
  "br1",
  "bl1"
]);

const crmParticipant = (role: "subject" | "partner") =>
  z
    .object({
      role: z.literal(role),
      source: z.literal("crm_client"),
      clientId: z.string().uuid()
    })
    .strict();

const individualRequest = z
  .object({
    methodCode: matrixMethodCodeSchema,
    mode: z.literal("individual"),
    participants: z.tuple([crmParticipant("subject")])
  })
  .strict();

const compatibilityRequest = z
  .object({
    methodCode: matrixMethodCodeSchema,
    mode: z.literal("compatibility"),
    participants: z.tuple([crmParticipant("subject"), crmParticipant("partner")])
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.participants[0].clientId === value.participants[1].clientId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["participants", 1, "clientId"],
        message: "Compatibility Matrix requires two distinct CRM clients"
      });
    }
  });

export const matrixProjectionRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z.object({ kind: z.literal("current_year") }).strict(),
  z
    .object({ kind: z.literal("explicit_year"), year: z.number().int().min(1900).max(2200) })
    .strict()
]);

export const previewMatrixRequestSchema = z.discriminatedUnion("mode", [
  individualRequest.extend({
    projection: matrixProjectionRequestSchema.optional().default({ kind: "none" })
  }),
  compatibilityRequest.extend({
    projection: z
      .object({ kind: z.literal("none") })
      .strict()
      .optional()
      .default({ kind: "none" })
  })
]);
export const persistMatrixCalculationRequestSchema = z.discriminatedUnion("mode", [
  individualRequest,
  compatibilityRequest
]);
export const recalculateMatrixCalculationRequestSchema = z.object({}).strict();
export const matrixProjectionQuerySchema = z
  .object({
    year: z.coerce.number().int().min(1900).max(2200)
  })
  .strict();
```

Add strict schemas for:

```ts
matrixPointsSchema;
matrixPurposesSchema;
matrixZonesSchema;
matrixEnergyRowSchema;
matrixEnergyMapSchema;
matrixIndividualBaseResultSchema;
matrixCompatibilityBaseResultSchema;
matrixBaseResultSchema;
matrixAgeCycleSchema;
matrixYearForecastSchema;
matrixDerivedProjectionSchema;
matrixPreviewResponseSchema;
matrixProjectionResponseSchema;
matrixCalculationResponseSchema;
```

`matrixCalculationResponseSchema` must mirror Numerology response integrity:
`calculation.module === "matrix"`, method and mode match, and
`calculation.resultData` deep-equals `result`. Export every inferred public type
and export the module from `packages/contracts/src/index.ts`.

- [ ] **Step 4: Run contracts tests**

Run:

```bash
pnpm test packages/contracts/src/matrix.test.ts packages/contracts/src/index.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/matrix.ts packages/contracts/src/matrix.test.ts packages/contracts/src/index.ts
git commit -m "feat: define Matrix API contracts"
```

---

### Task 3: Implement The Individual Ladini 22 Engine

**Files:**

- Create: `packages/domain/src/matrix/matrix-types.ts`
- Create: `packages/domain/src/matrix/matrix-errors.ts`
- Create: `packages/domain/src/matrix/reduce22.ts`
- Create: `packages/domain/src/matrix/reduce22.test.ts`
- Create: `packages/domain/src/matrix/ladini-22/golden-fixtures.ts`
- Create: `packages/domain/src/matrix/ladini-22/individual.ts`
- Create: `packages/domain/src/matrix/ladini-22/individual.test.ts`

**Interfaces:**

- Produces `calculateLadini22Individual({ birthDate })` returning
  `MatrixIndividualBaseResult`.
- Produces `reduce22(value)` and the canonical point/purpose/zone/energy types.
- Consumed by compatibility, registry, service, and projection tasks.

- [ ] **Step 1: Write reducer and golden individual tests**

```ts
import { describe, expect, it } from "vitest";
import { reduce22 } from "./reduce22";

describe("Matrix reduce22", () => {
  it.each([
    [1, 1],
    [22, 22],
    [23, 5],
    [28, 10],
    [45, 9],
    [99, 18]
  ])("reduces %i to %i", (input, expected) => expect(reduce22(input)).toBe(expected));
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid input %s", (value) =>
    expect(() => reduce22(value)).toThrow("positive integer")
  );
});
```

```ts
import { describe, expect, it } from "vitest";
import { calculateLadini22Individual } from "./individual";

describe("Ladini 22 individual Matrix", () => {
  it("matches the approved 14.03.1990 golden fixture", () => {
    const result = calculateLadini22Individual({ birthDate: "1990-03-14" });
    expect(result).toMatchObject({
      methodCode: "ladini_22",
      engineRevision: 1,
      mode: "individual",
      matrix: {
        points: {
          A: 14,
          B: 3,
          C: 19,
          D: 9,
          E: 9,
          tl: 17,
          tr: 22,
          br: 10,
          bl: 5,
          A1: 5,
          B1: 12,
          C1: 10,
          D1: 18,
          tl1: 8,
          tr1: 4,
          br1: 19,
          bl1: 14
        },
        purposes: { earth: 6, sky: 12, male: 9, female: 9, personal: 18, social: 18, spiritual: 9 },
        zones: { purpose: 18, money: 19, love: 14, energy: 12 },
        energyMap: { totals: { physical: 10, energy: 10, emotions: 20 } }
      }
    });
  });

  it.each(["1990-02-29", "1990-13-01", "not-a-date"])(
    "rejects invalid birth date %s",
    (birthDate) => expect(() => calculateLadini22Individual({ birthDate })).toThrow()
  );
});
```

- [ ] **Step 2: Run tests and confirm missing implementations**

Run:

```bash
pnpm test packages/domain/src/matrix/reduce22.test.ts packages/domain/src/matrix/ladini-22/individual.test.ts
```

Expected: FAIL because Matrix domain files do not exist.

- [ ] **Step 3: Implement explicit types and formulas**

Define:

```ts
export const MATRIX_METHOD_CODE = "ladini_22" as const;
export const MATRIX_ENGINE_REVISION = 1 as const;
export const MATRIX_POINT_CODES = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "tl",
  "tr",
  "br",
  "bl",
  "A1",
  "B1",
  "C1",
  "D1",
  "tl1",
  "tr1",
  "br1",
  "bl1"
] as const;
export type MatrixPointCode = (typeof MATRIX_POINT_CODES)[number];
export type MatrixPoints = Readonly<Record<MatrixPointCode, number>>;
```

Implement `reduce22` exactly as:

```ts
export function reduce22(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new MatrixValidationError("Matrix reducer requires a positive integer");
  }
  let current = value;
  while (current > 22) {
    current = String(current)
      .split("")
      .reduce((sum, digit) => sum + Number(digit), 0);
  }
  return current;
}
```

Implement strict ISO date parsing by reconstructing a UTC date and comparing
the resulting `YYYY-MM-DD`. Calculate every point, purpose, zone, and seven-row
energy map exactly as specified in the design. Store the complete expected
`14.03.1990` result as `LADINI_22_GOLDEN_FIXTURES[0]` and have the test compare
the full object, not only selected fields.

- [ ] **Step 4: Run individual domain tests**

Run:

```bash
pnpm test packages/domain/src/matrix/reduce22.test.ts packages/domain/src/matrix/ladini-22/individual.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/matrix
git commit -m "feat: calculate individual Ladini Matrix"
```

---

### Task 4: Add Compatibility, Forecast, Age Cycle, And Method Registry

**Files:**

- Create: `packages/domain/src/matrix/ladini-22/compatibility.ts`
- Create: `packages/domain/src/matrix/ladini-22/compatibility.test.ts`
- Create: `packages/domain/src/matrix/ladini-22/projection.ts`
- Create: `packages/domain/src/matrix/ladini-22/projection.test.ts`
- Create: `packages/domain/src/matrix/ladini-22/engine.ts`
- Create: `packages/domain/src/matrix/method-registry.ts`
- Create: `packages/domain/src/matrix/method-registry.test.ts`
- Create: `packages/domain/src/matrix/index.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Produces `calculateLadini22Compatibility(input)`.
- Produces `calculateLadini22Projection(input)` with current age cycle and one
  selected year forecast.
- Produces `resolveMatrixMethod("ladini_22")` returning `MatrixMethodEngine`.

- [ ] **Step 1: Write compatibility, projection, and registry tests**

```ts
it("builds the composite from two complete individual matrices", () => {
  const result = calculateLadini22Compatibility({
    firstBirthDate: "1990-03-14",
    secondBirthDate: "2000-01-01"
  });
  expect(result.mode).toBe("compatibility");
  expect(result.first.matrix.points.E).toBe(9);
  expect(result.second.matrix.points.E).toBe(8);
  expect(result.composite.points).toMatchObject({
    A: 15,
    B: 4,
    C: 21,
    D: 13,
    E: 17,
    tl: 19,
    tr: 7,
    br: 16,
    bl: 10
  });
  expect(result.composite.zones).toEqual({ purpose: 8, money: 6, love: 9, energy: 21 });
});
```

```ts
it("separates current age cycle from the selected year forecast", () => {
  const projection = calculateLadini22Projection({
    birthDate: "1990-03-14",
    matrix: calculateLadini22Individual({ birthDate: "1990-03-14" }).matrix,
    selectedYear: 2026,
    currentDate: "2026-03-13"
  });
  expect(projection.ageCycle).toMatchObject({ age: 35, pointCode: "tr", arcana: 22 });
  expect(projection.yearForecast).toEqual({
    year: 2026,
    personalYear: 9,
    challenge: 18,
    resource: 5
  });
});

it("changes age on the complete birthday and repeats the cycle after 80", () => {
  const before = projectionFor("1990-03-14", "2020-03-13");
  const birthday = projectionFor("1990-03-14", "2020-03-14");
  const age80 = projectionFor("1940-03-14", "2020-03-14");
  expect(before.ageCycle.age).toBe(29);
  expect(birthday.ageCycle).toMatchObject({ age: 30, pointCode: "tr" });
  expect(age80.ageCycle).toMatchObject({ age: 80, pointCode: "A" });
});

it("resolves the one supported method and rejects every other code", () => {
  expect(resolveMatrixMethod("ladini_22").methodCode).toBe("ladini_22");
  expect(() => resolveMatrixMethod("custom")).toThrow("Unsupported Matrix method");
});
```

- [ ] **Step 2: Run tests and confirm missing behavior**

Run:

```bash
pnpm test packages/domain/src/matrix/ladini-22/compatibility.test.ts packages/domain/src/matrix/ladini-22/projection.test.ts packages/domain/src/matrix/method-registry.test.ts
```

Expected: FAIL because compatibility, projection, and registry modules do not
exist.

- [ ] **Step 3: Implement compatibility and projection**

Compatibility must:

```ts
const compositePoints = Object.fromEntries(
  MATRIX_POINT_CODES.map((code) => [
    code,
    reduce22(first.matrix.points[code] + second.matrix.points[code])
  ])
) as MatrixPoints;
```

Build composite supporting purposes by reducing the matching individual
supporting values, then derive composite zones and the energy map from composite
points. Preserve `first` and `second` in request order.

Projection must parse both dates, calculate age from complete year/month/day,
use `MATRIX_AGE_ORDER = ["A", "tl", "B", "tr", "C", "br", "D", "bl"]`,
select `Math.floor((age % 80) / 10)`, and calculate:

```ts
const personalYear = reduce22(day + month + sumDigits(selectedYear));
const challenge = reduce22(personalYear + matrix.points.E);
const resource = reduce22(personalYear + matrix.points.A);
```

Registry implementation:

```ts
const engines = { ladini_22: ladini22Engine } as const;

export function resolveMatrixMethod(code: string): MatrixMethodEngine {
  const engine = engines[code as keyof typeof engines];
  if (!engine) throw new UnsupportedMatrixMethodError(code);
  return engine;
}
```

Export Matrix from `packages/domain/src/index.ts`.

- [ ] **Step 4: Run the full Matrix domain suite**

Run:

```bash
pnpm test packages/domain/src/matrix
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/matrix packages/domain/src/index.ts
git commit -m "feat: add Matrix compatibility and projections"
```

---

### Task 5: Orchestrate CRM Preview, Linking, Recalculation, And Projection

**Files:**

- Create: `apps/astrologer-api/src/modules/matrix/matrix-http-errors.ts`
- Create: `apps/astrologer-api/src/modules/matrix/matrix.service.test.ts`
- Create: `apps/astrologer-api/src/modules/matrix/matrix.service.ts`

**Interfaces:**

- Consumes `CalculationStore`, `ClientStore`, `AstrologerProfileStore`,
  `SystemClock`, shared Matrix schemas, canonical digests, and Matrix engine.
- Produces service methods `preview`, `createCalculation`, `recalculate`, and
  `projection`.

- [ ] **Step 1: Write failing service tests**

Cover these exact observable behaviors:

```ts
it("hydrates an active CRM client and previews without touching calculation storage", async () => {
  const response = await service.preview(individualPreviewBody(), request);
  expect(response.result.mode).toBe("individual");
  expect(response.result.matrix.points.E).toBe(9);
  expect(calculationStore.findExact).not.toHaveBeenCalled();
  expect(calculationStore.create).not.toHaveBeenCalled();
});

it("rejects missing birth data and non-active relationships", async () => {
  clientStore.getAstrologerClient = vi.fn(async () => ({ ...client, birthData: null }));
  await expect(service.preview(individualPreviewBody(), request)).rejects.toMatchObject({
    response: { code: "MATRIX_CLIENT_BIRTH_DATE_REQUIRED" }
  });
});

it("creates one linked individual record with server-owned snapshots", async () => {
  const response = await service.createCalculation(individualPersistBody(), request);
  expect(calculationStore.create).toHaveBeenCalledWith(
    expect.objectContaining({
      ownerUserId,
      module: "matrix",
      mode: "individual",
      methodCode: "ladini_22",
      linkClientIds: [clientId]
    })
  );
  expect(response.calculation.status).toBe("linked");
});

it("links both compatibility clients and deduplicates the fingerprint independent of request order", async () => {
  await service.createCalculation(compatibilityPersistBody(clientA, clientB), request);
  await service.createCalculation(compatibilityPersistBody(clientB, clientA), request);
  expect(calculationStore.findExact).toHaveBeenCalledTimes(2);
  expect(calculationStore.create).toHaveBeenCalledTimes(1);
});

it("recalculates existing participants without accepting replacement client ids", async () => {
  const response = await service.recalculate(calculationId, {}, request);
  expect(calculationStore.replaceResult).toHaveBeenCalledWith(
    expect.objectContaining({ calculationId, ownerUserId })
  );
  expect(response.calculation.id).toBe(calculationId);
});

it("derives a projection without changing the saved checksum", async () => {
  const response = await service.projection(calculationId, { year: "2026" }, request);
  expect(response.resultChecksum).toBe(savedCalculation.resultChecksum);
  expect(response.projection.yearForecast.year).toBe(2026);
  expect(calculationStore.replaceResult).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run service tests and confirm missing service**

Run:

```bash
pnpm test apps/astrologer-api/src/modules/matrix/matrix.service.test.ts
```

Expected: FAIL because Matrix service files do not exist.

- [ ] **Step 3: Implement preparation and ownership rules**

Implement a private prepared participant shape:

```ts
type HydratedMatrixParticipant = {
  readonly role: "subject" | "partner";
  readonly clientId: string;
  readonly displayName: string;
  readonly birthDate: string;
};
```

For each request participant, call `getAstrologerClient` with the session owner,
require `relationshipStatus === "active"`, non-empty display name, and valid
birth date. Never accept those fields from the request.

Build saved input with method code, engine revision, mode, and canonical
participant snapshots. Sort fingerprint participants by canonical JSON, but
preserve original order in stored participants and compatibility results.

Build result summary with only:

```ts
{
  center: result.mode === "individual" ? result.matrix.points.E : result.composite.points.E,
  personalPurpose: result.mode === "individual" ? result.matrix.purposes.personal : result.composite.purposes.personal,
  money: result.mode === "individual" ? result.matrix.zones.money : result.composite.zones.money,
  love: result.mode === "individual" ? result.matrix.zones.love : result.composite.zones.love
}
```

Use `createCalculation`/`recalculateCalculation` domain use cases and parse all
returned data through Matrix response schemas. Recalculation loads the owned
record, requires `module === "matrix"` and `methodCode === "ladini_22"`, reads
the existing CRM participant IDs, rehydrates them, and replaces only the result.

Projection loads the owned Matrix record, parses saved `inputData`, resolves the
astrologer timezone and current local date from `SystemClock`, and derives the
view without any store mutation.

- [ ] **Step 4: Run service and regression tests**

Run:

```bash
pnpm test apps/astrologer-api/src/modules/matrix/matrix.service.test.ts apps/astrologer-api/src/modules/numerology/numerology.service.test.ts packages/domain/src/calculations
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/astrologer-api/src/modules/matrix
git commit -m "feat: orchestrate Matrix calculations"
```

---

### Task 6: Expose Matrix HTTP Routes And Security Metadata

**Files:**

- Create: `apps/astrologer-api/src/modules/matrix/matrix.controller.ts`
- Create: `apps/astrologer-api/src/modules/matrix/matrix.module.ts`
- Create: `apps/astrologer-api/src/modules/matrix/matrix.e2e.test.ts`
- Modify: `apps/astrologer-api/src/app.module.ts`

**Interfaces:**

- Produces authenticated routes:
  `POST /matrix/preview`, `POST /matrix/calculations`,
  `POST /matrix/calculations/:id/recalculate`, and
  `GET /matrix/calculations/:id/projection?year=YYYY`.

- [ ] **Step 1: Write the failing HTTP security tests**

Use the existing Numerology e2e harness and assert:

```ts
it("keeps preview and projection read-only while requiring authentication", async () => {
  expect((await postJson("/matrix/preview", previewBody())).status).toBe(401);
  expect(
    (await postJson("/matrix/preview", previewBody(), { cookie: sessionCookieHeader() })).status
  ).toBe(200);
  expect(
    (
      await getJson(`/matrix/calculations/${calculationId}/projection?year=2026`, {
        cookie: sessionCookieHeader()
      })
    ).status
  ).toBe(200);
  expect(calculationStore.create).not.toHaveBeenCalled();
  expect(calculationStore.replaceResult).not.toHaveBeenCalled();
});

it("requires CSRF for create and recalculate", async () => {
  expect(
    (await postJson("/matrix/calculations", persistBody(), { cookie: sessionCookieHeader() }))
      .status
  ).toBe(403);
  expect((await postJson("/matrix/calculations", persistBody(), csrfHeaders())).status).toBe(201);
  expect(
    (
      await postJson(
        `/matrix/calculations/${calculationId}/recalculate`,
        {},
        { cookie: sessionCookieHeader() }
      )
    ).status
  ).toBe(403);
});

it("returns stable feature errors without exposing another owner's objects", async () => {
  const missing = await getJson(
    `/matrix/calculations/${otherOwnerCalculationId}/projection?year=2026`,
    csrfHeaders()
  );
  expect(missing.status).toBe(404);
  expect(missing.body).toMatchObject({ code: "MATRIX_CALCULATION_NOT_FOUND" });
});
```

- [ ] **Step 2: Run e2e test and confirm route absence**

Run:

```bash
pnpm test apps/astrologer-api/src/modules/matrix/matrix.e2e.test.ts
```

Expected: FAIL with 404 or missing `MatrixModule`.

- [ ] **Step 3: Implement controller and feature module**

Controller shape:

```ts
@Controller("matrix")
@UseGuards(AstrologerSessionAuthGuard)
export class MatrixController {
  constructor(private readonly matrixService: MatrixService) {}

  @Post("preview")
  @HttpCode(HttpStatus.OK)
  preview(@Body() body: unknown, @Req() request: AstrologerSessionRequest) {
    return this.matrixService.preview(body, request);
  }

  @Post("calculations")
  @RequireCsrf()
  createCalculation(@Body() body: unknown, @Req() request: AstrologerSessionRequest) {
    return this.matrixService.createCalculation(body, request);
  }

  @Post("calculations/:calculationId/recalculate")
  @RequireCsrf()
  recalculate(
    @Param("calculationId") id: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.matrixService.recalculate(id, body, request);
  }

  @Get("calculations/:calculationId/projection")
  projection(
    @Param("calculationId") id: string,
    @Query() query: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.matrixService.projection(id, query, request);
  }
}
```

`MatrixModule` imports `AstrologerProfileModule`, `CalculationsModule`,
`ClientsModule`, `ClockModule`, `IdentityModule`, and `SecurityModule`; provides
`MatrixService`; and owns `MatrixController`. Import only `MatrixModule` in root
`AppModule`.

- [ ] **Step 4: Run e2e, app typecheck, and build**

Run:

```bash
pnpm test apps/astrologer-api/src/modules/matrix/matrix.e2e.test.ts
pnpm --filter @elevenhouse/astrologer-api typecheck
pnpm --filter @elevenhouse/astrologer-api build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/astrologer-api/src/modules/matrix apps/astrologer-api/src/app.module.ts
git commit -m "feat: expose Matrix API routes"
```

---

### Task 7: Synchronize Canonical Docs And Run Broad Verification

**Files:**

- Modify: `docs/architecture/backend-modules.md`
- Modify: `docs/api/api-boundaries.md`
- Modify: `docs/architecture/design-reference-inventory.md`

**Interfaces:**

- Produces an accurate readiness map: Matrix backend core ready; Matrix notes,
  interpretations, AI report, PDF, and frontend still missing.

- [ ] **Step 1: Update canonical documentation with exact routes and boundaries**

Document:

```text
POST /matrix/preview
POST /matrix/calculations
POST /matrix/calculations/:calculationId/recalculate
GET  /matrix/calculations/:calculationId/projection?year=YYYY
```

State explicitly that preview/projection are read-only, persistence is CRM-only
and atomically linked, saved base results exclude forecast/current-age derived
views, and Matrix has no publication route.

- [ ] **Step 2: Run focused suites**

Run:

```bash
pnpm test packages/contracts/src/matrix.test.ts packages/domain/src/matrix apps/astrologer-api/src/modules/matrix
```

Expected: PASS.

- [ ] **Step 3: Run regression suites for shared calculations and Numerology**

Run:

```bash
pnpm test packages/domain/src/calculations packages/contracts/src/calculations.test.ts packages/contracts/src/numerology.test.ts apps/astrologer-api/src/modules/calculations apps/astrologer-api/src/modules/numerology
```

Expected: PASS.

- [ ] **Step 4: Run repository verification**

Run:

```bash
pnpm verify
```

Expected: PASS. If an unrelated pre-existing failure appears, record its exact
command, file, and output; do not weaken Matrix checks or claim broad success.

- [ ] **Step 5: Inspect scope and commit docs**

Run:

```bash
git status --short
git diff --stat
git diff --check
```

Expected: only Matrix/core-digest files and the three canonical docs are part of
this implementation series.

```bash
git add docs/architecture/backend-modules.md docs/api/api-boundaries.md docs/architecture/design-reference-inventory.md
git commit -m "docs: record Matrix backend core"
```

---

## Completion Evidence

Before reporting this backend slice complete, capture:

- all commands and pass/fail totals from Tasks 1–7;
- exact golden fixture values for `14.03.1990`;
- API evidence that preview/projection make no writes;
- API evidence that create/recalculate require CSRF;
- service evidence that compatibility links both owner-scoped CRM clients;
- evidence that projection changes neither result checksum nor saved state;
- `pnpm verify` result or exact unrelated blocker;
- `git status --short` and the commit list created by the plan;
- explicit deferred scope: notes, interpretation catalog, AI report, PDF worker,
  frontend, and disabled chat UI belong to subsequent plans derived from the
  approved production design.
