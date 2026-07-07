# Product Type Aware Constructor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each product type open a focused creation scenario with only relevant fields while preserving the full cube-based constructor for `custom`.

**Architecture:** Keep the existing contract-backed `ProductFormDraft` and `Products` API as the source of persisted product state. Add a type-definition layer in the products feature model that describes which sections are primary, advanced, fixed, or hidden for each product type. Render the constructor from those definitions so `custom` keeps the full builder, while standard product types become guided forms backed by the same draft-to-contract normalization.

**Tech Stack:** React + Vite + TypeScript in `apps/astrologer-web`, shared Zod contracts in `packages/contracts`, product taxonomy in `packages/validation`, Vitest/Testing Library, existing browser QA on `localhost:5174/products`.

---

## Current-State Diagnosis

- `createDefaultProductDraft(type)` already applies different defaults per type in `apps/astrologer-web/src/features/products/model/productDraft.ts`.
- `ProductConstructorEditor` always renders the same section list: basic sections, methods, client data, access grants, modifiers, included items.
- Shared contracts already support the core fields needed for this slice: `type`, `executionMode`, `paymentModel`, `durationLabel`, `slaLabel`, package settings, subscription settings, participant settings, delivery formats, required client data, methods, access grants, included items, and modifiers.
- The right first implementation is not a DB rewrite. It is a product-type scenario layer that controls UI composition and payload normalization on top of the existing contract.
- Future contours remain out of this slice: real course curriculum, content library, availability slots, booking policies, subscription lifecycle, and generated artifacts. The UI can name those concepts only when they map to current fields or are clearly stored as included/access metadata.

## Product Decisions Locked For This Slice

- `custom` is the full cube constructor.
- Other product types are guided scenarios.
- Hidden fields must not silently leak stale values into create/update payloads when they are not applicable to the selected type.
- Advanced settings are allowed, but only as a deliberate disclosure for secondary controls.
- No localStorage, mocks, fake backend success, or visual-only state.
- No global state manager. Keep current local flow state through `useProductCreateFlow`.

## Product Type Field Matrix

### `single` · Разовая консультация

Primary sections:
- Media
- Name and price
- Consultation setup: duration, live/online delivery format, meeting/result format
- Client intake: required chart data and question/event when selected by method
- Method/system
- Included items
- Preview

Advanced sections:
- Participants
- Access grants
- Modifiers

Fixed/default behavior:
- `paymentModel: "once"`
- `executionMode: "live"`
- `durationLabel: "60 мин"`
- `deliveryFormats: ["video"]`
- `requiredClientData: ["chart1"]`
- `methods: ["natal"]`

### `pack` · Пакет консультаций

Primary sections:
- Media
- Name and price
- Package setup: session count, per-session duration, package discount
- Client intake
- Method/system
- Included items
- Preview

Advanced sections:
- Participants
- Access grants
- Modifiers

Fixed/default behavior:
- `paymentModel: "pack"`
- `executionMode: "live"`
- `packageSessionCount` required
- `durationLabel` describes the package, for example `3 × 60 мин`

### `async` · Разбор в записи

Primary sections:
- Media
- Name and price
- Result format: video/audio/text/file
- SLA
- Client intake: question, chart data, event/city where relevant
- Method/system
- Included items
- Preview

Advanced sections:
- Modifiers
- Access grants

Fixed/default behavior:
- `paymentModel: "once"`
- `executionMode: "async"`
- `slaLabel` required for publish
- No live-slot controls in primary UI

### `sub` · Подписка

Primary sections:
- Media
- Name and price
- Subscription billing: period and trial days
- Access grants: content/channel/records/community/journal
- Included items
- Preview

Advanced sections:
- Delivery formats
- Client intake
- Modifiers

Fixed/default behavior:
- `paymentModel: "sub"`
- `executionMode: "async"`
- `subscriptionPeriod` required
- `accessGrants` should contain at least one access value
- Methods are hidden by default

### `mini` · Мини-продукт

Primary sections:
- Media
- Name and price
- Quick-answer setup: response format, SLA/duration label, question intake
- Included items
- Preview

Advanced sections:
- Method/system
- Modifiers

Fixed/default behavior:
- `paymentModel: "once"`
- `executionMode: "instant"`
- `deliveryFormats: ["chat"]`
- `requiredClientData: ["question"]`
- `durationLabel: "24 ч"`

### `course` · Курс

Primary sections:
- Media
- Name and price
- Course setup: module/lesson volume via `durationLabel`
- Access grants: course materials
- Included items
- Preview

Advanced sections:
- Delivery formats
- Client intake
- Modifiers

