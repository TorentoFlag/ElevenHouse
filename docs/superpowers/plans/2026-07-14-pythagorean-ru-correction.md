# Pythagorean RU Correction Implementation Plan

> The post-implementation production audit found that the frontend portion of
> this plan was only partially completed. The remaining result-completeness work
> is tracked by `2026-07-14-numerology-result-completeness.md`; later period,
> lifecycle, AI, presentation, and PDF phases are defined in
> `../specs/2026-07-14-numerology-production-completion-design.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the incorrect Numerology implementation with one canonical Pythagorean RU engine, one current saved result per calculation, complete compatibility output, and server-only arithmetic while preserving the existing `/numerology` design.

**Architecture:** A typed Numerology method registry resolves one active engine per method code. Shared `Calculations` stores one current input/result payload and owns linking/publication; recalculation replaces that payload transactionally and invalidates dependent interpretations/artifacts. React requests preview or persistence and only renders validated server results.

**Tech Stack:** TypeScript 6, Zod, NestJS, Drizzle/PostgreSQL, React 19, TanStack Query, Vitest, Computer Use.

## Global Constraints

- `pythagorean` has one implementation; no algorithm-version fields, version registry, compatibility branch, or retained old engine.
- One calculation record has one current saved input/result; no result history and no `calculation_versions` table.
- No method settings are accepted. Canonical rules preserve `11/22/33`, treat `Ё` and `Й` separately, and always calculate core numbers, matrix, and lines.
- Existing visible `/numerology` layout and controls remain unchanged; no setup modal, inline form, drawer, or settings UI.
- All deterministic arithmetic lives in `packages/domain`; frontend fallbacks are forbidden.
- Selecting a client or toggling `Год`/`Совместимость` uses preview and writes nothing.
- `Привязать` sends input only; backend recalculates, persists, and links atomically.
- Preserve the pre-existing user changes in `NumerologyPageView.test.tsx` and `useNumerologyPageController.ts`; do not overwrite or stage their error-banner-removal hunks as agent-owned work.
- Do not start, stop, restart, or kill local processes. Before browser/DB verification, inspect existing ports only.
- Schema changes require a rebuilt baseline migration and a local `pnpm db:reset`.

## File Structure

### Shared calculations

- Modify `packages/domain/src/calculations/calculation-types.ts`: one current saved payload types.
- Modify `packages/domain/src/calculations/calculation-store.ts`: create/replace/link/publish ports without result versions.
- Modify `packages/domain/src/calculations/calculation-use-cases.ts`: in-place recalculation and current-result publication rules.
- Rewrite `packages/domain/src/calculations/index.test.ts`: current-result lifecycle tests.
- Modify `packages/contracts/src/calculations.ts` and tests: remove all method/result version fields.

### Database

- Modify `packages/db/src/schema/calculations/calculation-records.schema.ts`: current JSON/result/fingerprint columns.
- Modify `packages/db/src/schema/calculations/calculation-participants.schema.ts`: remove redundant participant input/override fields.
- Delete `packages/db/src/schema/calculations/calculation-versions.schema.ts`.
- Modify interpretation/artifact schemas and relations to reference calculation only.
- Rewrite `packages/db/src/adapters/calculations/drizzle-calculation-store.ts` and integration tests.
- Rebuild `packages/db/drizzle/` as the current baseline and update schema tests.

### Pythagorean RU method

- Create focused files under `packages/domain/src/numerology/methods/pythagorean-ru/` for profile, reduction, names, periods, matrix, lines, compatibility, engine, and fixtures.
- Create `packages/domain/src/numerology/method-registry.ts`.
- Delete the superseded root-level Pythagorean engine/profile/reduction/name
  files and tests after their new focused replacements are green.
- Modify `packages/domain/src/numerology/numerology-types.ts` and use cases.

### API/contracts/frontend

- Rewrite `packages/contracts/src/numerology.ts` and tests with typed preview/persist/recalculate and result unions.
- Modify Numerology Nest controller/service/tests/e2e for preview and single-result persistence.
- Modify calculation API services for current interpretations/publication.
- Modify Numerology frontend API, queries, models, controller, components, and tests to consume preview/saved results only.

---

### Task 1: Remove Calculation And Algorithm Version Contracts

**Files:**
- Modify: `packages/contracts/src/calculations.ts`
- Modify: `packages/contracts/src/calculations.test.ts`
- Modify: `packages/domain/src/calculations/calculation-types.ts`
- Modify: `packages/domain/src/calculations/calculation-errors.ts`
- Modify: `packages/domain/src/calculations/calculation-store.ts`
- Modify: `packages/domain/src/calculations/calculation-use-cases.ts`
- Modify: `packages/domain/src/calculations/index.test.ts`

**Interfaces:**
- Produces: `CalculationRecord` with `inputData`, `resultData`, `resultSummary`, `resultChecksum`, and `requestFingerprint`; `replaceCalculationResult()`; typed replace outcomes/conflict errors; interpretation/artifact types without `versionId`.
- Consumed by: DB adapter, Nest services, Numerology contracts, frontend.

- [ ] **Step 1: Write failing contract tests for one current result**

Add assertions equivalent to:

```ts
const parsed = calculationRecordResponseSchema.parse({
  id: calculationId,
  ownerUserId,
  module: "numerology",
  mode: "individual",
  methodCode: "pythagorean",
  title: "Голубев Антон, психоматрица",
  status: "calculated",
  requestFingerprint: `sha256:${"a".repeat(64)}`,
  inputData: { participant: { calculationName: "Голубев Антон", calculationNameSource: "crm_display_name", birthDate: "2000-08-19" } },
  resultData: { methodCode: "pythagorean", mode: "individual", keyNumbers: {} },
  resultSummary: { lifePath: 2 },
  resultChecksum: `sha256:${"b".repeat(64)}`,
  participants: [participant],
  links: [],
  interpretations: [],
  artifacts: [],
  createdAt,
  updatedAt
});