Fixed/default behavior:
- `paymentModel: "once"` for this slice, not `pack`
- `executionMode: "async"`
- `durationLabel: "8 модулей"`
- `accessGrants: ["course"]`
- No real lesson builder until the `Content/Course` contour exists

### `custom` · Свой формат

Primary sections:
- All current cube sections
- Included items
- Preview

Advanced sections:
- None; this mode is already the advanced builder

Fixed/default behavior:
- Preserve current rich default demo config and modifiers.

## File Structure

### Create

- `apps/astrologer-web/src/features/products/model/productTypeDefinitions.ts`
  - Defines product section ids, type scenario definitions, primary/advanced/fixed controls, and helper predicates.

- `apps/astrologer-web/src/features/products/model/productTypeDefinitions.test.ts`
  - Unit tests for the field matrix, especially `custom` full builder and standard guided scenarios.

- `apps/astrologer-web/src/features/products/model/productTypeDraftNormalization.ts`
  - Normalizes hidden or fixed draft fields before create/update payload conversion.

- `apps/astrologer-web/src/features/products/model/productTypeDraftNormalization.test.ts`
  - Unit tests proving hidden stale fields do not leak into payloads.

- `apps/astrologer-web/src/pages/products/components/ProductConstructorModal/components/sections/ProductScenarioSections.tsx`
  - Scenario-specific composition that renders the existing section primitives according to the type definition.

- `apps/astrologer-web/src/pages/products/components/ProductConstructorModal/components/sections/ProductScenarioAdvancedSection.tsx`
  - Collapsible advanced section wrapper for secondary sections on non-custom types.

### Modify

- `apps/astrologer-web/src/features/products/model/productDraft.ts`
  - Use normalization before `toCreateProductRequest` and `toUpdateProductRequest`.
  - Change `course` default payment model to `once`, because a course is not semantically a package of appointments.

- `apps/astrologer-web/src/pages/products/components/ProductConstructorModal/components/ProductConstructorEditor.tsx`
  - Replace unconditional section rendering with `ProductScenarioSections`.

- `apps/astrologer-web/src/pages/products/components/ProductConstructorModal/components/sections/BasicProductSections.tsx`
  - Export smaller section components where needed.
  - Avoid rendering payment variants that are fixed/hidden by the active scenario.

- `apps/astrologer-web/src/pages/products/components/ProductConstructorModal/ProductConstructorModal.test.tsx`
  - Replace generic “many tiles render” assertions with type-specific visible/hidden section assertions.

- `apps/astrologer-web/src/pages/products/components/ProductConstructorModal/ProductConstructorModalArchitecture.test.ts`
  - Add/import checks for one-component-per-file and no broad JSX dumping into editor.

- `apps/astrologer-web/src/pages/products/components/ProductsPageComponents.test.tsx`
  - Confirm selecting each product type opens a scenario-specific constructor.

- `packages/validation/src/products/index.ts`
  - Add type-aware invariant helpers for publish/create readiness where current contracts can validate safely.

- `packages/contracts/src/products.ts`
  - Wire type-aware invariant helpers through create/update/product response schemas only when they do not break persisted historical data.

- `packages/contracts/src/products.test.ts`
  - Add tests for type-specific invalid payloads.

### Optional Docs

- `docs/architecture/design-reference-inventory.md`
  - Update Product constructor row only if implementation changes the documented integration status.

## Task 1: Product Type Definitions Model

**Files:**
- Create: `apps/astrologer-web/src/features/products/model/productTypeDefinitions.ts`
- Create: `apps/astrologer-web/src/features/products/model/productTypeDefinitions.test.ts`

- [ ] **Step 1: Write failing tests for the type matrix**

Add tests that lock the expected section model:

```ts
import { describe, expect, it } from "vitest";
import {
  getProductTypeDefinition,
  productScenarioSectionIds,
  type ProductScenarioSectionId
} from "./productTypeDefinitions";

describe("productTypeDefinitions", () => {
  it("keeps custom as the full cube constructor", () => {
    const definition = getProductTypeDefinition("custom");

    expect(definition.mode).toBe("full");
    expect(definition.primarySections).toEqual(productScenarioSectionIds);
    expect(definition.advancedSections).toEqual([]);
  });

  it.each([
    ["single", ["media", "basics", "consultation", "clientData", "methods", "includedItems"]],
    ["pack", ["media", "basics", "package", "clientData", "methods", "includedItems"]],
    ["async", ["media", "basics", "asyncResult", "clientData", "methods", "includedItems"]],
    ["sub", ["media", "basics", "subscription", "accessGrants", "includedItems"]],
    ["mini", ["media", "basics", "mini", "includedItems"]],
    ["course", ["media", "basics", "course", "accessGrants", "includedItems"]]
  ] as const)("defines primary sections for %s", (type, expectedSections) => {
    const definition = getProductTypeDefinition(type);

    expect(definition.mode).toBe("guided");
    expect(definition.primarySections).toEqual(expectedSections);
  });

  it("does not put subscription fields into one-off consultation primary sections", () => {
    const definition = getProductTypeDefinition("single");

    expect(definition.primarySections).not.toContain("subscription");
    expect(definition.fixedPaymentModel).toBe("once");
    expect(definition.fixedExecutionMode).toBe("live");
  });

  it("marks package and subscription settings as required for their product types", () => {
    expect(getProductTypeDefinition("pack").requiredDraftFields).toContain("packageSessionCount");
    expect(getProductTypeDefinition("sub").requiredDraftFields).toContain("subscriptionPeriod");
    expect(getProductTypeDefinition("sub").requiredDraftFields).toContain("accessGrants");
  });
});
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run:

```bash
corepack pnpm --filter @elevenhouse/astrologer-web test -- productTypeDefinitions
```

Expected: FAIL because `productTypeDefinitions.ts` does not exist.

- [ ] **Step 3: Implement `productTypeDefinitions.ts`**

Create the type model with the exact section ids:

```ts
import type {
  ProductExecutionMode,
  ProductPaymentModel,
  ProductType
} from "@elevenhouse/contracts/products";
import type { ProductFormDraft } from "./productDraft";

export const productScenarioSectionIds = [
  "media",
  "basics",
  "format",
  "execution",
  "payment",
  "duration",
  "participants",
  "consultation",
  "package",
  "asyncResult",
  "subscription",
  "mini",
  "course",
  "methods",
  "clientData",
  "accessGrants",
  "modifiers",
  "includedItems"
] as const;

export type ProductScenarioSectionId = (typeof productScenarioSectionIds)[number];
export type ProductDraftRequiredField = keyof Pick<
  ProductFormDraft,
  | "title"
  | "priceMinor"
  | "durationLabel"
  | "slaLabel"
  | "packageSessionCount"
  | "subscriptionPeriod"
  | "deliveryFormats"
  | "requiredClientData"
  | "methods"
  | "accessGrants"
  | "includedItems"
>;

export type ProductTypeDefinition = {
  readonly type: ProductType;
  readonly mode: "guided" | "full";
  readonly primarySections: readonly ProductScenarioSectionId[];
  readonly advancedSections: readonly ProductScenarioSectionId[];
  readonly fixedPaymentModel: ProductPaymentModel | null;
  readonly fixedExecutionMode: ProductExecutionMode | null;
  readonly requiredDraftFields: readonly ProductDraftRequiredField[];
};

const fullSections = productScenarioSectionIds;

const definitions = {
  single: {
    type: "single",
    mode: "guided",
    primarySections: ["media", "basics", "consultation", "clientData", "methods", "includedItems"],
    advancedSections: ["participants", "accessGrants", "modifiers"],
    fixedPaymentModel: "once",
    fixedExecutionMode: "live",
    requiredDraftFields: ["title", "priceMinor", "durationLabel", "deliveryFormats", "requiredClientData"]
  },
  pack: {
    type: "pack",
    mode: "guided",
    primarySections: ["media", "basics", "package", "clientData", "methods", "includedItems"],
    advancedSections: ["participants", "accessGrants", "modifiers"],
    fixedPaymentModel: "pack",
    fixedExecutionMode: "live",
    requiredDraftFields: ["title", "priceMinor", "packageSessionCount", "durationLabel"]
  },
  async: {
    type: "async",
    mode: "guided",
    primarySections: ["media", "basics", "asyncResult", "clientData", "methods", "includedItems"],
    advancedSections: ["accessGrants", "modifiers"],
    fixedPaymentModel: "once",
    fixedExecutionMode: "async",
    requiredDraftFields: ["title", "priceMinor", "slaLabel", "deliveryFormats", "requiredClientData"]
  },
  sub: {
    type: "sub",
    mode: "guided",
    primarySections: ["media", "basics", "subscription", "accessGrants", "includedItems"],
    advancedSections: ["format", "clientData", "modifiers"],
    fixedPaymentModel: "sub",
    fixedExecutionMode: "async",
    requiredDraftFields: ["title", "priceMinor", "subscriptionPeriod", "accessGrants"]
  },
  mini: {
    type: "mini",
    mode: "guided",
    primarySections: ["media", "basics", "mini", "includedItems"],
    advancedSections: ["methods", "modifiers"],
    fixedPaymentModel: "once",
    fixedExecutionMode: "instant",
    requiredDraftFields: ["title", "priceMinor", "durationLabel", "deliveryFormats", "requiredClientData"]
  },
  course: {
    type: "course",
    mode: "guided",
    primarySections: ["media", "basics", "course", "accessGrants", "includedItems"],
    advancedSections: ["format", "clientData", "modifiers"],
    fixedPaymentModel: "once",
    fixedExecutionMode: "async",
    requiredDraftFields: ["title", "priceMinor", "durationLabel", "accessGrants"]
  },
  custom: {
    type: "custom",
    mode: "full",
    primarySections: fullSections,
    advancedSections: [],
    fixedPaymentModel: null,
    fixedExecutionMode: null,
    requiredDraftFields: ["title", "priceMinor", "deliveryFormats"]
  }
} satisfies Record<ProductType, ProductTypeDefinition>;