expect(parsed).not.toHaveProperty("versions");
expect(parsed).not.toHaveProperty("currentMethodVersion");
```

Also assert `saveCalculationInterpretationRequestSchema.parse({ text: "Ручная трактовка" })` succeeds without `versionId`, and interpretation/artifact responses contain no `versionId`. Participant responses contain no `birthDate`, `inputSnapshot`, or `manuallyOverridden`; exact method input lives once in `calculation.inputData`.

- [ ] **Step 2: Run contract tests and confirm RED**

Run:

```bash
pnpm test packages/contracts/src/calculations.test.ts
```

Expected: FAIL because current schemas require `currentMethodVersion`, `versions`, and `versionId`.

- [ ] **Step 3: Replace contract shapes**

Define the current result fields directly on `calculationRecordResponseSchema`:

```ts
requestFingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
inputData: calculationJsonObjectSchema,
resultData: calculationJsonObjectSchema,
resultSummary: calculationJsonObjectSchema,
resultChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/)
```

Delete `calculationVersionResponseSchema`, `currentMethodVersion`, `versions`,
all `versionId` fields, and participant `birthDate`, `inputSnapshot`, and
`manuallyOverridden`. Rename `calculationSnapshotObjectSchema` to
`calculationJsonObjectSchema` and update exports/imports.

- [ ] **Step 4: Write failing domain lifecycle tests**

Cover:

```ts
expect(created.resultData).toEqual({ lifePath: 2 });
expect(recalculated.resultData).toEqual({ lifePath: 2, expression: 6 });
expect(recalculated.interpretations).toEqual([]);
expect(recalculated.artifacts).toEqual([]);
expect(recalculated.links.every((link) => link.visibility === "private_to_astrologer")).toBe(true);
expect(recalculated).not.toHaveProperty("versions");
```

Add rejection when recalculation changes CRM client IDs or participant roles.
Add a collision case where the new fingerprint belongs to another record and
assert `replaceCalculationResult` rejects without changing either record.
After replacement, assert publication with the old checksum or without a new
approved current interpretation is rejected; after saving and approving a new
interpretation, publication with the new checksum succeeds.

- [ ] **Step 5: Run domain tests and confirm RED**

Run:

```bash
pnpm test packages/domain/src/calculations/index.test.ts
```

Expected: FAIL because `appendVersion` and version-scoped interpretation/publication still exist.

- [ ] **Step 6: Implement the current-result domain model**

Use these signatures:

```ts
export type CalculationSavedData = {
  readonly requestFingerprint: string;
  readonly inputData: unknown;
  readonly resultData: unknown;
  readonly resultSummary: unknown;
  readonly resultChecksum: string;
};

export type CalculationParticipant = {
  readonly role: CalculationParticipantRole;
  readonly source: CalculationParticipantSource;
  readonly clientId: string | null;
  readonly displayName: string;
};

export type CalculationStoreReplaceResultInput = CalculationSavedData & {
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly participants: readonly CalculationParticipant[];
  readonly now: string;
};

export type CalculationStoreReplaceResultOutcome =
  | { readonly status: "updated"; readonly calculation: CalculationRecord }
  | { readonly status: "not_found" }
  | { readonly status: "exact_key_conflict" };

export type CalculationStore = {
  readonly listByOwner: (query: {
    readonly ownerUserId: string;
    readonly module: CalculationModuleFilter;
    readonly status: CalculationStatusFilter;
    readonly limit: number;
    readonly offset: number;
  }) => Promise<CalculationListResult>;
  readonly findByOwnerAndId: (input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
  }) => Promise<CalculationRecord | null>;
  readonly findExact: (input: {
    readonly ownerUserId: string;
    readonly module: CalculationModule;
    readonly mode: CalculationMode;
    readonly methodCode: string;
    readonly requestFingerprint: string;
  }) => Promise<CalculationRecord | null>;
  readonly create: (input: CalculationStoreCreateInput) => Promise<CalculationRecord>;
  readonly replaceResult: (
    input: CalculationStoreReplaceResultInput
  ) => Promise<CalculationStoreReplaceResultOutcome>;
  readonly ensureClientLinks: (input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly clientIds: readonly string[];
    readonly now: string;
  }) => Promise<CalculationRecord | null>;
  readonly linkClient: (input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly clientId: string;
    readonly now: string;
  }) => Promise<CalculationRecord | null>;
  readonly publishClientLink: (input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly clientId: string;
    readonly expectedResultChecksum: string;
    readonly now: string;
  }) => Promise<CalculationRecord | null>;
  readonly saveInterpretation: (input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly source: CalculationInterpretationSource;
    readonly text: string;
    readonly modelId: string | null;
    readonly promptVersion: string | null;
    readonly interpretationIdGenerator: () => string;
    readonly now: string;
  }) => Promise<CalculationRecord | null>;
  readonly approveInterpretation: (input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly interpretationId: string;
    readonly now: string;
  }) => Promise<CalculationRecord | null>;
  readonly archive: (input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly now: string;
  }) => Promise<CalculationRecord | null>;
};

export type CalculationStoreCreateInput = CalculationSavedData & {
  readonly ownerUserId: string;
  readonly module: CalculationModule;
  readonly mode: CalculationMode;
  readonly methodCode: string;
  readonly title: string;
  readonly participants: readonly CalculationParticipant[];
  readonly linkClientIds: readonly string[];
  readonly idGenerator: () => string;
  readonly now: string;
};