export function getProductTypeDefinition(type: ProductType): ProductTypeDefinition {
  return definitions[type];
}

export function isProductScenarioSectionVisible(
  type: ProductType,
  section: ProductScenarioSectionId
): boolean {
  const definition = getProductTypeDefinition(type);
  return (
    definition.primarySections.includes(section) || definition.advancedSections.includes(section)
  );
}
```

- [ ] **Step 4: Run the type-definition tests**

Run:

```bash
corepack pnpm --filter @elevenhouse/astrologer-web test -- productTypeDefinitions
```

Expected: PASS.

## Task 2: Draft Normalization By Product Type

**Files:**
- Create: `apps/astrologer-web/src/features/products/model/productTypeDraftNormalization.ts`
- Create: `apps/astrologer-web/src/features/products/model/productTypeDraftNormalization.test.ts`
- Modify: `apps/astrologer-web/src/features/products/model/productDraft.ts`

- [ ] **Step 1: Write failing normalization tests**

```ts
import { describe, expect, it } from "vitest";
import { createDefaultProductDraft } from "./productDraft";
import { normalizeProductDraftForType } from "./productTypeDraftNormalization";

describe("normalizeProductDraftForType", () => {
  it("removes stale subscription settings from a single consultation", () => {
    const draft = {
      ...createDefaultProductDraft("single"),
      paymentModel: "sub" as const,
      subscriptionPeriod: "month" as const,
      trialDays: 7
    };

    const normalized = normalizeProductDraftForType(draft);

    expect(normalized.paymentModel).toBe("once");
    expect(normalized.subscriptionPeriod).toBeNull();
    expect(normalized.trialDays).toBeNull();
  });

  it("keeps package settings for package products", () => {
    const draft = createDefaultProductDraft("pack");

    const normalized = normalizeProductDraftForType(draft);

    expect(normalized.paymentModel).toBe("pack");
    expect(normalized.packageSessionCount).toBe(3);
    expect(normalized.packageDiscountPercent).toBe(15);
  });

  it("makes course a one-time async access product for this slice", () => {
    const normalized = normalizeProductDraftForType(createDefaultProductDraft("course"));

    expect(normalized.paymentModel).toBe("once");
    expect(normalized.executionMode).toBe("async");
    expect(normalized.accessGrants).toContain("course");
    expect(normalized.packageSessionCount).toBeNull();
  });

  it("does not normalize custom because custom is the full builder", () => {
    const draft = {
      ...createDefaultProductDraft("custom"),
      paymentModel: "sub" as const,
      subscriptionPeriod: "year" as const,
      trialDays: 14
    };

    expect(normalizeProductDraftForType(draft)).toEqual(draft);
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
corepack pnpm --filter @elevenhouse/astrologer-web test -- productTypeDraftNormalization
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement normalization**

```ts
import type { ProductFormDraft } from "./productDraft";
import { getProductTypeDefinition } from "./productTypeDefinitions";

export function normalizeProductDraftForType(draft: ProductFormDraft): ProductFormDraft {
  const definition = getProductTypeDefinition(draft.type);

  if (definition.mode === "full") {
    return draft;
  }

  const paymentModel = definition.fixedPaymentModel ?? draft.paymentModel;
  const executionMode = definition.fixedExecutionMode ?? draft.executionMode;

  return {
    ...draft,
    paymentModel,
    executionMode,
    packageSessionCount:
      paymentModel === "pack" ? draft.packageSessionCount ?? 1 : null,
    packageDiscountPercent:
      paymentModel === "pack" ? draft.packageDiscountPercent ?? 0 : null,
    subscriptionPeriod:
      paymentModel === "sub" ? draft.subscriptionPeriod ?? "month" : null,
    trialDays:
      paymentModel === "sub" ? draft.trialDays ?? 0 : null,
    priceMinor: paymentModel === "free" ? 0 : draft.priceMinor,
    groupSize: draft.participantMode === "group" ? draft.groupSize ?? 2 : null,
    accessGrants:
      draft.type === "course" && !draft.accessGrants.includes("course")
        ? [...draft.accessGrants, "course"]
        : draft.accessGrants
  };
}
```

- [ ] **Step 4: Wire normalization into payload conversion**

In `productDraft.ts`, import and call normalization before `toPayload`:

```ts
import { normalizeProductDraftForType } from "./productTypeDraftNormalization";
```

Change:

```ts
export function toCreateProductRequest(draft: ProductFormDraft): CreateProductRequest {
  return createProductRequestSchema.parse(toPayload(draft, "create"));
}

export function toUpdateProductRequest(draft: ProductFormDraft): UpdateProductRequest {
  return updateProductRequestSchema.parse(toPayload(draft, "update"));
}
```

to:

```ts
export function toCreateProductRequest(draft: ProductFormDraft): CreateProductRequest {
  return createProductRequestSchema.parse(toPayload(normalizeProductDraftForType(draft), "create"));
}

export function toUpdateProductRequest(draft: ProductFormDraft): UpdateProductRequest {
  return updateProductRequestSchema.parse(toPayload(normalizeProductDraftForType(draft), "update"));
}
```

- [ ] **Step 5: Update the course default**

In `createDefaultProductDraft("course")`, add:

```ts
executionMode: "async",
paymentModel: "once",
packageSessionCount: null,
packageDiscountPercent: null,
```

- [ ] **Step 6: Run draft tests**

Run:

```bash
corepack pnpm --filter @elevenhouse/astrologer-web test -- productDraft productTypeDraftNormalization
```

Expected: PASS.

## Task 3: Split Renderable Sections For Scenario Composition

**Files:**
- Modify: `apps/astrologer-web/src/pages/products/components/ProductConstructorModal/components/sections/BasicProductSections.tsx`
- Create: `apps/astrologer-web/src/pages/products/components/ProductConstructorModal/components/sections/ProductScenarioAdvancedSection.tsx`

- [ ] **Step 1: Export section components**

In `BasicProductSections.tsx`, export these existing components:

```ts
export function PaymentSection(...)
export function DurationSection(...)
export function ParticipantsSection(...)
```

If TypeScript rejects exports because functions are currently declared with `function`, convert each declaration to an exported function without changing JSX.

- [ ] **Step 2: Create the advanced wrapper**

```tsx
import { useState, type ReactNode } from "react";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import styles from "../../ProductConstructorModal.module.css";

export function ProductScenarioAdvancedSection({
  label,
  children
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className={styles.constructorSectionPlain}>
      <button
        className={styles.constructorAdvancedToggle}
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>{label}</span>
        <Icon
          iconName="chevronDown"
          className={isOpen ? styles.constructorAdvancedToggleIconOpen : undefined}
          width={16}
          height={16}
        />
      </button>
      {isOpen ? <div className={styles.constructorAdvancedBody}>{children}</div> : null}
    </section>
  );
}
```

- [ ] **Step 3: Add CSS for the advanced wrapper**

In `ProductConstructorModal.module.css`, add:

```css
.constructorAdvancedToggle {
  width: 100%;
  border: 1px solid var(--eh-border-muted);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--eh-text-primary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.constructorAdvancedBody {
  display: grid;
  gap: 18px;
  margin-top: 14px;
}

.constructorAdvancedToggleIconOpen {
  transform: rotate(180deg);
}
```

- [ ] **Step 4: Run component typecheck**

Run:

```bash
corepack pnpm --filter @elevenhouse/astrologer-web typecheck
```

Expected: PASS.

## Task 4: Render The Guided Scenario Sections

**Files:**
- Create: `apps/astrologer-web/src/pages/products/components/ProductConstructorModal/components/sections/ProductScenarioSections.tsx`
- Modify: `apps/astrologer-web/src/pages/products/components/ProductConstructorModal/components/ProductConstructorEditor.tsx`

- [ ] **Step 1: Write failing modal tests for visible sections**

In `ProductConstructorModal.test.tsx`, add tests:

```ts
it("renders a focused subscription scenario without consultation package controls", () => {
  const modal = renderModalWithDraft(createDefaultProductDraft("sub"));
  const serialized = serializeRendered(modal);

  expect(serialized).toContain("Подписка");
  expect(serialized).toContain("Период подписки");
  expect(serialized).toContain("Доступ");
  expect(serialized).not.toContain("Сессий в пакете");
  expect(serialized).not.toContain("Вживую · слот");
});

it("keeps custom as the full cube constructor", () => {
  const modal = renderModalWithDraft(createDefaultProductDraft("custom"));
  const serialized = serializeRendered(modal);

  expect(serialized).toContain("Формат поставки");
  expect(serialized).toContain("Когда");
  expect(serialized).toContain("Оплата");
  expect(serialized).toContain("Участники");
  expect(serialized).toContain("Метод / система");
  expect(serialized).toContain("Данные от клиента");
  expect(serialized).toContain("Доступ");
  expect(serialized).toContain("Допы · модификаторы");
});
```

If `renderModalWithDraft` does not exist, create a local helper in the test file that calls `ProductConstructorModal` with the same props used by existing tests.

- [ ] **Step 2: Implement `ProductScenarioSections.tsx`**

The component should map section ids to existing section components:

```tsx
import { getProductTypeDefinition, type ProductScenarioSectionId } from "../../../../../../features/products/model/productTypeDefinitions";
import type { ProductConstructorSectionProps } from "../../types";
import {
  AccessGrantsSection,
  ClientDataSection,
  DurationSection,
  MethodsSection,
  ParticipantsSection,
  PaymentSection
} from "./BasicProductSections";
import { IncludedItemsSection } from "./IncludedItemsSection";
import { ModifiersSection } from "./ModifiersSection";
import { ProductScenarioAdvancedSection } from "./ProductScenarioAdvancedSection";
import { ScenarioBasicsSection, ScenarioConsultationSection, ScenarioPackageSection, ScenarioAsyncResultSection, ScenarioSubscriptionSection, ScenarioMiniSection, ScenarioCourseSection } from "./ScenarioPrimarySections";

export function ProductScenarioSections(props: ProductConstructorSectionProps) {
  const definition = getProductTypeDefinition(props.draft.type);

  if (definition.mode === "full") {
    return (
      <>
        {definition.primarySections.map((section) => renderSection(section, props))}
      </>
    );
  }

  return (
    <>
      {definition.primarySections.map((section) => renderSection(section, props))}
      {definition.advancedSections.length ? (
        <ProductScenarioAdvancedSection label="Расширенные настройки">
          {definition.advancedSections.map((section) => renderSection(section, props))}
        </ProductScenarioAdvancedSection>
      ) : null}
    </>
  );
}

function renderSection(section: ProductScenarioSectionId, props: ProductConstructorSectionProps) {
  if (section === "media" || section === "basics") return <ScenarioBasicsSection key={section} section={section} {...props} />;
  if (section === "format") return <ScenarioConsultationSection key={section} variant="format" {...props} />;
  if (section === "execution") return <ScenarioConsultationSection key={section} variant="execution" {...props} />;
  if (section === "payment") return <PaymentSection key={section} {...props} />;
  if (section === "duration") return <DurationSection key={section} {...props} />;
  if (section === "participants") return <ParticipantsSection key={section} {...props} />;
  if (section === "consultation") return <ScenarioConsultationSection key={section} variant="full" {...props} />;
  if (section === "package") return <ScenarioPackageSection key={section} {...props} />;
  if (section === "asyncResult") return <ScenarioAsyncResultSection key={section} {...props} />;
  if (section === "subscription") return <ScenarioSubscriptionSection key={section} {...props} />;
  if (section === "mini") return <ScenarioMiniSection key={section} {...props} />;
  if (section === "course") return <ScenarioCourseSection key={section} {...props} />;
  if (section === "methods") return <MethodsSection key={section} {...props} />;
  if (section === "clientData") return <ClientDataSection key={section} {...props} />;
  if (section === "accessGrants") return <AccessGrantsSection key={section} {...props} />;
  if (section === "modifiers") return <ModifiersSection key={section} {...props} />;
  return <IncludedItemsSection key={section} {...props} />;
}
```

- [ ] **Step 3: Create scenario primary sections**

Create `ScenarioPrimarySections.tsx` next to `ProductScenarioSections.tsx`. It may reuse existing controls, but each exported component must have a single responsibility:

```tsx
import type { ProductConstructorSectionProps } from "../../types";
import { BasicProductSections, DurationSection, PaymentSection } from "./BasicProductSections";

export function ScenarioBasicsSection(
  props: ProductConstructorSectionProps & { readonly section: "media" | "basics" }
) {
  return <BasicProductSections {...props} only={props.section} />;
}

export function ScenarioConsultationSection(props: ProductConstructorSectionProps & { readonly variant: "full" | "format" | "execution" }) {
  return <BasicProductSections {...props} only={props.variant === "full" ? "consultation" : props.variant} />;
}

export function ScenarioPackageSection(props: ProductConstructorSectionProps) {
  return <PaymentSection {...props} forcedMode="pack" />;
}

export function ScenarioAsyncResultSection(props: ProductConstructorSectionProps) {
  return <BasicProductSections {...props} only="asyncResult" />;
}

export function ScenarioSubscriptionSection(props: ProductConstructorSectionProps) {
  return <PaymentSection {...props} forcedMode="sub" />;
}

export function ScenarioMiniSection(props: ProductConstructorSectionProps) {
  return <BasicProductSections {...props} only="mini" />;
}

export function ScenarioCourseSection(props: ProductConstructorSectionProps) {
  return <DurationSection {...props} labelOverride="Объём курса" />;
}
```

The extraction in Task 3 must expose these exact props before this task is implemented:

```ts
type BasicProductSectionsProps = ProductConstructorSectionProps & {
  readonly only?: "media" | "basics" | "format" | "execution" | "consultation" | "asyncResult" | "mini";
};

type PaymentSectionProps = ProductConstructorSectionProps & {
  readonly forcedMode?: ProductPaymentModel;
};

type DurationSectionProps = ProductConstructorSectionProps & {
  readonly labelOverride?: string;
};
```

`BasicProductSections` should render all basic sections when `only` is omitted, preserving the current `custom` behavior. `PaymentSection` should render only the forced payment-mode controls when `forcedMode` is provided. `DurationSection` should use `labelOverride` only for the section heading.

- [ ] **Step 4: Replace editor composition**

In `ProductConstructorEditor.tsx`, replace the current unconditional list with:

```tsx
import { ProductScenarioSections } from "./sections/ProductScenarioSections";
import styles from "../ProductConstructorModal.module.css";

export function ProductConstructorEditor(props: ProductConstructorSectionProps) {
  return (
    <div className={styles.productConstructorEditor} data-product-constructor-editor="true">
      <ProductScenarioSections {...props} />
    </div>
  );
}
```

- [ ] **Step 5: Run modal tests**

Run:

```bash
corepack pnpm --filter @elevenhouse/astrologer-web test -- ProductConstructorModal
```

Expected: PASS after adjusting section extraction.

## Task 5: Type-Aware Validation

**Files:**
- Modify: `packages/validation/src/products/index.ts`
- Modify: `packages/contracts/src/products.ts`
- Modify: `packages/contracts/src/products.test.ts`

- [ ] **Step 1: Add failing contract tests**

Add tests:

```ts
it("rejects subscription products without subscriptionPeriod", () => {
  const payload = createValidProductPayload({
    type: "sub",
    paymentModel: "sub",
    subscriptionPeriod: undefined
  });

  expect(() => createProductRequestSchema.parse(payload)).toThrow(/subscriptionPeriod/);
});

it("rejects package products without packageSessionCount", () => {
  const payload = createValidProductPayload({
    type: "pack",
    paymentModel: "pack",
    packageSessionCount: undefined
  });

  expect(() => createProductRequestSchema.parse(payload)).toThrow(/packageSessionCount/);
});

it("rejects course products without course access grant", () => {
  const payload = createValidProductPayload({
    type: "course",
    accessGrants: []
  });

  expect(() => createProductRequestSchema.parse(payload)).toThrow(/course access/);
});
```

Use the existing product contract test fixture style in `products.test.ts`; do not introduce a second fixture system.

- [ ] **Step 2: Extend validation inputs**

In `packages/validation/src/products/index.ts`, add `type` to `ProductCreateInvariantInput` and `ProductUpdateInvariantInput`:

```ts
readonly type?: ProductTypeValue;
```

Then add type-aware checks in `collectProductCreateInvariantIssues`:

```ts
if (value.type === "pack" && value.paymentModel !== "pack") {
  issues.push({ path: ["paymentModel"], message: "Package products require pack payment model" });
}

if (value.type === "sub" && value.paymentModel !== "sub") {
  issues.push({ path: ["paymentModel"], message: "Subscription products require subscription payment model" });
}

if (value.type === "course" && !value.accessGrants?.includes("course")) {
  issues.push({ path: ["accessGrants"], message: "Course products require course access grant" });
}
```

- [ ] **Step 3: Ensure contracts pass type into invariant checks**

In `packages/contracts/src/products.ts`, update the value shape accepted by `addProductPayloadIssues` and `addProductUpdateIssues` to include:

```ts
readonly type?: ProductTypeValue;
```

Make sure the existing `superRefine(addProductPayloadIssues)` now sees `type`.

- [ ] **Step 4: Run validation and contract tests**

Run:

```bash
corepack pnpm --filter @elevenhouse/validation test -- products
corepack pnpm --filter @elevenhouse/contracts test -- products
```

Expected: PASS.

## Task 6: Create Flow Tests Across All Types

**Files:**
- Modify: `apps/astrologer-web/src/pages/products/components/ProductsPageComponents.test.tsx`
- Modify: `apps/astrologer-web/src/features/products/model/productCreateFlowPersistence.test.ts`

- [ ] **Step 1: Add UI flow assertions per type**

For each product type, assert the selected type label and at least one unique field:

```ts
it.each([
  ["single", "Разовая консультация", "Длительность"],
  ["pack", "Пакет консультаций", "Сессий в пакете"],
  ["async", "Разбор в записи", "SLA"],
  ["sub", "Подписка", "Период подписки"],
  ["mini", "Мини-продукт", "Вопрос"],
  ["course", "Курс", "Объём курса"],
  ["custom", "Свой формат", "Формат поставки"]
] as const)("opens a type-aware constructor for %s", async (type, label, uniqueText) => {
  renderProductsPageWithCreateFlow();

  await user.click(screen.getByRole("button", { name: /создать продукт/i }));
  await user.click(screen.getByRole("button", { name: new RegExp(label, "i") }));

  expect(screen.getByText(label)).toBeInTheDocument();
  expect(screen.getByText(uniqueText)).toBeInTheDocument();
});
```

- [ ] **Step 2: Add persistence assertions for hidden stale fields**

In persistence tests, create a `single` draft with stale subscription fields and verify `createProduct` receives normalized `paymentModel: "once"` and no subscription payload.

- [ ] **Step 3: Run product tests**

Run:

```bash
corepack pnpm --filter @elevenhouse/astrologer-web test -- ProductsPageComponents productCreateFlowPersistence ProductConstructorModal
```

Expected: PASS.

## Task 7: Browser QA

**Files:**
- No code files unless browser testing finds defects.

- [ ] **Step 1: Confirm existing services without restarting**

Run:

```bash
lsof -nP -iTCP:5174 -sTCP:LISTEN
curl -I --max-time 5 http://localhost:5174/products
```

Expected: `localhost:5174` responds. Do not start or restart services unless the user explicitly asks.

- [ ] **Step 2: Test product type selector through `computer-use`**

Open or focus `Google Chrome` at:

```text
http://localhost:5174/products
```

For each type:

1. Click `Создать продукт`.
2. Select the product type.
3. Verify the constructor header contains that type label.
4. Verify unique expected fields from Task 6 are visible.
5. Verify unrelated fields are hidden from primary UI.
6. Close without saving unless running the dedicated DB persistence test.

- [ ] **Step 3: Test one persistence path**

Create one draft for `pack` with:

- title: `QA Пакет консультаций`
- price: `12600`
- package sessions: `3`
- discount: `15`
- duration: `3 × 60 мин`

Save as draft.

Verify through API or DB that:

- `type = 'pack'`
- `payment_model = 'pack'`
- `package_session_count = 3`
- `package_discount_percent = 15`
- `subscription_period is null`

Use the repo’s existing DB access pattern. Do not invent a localStorage check.

## Task 8: Final Verification

**Files:**
- All files touched by previous tasks.

- [ ] **Step 1: Run targeted checks**

```bash
corepack pnpm --filter @elevenhouse/astrologer-web typecheck
corepack pnpm --filter @elevenhouse/astrologer-web test -- ProductConstructorModal ProductsPageComponents productDraft productTypeDefinitions productTypeDraftNormalization productCreateFlowPersistence
corepack pnpm --filter @elevenhouse/contracts test -- products
corepack pnpm --filter @elevenhouse/validation test -- products
```

Expected: PASS.

- [ ] **Step 2: Run broader checks if the targeted checks pass**

```bash
corepack pnpm typecheck
corepack pnpm test
```

Expected: PASS, or report unrelated existing failures with exact files.

- [ ] **Step 3: Inspect dirty worktree**

```bash
git status --short
git diff --check
```

Expected: only intended product constructor files plus optional docs are dirty; `git diff --check` has no whitespace errors.

## Acceptance Criteria

- Selecting different product types no longer opens the same primary form.
- `custom` keeps the full constructor and all cube sections.
- Standard types show focused primary sections and put secondary fields into advanced disclosure.
- Hidden stale fields are normalized before create/update payloads.
- Type-specific validation is covered by shared validation/contracts where safe.
- Tests cover all seven product types.
- Browser QA verifies the visible flow on `localhost:5174/products`.
- At least one saved draft is verified against backend persistence when implementation is executed.

## Self-Review

- Spec coverage: all seven product types are covered by the field matrix and by UI tests.
- Placeholder scan: no `TBD` or unresolved product decision remains in this slice.
- Type consistency: type ids match `productTypeValues`: `single`, `pack`, `async`, `sub`, `mini`, `course`, `custom`.
- Scope: real booking, course curriculum, subscriptions lifecycle, payment provider integration, and content delivery are explicitly out of this implementation slice.