export async function replaceCalculationResult(input: {
  readonly store: CalculationStore;
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly participants: readonly CalculationParticipant[];
  readonly savedData: CalculationSavedData;
  readonly now: Date;
}): Promise<CalculationRecord>;
```

Add `CalculationParticipantMismatchError` and `CalculationAlreadyExistsError`
to `calculation-errors.ts`. `replaceCalculationResult` validates stable
participant role/source/client identity, normalizes current data, then maps the
store's `not_found` and `exact_key_conflict` outcomes to typed domain errors.
Publishing uses `expectedResultChecksum` for optimistic race protection. Saving
an interpretation targets the calculation directly.
`store.create` has create-or-return-existing semantics for the unique exact key:
when an owner/module/method/mode/fingerprint record already exists, it returns
that record after idempotently ensuring every `linkClientId`; it never creates a
second record or replaces the existing result.
`ensureClientLinks` performs the same multi-link operation atomically for the
service's pre-engine exact-hit path.

- [ ] **Step 7: Run focused tests and commit**

```bash
pnpm test packages/contracts/src/calculations.test.ts packages/domain/src/calculations/index.test.ts
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/domain typecheck
git add packages/contracts/src/calculations.ts packages/contracts/src/calculations.test.ts packages/domain/src/calculations
git diff --cached --check
git commit -m "refactor: store one current calculation result"
```

Expected: focused tests/typechecks pass.

### Task 2: Rebuild Calculation Persistence Around The Current Result

**Files:**
- Modify: `packages/db/src/schema/calculations/calculation-records.schema.ts`
- Modify: `packages/db/src/schema/calculations/calculation-participants.schema.ts`
- Delete: `packages/db/src/schema/calculations/calculation-versions.schema.ts`
- Modify: `packages/db/src/schema/calculations/calculation-interpretations.schema.ts`
- Modify: `packages/db/src/schema/calculations/calculation-artifacts.schema.ts`
- Modify: `packages/db/src/schema/calculations/relations.schema.ts`
- Modify: `packages/db/src/schema/calculations/index.ts`
- Modify: `packages/db/src/adapters/calculations/drizzle-calculation-store.ts`
- Modify: `packages/db/src/adapters/calculations/drizzle-calculation-store.integration.ts`
- Modify: `packages/db/src/schema.test.ts`
- Regenerate: `packages/db/drizzle/*`

**Interfaces:**
- Consumes: Task 1 `CalculationStore` port.
- Produces: transactional `create`, `replaceResult`, `ensureClientLinks`,
  `linkClient`, `publishClientLink`, and direct calculation interpretation
  persistence.

- [ ] **Step 1: Write failing schema and adapter tests**

Assert schema exports and adapter behavior:

```ts
expect(calculationRecords).toHaveProperty("inputData");
expect(calculationRecords).toHaveProperty("resultData");
expect(calculationRecords).toHaveProperty("requestFingerprint");
expect(calculationSchema).not.toHaveProperty("calculationVersions");
```

Integration scenario:

```ts
const replaced = await store.replaceResult({
  ownerUserId,
  calculationId: created.id,
  participants: created.participants,
  requestFingerprint: fingerprintB,
  inputData: inputB,
  resultData: resultB,
  resultSummary: summaryB,
  resultChecksum: checksumB,
  now
});

expect(replaced?.resultData).toEqual(resultB);
expect(replaced?.interpretations).toEqual([]);
expect(replaced?.artifacts).toEqual([]);
expect(replaced?.links[0]?.visibility).toBe("private_to_astrologer");
```

- [ ] **Step 2: Run DB tests and confirm RED**

```bash
pnpm test packages/db/src/schema.test.ts
POSTGRES_CONTAINER_ID="$(docker compose ps -q postgres)"
POSTGRES_PORT="$(docker port "$POSTGRES_CONTAINER_ID" 5432/tcp | sed -E 's/.*:([0-9]+)$/\1/')"
INTEGRATION_DATABASE_URL="postgresql://elevenhouse:elevenhouse@localhost:${POSTGRES_PORT}/elevenhouse" pnpm test:integration packages/db/src/adapters/calculations/drizzle-calculation-store.integration.ts
```

Expected: FAIL because the existing schema and adapter use `calculation_versions`.

- [ ] **Step 3: Move current payload to `calculation_records`**

Add:

```ts
requestFingerprint: text("request_fingerprint").notNull(),
inputData: jsonb("input_data").notNull(),
resultData: jsonb("result_data").notNull(),
resultSummary: jsonb("result_summary").notNull(),
resultChecksum: text("result_checksum").notNull()
```

Add a unique index over owner/module/method/mode/request fingerprint. Remove
`currentMethodVersion`. Delete the versions schema export and relations. Remove
participant `birth_date`, `input_snapshot`, and `manually_overridden`;
record-level `inputData` is authoritative. Remove `versionId` from
interpretation/artifact schemas; retain their `calculationId` cascade FK.
Name the exact-key index `calculation_records_exact_request_unique`. Add DB
checks that fingerprint/checksum match `^sha256:[a-f0-9]{64}$` and that all
three JSONB payload columns contain objects; cover each constraint in
`schema.test.ts`.

- [ ] **Step 4: Implement transactional replacement**

Inside one DB transaction:

```ts
await tx.delete(calculationInterpretations).where(eq(calculationInterpretations.calculationId, id));
await tx.delete(calculationArtifacts).where(eq(calculationArtifacts.calculationId, id));
await tx.update(calculationClientLinks).set({
  visibility: "private_to_astrologer",
  publishedAt: null,
  updatedAt: now
}).where(eq(calculationClientLinks.calculationId, id));
await updateParticipantMetadataWithoutChangingIdentity(tx, id, participants);
await tx.update(calculationRecords).set({
  requestFingerprint,
  inputData,
  resultData,
  resultSummary,
  resultChecksum,
  status: hasLinks ? "linked" : "calculated",
  updatedAt: now
}).where(and(eq(calculationRecords.id, id), eq(calculationRecords.ownerUserId, ownerUserId)));
```

Publishing compares `expectedResultChecksum` in the same update predicate. Create and initial CRM links occur in one transaction.
Implement insert conflict handling for the exact-key unique index: after a
concurrent `ON CONFLICT DO NOTHING`, select the owner-scoped existing row and
idempotently insert all requested client links in the same transaction. Add an
integration test with two create calls for the same fingerprint and assert one
record plus one link per CRM client.
Before replacement, detect an exact-key collision with another calculation and
return a typed conflict without deleting interpretations/artifacts or changing
either record.
Reconcile participants by stable role/source/client identity and update only
allowed display metadata and ordering on existing rows. Integration tests query
participant row IDs before/after recalculation and assert they stay unchanged.

- [ ] **Step 5: Rebuild the baseline migration**

Delete the generated SQL/meta artifacts with `apply_patch`, leaving the Drizzle folder ready for regeneration, then run:

```bash
pnpm db:generate
rg -n "calculation_versions|current_method_version|method_version|version_id" packages/db/drizzle
rg -n "request_fingerprint|input_data|result_data|result_checksum" packages/db/drizzle
```

Expected: first `rg` returns no matches; second finds the new columns. Do not run `db:reset` until Task 8.

- [ ] **Step 6: Run DB verification and commit**

```bash
pnpm test packages/db/src/schema.test.ts
POSTGRES_CONTAINER_ID="$(docker compose ps -q postgres)"
POSTGRES_PORT="$(docker port "$POSTGRES_CONTAINER_ID" 5432/tcp | sed -E 's/.*:([0-9]+)$/\1/')"
INTEGRATION_DATABASE_URL="postgresql://elevenhouse:elevenhouse@localhost:${POSTGRES_PORT}/elevenhouse" pnpm test:integration packages/db/src/adapters/calculations/drizzle-calculation-store.integration.ts
pnpm --filter @elevenhouse/db typecheck
pnpm --filter @elevenhouse/db build
git add packages/db/src/schema/calculations packages/db/src/schema.test.ts packages/db/src/adapters/calculations packages/db/drizzle
git diff --cached --check
git commit -m "refactor: persist current calculation result"
```

Expected: DB tests/typecheck/build pass and no version table/columns remain.

### Task 3: Implement The Canonical Pythagorean RU Engine

**Files:**
- Create: `packages/domain/src/numerology/method-registry.ts`
- Create: `packages/domain/src/numerology/methods/pythagorean-ru/profile.ts`
- Create: `packages/domain/src/numerology/methods/pythagorean-ru/reduction.ts`
- Create: `packages/domain/src/numerology/methods/pythagorean-ru/name-numbers.ts`
- Create: `packages/domain/src/numerology/methods/pythagorean-ru/period-numbers.ts`
- Create: `packages/domain/src/numerology/methods/pythagorean-ru/psychomatrix.ts`
- Create: `packages/domain/src/numerology/methods/pythagorean-ru/strength-lines.ts`
- Create: `packages/domain/src/numerology/methods/pythagorean-ru/compatibility.ts`
- Create: `packages/domain/src/numerology/methods/pythagorean-ru/engine.ts`
- Create: `packages/domain/src/numerology/methods/pythagorean-ru/golden-fixtures.ts`
- Create: `reduction.test.ts`, `name-numbers.test.ts`,
  `period-numbers.test.ts`, `psychomatrix.test.ts`,
  `strength-lines.test.ts`, `compatibility.test.ts`, and `engine.test.ts`
  beside those method files
- Modify: `packages/domain/src/numerology/numerology-types.ts`
- Modify: `packages/domain/src/numerology/numerology-use-cases.ts`
- Modify: `packages/domain/src/numerology/index.ts`
- Delete: `packages/domain/src/numerology/pythagorean-engine.ts`
- Delete: `packages/domain/src/numerology/pythagorean-engine.test.ts`
- Delete: `packages/domain/src/numerology/pythagorean-profile.ts`
- Delete: `packages/domain/src/numerology/number-reduction.ts`
- Delete: `packages/domain/src/numerology/number-reduction.test.ts`
- Delete: `packages/domain/src/numerology/name-normalization.ts`
- Delete: `packages/domain/src/numerology/name-normalization.test.ts`

**Interfaces:**
- Consumes: method code and typed participant/period request.
- Produces: `pythagoreanRuEngine`, `resolveNumerologyMethod("pythagorean")`, individual/compatibility result types without method version.

- [ ] **Step 1: Add golden fixture tests first**

Define fixtures:

```ts
export const golubevFixture = {
  participant: { calculationName: "Голубев Антон", birthDate: "2000-08-19" },
  expected: {
    keyNumbers: { lifePath: 2, birthday: 1, expression: 6, soul: 6, personality: 9 },
    workingNumbers: { first: 20, second: 2, third: 18, fourth: 9 },
    cells: { "1": "11", "2": "222", "3": "", "4": "", "5": "", "6": "", "7": "", "8": "88", "9": "99" },
    lines: { goal: 2, family: 5, stability: 2, self_esteem: 5, material: 0, talent: 4, spirituality: 4, temperament: 0 }
  }
} as const;
```

Add the second individual and pair expectations explicitly:

```ts
export const koshkinaFixture = {
  participant: { calculationName: "Кошкина Яна Владимировна", birthDate: "2002-03-16" },
  expected: {
    keyNumbers: { lifePath: 5, birthday: 7, expression: 7, soul: 9, personality: 7 },
    workingNumbers: { first: 14, second: 5, third: 12, fourth: 3 },
    cells: { "1": "111", "2": "222", "3": "33", "4": "4", "5": "5", "6": "6", "7": "", "8": "", "9": "" },
    lines: { goal: 4, family: 4, stability: 3, self_esteem: 8, material: 3, talent: 0, spirituality: 4, temperament: 3 }
  }
} as const;

export const compatibilityFixture = {
  pairNumber: 7,
  counts: {
    key_numbers: { match: 0, close: 1, different: 3, tension: 1 },
    psychomatrix: { match: 2, close: 4, different: 3, tension: 0 },
    strength_lines: { match: 1, close: 2, different: 1, tension: 4 },
    total: { match: 3, close: 7, different: 7, tension: 5 }
  },
  conclusion: "mixed"
} as const;
```

Assert five key-number, nine matrix, and eight strength-line comparisons are
returned, and every comparison has `block`, `code`, `valueA`, `valueB`,
`difference`, `relation`, and non-empty `explanation`.

- [ ] **Step 2: Run golden tests and confirm RED**

```bash
pnpm test packages/domain/src/numerology/methods/pythagorean-ru
```

Expected: FAIL because the new engine files do not exist.

- [ ] **Step 3: Implement canonical reduction and profile**

Use one policy:

```ts
export const MASTER_NUMBERS = new Set([11, 22, 33]);

function assertNonNegativeInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new NumerologyValidationError("Reduction input must be a non-negative integer");
  }
}

export function reduceScalar(value: number): number {
  assertNonNegativeInteger(value);
  let current = value;
  while (current > 9 && !MASTER_NUMBERS.has(current)) {
    current = [...String(current)].reduce((sum, digit) => sum + Number(digit), 0);
  }
  return current;
}

export function reduceFully(value: number): number {
  assertNonNegativeInteger(value);
  let current = value;
  while (current > 9) current = [...String(current)].reduce((sum, digit) => sum + Number(digit), 0);
  return current;
}
```

`assertNonNegativeInteger` throws `NumerologyValidationError` for negative,
fractional, or non-finite input; the psychomatrix computes the absolute third
working number before reduction. Define the profile's exact repeating 1-9
Russian table and vowels:

```ts
const LETTER_VALUES = {
  а: 1, и: 1, с: 1, ъ: 1,
  б: 2, й: 2, т: 2, ы: 2,
  в: 3, к: 3, у: 3, ь: 3,
  г: 4, л: 4, ф: 4, э: 4,
  д: 5, м: 5, х: 5, ю: 5,
  е: 6, н: 6, ц: 6, я: 6,
  ё: 7, о: 7, ч: 7,
  ж: 8, п: 8, ш: 8,
  з: 9, р: 9, щ: 9
} as const;
const VOWELS = new Set(["а", "е", "ё", "и", "о", "у", "ы", "э", "ю", "я"]);
```

The profile also contains the eight line definitions, line-level labels,
compatibility thresholds, and deterministic explanation text. It contains no
`methodVersion` or user settings.

- [ ] **Step 4: Implement strict name normalization**

Accept Cyrillic letters plus space, hyphen, straight/curly apostrophe. Lowercase, remove separators, keep `ё` and `й` distinct, and throw `NumerologyValidationError` on the first unsupported character. Require at least one vowel and consonant.

Run:

```bash
pnpm test packages/domain/src/numerology/methods/pythagorean-ru/name-numbers.test.ts
```

Expected: PASS for `Голубев Антон`, `Кошкина Яна Владимировна`, `Ё`, and `Й`; reject Latin, digits, and emoji.

- [ ] **Step 5: Implement periods, matrix, and lines**

The matrix working numbers must use:

```ts
const first = sum(dateDigits);
const second = reduceFully(first);
const firstBirthDayDigit = Number(String(dayNumber)[0]);
const third = Math.abs(first - 2 * firstBirthDayDigit);
const fourth = reduceFully(third);
```

Period requests are independent:

```ts
type PythagoreanPeriodsRequest = {
  readonly personalYear?: { readonly year: number };
  readonly personalMonths?: { readonly year: number };
  readonly personalDay?: { readonly date: string };
};
```

Use these exact formulas: personal year is birth-day digit sum plus birth-month
digit sum plus target-year digit sum, then `reduceScalar`; personal month is the
personal-year value plus target month; personal day is the personal-month value
plus the target-day digit sum. Returned period items carry their explicit target
year/month/date. `personalMonths` returns all twelve months from the requested
year.

Define lines exactly as `goal=147`, `family=258`, `stability=369`,
`self_esteem=123`, `material=456`, `talent=789`, `spirituality=159`, and
`temperament=357`. Sum matrix cell counts, then classify `0=absent`, `1=weak`,
`2=moderate`, `3=expressed`, and `4+=strong`.

Run:

```bash
pnpm test packages/domain/src/numerology/methods/pythagorean-ru/period-numbers.test.ts packages/domain/src/numerology/methods/pythagorean-ru/psychomatrix.test.ts packages/domain/src/numerology/methods/pythagorean-ru/strength-lines.test.ts
```

Expected: `07.01.2000` yields `10,1,4,4`; line levels exactly match the approved scale; future target periods pass.

- [ ] **Step 6: Implement complete compatibility**

Every comparison has:

```ts
type PythagoreanComparison = {
  readonly block: "key_numbers" | "psychomatrix" | "strength_lines";
  readonly code: string;
  readonly valueA: number;
  readonly valueB: number;
  readonly difference: number;
  readonly relation: "match" | "close" | "different" | "tension";
  readonly explanation: string;
};
```

Compare only life path, birthday, expression, soul, and personality as key
numbers; then all 9 cells and 8 lines. For key numbers classify absolute
difference `0=match`, `1=close`, `2..3=different`, `4+=tension`. For matrix and
line counts use `0=match`, `1=close`, `2=different`, `3+=tension`. Build four
zones referencing comparison codes, per-block and total counts, and pair number.
Return no conclusion for zero comparisons; otherwise return `harmonious` when
`match + close > different + tension`, `attention` when
`tension >= match + close`, and `mixed` in the remaining case. Include the
inputs to this rule and a non-empty explanation in the result.

- [ ] **Step 7: Add the typed method registry**

```ts
const engines = {
  pythagorean: pythagoreanRuEngine
} as const satisfies Record<NumerologyMethodCode, NumerologyMethodEngine>;

export function resolveNumerologyMethod(code: NumerologyMethodCode) {
  const engine = engines[code];
  if (!engine) throw new UnsupportedNumerologyMethodError(code);
  return engine;
}
```

Do not add inactive Vedic/Kabbalistic/Author placeholders to the active union.

- [ ] **Step 8: Run domain verification and commit**

```bash
pnpm test packages/domain/src/numerology
pnpm --filter @elevenhouse/domain typecheck
pnpm --filter @elevenhouse/domain build
git add packages/domain/src/numerology
git diff --cached --check
git commit -m "fix: implement canonical Pythagorean calculations"
```

Expected: all golden and edge tests pass; `rg -n "methodVersion|pythagoreanProfileV1" packages/domain/src/numerology` returns no matches.

### Task 4: Define Typed Numerology API Contracts

**Files:**
- Modify: `packages/contracts/src/numerology.ts`
- Modify: `packages/contracts/src/numerology.test.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Consumes: Task 3 method input/result field names and Task 1 calculation record contract.
- Produces: preview/persist/recalculate requests and discriminated result responses for API/frontend.

- [ ] **Step 1: Write failing request tests**

Assert:

```ts
previewNumerologyRequestSchema.parse({
  mode: "individual",
  methodCode: "pythagorean",
  participants: [{
    role: "subject",
    source: "crm_client",
    clientId
  }],
  periodRequest: {
    kind: "explicit",
    personalMonths: { year: 2027 }
  }
});
```

Use a strict discriminated participant union. A CRM participant accepts only
`role`, `source: "crm_client"`, and `clientId`; the backend hydrates its current
display label, calculation name, calculation-name source, and birth date from
the owner-scoped CRM record. A manual participant accepts `role`,
`source: "manual"`, `clientId: null`, `displayName`, `calculationName`,
`calculationNameSource: "manual_entry"`, and `birthDate`, but current UI does
not expose manual entry. Reject a missing manual calculation name, unsupported
method, invalid/future birth date, duplicate compatibility client, malformed
future period, and all `settings`, `methodVersion`, or result fields.
Also accept `{ periodRequest: { kind: "current_year" } }` for the existing
`Год` control. The domain engine never receives this intent directly; the API
resolves it to explicit `personalYear` and `personalMonths` targets.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm test packages/contracts/src/numerology.test.ts
```

Expected: FAIL because current contracts require settings and expose versions.

- [ ] **Step 3: Implement request/result schemas**

Use a discriminated request union on `mode` and literal method code. Define:

```ts
type NumerologyPeriodRequest =
  | { readonly kind: "current_year" }
  | {
      readonly kind: "explicit";
      readonly personalYear?: { readonly year: number };
      readonly personalMonths?: { readonly year: number };
      readonly personalDay?: { readonly date: string };
    };

previewNumerologyRequestSchema
persistNumerologyCalculationRequestSchema // preview fields + title
recalculateNumerologyCalculationRequestSchema // preview fields + title optional
pythagoreanIndividualResultSchema
pythagoreanCompatibilityResultSchema
numerologyPreviewResponseSchema // { result }
numerologyCalculationResponseSchema // { calculation, result }
```

Explicit years are integers from `1` through `9999`; `personalDay.date` is a
real four-digit ISO calendar date and may be in the future. Require at least one
explicit period member when `kind` is `explicit`; reject unknown keys.

`createNumerologyAiDraftRequestSchema` is an empty strict object because there is only one current saved result.

- [ ] **Step 4: Add response integrity checks**

`numerologyCalculationResponseSchema` must verify `calculation.resultData` deep-equals the parsed `result`, method/mode match the record, and `resultChecksum` has the expected SHA-256 format.

- [ ] **Step 5: Verify and commit**

```bash
pnpm test packages/contracts/src/numerology.test.ts packages/contracts/src/calculations.test.ts
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/contracts build
git add packages/contracts/src/numerology.ts packages/contracts/src/numerology.test.ts packages/contracts/src/index.ts
git diff --cached --check
git commit -m "refactor: type current numerology results"
```

### Task 5: Add Side-Effect-Free Preview And Atomic Persistence API

**Files:**
- Modify: `apps/astrologer-api/src/modules/numerology/numerology.controller.ts`
- Modify: `apps/astrologer-api/src/modules/numerology/numerology.service.ts`
- Modify: `apps/astrologer-api/src/modules/numerology/numerology.module.ts`
- Modify: `apps/astrologer-api/src/modules/astrologer-profile/astrologer-profile.module.ts`
- Create: `apps/astrologer-api/src/modules/numerology/numerology-http-errors.ts`
- Create: `apps/astrologer-api/src/modules/numerology/numerology-digests.ts`
- Create: `apps/astrologer-api/src/modules/numerology/numerology-digests.test.ts`
- Modify: `apps/astrologer-api/src/modules/numerology/numerology.service.test.ts`
- Modify: `apps/astrologer-api/src/modules/numerology/numerology.e2e.test.ts`
- Modify: `apps/astrologer-api/src/modules/calculations/calculations.controller.ts`
- Modify: `apps/astrologer-api/src/modules/calculations/calculations.service.ts`
- Modify: `apps/astrologer-api/src/modules/calculations/calculations.service.test.ts`

**Interfaces:**
- Consumes: Tasks 1-4 domain/store/contracts.
- Produces: `POST /numerology/preview`, atomic persist/link, current-result recalculation, current-result AI request.

- [ ] **Step 1: Write failing preview and persistence tests**

Cover:

```ts
const preview = await service.preview(body, request);
expect(preview.result.keyNumbers.lifePath).toBe(2);
expect(store.create).not.toHaveBeenCalled();

const saved = await service.createCalculation(body, request);
expect(store.create).toHaveBeenCalledWith(expect.objectContaining({
  requestFingerprint: expect.stringMatching(/^sha256:/),
  linkClientIds: [clientId]
}));
```

Call create twice and assert the second call returns the same calculation ID,
does not invoke the engine again after exact lookup, and leaves one record with
idempotent client links. Add reversed compatibility order returning the same
canonical pair fingerprint and calculation ID, a concurrent adapter-conflict
case, foreign-client rejection, and recalculation with changed client ID
rejection.
At controller/e2e level, assert preview succeeds for an authenticated astrologer
without CSRF metadata and performs no mutation, while create, recalculate,
interpretation, link, and publication routes still reject a missing/invalid CSRF
token.
Assert structured error bodies: malformed input and
`NumerologyValidationError` map to `400/NUMEROLOGY_VALIDATION_FAILED`, an
unowned CRM participant maps to non-enumerating `404/CLIENT_NOT_FOUND`, an
unsupported method maps to `422/UNSUPPORTED_NUMEROLOGY_METHOD`, a participant
identity change during recalculation maps to
`409/CALCULATION_PARTICIPANT_MISMATCH`, and invalid saved result JSON maps to
`500/CALCULATION_RESULT_INTEGRITY_ERROR` without leaking persisted content. A
recalculation whose exact key belongs to another record maps to
`409/CALCULATION_ALREADY_EXISTS` and leaves both records unchanged.
Missing or invalid persisted astrologer timezone for `current_year` maps to
`409/ASTROLOGER_TIMEZONE_REQUIRED`, not a server-time fallback.
With `SystemClock` fixed at `2026-12-31T22:30:00.000Z` and profile timezone
`Europe/Moscow`, assert `current_year` resolves to explicit target `2027`; the
same instant in `America/New_York` resolves to `2026`. Assert the resolved year,
not the intent token or browser time, participates in the fingerprint.
Change only CRM birth time/place fields and assert the canonical Numerology
input, fingerprint, and deterministic result stay unchanged. Open an existing
saved calculation and assert the engine is not called; invalid method JSON or a
checksum mismatch returns the integrity error. For AI draft, assert only a
validated current stored result is sent to AI and the returned interpretation
cannot mutate `resultData` or `resultChecksum`.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm test apps/astrologer-api/src/modules/numerology apps/astrologer-api/src/modules/calculations
```

Expected: FAIL because preview and current-result contracts do not exist.

- [ ] **Step 3: Implement preview**

Add:

```ts
@Post("preview")
preview(@Body() body: unknown, @Req() request: AstrologerSessionRequest) {
  return this.numerologyService.preview(body, request);
}
```

The service validates CRM ownership, hydrates CRM participant data from
`ClientStore`, records `calculationNameSource: "crm_display_name"`, resolves
`pythagorean`, calculates, validates its own result schema, and returns it
without calculation-store calls.
Preview remains an authenticated, side-effect-free POST and therefore does not
receive `@RequireCsrf()`. It still enforces the current astrologer session and
participant ownership. Every state-changing route retains `@RequireCsrf()`.
Centralize error-to-HTTP mapping in `numerology-http-errors.ts`; controllers
remain thin and domain validation failures do not fall through to a generic
500 response.
Export `ASTROLOGER_PROFILE_STORE` from `AstrologerProfileModule`, import that
module into `NumerologyModule`, and resolve `current_year` using `SystemClock`
plus the owner profile's validated IANA timezone. Convert the instant with
`Intl.DateTimeFormat("en", { timeZone, year: "numeric" })`; reject a missing or
invalid profile timezone explicitly instead of falling back to the API host or
browser timezone.

- [ ] **Step 4: Implement canonical fingerprints and persistence**

Canonicalize JSON recursively by sorted keys. Compatibility fingerprint identity uses sorted CRM IDs while saved roles remain unchanged. Hash only server-validated input:

```ts
type JsonValue = null | boolean | number | string | readonly JsonValue[] | {
  readonly [key: string]: JsonValue;
};

export function sha256CanonicalJson(value: JsonValue): `sha256:${string}` {
  const hex = createHash("sha256").update(stableJson(value)).digest("hex");
  return `sha256:${hex}`;
}

const requestFingerprint = sha256CanonicalJson(canonicalInput);
const resultChecksum = sha256CanonicalJson(result);
```

Keep canonical JSON/digest logic in `numerology-digests.ts`; test recursive key
ordering, array order preservation, UTF-8 Cyrillic input, and the exact
`sha256:` plus 64-lowercase-hex format. On every saved-result read, validate the
method result schema and verify its recomputed checksum before returning it.

On create, hydrate/validate input and compute the fingerprint before engine
execution. If the exact owner/module/method/mode/fingerprint record exists,
idempotently ensure its client links and return its validated stored result
without recalculation. Otherwise run the engine; never accept preview result
data from the browser. Store the server result and link all CRM participant IDs
in one adapter transaction. The adapter's unique-conflict path returns the same
record safely if two requests race.

- [ ] **Step 5: Implement in-place recalculation and direct interpretations**

Recalculate reruns the engine and calls `replaceCalculationResult`. AI draft and manual interpretation operations address only the calculation; publication passes `expectedResultChecksum`.

- [ ] **Step 6: Verify and commit**

```bash
pnpm test apps/astrologer-api/src/modules/numerology apps/astrologer-api/src/modules/calculations
pnpm --filter @elevenhouse/astrologer-api typecheck
pnpm --filter @elevenhouse/astrologer-api build
git add apps/astrologer-api/src/modules/numerology apps/astrologer-api/src/modules/calculations
git diff --cached --check
git commit -m "feat: add deterministic numerology preview"
```

### Task 6: Make The Existing Numerology UI Server-Driven

**Files:**
- Modify: `apps/astrologer-web/src/features/numerology/api/numerologyApi.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyQueries.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyHooks.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyFormModel.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyFormModel.test.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyPageModel.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyPageModel.test.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyWorkspaceModel.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyWorkspaceModel.test.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyResultModel.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyResultPanelModel.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyResultPanelModel.test.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyCompatibilityFlowModel.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyCompatibilityFlowModel.test.ts`
- Modify: `apps/astrologer-web/src/pages/numerology/useNumerologyPageController.ts`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx`
- Modify: `apps/astrologer-web/src/features/numerology/components/NumerologyResultPanel.tsx`
- Modify: `apps/astrologer-web/src/features/numerology/components/YearMonthsPanel.tsx`
- Modify: `apps/astrologer-web/src/features/numerology/components/CompatibilityWorkspace.tsx`
- Modify: `apps/astrologer-web/src/features/numerology/components/NumerologyResultPanel.structure.test.ts`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx`

**Interfaces:**
- Consumes: Task 4 response contracts and Task 5 endpoints.
- Produces: unchanged visible UI backed only by preview/current saved results.

- [ ] **Step 1: Preserve and identify pre-existing user hunks**

Run:

```bash
git diff -- apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx apps/astrologer-web/src/pages/numerology/useNumerologyPageController.ts
```

Record that the existing hunks remove the missing-partner error banner. Do not revert them. During commits, use `git add -p` for overlapping files and inspect cached diff.

- [ ] **Step 2: Write failing frontend behavior tests**

Add tests proving:

```ts
expect(source).not.toContain("calculatePersonalYear");
expect(source).not.toContain("new Date(");
expect(source).not.toContain("getFullYear(");
expect(source).not.toContain("currentDate");
expect(source).not.toContain("buildPersonalMonthItems");
expect(workspace.strengthLines.find((line) => line.code === "self_esteem")).toBeDefined();
expect(workspace.compatibility?.counts.total).toEqual({ match: 3, close: 7, different: 7, tension: 5 });
```

Controller tests must prove client selection and toggles call preview only, and `Привязать` calls persist once.

- [ ] **Step 3: Run and confirm RED**

```bash
pnpm test apps/astrologer-web/src/features/numerology apps/astrologer-web/src/pages/numerology
```

Expected: FAIL because current code injects browser-year/month calculations and auto-persists on selection.

- [ ] **Step 4: Add preview queries and explicit persistence mutation**

Define API functions:

```ts
previewNumerology(input: PreviewNumerologyRequest): Promise<NumerologyPreviewResponse>
persistNumerology(input: PersistNumerologyCalculationRequest): Promise<NumerologyCalculationResponse>
recalculateNumerology(id: string, input: RecalculateNumerologyCalculationRequest): Promise<NumerologyCalculationResponse>
```

Preview query keys include canonical participant IDs/manual input, mode, and
period request. For the current CRM-only UI, the query is enabled only when the
required selected clients expose a display name and birth date; the request
still sends only their IDs and the server rehydrates authoritative values.

- [ ] **Step 5: Map existing controls without changing design**

- Client picker changes preview input only.
- `Год` adds/removes `{ periodRequest: { kind: "current_year" } }` in preview
  input. React never reads the browser clock; render labels only from explicit
  target years returned by the server.
- `Совместимость` changes mode and adds partner input; missing partner remains a neutral waiting state, preserving the existing user change.
- `Привязать` invokes persistence with current input, then replaces preview display with the saved response.

Do not add buttons, panels, modal state, or CSS layout changes.

- [ ] **Step 6: Remove frontend arithmetic and render complete server output**

Delete personal-year fallback, month reduction, line classification, and compatibility aggregation. Map snake_case codes directly. Render comparison difference, relation, explanation, zones, counts, and conclusion in the existing compatibility panel structure.

- [ ] **Step 7: Verify visual structure tests and commit only agent-owned hunks**

```bash
pnpm test apps/astrologer-web/src/features/numerology apps/astrologer-web/src/pages/numerology
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-web build
git add apps/astrologer-web/src/features/numerology
git add -p apps/astrologer-web/src/pages/numerology
git diff --cached --check
git diff --cached -- apps/astrologer-web/src/pages/numerology
git commit -m "fix: render server numerology results"
```

Expected: tests/typecheck/build pass; cached diff does not accidentally absorb pre-existing user hunks unless they became inseparable from the requested implementation and are explicitly reported.

### Task 7: Align Durable Architecture And API Documentation

**Files:**
- Modify: `docs/architecture/design-reference-inventory.md`
- Modify: `docs/architecture/backend-modules.md`
- Modify: `docs/api/api-boundaries.md`
- Modify: `docs/development/commands.md` if Task 2 introduced a new verified command detail
- Modify: `docs/superpowers/specs/2026-07-05-numerology-calculations-design.md` only to add a superseded-by pointer, not to rewrite history

**Interfaces:**
- Consumes: implemented routes, domain boundaries, and persistence model.
- Produces: durable current documentation after the execution spec.

- [ ] **Step 1: Write the stale-inventory check**

Run:

```bash
rg -n "Numerology.*future|Numerology.*missing|calculation_versions|methodVersion|setup modal" docs/architecture docs/api docs/superpowers/specs/2026-07-05-numerology-calculations-design.md
```

Expected: stale Numerology status and old design concepts are found.

- [ ] **Step 2: Update canonical docs**

- Inventory: mark Numerology contracts/domain/API/frontend as ready only after their tests pass; describe current gaps such as PDF/AI if still unimplemented.
- Backend modules: document typed method registry, one active engine per code, one current saved result.
- API boundaries: add `POST /numerology/preview`, current create/recalculate
  semantics, CRM server hydration, timezone-aware `current_year`, and the
  explicit no-result-from-frontend rule.
- Old spec: add a top note linking the 2026-07-14 correction design.

- [ ] **Step 3: Verify and commit**

```bash
rg -n "calculation_versions|methodVersion|Pythagorean v1|Pythagorean v2" docs/architecture docs/api
git diff --check -- docs
git add docs/architecture/design-reference-inventory.md docs/architecture/backend-modules.md docs/api/api-boundaries.md docs/superpowers/specs/2026-07-05-numerology-calculations-design.md
git diff --cached --check
git commit -m "docs: align Numerology architecture"
```

Expected: first `rg` returns no stale current-architecture claims; docs diff check passes.

### Task 8: Reset Local DB, Recreate Test Clients, And Verify End To End

**Files:**
- No production file changes expected.
- May update tests only if verification reveals a genuine missing requirement; return to the owning earlier task's RED-GREEN cycle before editing.

**Interfaces:**
- Consumes: all implementation tasks.
- Produces: fresh DB, restored test fixtures, browser and repository evidence.

- [ ] **Step 1: Inspect existing services without managing them**

Run:

```bash
lsof -nP -iTCP:3002 -sTCP:LISTEN
lsof -nP -iTCP:5174 -sTCP:LISTEN
docker compose ps postgres
docker port "$(docker compose ps -q postgres)" 5432/tcp
curl -fsS http://localhost:3002/health
curl -fsS http://localhost:5174/numerology >/dev/null
```

Expected: API/web respond and the active ElevenHouse PostgreSQL host port is
identified. Do not assume root `.env` port `5432` is the active ElevenHouse DB,
because another repository may own that port. If any required service is
absent, stop and report; do not start it.

- [ ] **Step 2: Run pre-reset verification**

```bash
pnpm test packages/domain/src/calculations packages/domain/src/numerology packages/contracts/src/calculations.test.ts packages/contracts/src/numerology.test.ts apps/astrologer-api/src/modules/calculations apps/astrologer-api/src/modules/numerology apps/astrologer-web/src/features/numerology apps/astrologer-web/src/pages/numerology
POSTGRES_CONTAINER_ID="$(docker compose ps -q postgres)"
POSTGRES_PORT="$(docker port "$POSTGRES_CONTAINER_ID" 5432/tcp | sed -E 's/.*:([0-9]+)$/\1/')"
INTEGRATION_DATABASE_URL="postgresql://elevenhouse:elevenhouse@localhost:${POSTGRES_PORT}/elevenhouse" pnpm test:integration packages/db/src/adapters/calculations/drizzle-calculation-store.integration.ts
```

Expected: all focused tests pass against disposable integration state.

- [ ] **Step 3: Obtain explicit lifecycle authorization for stale services**

Compare the running API command with the code just built. A long-running
`node apps/astrologer-api/dist/main.js` process predating this implementation
cannot serve the new contracts after build. Report the exact API PID and port
`3002`, explain that schema reset plus browser E2E requires that process to be
restarted, and obtain the user's explicit restart command before proceeding. If
authorized, stop only that identified API process immediately before Step 4;
leave frontend, workers, PostgreSQL, Redis, and all unrelated processes alone.
Do not reset the DB, stop, or restart anything without that explicit command.

- [ ] **Step 4: Reset the authorized local development DB**

Run:

```bash
POSTGRES_CONTAINER_ID="$(docker compose ps -q postgres)"
POSTGRES_PORT="$(docker port "$POSTGRES_CONTAINER_ID" 5432/tcp | sed -E 's/.*:([0-9]+)$/\1/')"
DATABASE_URL="postgresql://elevenhouse:elevenhouse@localhost:${POSTGRES_PORT}/elevenhouse" pnpm db:reset
```

Expected: safety guard confirms a local DB, baseline migration applies, platform
seed completes. If the command refuses the target, stop; do not bypass the
guard. After a successful reset, restart only the API process authorized in Step
3 with its existing launch command, active ElevenHouse DB/Redis overrides, and
port `3002`; then require `curl -fsS http://localhost:3002/health` to pass before
opening the product flow.

- [ ] **Step 5: Re-authenticate and recreate the two test clients with Computer Use**

Use the already-open Chrome window. Because reset invalidates sessions, complete local passwordless login using the existing local delivery workflow without restarting services. Recreate and relate to astrologer `+78005553535`:

```text
Голубев Антон — 19.08.2000 12:45 — Калининск, Саратовская область
Кошкина Яна Владимировна — 16.03.2002 16:30 — Москва
```

Do not submit these values to any non-local destination.

- [ ] **Step 6: Verify DB invariants read-only**

Run from the repository root. This detects the active ElevenHouse container
port, uses the DB package's existing `tsx` and `pg` dependencies, and issues
read-only queries; it does not require a separate `psql` binary:

```bash
POSTGRES_CONTAINER_ID="$(docker compose ps -q postgres)"
POSTGRES_PORT="$(docker port "$POSTGRES_CONTAINER_ID" 5432/tcp | sed -E 's/.*:([0-9]+)$/\1/')"
DATABASE_URL="postgresql://elevenhouse:elevenhouse@localhost:${POSTGRES_PORT}/elevenhouse" pnpm --silent --filter @elevenhouse/db exec tsx -e '
import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const queries = [
  "select to_regclass(\x27public.calculation_versions\x27) as removed_versions_table",
  "select column_name from information_schema.columns where table_schema = \x27public\x27 and table_name = \x27calculation_records\x27 order by ordinal_position",
  "select count(*)::int as numerology_records from calculation_records where module = \x27numerology\x27",
  `select profiles.display_name_snapshot, birth.birth_date, birth.birth_time,
          birth.birth_place_text, identities.phone_number
     from client_astrologer_relationships relationships
     join client_profiles profiles on profiles.user_id = relationships.client_user_id
     join client_birth_data birth on birth.client_user_id = relationships.client_user_id
     join auth_identities identities
       on identities.user_id = relationships.astrologer_user_id
      and identities.provider = \x27phone\x27
    where profiles.display_name_snapshot in (\x27Голубев Антон\x27, \x27Кошкина Яна Владимировна\x27)
      and identities.phone_number = \x27+78005553535\x27
    order by profiles.display_name_snapshot`
];
void (async () => {
  try {
    for (const query of queries) console.table((await pool.query(query)).rows);
  } finally {
    await pool.end();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
'
```

Prove:

- both CRM relationships and birth records exist;
- `calculation_versions` does not exist;
- calculation records have current input/result/fingerprint columns;
- no Numerology calculations exist before UI interaction.

- [ ] **Step 7: Verify the browser flow through Computer Use**

In the existing `/numerology` tab:

1. Select Golubev; verify the golden individual values and query DB to confirm zero records were created.
2. Toggle `Год`; verify the target year matches the running instant in the
   astrologer's saved timezone, year/month values and labels are server-returned,
   and DB count remains zero.
3. Toggle compatibility and select Koshkina; verify pair number `7`, all comparison blocks, counts `3/7/7/5`, conclusion `mixed`, and no DB write.
4. Click `Привязать`; verify exactly one record exists and both CRM links are present.
5. Reload/open the saved calculation; verify it renders without recalculation or browser-clock mutation.
6. Reverse participant selection; verify no duplicate logical pair record is created.

Capture accessibility state/screenshots for the final evidence. Do not change the visual design.

- [ ] **Step 8: Run final verification**

```bash
pnpm verify
git diff --check
git status --short
```

Expected: every command passes. Review status and confirm only pre-existing user changes and any intentionally uncommitted plan artifacts remain.

- [ ] **Step 9: Final scoped review**

Run:

```bash
rg -n "methodVersion|currentMethodVersion|calculationVersions|calculation_versions|pythagoreanProfileV1" apps packages docs/architecture docs/api
rg -n "calculatePersonalYear|buildPersonalMonthItems|new Date\(\)\.getFullYear" apps/astrologer-web/src/features/numerology apps/astrologer-web/src/pages/numerology
git log --oneline --decorate -10
```

Expected: no old method/result versioning or frontend arithmetic remains; commits are scoped and ordered.
