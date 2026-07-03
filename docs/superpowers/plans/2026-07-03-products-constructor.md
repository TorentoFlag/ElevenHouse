# Products Constructor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the partial product editor in `astrologer-web` with a production-backed product constructor that maps the `ElevenHouseDesign` reference flow to existing `Products` contracts and API mutations.

**Architecture:** Keep backend unchanged for this slice because `ProductsModule` and `@elevenhouse/contracts` already cover the core constructor fields. Add small reusable design-system controls for selectable tiles, numeric steppers and icon picking, then compose them in `apps/astrologer-web` as product-specific workflow components. All product create/update/status actions go through existing API wrappers, React Query mutations and shared contract parsers.

**Tech Stack:** React 19, Vite, TypeScript, React Query, Zod contracts in `@elevenhouse/contracts`, local CSS modules, `@elevenhouse/design-system`, Vitest.

---

## File Structure

Create:

- `packages/design-system/src/components/SelectableTile/SelectableTile.tsx` — reusable tile button used for option groups.
- `packages/design-system/src/components/SelectableTile/SelectableTile.css`
- `packages/design-system/src/components/SelectableTile/types.ts`
- `packages/design-system/src/components/SelectableTile/index.ts`
- `packages/design-system/src/components/SelectableTile/SelectableTile.test.tsx`
- `packages/design-system/src/components/NumberStepper/NumberStepper.tsx` — reusable plus/minus numeric input control.
- `packages/design-system/src/components/NumberStepper/NumberStepper.css`
- `packages/design-system/src/components/NumberStepper/types.ts`
- `packages/design-system/src/components/NumberStepper/index.ts`
- `packages/design-system/src/components/NumberStepper/NumberStepper.test.tsx`
- `packages/design-system/src/components/IconPicker/IconPicker.tsx` — reusable icon-name picker backed by the design-system `Icon` registry.
- `packages/design-system/src/components/IconPicker/IconPicker.css`
- `packages/design-system/src/components/IconPicker/types.ts`
- `packages/design-system/src/components/IconPicker/index.ts`
- `packages/design-system/src/components/IconPicker/IconPicker.test.tsx`
- `apps/astrologer-web/src/features/products/model/productConstructorOptions.ts` — typed constructor option metadata derived from contract enum values.
- `apps/astrologer-web/src/features/products/model/productConstructorOptions.test.ts`
- `apps/astrologer-web/src/pages/products/components/ProductConstructorModal/ProductConstructorModal.tsx`
- `apps/astrologer-web/src/pages/products/components/ProductConstructorModal/index.ts`
- `apps/astrologer-web/src/pages/products/components/ProductConstructorModal/ProductConstructorModal.test.tsx`
- `apps/astrologer-web/src/features/products/model/useUpdateProductMutation.ts`
- `apps/astrologer-web/src/features/products/model/usePublishProductMutation.ts`
- `apps/astrologer-web/src/features/products/model/useMoveProductToDraftMutation.ts`
- `apps/astrologer-web/src/features/products/model/useArchiveProductMutation.ts`
- `apps/astrologer-web/src/features/products/model/useDuplicateProductMutation.ts`

Modify:

- `packages/design-system/src/components/index.ts` — export new controls.
- `packages/design-system/src/index.ts` — exports already flow through components; verify after component export changes.
- `apps/astrologer-web/src/features/products/model/productDraft.ts` — add constructor helper reducers and preview helpers.
- `apps/astrologer-web/src/features/products/model/productDraft.test.ts` — cover full constructor payload normalization.
- `apps/astrologer-web/src/features/products/model/productCopy.ts` — add constructor labels, modifier labels and editor copy.
- `apps/astrologer-web/src/common/i18n/astrologerCopy.ts` — add modal/action labels in `ru` and `en`.
- `apps/astrologer-web/src/pages/products/components/ProductsCreateFlow.tsx` — render the new constructor modal.
- `apps/astrologer-web/src/pages/products/hooks/useProductCreateFlow.ts` — support create and edit constructor state.
- `apps/astrologer-web/src/pages/products/components/ProductCard.tsx` — add edit/status/duplicate action entry points.
- `apps/astrologer-web/src/pages/products/components/ProductsResults.tsx` — pass action handlers through to cards.
- `apps/astrologer-web/src/pages/products/ProductsPage.tsx` — wire create, edit and status mutations.
- `apps/astrologer-web/src/pages/products/ProductsPageView.tsx` — pass card action handlers.
- `apps/astrologer-web/src/pages/products/ProductsPage.module.css` — product constructor layout, preview and action menu styles.
- `apps/astrologer-web/src/pages/products/components/ProductsPageComponents.test.tsx` — update component tests for constructor and card actions.
- `apps/astrologer-web/src/pages/products/ProductsPage.test.tsx` — cover page-level mutation wiring.

Do not modify:

- `apps/astrologer-api` — existing product endpoints and contracts are sufficient for this slice.
- `packages/db` migrations — no product schema change is required.
- `ElevenHouseDesign` — reference only.

---

## Task 1: Design-System `SelectableTile`

**Files:**

- Create: `packages/design-system/src/components/SelectableTile/types.ts`
- Create: `packages/design-system/src/components/SelectableTile/SelectableTile.tsx`
- Create: `packages/design-system/src/components/SelectableTile/SelectableTile.css`
- Create: `packages/design-system/src/components/SelectableTile/index.ts`
- Create: `packages/design-system/src/components/SelectableTile/SelectableTile.test.tsx`
- Modify: `packages/design-system/src/components/index.ts`

- [ ] **Step 1: Write the failing tests**

Add `packages/design-system/src/components/SelectableTile/SelectableTile.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { SelectableTile } from "./SelectableTile";

describe("SelectableTile", () => {
  it("renders an accessible selectable button", () => {
    const onClick = vi.fn();
    const tile = SelectableTile({
      label: "Видео",
      description: "Запись сессии",
      selected: true,
      icon: <span data-icon="video" />,
      onClick
    });

    expect(tile.type).toBe("button");
    expect(tile.props.type).toBe("button");
    expect(tile.props["aria-pressed"]).toBe(true);
    expect(tile.props.className).toContain("ehSelectableTile");
    expect(tile.props.className).toContain("ehSelectableTile--selected");
    expect(JSON.stringify(tile.props.children)).toContain("Видео");
    expect(JSON.stringify(tile.props.children)).toContain("Запись сессии");

    tile.props.onClick();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("supports disabled state without calling onClick", () => {
    const onClick = vi.fn();
    const tile = SelectableTile({
      label: "Канал",
      selected: false,
      disabled: true,
      onClick
    });

    expect(tile.props.disabled).toBe(true);
    expect(tile.props["aria-pressed"]).toBe(false);
    tile.props.onClick();
    expect(onClick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm test -- packages/design-system/src/components/SelectableTile/SelectableTile.test.tsx
```

Expected: fail because `SelectableTile` does not exist.

- [ ] **Step 3: Add the component types**

Create `packages/design-system/src/components/SelectableTile/types.ts`:

```ts
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type SelectableTileProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly icon?: ReactNode;
  readonly selected?: boolean;
};
```

- [ ] **Step 4: Add the component implementation**

Create `packages/design-system/src/components/SelectableTile/SelectableTile.tsx`:

```tsx
import { classNames } from "../../helpers/classNames.js";
import type { SelectableTileProps } from "./types.js";

export function SelectableTile({
  label,
  description,
  icon,
  selected = false,
  disabled = false,
  className,
  onClick,
  type = "button",
  ...buttonProps
}: SelectableTileProps) {
  return (
    <button
      {...buttonProps}
      className={classNames(
        "ehSelectableTile",
        {
          "ehSelectableTile--selected": selected,
          "ehSelectableTile--disabled": disabled
        },
        className
      )}
      type={type}
      disabled={disabled}
      aria-pressed={selected}
      onClick={(event) => {
        if (!disabled) {
          onClick?.(event);
        }
      }}
    >
      {icon ? (
        <span className="ehSelectableTile__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="ehSelectableTile__body">
        <span className="ehSelectableTile__label">{label}</span>
        {description ? (
          <span className="ehSelectableTile__description">{description}</span>
        ) : null}
      </span>
    </button>
  );
}
```

- [ ] **Step 5: Add CSS**

Create `packages/design-system/src/components/SelectableTile/SelectableTile.css`:

```css
.ehSelectableTile {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--eh-color-moon-300-alpha-14);
  border-radius: 12px;
  background: rgb(22 20 47 / 0.78);
  color: var(--eh-color-moon-120);
  cursor: pointer;
  font-family: var(--eh-font-sans);
  text-align: left;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    color 160ms ease;
}

.ehSelectableTile:hover {
  border-color: var(--eh-color-gold-alpha-44);
  background: rgb(30 27 62 / 0.92);
}

.ehSelectableTile--selected {
  border-color: var(--eh-color-gold);
  background: var(--eh-color-gold-alpha-14);
}

.ehSelectableTile--disabled {
  cursor: not-allowed;
  opacity: 0.54;
}

.ehSelectableTile__icon {
  display: grid;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 10px;
  background: var(--eh-color-gold-alpha-14);
  color: var(--eh-color-gold);
}

.ehSelectableTile__body {
  min-width: 0;
}

.ehSelectableTile__label {
  display: block;
  color: var(--eh-color-moon-120);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.25;
}

.ehSelectableTile__description {
  display: block;
  margin-top: 4px;
  color: var(--eh-color-moon-500);
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.35;
}
```

- [ ] **Step 6: Export it**

Create `packages/design-system/src/components/SelectableTile/index.ts`:

```ts
export * from "./SelectableTile.js";
export * from "./types.js";
```

Modify `packages/design-system/src/components/index.ts`:

```ts
export * from "./Button/index.js";
export * from "./Card/index.js";
export * from "./Chip/index.js";
export * from "./IconButton/index.js";
export * from "./LanguageSwitcher/index.js";
export * from "./Modal/index.js";
export * from "./OtpAuthForm/index.js";
export * from "./OtpCodeForm/index.js";
export * from "./SegmentedTabs/index.js";
export * from "./SelectableTile/index.js";
```

- [ ] **Step 7: Run the focused test and verify it passes**

Run:

```bash
pnpm test -- packages/design-system/src/components/SelectableTile/SelectableTile.test.tsx
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add packages/design-system/src/components/SelectableTile packages/design-system/src/components/index.ts
git commit -m "feat: add selectable tile control"
```

---

## Task 2: Design-System `NumberStepper`

**Files:**

- Create: `packages/design-system/src/components/NumberStepper/types.ts`
- Create: `packages/design-system/src/components/NumberStepper/NumberStepper.tsx`
- Create: `packages/design-system/src/components/NumberStepper/NumberStepper.css`
- Create: `packages/design-system/src/components/NumberStepper/index.ts`
- Create: `packages/design-system/src/components/NumberStepper/NumberStepper.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add `packages/design-system/src/components/NumberStepper/NumberStepper.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { NumberStepper } from "./NumberStepper";

describe("NumberStepper", () => {
  it("increments and decrements within bounds", () => {
    const onValueChange = vi.fn();
    const stepper = NumberStepper({
      value: 3,
      min: 2,
      max: 5,
      step: 1,
      decrementLabel: "Уменьшить",
      incrementLabel: "Увеличить",
      onValueChange
    });

    const buttons = stepper.props.children.filter((child: { type: string }) => child.type === "button");
    buttons[0].props.onClick();
    buttons[1].props.onClick();

    expect(onValueChange).toHaveBeenNthCalledWith(1, 2);
    expect(onValueChange).toHaveBeenNthCalledWith(2, 4);
  });

  it("clamps values at min and max", () => {
    const onValueChange = vi.fn();
    const minStepper = NumberStepper({
      value: 2,
      min: 2,
      max: 5,
      decrementLabel: "Уменьшить",
      incrementLabel: "Увеличить",
      onValueChange
    });
    const minButtons = minStepper.props.children.filter((child: { type: string }) => child.type === "button");

    minButtons[0].props.onClick();
    expect(onValueChange).toHaveBeenCalledWith(2);

    const maxStepper = NumberStepper({
      value: 5,
      min: 2,
      max: 5,
      decrementLabel: "Уменьшить",
      incrementLabel: "Увеличить",
      onValueChange
    });
    const maxButtons = maxStepper.props.children.filter((child: { type: string }) => child.type === "button");

    maxButtons[1].props.onClick();
    expect(onValueChange).toHaveBeenLastCalledWith(5);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm test -- packages/design-system/src/components/NumberStepper/NumberStepper.test.tsx
```

Expected: fail because `NumberStepper` does not exist.

- [ ] **Step 3: Add types**

Create `packages/design-system/src/components/NumberStepper/types.ts`:

```ts
export type NumberStepperProps = {
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly suffix?: string;
  readonly decrementLabel: string;
  readonly incrementLabel: string;
  readonly className?: string;
  readonly onValueChange: (value: number) => void;
};
```

- [ ] **Step 4: Add implementation**

Create `packages/design-system/src/components/NumberStepper/NumberStepper.tsx`:

```tsx
import { classNames } from "../../helpers/classNames.js";
import type { NumberStepperProps } from "./types.js";

export function NumberStepper({
  value,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  suffix,
  decrementLabel,
  incrementLabel,
  className,
  onValueChange
}: NumberStepperProps) {
  const decrement = () => onValueChange(clamp(value - step, min, max));
  const increment = () => onValueChange(clamp(value + step, min, max));

  return (
    <div className={classNames("ehNumberStepper", className)}>
      <button
        className="ehNumberStepper__button"
        type="button"
        aria-label={decrementLabel}
        onClick={decrement}
      >
        -
      </button>
      <span className="ehNumberStepper__value">
        {value}
        {suffix ?? ""}
      </span>
      <button
        className="ehNumberStepper__button"
        type="button"
        aria-label={incrementLabel}
        onClick={increment}
      >
        +
      </button>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
```

- [ ] **Step 5: Add CSS**

Create `packages/design-system/src/components/NumberStepper/NumberStepper.css`:

```css
.ehNumberStepper {
  display: inline-flex;
  align-items: center;
  gap: 9px;
}

.ehNumberStepper__button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid var(--eh-color-moon-300-alpha-14);
  border-radius: 10px;
  background: rgb(22 20 47 / 0.9);
  color: var(--eh-color-moon-120);
  cursor: pointer;
  font: inherit;
  font-weight: 800;
}

.ehNumberStepper__button:hover {
  border-color: var(--eh-color-gold-alpha-44);
  color: var(--eh-color-gold);
}

.ehNumberStepper__value {
  min-width: 42px;
  color: var(--eh-color-moon-120);
  font-family: var(--eh-font-mono);
  font-size: 15px;
  font-weight: 700;
  text-align: center;
}
```

- [ ] **Step 6: Export it**

Create `packages/design-system/src/components/NumberStepper/index.ts`:

```ts
export * from "./NumberStepper.js";
export * from "./types.js";
```

Modify `packages/design-system/src/components/index.ts` and add `NumberStepper` after `Modal`:

```ts
export * from "./NumberStepper/index.js";
```

- [ ] **Step 7: Run the focused test and verify it passes**

Run:

```bash
pnpm test -- packages/design-system/src/components/NumberStepper/NumberStepper.test.tsx
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add packages/design-system/src/components/NumberStepper
git commit -m "feat: add number stepper control"
```

---

## Task 3: Design-System `IconPicker`

**Files:**

- Create: `packages/design-system/src/components/IconPicker/types.ts`
- Create: `packages/design-system/src/components/IconPicker/IconPicker.tsx`
- Create: `packages/design-system/src/components/IconPicker/IconPicker.css`
- Create: `packages/design-system/src/components/IconPicker/index.ts`
- Create: `packages/design-system/src/components/IconPicker/IconPicker.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add `packages/design-system/src/components/IconPicker/IconPicker.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { IconPicker } from "./IconPicker";

describe("IconPicker", () => {
  it("renders icon options and emits selected icon name", () => {
    const onValueChange = vi.fn();
    const picker = IconPicker({
      value: "check",
      iconNames: ["check", "video"],
      ariaLabel: "Выберите иконку",
      onValueChange
    });

    expect(picker.props.role).toBe("listbox");
    expect(picker.props["aria-label"]).toBe("Выберите иконку");

    const options = picker.props.children;
    expect(options).toHaveLength(2);
    expect(options[0].props["aria-selected"]).toBe(true);
    expect(options[1].props["aria-selected"]).toBe(false);

    options[1].props.onClick();
    expect(onValueChange).toHaveBeenCalledWith("video");
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm test -- packages/design-system/src/components/IconPicker/IconPicker.test.tsx
```

Expected: fail because `IconPicker` does not exist.

- [ ] **Step 3: Add types**

Create `packages/design-system/src/components/IconPicker/types.ts`:

```ts
import type { IconName } from "../../icons/Icon/index.js";

export type IconPickerProps<TIconName extends IconName = IconName> = {
  readonly value: TIconName;
  readonly iconNames: readonly TIconName[];
  readonly ariaLabel: string;
  readonly className?: string;
  readonly onValueChange: (value: TIconName) => void;
};
```

- [ ] **Step 4: Add implementation**

Create `packages/design-system/src/components/IconPicker/IconPicker.tsx`:

```tsx
import { classNames } from "../../helpers/classNames.js";
import { Icon, type IconName } from "../../icons/Icon/index.js";
import type { IconPickerProps } from "./types.js";

export function IconPicker<TIconName extends IconName = IconName>({
  value,
  iconNames,
  ariaLabel,
  className,
  onValueChange
}: IconPickerProps<TIconName>) {
  return (
    <div className={classNames("ehIconPicker", className)} role="listbox" aria-label={ariaLabel}>
      {iconNames.map((iconName) => {
        const selected = iconName === value;

        return (
          <button
            key={iconName}
            className={classNames("ehIconPicker__option", {
              "ehIconPicker__option--selected": selected
            })}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onValueChange(iconName)}
          >
            <Icon iconName={iconName} width={16} height={16} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Add CSS**

Create `packages/design-system/src/components/IconPicker/IconPicker.css`:

```css
.ehIconPicker {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(34px, 1fr));
  gap: 6px;
  min-width: 220px;
  padding: 8px;
  border: 1px solid var(--eh-color-moon-300-alpha-14);
  border-radius: 12px;
  background: rgb(16 14 35 / 0.98);
}

.ehIconPicker__option {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--eh-color-moon-500);
  cursor: pointer;
}

.ehIconPicker__option:hover,
.ehIconPicker__option--selected {
  border-color: var(--eh-color-gold-alpha-44);
  background: var(--eh-color-gold-alpha-14);
  color: var(--eh-color-gold);
}
```

- [ ] **Step 6: Export it**

Create `packages/design-system/src/components/IconPicker/index.ts`:

```ts
export * from "./IconPicker.js";
export * from "./types.js";
```

Modify `packages/design-system/src/components/index.ts` and add `IconPicker` after `IconButton`:

```ts
export * from "./IconPicker/index.js";
```

- [ ] **Step 7: Run design-system component tests**

Run:

```bash
pnpm test -- packages/design-system/src/components/SelectableTile/SelectableTile.test.tsx packages/design-system/src/components/NumberStepper/NumberStepper.test.tsx packages/design-system/src/components/IconPicker/IconPicker.test.tsx
```

Expected: all three pass.

- [ ] **Step 8: Run design-system typecheck**

Run:

```bash
pnpm --filter @elevenhouse/design-system typecheck
```

Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add packages/design-system/src/components/IconPicker packages/design-system/src/components/index.ts
git commit -m "feat: add icon picker control"
```

---

## Task 4: Product Constructor Options and Draft Helpers

**Files:**

- Create: `apps/astrologer-web/src/features/products/model/productConstructorOptions.ts`
- Create: `apps/astrologer-web/src/features/products/model/productConstructorOptions.test.ts`
- Modify: `apps/astrologer-web/src/features/products/model/productDraft.ts`
- Modify: `apps/astrologer-web/src/features/products/model/productDraft.test.ts`

- [ ] **Step 1: Write constructor options tests**

Create `apps/astrologer-web/src/features/products/model/productConstructorOptions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  productAccessGrantOptions,
  productDeliveryFormatOptions,
  productExecutionModeOptions,
  productIconNames,
  productMethodOptions,
  productParticipantModeOptions,
  productPaymentModelOptions,
  productRequiredClientDataOptions,
  productSubscriptionPeriodOptions
} from "./productConstructorOptions";

describe("product constructor options", () => {
  it("keeps option sets aligned with product contracts", () => {
    expect(productDeliveryFormatOptions.map((option) => option.value)).toEqual([
      "video",
      "audio",
      "chat",
      "text",
      "file",
      "channel"
    ]);
    expect(productExecutionModeOptions.map((option) => option.value)).toEqual([
      "live",
      "async",
      "instant"
    ]);
    expect(productPaymentModelOptions.map((option) => option.value)).toEqual([
      "once",
      "pack",
      "sub",
      "free"
    ]);
    expect(productParticipantModeOptions.map((option) => option.value)).toEqual([
      "solo",
      "group",
      "gift"
    ]);
    expect(productRequiredClientDataOptions.map((option) => option.value)).toContain("chart1");
    expect(productMethodOptions.map((option) => option.value)).toContain("natal");
    expect(productAccessGrantOptions.map((option) => option.value)).toContain("course");
    expect(productSubscriptionPeriodOptions.map((option) => option.value)).toEqual([
      "week",
      "month",
      "year"
    ]);
    expect(productIconNames).toContain("check");
    expect(productIconNames).toContain("video");
  });
});
```

- [ ] **Step 2: Write draft helper tests**

Append to `apps/astrologer-web/src/features/products/model/productDraft.test.ts`:

```ts
import {
  addProductIncludedItem,
  addProductModifier,
  removeProductIncludedItem,
  removeProductModifier,
  toggleProductDraftArrayValue,
  updateProductIncludedItem,
  updateProductModifier
} from "./productDraft";

it("toggles array values without duplicates", () => {
  const draft = createDefaultProductDraft("single");

  expect(toggleProductDraftArrayValue(draft, "deliveryFormats", "audio").deliveryFormats).toEqual([
    "video",
    "audio"
  ]);
  expect(toggleProductDraftArrayValue(draft, "deliveryFormats", "video").deliveryFormats).toEqual([]);
});

it("adds, updates and removes included items", () => {
  const draft = createDefaultProductDraft("custom");
  const withItem = addProductIncludedItem(draft);
  const lastIndex = withItem.includedItems.length - 1;

  expect(withItem.includedItems[lastIndex]).toEqual({
    text: "",
    icon: "check",
    order: (lastIndex + 1) * 10
  });

  const updated = updateProductIncludedItem(withItem, lastIndex, {
    text: "Персональная карта",
    icon: "orbit"
  });
  expect(updated.includedItems[lastIndex]).toMatchObject({
    text: "Персональная карта",
    icon: "orbit"
  });

  expect(removeProductIncludedItem(updated, lastIndex).includedItems).toHaveLength(lastIndex);
});

it("adds, updates and removes product modifiers", () => {
  const draft = createDefaultProductDraft("single");
  const withModifier = addProductModifier(draft);

  expect(withModifier.modifiers[0]).toEqual({
    label: "",
    priceMinor: 0,
    kind: "fixed",
    isEnabled: true,
    createsArtifact: false,
    order: 10
  });

  const updated = updateProductModifier(withModifier, 0, {
    label: "PDF-резюме",
    priceMinor: 99000,
    createsArtifact: true
  });
  expect(updated.modifiers[0]).toMatchObject({
    label: "PDF-резюме",
    priceMinor: 99000,
    createsArtifact: true
  });

  expect(removeProductModifier(updated, 0).modifiers).toEqual([]);
});
```

- [ ] **Step 3: Run focused tests and verify they fail**

Run:

```bash
pnpm test -- apps/astrologer-web/src/features/products/model/productConstructorOptions.test.ts apps/astrologer-web/src/features/products/model/productDraft.test.ts
```

Expected: fail because the options and helper exports do not exist.

- [ ] **Step 4: Add option metadata**

Create `apps/astrologer-web/src/features/products/model/productConstructorOptions.ts`:

```ts
import type {
  ProductAccessGrant,
  ProductDeliveryFormat,
  ProductExecutionMode,
  ProductMethod,
  ProductParticipantMode,
  ProductPaymentModel,
  ProductRequiredClientData,
  ProductSubscriptionPeriod
} from "@elevenhouse/contracts";
import type { IconName } from "@elevenhouse/design-system/icons/Icon";

export type ProductConstructorOption<TValue extends string> = {
  readonly value: TValue;
  readonly iconName: IconName;
};

export const productDeliveryFormatOptions = [
  { value: "video", iconName: "video" },
  { value: "audio", iconName: "content" },
  { value: "chat", iconName: "chat" },
  { value: "text", iconName: "content" },
  { value: "file", iconName: "box" },
  { value: "channel", iconName: "flow" }
] satisfies readonly ProductConstructorOption<ProductDeliveryFormat>[];

export const productExecutionModeOptions = [
  { value: "live", iconName: "video" },
  { value: "async", iconName: "refresh" },
  { value: "instant", iconName: "sparkle" }
] satisfies readonly ProductConstructorOption<ProductExecutionMode>[];

export const productPaymentModelOptions = [
  { value: "once", iconName: "wallet" },
  { value: "pack", iconName: "box" },
  { value: "sub", iconName: "refresh" },
  { value: "free", iconName: "sparkle" }
] satisfies readonly ProductConstructorOption<ProductPaymentModel>[];

export const productSubscriptionPeriodOptions = [
  { value: "week", iconName: "refresh" },
  { value: "month", iconName: "refresh" },
  { value: "year", iconName: "refresh" }
] satisfies readonly ProductConstructorOption<ProductSubscriptionPeriod>[];

export const productParticipantModeOptions = [
  { value: "solo", iconName: "verified" },
  { value: "group", iconName: "chat" },
  { value: "gift", iconName: "sparkle" }
] satisfies readonly ProductConstructorOption<ProductParticipantMode>[];

export const productRequiredClientDataOptions = [
  { value: "chart1", iconName: "orbit" },
  { value: "cities", iconName: "reference" },
  { value: "chart2", iconName: "chat" },
  { value: "question", iconName: "chat" },
  { value: "event", iconName: "content" }
] satisfies readonly ProductConstructorOption<ProductRequiredClientData>[];

export const productMethodOptions = [
  { value: "natal", iconName: "orbit" },
  { value: "forecast", iconName: "refresh" },
  { value: "synastry", iconName: "chat" },
  { value: "child", iconName: "verified" },
  { value: "numerology", iconName: "content" },
  { value: "matrix", iconName: "orbit" },
  { value: "humandesign", iconName: "flow" }
] satisfies readonly ProductConstructorOption<ProductMethod>[];

export const productAccessGrantOptions = [
  { value: "content", iconName: "content" },
  { value: "channel", iconName: "flow" },
  { value: "records", iconName: "video" },
  { value: "course", iconName: "box" },
  { value: "community", iconName: "chat" },
  { value: "journal", iconName: "reference" }
] satisfies readonly ProductConstructorOption<ProductAccessGrant>[];

export const productIconNames = [
  "check",
  "sparkle",
  "video",
  "chat",
  "content",
  "box",
  "wallet",
  "orbit",
  "reference",
  "verified",
  "refresh"
] satisfies readonly IconName[];
```

- [ ] **Step 5: Add draft helper exports**

Modify `apps/astrologer-web/src/features/products/model/productDraft.ts` by adding these exports after `createProductDraftFromResponse`:

```ts
export type ProductDraftArrayKey =
  | "deliveryFormats"
  | "requiredClientData"
  | "methods"
  | "accessGrants";

export function toggleProductDraftArrayValue<TKey extends ProductDraftArrayKey>(
  draft: ProductFormDraft,
  key: TKey,
  value: ProductFormDraft[TKey][number]
): ProductFormDraft {
  const current = draft[key] as readonly string[];
  const next = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];

  return {
    ...draft,
    [key]: next
  };
}

export function addProductIncludedItem(draft: ProductFormDraft): ProductFormDraft {
  return {
    ...draft,
    includedItems: [
      ...draft.includedItems,
      {
        text: "",
        icon: "check",
        order: (draft.includedItems.length + 1) * 10
      }
    ]
  };
}

export function updateProductIncludedItem(
  draft: ProductFormDraft,
  index: number,
  patch: Partial<ProductIncludedItemRequest>
): ProductFormDraft {
  return {
    ...draft,
    includedItems: draft.includedItems.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item
    )
  };
}

export function removeProductIncludedItem(draft: ProductFormDraft, index: number): ProductFormDraft {
  return {
    ...draft,
    includedItems: draft.includedItems.filter((_, itemIndex) => itemIndex !== index)
  };
}

export function addProductModifier(draft: ProductFormDraft): ProductFormDraft {
  return {
    ...draft,
    modifiers: [
      ...draft.modifiers,
      {
        label: "",
        priceMinor: 0,
        kind: "fixed",
        isEnabled: true,
        createsArtifact: false,
        order: (draft.modifiers.length + 1) * 10
      }
    ]
  };
}

export function updateProductModifier(
  draft: ProductFormDraft,
  index: number,
  patch: Partial<ProductModifierRequest>
): ProductFormDraft {
  return {
    ...draft,
    modifiers: draft.modifiers.map((modifier, modifierIndex) =>
      modifierIndex === index ? { ...modifier, ...patch } : modifier
    )
  };
}

export function removeProductModifier(draft: ProductFormDraft, index: number): ProductFormDraft {
  return {
    ...draft,
    modifiers: draft.modifiers.filter((_, modifierIndex) => modifierIndex !== index)
  };
}
```

- [ ] **Step 6: Run focused tests and verify they pass**

Run:

```bash
pnpm test -- apps/astrologer-web/src/features/products/model/productConstructorOptions.test.ts apps/astrologer-web/src/features/products/model/productDraft.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/astrologer-web/src/features/products/model/productConstructorOptions.ts apps/astrologer-web/src/features/products/model/productConstructorOptions.test.ts apps/astrologer-web/src/features/products/model/productDraft.ts apps/astrologer-web/src/features/products/model/productDraft.test.ts
git commit -m "feat: add product constructor model helpers"
```

---

## Task 5: Product Mutation Hooks

**Files:**

- Create: `apps/astrologer-web/src/features/products/model/useUpdateProductMutation.ts`
- Create: `apps/astrologer-web/src/features/products/model/usePublishProductMutation.ts`
- Create: `apps/astrologer-web/src/features/products/model/useMoveProductToDraftMutation.ts`
- Create: `apps/astrologer-web/src/features/products/model/useArchiveProductMutation.ts`
- Create: `apps/astrologer-web/src/features/products/model/useDuplicateProductMutation.ts`
- Modify: `apps/astrologer-web/src/features/products/model/productsQueryOptions.test.ts`

- [ ] **Step 1: Add hook coverage to existing query options test**

Append to `apps/astrologer-web/src/features/products/model/productsQueryOptions.test.ts`:

```ts
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useArchiveProductMutation } from "./useArchiveProductMutation";
import { useDuplicateProductMutation } from "./useDuplicateProductMutation";
import { useMoveProductToDraftMutation } from "./useMoveProductToDraftMutation";
import { usePublishProductMutation } from "./usePublishProductMutation";
import { useUpdateProductMutation } from "./useUpdateProductMutation";

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useMutation: vi.fn((options: unknown) => options),
    useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() }))
  };
});

it("creates React Query mutation hooks for all product actions", () => {
  expect(useUpdateProductMutation()).toHaveProperty("mutationFn");
  expect(usePublishProductMutation()).toHaveProperty("mutationFn");
  expect(useMoveProductToDraftMutation()).toHaveProperty("mutationFn");
  expect(useArchiveProductMutation()).toHaveProperty("mutationFn");
  expect(useDuplicateProductMutation()).toHaveProperty("mutationFn");
  expect(useQueryClient).toHaveBeenCalled();
  expect(useMutation).toHaveBeenCalled();
});
```

Merge the new imports into the existing top-level import section; do not add a second import block for the same module.

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```bash
pnpm test -- apps/astrologer-web/src/features/products/model/productsQueryOptions.test.ts
```

Expected: fail because mutation hook files do not exist.

- [ ] **Step 3: Add update hook**

Create `apps/astrologer-web/src/features/products/model/useUpdateProductMutation.ts`:

```ts
import type { ProductResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type { UpdateProductInput } from "../api/updateProduct";
import { updateProductMutationOptions } from "./productsQueryOptions";

export function useUpdateProductMutation(): UseMutationResult<
  ProductResponse,
  Error,
  UpdateProductInput
> {
  const queryClient = useQueryClient();

  return useMutation(updateProductMutationOptions(queryClient));
}
```

- [ ] **Step 4: Add status/action hooks**

Create `apps/astrologer-web/src/features/products/model/usePublishProductMutation.ts`:

```ts
import type { ProductResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { publishProductMutationOptions } from "./productsQueryOptions";

export function usePublishProductMutation(): UseMutationResult<ProductResponse, Error, string> {
  const queryClient = useQueryClient();

  return useMutation(publishProductMutationOptions(queryClient));
}
```

Create `apps/astrologer-web/src/features/products/model/useMoveProductToDraftMutation.ts`:

```ts
import type { ProductResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { moveProductToDraftMutationOptions } from "./productsQueryOptions";

export function useMoveProductToDraftMutation(): UseMutationResult<ProductResponse, Error, string> {
  const queryClient = useQueryClient();

  return useMutation(moveProductToDraftMutationOptions(queryClient));
}
```

Create `apps/astrologer-web/src/features/products/model/useArchiveProductMutation.ts`:

```ts
import type { ProductResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { archiveProductMutationOptions } from "./productsQueryOptions";

export function useArchiveProductMutation(): UseMutationResult<ProductResponse, Error, string> {
  const queryClient = useQueryClient();

  return useMutation(archiveProductMutationOptions(queryClient));
}
```

Create `apps/astrologer-web/src/features/products/model/useDuplicateProductMutation.ts`:

```ts
import type { ProductResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { duplicateProductMutationOptions } from "./productsQueryOptions";

export function useDuplicateProductMutation(): UseMutationResult<ProductResponse, Error, string> {
  const queryClient = useQueryClient();

  return useMutation(duplicateProductMutationOptions(queryClient));
}
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm test -- apps/astrologer-web/src/features/products/model/productsQueryOptions.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/astrologer-web/src/features/products/model/useUpdateProductMutation.ts apps/astrologer-web/src/features/products/model/usePublishProductMutation.ts apps/astrologer-web/src/features/products/model/useMoveProductToDraftMutation.ts apps/astrologer-web/src/features/products/model/useArchiveProductMutation.ts apps/astrologer-web/src/features/products/model/useDuplicateProductMutation.ts apps/astrologer-web/src/features/products/model/productsQueryOptions.test.ts
git commit -m "feat: add product action mutation hooks"
```

---

## Task 6: Product Constructor Modal UI

**Files:**

- Create: `apps/astrologer-web/src/pages/products/components/ProductConstructorModal/ProductConstructorModal.tsx`
- Create: `apps/astrologer-web/src/pages/products/components/ProductConstructorModal/index.ts`
- Create: `apps/astrologer-web/src/pages/products/components/ProductConstructorModal/ProductConstructorModal.test.tsx`
- Modify: `apps/astrologer-web/src/pages/products/ProductsPage.module.css`

- [ ] **Step 1: Write focused modal tests**

Create `apps/astrologer-web/src/pages/products/components/ProductConstructorModal/ProductConstructorModal.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import { SelectableTile } from "@elevenhouse/design-system/components/SelectableTile";
import { NumberStepper } from "@elevenhouse/design-system/components/NumberStepper";
import { createDefaultProductDraft } from "../../../../features/products/model/productDraft";
import { productCopyByLocale } from "../../../../features/products/model/productCopy";
import { ProductConstructorModal } from "./ProductConstructorModal";

const copy = {
  title: "Новый продукт",
  closeLabel: "Закрыть редактор продукта",
  typeLabel: "Тип",
  titleLabel: "Название",
  titlePlaceholder: "Например, Натальный разбор",
  subtitleLabel: "Описание",
  subtitlePlaceholder: "Коротко объясните, что получит клиент",
  priceLabel: "Цена",
  deliveryFormatsLabel: "Формат",
  executionModeLabel: "Когда выполняется",
  paymentModelLabel: "Оплата",
  durationLabel: "Объём",
  participantModeLabel: "Участники",
  requiredClientDataLabel: "Данные от клиента",
  methodsLabel: "Метод / система",
  accessGrantsLabel: "Доступ",
  includedItemsLabel: "Что входит",
  modifiersLabel: "Допы / модификаторы",
  previewLabel: "Превью",
  addIncludedItemLabel: "Добавить пункт",
  addModifierLabel: "Добавить модификатор",
  decrementLabel: "Уменьшить",
  incrementLabel: "Увеличить",
  iconPickerLabel: "Выберите иконку",
  cancelLabel: "Отмена",
  saveDraftLabel: "Сохранить черновик",
  savingLabel: "Сохраняем",
  genericError: "Не удалось сохранить продукт"
};

describe("ProductConstructorModal", () => {
  it("renders constructor sections and updates draft fields", () => {
    const draft = {
      ...createDefaultProductDraft("pack"),
      title: "Пакет консультаций"
    };
    const onDraftChange = vi.fn();
    const onSave = vi.fn();

    const modal = ProductConstructorModal({
      copy,
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      draft,
      isSaving: false,
      error: null,
      onDraftChange,
      onSave,
      onClose: vi.fn()
    });

    expect(findByType(modal, Modal).props.title).toBe("Новый продукт");
    expect(findAllByType(modal, SelectableTile).length).toBeGreaterThan(12);
    expect(findAllByType(modal, NumberStepper).length).toBeGreaterThan(0);
    expect(JSON.stringify(modal.props.children)).toContain("Формат");
    expect(JSON.stringify(modal.props.children)).toContain("Превью");

    findByProp(modal, "data-product-constructor-title").props.onChange({
      currentTarget: { value: "Новая консультация" }
    });
    expect(onDraftChange).toHaveBeenCalledWith({
      ...draft,
      title: "Новая консультация"
    });

    findByProp(modal, "data-product-constructor-form").props.onSubmit({
      preventDefault: vi.fn()
    });
    expect(onSave).toHaveBeenCalledOnce();
  });
});

function findByType(root: any, type: unknown): any {
  const match = findAllByType(root, type)[0];
  if (!match) throw new Error("Expected element by type");
  return match;
}

function findAllByType(root: any, type: unknown): any[] {
  const matches: any[] = [];
  visit(root, (node) => {
    if (node?.type === type) matches.push(node);
  });
  return matches;
}

function findByProp(root: any, prop: string): any {
  let found: any = null;
  visit(root, (node) => {
    if (node?.props && prop in node.props) found = node;
  });
  if (!found) throw new Error(`Expected ${prop}`);
  return found;
}

function visit(node: any, visitor: (node: any) => void) {
  if (!node || typeof node !== "object") return;
  visitor(node);
  const children = node.props?.children;
  if (Array.isArray(children)) children.forEach((child) => visit(child, visitor));
  else visit(children, visitor);
}
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```bash
pnpm test -- apps/astrologer-web/src/pages/products/components/ProductConstructorModal/ProductConstructorModal.test.tsx
```

Expected: fail because `ProductConstructorModal` does not exist.

- [ ] **Step 3: Add the modal component**

Create `apps/astrologer-web/src/pages/products/components/ProductConstructorModal/ProductConstructorModal.tsx` with this structure:

```tsx
import type { FormEvent } from "react";
import type { ProductLocale, ProductCopy } from "../../../../features/products/model/productCopy";
import type { ProductFormDraft } from "../../../../features/products/model/productDraft";
import {
  addProductIncludedItem,
  addProductModifier,
  removeProductIncludedItem,
  removeProductModifier,
  toggleProductDraftArrayValue,
  updateProductIncludedItem,
  updateProductModifier
} from "../../../../features/products/model/productDraft";
import {
  productAccessGrantOptions,
  productDeliveryFormatOptions,
  productExecutionModeOptions,
  productMethodOptions,
  productParticipantModeOptions,
  productPaymentModelOptions,
  productRequiredClientDataOptions,
  productSubscriptionPeriodOptions
} from "../../../../features/products/model/productConstructorOptions";
import { formatMoneyMinor } from "../../../../features/products/model/productFormatting";
import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import "@elevenhouse/design-system/components/Modal.css";
import { NumberStepper } from "@elevenhouse/design-system/components/NumberStepper";
import "@elevenhouse/design-system/components/NumberStepper.css";
import { SelectableTile } from "@elevenhouse/design-system/components/SelectableTile";
import "@elevenhouse/design-system/components/SelectableTile.css";
import { Icon, type IconName } from "@elevenhouse/design-system/icons/Icon";
import styles from "../../ProductsPage.module.css";

export type ProductConstructorModalCopy = {
  readonly title: string;
  readonly closeLabel: string;
  readonly typeLabel: string;
  readonly titleLabel: string;
  readonly titlePlaceholder: string;
  readonly subtitleLabel: string;
  readonly subtitlePlaceholder: string;
  readonly priceLabel: string;
  readonly deliveryFormatsLabel: string;
  readonly executionModeLabel: string;
  readonly paymentModelLabel: string;
  readonly durationLabel: string;
  readonly participantModeLabel: string;
  readonly requiredClientDataLabel: string;
  readonly methodsLabel: string;
  readonly accessGrantsLabel: string;
  readonly includedItemsLabel: string;
  readonly modifiersLabel: string;
  readonly previewLabel: string;
  readonly addIncludedItemLabel: string;
  readonly addModifierLabel: string;
  readonly decrementLabel: string;
  readonly incrementLabel: string;
  readonly iconPickerLabel: string;
  readonly cancelLabel: string;
  readonly saveDraftLabel: string;
  readonly savingLabel: string;
  readonly genericError: string;
};

export type ProductConstructorModalProps = {
  readonly copy: ProductConstructorModalCopy;
  readonly productCopy: ProductCopy;
  readonly locale: ProductLocale;
  readonly draft: ProductFormDraft;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly onDraftChange: (draft: ProductFormDraft) => void;
  readonly onSave: () => Promise<void> | void;
  readonly onClose: () => void;
};

export function ProductConstructorModal({
  copy,
  productCopy,
  locale,
  draft,
  isSaving,
  error,
  onDraftChange,
  onSave,
  onClose
}: ProductConstructorModalProps) {
  const update = (patch: Partial<ProductFormDraft>) => onDraftChange({ ...draft, ...patch });

  return (
    <Modal title={copy.title} closeLabel={copy.closeLabel} className={styles.constructorModal} onClose={onClose}>
      <form
        className={styles.constructorForm}
        data-product-constructor-form="true"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          void onSave();
        }}
      >
        <div className={styles.constructorMain}>
          <div className={styles.constructorFields}>
            <ConstructorBlock label={copy.typeLabel}>
              <div className={styles.typePreviewLabel}>{productCopy.types[draft.type].label}</div>
            </ConstructorBlock>

            <ConstructorBlock label={copy.titleLabel}>
              <input
                className={styles.textInput}
                data-product-constructor-title="true"
                value={draft.title}
                placeholder={copy.titlePlaceholder}
                onChange={(event) => update({ title: event.currentTarget.value })}
              />
            </ConstructorBlock>

            <ConstructorBlock label={copy.subtitleLabel}>
              <textarea
                className={`${styles.textInput} ${styles.textArea}`}
                value={draft.subtitle}
                placeholder={copy.subtitlePlaceholder}
                rows={3}
                onChange={(event) => update({ subtitle: event.currentTarget.value })}
              />
            </ConstructorBlock>

            <ConstructorBlock label={copy.priceLabel}>
              <input
                className={styles.textInput}
                inputMode="numeric"
                value={String(Math.floor(draft.priceMinor / 100))}
                onChange={(event) =>
                  update({ priceMinor: Number(event.currentTarget.value.replace(/[^\d]/g, "") || 0) * 100 })
                }
              />
            </ConstructorBlock>

            <OptionBlock
              label={copy.deliveryFormatsLabel}
              options={productDeliveryFormatOptions}
              copy={productCopy.deliveryFormats}
              selectedValues={draft.deliveryFormats}
              onToggle={(value) => onDraftChange(toggleProductDraftArrayValue(draft, "deliveryFormats", value))}
            />
            <SingleOptionBlock
              label={copy.executionModeLabel}
              options={productExecutionModeOptions}
              copy={productCopy.executionModes}
              value={draft.executionMode}
              onChange={(value) => update({ executionMode: value })}
            />
            <SingleOptionBlock
              label={copy.paymentModelLabel}
              options={productPaymentModelOptions}
              copy={productCopy.paymentModels}
              value={draft.paymentModel}
              onChange={(value) => update({ paymentModel: value })}
            />

            {draft.paymentModel === "pack" ? (
              <ConstructorBlock label={productCopy.paymentModels.pack.label}>
                <NumberStepper
                  value={draft.packageSessionCount ?? 2}
                  min={2}
                  decrementLabel={copy.decrementLabel}
                  incrementLabel={copy.incrementLabel}
                  onValueChange={(value) => update({ packageSessionCount: value })}
                />
                <NumberStepper
                  value={draft.packageDiscountPercent ?? 0}
                  min={0}
                  max={100}
                  step={5}
                  suffix="%"
                  decrementLabel={copy.decrementLabel}
                  incrementLabel={copy.incrementLabel}
                  onValueChange={(value) => update({ packageDiscountPercent: value })}
                />
              </ConstructorBlock>
            ) : null}

            {draft.paymentModel === "sub" ? (
              <SingleOptionBlock
                label={productCopy.paymentModels.sub.label}
                options={productSubscriptionPeriodOptions}
                copy={productCopy.subscriptionPeriods}
                value={draft.subscriptionPeriod ?? "month"}
                onChange={(value) => update({ subscriptionPeriod: value })}
              />
            ) : null}

            <SingleOptionBlock
              label={copy.participantModeLabel}
              options={productParticipantModeOptions}
              copy={productCopy.participantModes}
              value={draft.participantMode}
              onChange={(value) => update({ participantMode: value })}
            />

            <OptionBlock
              label={copy.requiredClientDataLabel}
              options={productRequiredClientDataOptions}
              copy={productCopy.requiredClientData}
              selectedValues={draft.requiredClientData}
              onToggle={(value) => onDraftChange(toggleProductDraftArrayValue(draft, "requiredClientData", value))}
            />
            <OptionBlock
              label={copy.methodsLabel}
              options={productMethodOptions}
              copy={productCopy.methods}
              selectedValues={draft.methods}
              onToggle={(value) => onDraftChange(toggleProductDraftArrayValue(draft, "methods", value))}
            />
            <OptionBlock
              label={copy.accessGrantsLabel}
              options={productAccessGrantOptions}
              copy={productCopy.accessGrants}
              selectedValues={draft.accessGrants}
              onToggle={(value) => onDraftChange(toggleProductDraftArrayValue(draft, "accessGrants", value))}
            />

            <ConstructorBlock label={copy.includedItemsLabel}>
              {draft.includedItems.map((item, index) => (
                <div className={styles.constructorRow} key={`${item.order}:${index}`}>
                  <input
                    className={styles.textInput}
                    value={item.text}
                    onChange={(event) =>
                      onDraftChange(updateProductIncludedItem(draft, index, { text: event.currentTarget.value }))
                    }
                  />
                  <button type="button" className={styles.iconTextButton} onClick={() => onDraftChange(removeProductIncludedItem(draft, index))}>
                    <Icon iconName="trash" width={14} height={14} aria-hidden="true" />
                  </button>
                </div>
              ))}
              <button type="button" className={styles.inlineAddButton} onClick={() => onDraftChange(addProductIncludedItem(draft))}>
                <Icon iconName="plus" width={14} height={14} aria-hidden="true" />
                {copy.addIncludedItemLabel}
              </button>
            </ConstructorBlock>

            <ConstructorBlock label={copy.modifiersLabel}>
              {draft.modifiers.map((modifier, index) => (
                <div className={styles.constructorRow} key={`${modifier.order}:${index}`}>
                  <input
                    className={styles.textInput}
                    value={modifier.label}
                    onChange={(event) =>
                      onDraftChange(updateProductModifier(draft, index, { label: event.currentTarget.value }))
                    }
                  />
                  <input
                    className={styles.textInput}
                    inputMode="numeric"
                    value={String(Math.floor(modifier.priceMinor / 100))}
                    onChange={(event) =>
                      onDraftChange(
                        updateProductModifier(draft, index, {
                          priceMinor: Number(event.currentTarget.value.replace(/[^\d]/g, "") || 0) * 100
                        })
                      )
                    }
                  />
                  <button type="button" className={styles.iconTextButton} onClick={() => onDraftChange(removeProductModifier(draft, index))}>
                    <Icon iconName="trash" width={14} height={14} aria-hidden="true" />
                  </button>
                </div>
              ))}
              <button type="button" className={styles.inlineAddButton} onClick={() => onDraftChange(addProductModifier(draft))}>
                <Icon iconName="plus" width={14} height={14} aria-hidden="true" />
                {copy.addModifierLabel}
              </button>
            </ConstructorBlock>
          </div>

          <aside className={styles.constructorPreview}>
            <span className={styles.summaryLabel}>{copy.previewLabel}</span>
            <h3>{draft.title || productCopy.types[draft.type].label}</h3>
            <p>{draft.subtitle || productCopy.types[draft.type].description}</p>
            <strong>{formatMoneyMinor(draft.paymentModel === "free" ? 0 : draft.priceMinor, draft.currency, locale)}</strong>
            <ul>
              {draft.includedItems.filter((item) => item.text.trim()).slice(0, 6).map((item) => (
                <li key={`${item.order}:${item.text}`}>{item.text}</li>
              ))}
            </ul>
          </aside>
        </div>

        {error ? <p className={styles.editorError} role="alert">{error}</p> : null}

        <div className={styles.editorActions}>
          <Button title={copy.cancelLabel} variant="default" onClick={onClose} disabled={isSaving} />
          <Button title={isSaving ? copy.savingLabel : copy.saveDraftLabel} type="submit" disabled={isSaving || !draft.title.trim()} />
        </div>
      </form>
    </Modal>
  );
}

type CopyRecord<TValue extends string> = Record<TValue, { readonly label: string; readonly description?: string }>;
type Option<TValue extends string> = { readonly value: TValue; readonly iconName: IconName };

function ConstructorBlock({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <section className={styles.constructorBlock}>
      <h3>{label}</h3>
      {children}
    </section>
  );
}

function OptionBlock<TValue extends string>({
  label,
  options,
  copy,
  selectedValues,
  onToggle
}: {
  readonly label: string;
  readonly options: readonly Option<TValue>[];
  readonly copy: CopyRecord<TValue>;
  readonly selectedValues: readonly TValue[];
  readonly onToggle: (value: TValue) => void;
}) {
  return (
    <ConstructorBlock label={label}>
      <div className={styles.constructorTileGrid}>
        {options.map((option) => (
          <SelectableTile
            key={option.value}
            label={copy[option.value].label}
            description={copy[option.value].description}
            icon={<Icon iconName={option.iconName} width={16} height={16} aria-hidden="true" />}
            selected={selectedValues.includes(option.value)}
            onClick={() => onToggle(option.value)}
          />
        ))}
      </div>
    </ConstructorBlock>
  );
}

function SingleOptionBlock<TValue extends string>({
  label,
  options,
  copy,
  value,
  onChange
}: {
  readonly label: string;
  readonly options: readonly Option<TValue>[];
  readonly copy: CopyRecord<TValue>;
  readonly value: TValue;
  readonly onChange: (value: TValue) => void;
}) {
  return (
    <ConstructorBlock label={label}>
      <div className={styles.constructorTileGrid}>
        {options.map((option) => (
          <SelectableTile
            key={option.value}
            label={copy[option.value].label}
            description={copy[option.value].description}
            icon={<Icon iconName={option.iconName} width={16} height={16} aria-hidden="true" />}
            selected={value === option.value}
            onClick={() => onChange(option.value)}
          />
        ))}
      </div>
    </ConstructorBlock>
  );
}
```

- [ ] **Step 4: Export the modal**

Create `apps/astrologer-web/src/pages/products/components/ProductConstructorModal/index.ts`:

```ts
export * from "./ProductConstructorModal";
```

- [ ] **Step 5: Add CSS**

Append to `apps/astrologer-web/src/pages/products/ProductsPage.module.css`:

```css
.constructorModal {
  width: min(1180px, calc(100vw - 32px));
}

.constructorForm {
  display: flex;
  min-height: 0;
  flex-direction: column;
}

.constructorMain {
  display: grid;
  gap: 20px;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
}

.constructorFields {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 16px;
}

.constructorBlock {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding-top: 16px;
  border-top: 1px solid var(--products-line);
}

.constructorBlock:first-child {
  padding-top: 0;
  border-top: 0;
}

.constructorBlock h3 {
  margin: 0;
  color: var(--eh-color-moon-120);
  font-size: 13px;
  font-weight: 800;
}

.constructorTileGrid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.constructorRow {
  display: grid;
  align-items: center;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr) auto;
}

.constructorPreview {
  position: sticky;
  top: 0;
  align-self: start;
  padding: 18px;
  border: 1px solid var(--products-line);
  border-radius: 16px;
  background: var(--products-panel);
}

.constructorPreview h3 {
  margin: 8px 0 6px;
  color: var(--eh-color-moon-120);
  font-size: 18px;
}

.constructorPreview p {
  margin: 0 0 14px;
  color: var(--eh-color-moon-500);
  font-size: 13px;
  line-height: 1.45;
}

.constructorPreview strong {
  display: block;
  margin-bottom: 14px;
  color: var(--products-accent-text);
  font-size: 24px;
}

.constructorPreview ul {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.constructorPreview li {
  color: var(--eh-color-moon-500);
  font-size: 12.5px;
}

.inlineAddButton,
.iconTextButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid var(--products-line);
  border-radius: 10px;
  background: rgb(22 20 47 / 0.74);
  color: var(--eh-color-moon-120);
  cursor: pointer;
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
}

.inlineAddButton {
  align-self: flex-start;
  padding: 8px 12px;
}

.iconTextButton {
  width: 38px;
  height: 38px;
}

@media (max-width: 920px) {
  .constructorMain {
    grid-template-columns: 1fr;
  }

  .constructorPreview {
    position: static;
  }
}
```

- [ ] **Step 6: Run focused modal test**

Run:

```bash
pnpm test -- apps/astrologer-web/src/pages/products/components/ProductConstructorModal/ProductConstructorModal.test.tsx
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/astrologer-web/src/pages/products/components/ProductConstructorModal apps/astrologer-web/src/pages/products/ProductsPage.module.css
git commit -m "feat: add product constructor modal"
```

---

## Task 7: Wire Constructor into Create and Edit Flows

**Files:**

- Modify: `apps/astrologer-web/src/pages/products/components/ProductsCreateFlow.tsx`
- Modify: `apps/astrologer-web/src/pages/products/hooks/useProductCreateFlow.ts`
- Modify: `apps/astrologer-web/src/pages/products/ProductsPage.tsx`
- Modify: `apps/astrologer-web/src/pages/products/ProductsPageView.tsx`
- Modify: `apps/astrologer-web/src/pages/products/components/ProductsResults.tsx`
- Modify: `apps/astrologer-web/src/pages/products/components/ProductCard.tsx`
- Modify: `apps/astrologer-web/src/common/i18n/astrologerCopy.ts`
- Modify: `apps/astrologer-web/src/pages/products/ProductsPage.test.tsx`
- Modify: `apps/astrologer-web/src/pages/products/components/ProductsPageComponents.test.tsx`

- [ ] **Step 1: Add failing page/component tests**

In `apps/astrologer-web/src/pages/products/components/ProductsPageComponents.test.tsx`, update imports:

```ts
import { ProductConstructorModal } from "./ProductConstructorModal";
```

Replace `ProductEditorModal` expectations in the create-flow test with `ProductConstructorModal`:

```ts
const constructorModal = findRequiredElementByType(flowView, ProductConstructorModal);
expect(constructorModal.props.draft).toBe(draft);
constructorModal.props.onDraftChange(draft);
constructorModal.props.onSave();
constructorModal.props.onClose();
expect(flow.updateDraft).toHaveBeenCalledWith(draft);
expect(flow.saveDraft).toHaveBeenCalledOnce();
expect(flow.closeEditor).toHaveBeenCalledOnce();
```

In `ProductCard` tests, assert action handlers:

```ts
it("exposes product card actions", () => {
  const onEdit = vi.fn();
  const onDuplicate = vi.fn();
  const onStatusChange = vi.fn();
  const card = ProductCard({
    product,
    productCopy: productCopyByLocale.ru,
    locale: "ru",
    actions: {
      editLabel: "Изменить",
      duplicateLabel: "Дублировать",
      publishLabel: "Опубликовать",
      draftLabel: "В черновик",
      archiveLabel: "В архив",
      onEdit,
      onDuplicate,
      onStatusChange
    }
  });

  findRequiredElementByProp(card, "data-product-action-edit").props.onClick();
  findRequiredElementByProp(card, "data-product-action-duplicate").props.onClick();
  findRequiredElementByProp(card, "data-product-action-archive").props.onClick();

  expect(onEdit).toHaveBeenCalledWith(product);
  expect(onDuplicate).toHaveBeenCalledWith(product.id);
  expect(onStatusChange).toHaveBeenCalledWith(product.id, "archived");
});
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```bash
pnpm test -- apps/astrologer-web/src/pages/products/components/ProductsPageComponents.test.tsx apps/astrologer-web/src/pages/products/ProductsPage.test.tsx
```

Expected: fail because the page still uses `ProductEditorModal` and card actions are missing.

- [ ] **Step 3: Extend copy**

Modify `AstrologerCopy["products"]["editor"]` in `apps/astrologer-web/src/common/i18n/astrologerCopy.ts` by adding:

```ts
deliveryFormatsLabel: string;
executionModeLabel: string;
paymentModelLabel: string;
durationLabel: string;
participantModeLabel: string;
requiredClientDataLabel: string;
methodsLabel: string;
accessGrantsLabel: string;
modifiersLabel: string;
previewLabel: string;
addIncludedItemLabel: string;
addModifierLabel: string;
decrementLabel: string;
incrementLabel: string;
iconPickerLabel: string;
```

Add `products.actions` copy:

```ts
actions: {
  editLabel: string;
  duplicateLabel: string;
  publishLabel: string;
  draftLabel: string;
  archiveLabel: string;
};
```

In the Russian dictionary use:

```ts
deliveryFormatsLabel: "Формат",
executionModeLabel: "Когда выполняется",
paymentModelLabel: "Оплата",
durationLabel: "Объём",
participantModeLabel: "Участники",
requiredClientDataLabel: "Данные от клиента",
methodsLabel: "Метод / система",
accessGrantsLabel: "Доступ",
modifiersLabel: "Допы / модификаторы",
previewLabel: "Превью",
addIncludedItemLabel: "Добавить пункт",
addModifierLabel: "Добавить модификатор",
decrementLabel: "Уменьшить",
incrementLabel: "Увеличить",
iconPickerLabel: "Выберите иконку",
actions: {
  editLabel: "Изменить",
  duplicateLabel: "Дублировать",
  publishLabel: "Опубликовать",
  draftLabel: "В черновик",
  archiveLabel: "В архив"
}
```

In the English dictionary use:

```ts
deliveryFormatsLabel: "Format",
executionModeLabel: "Delivery timing",
paymentModelLabel: "Payment",
durationLabel: "Scope",
participantModeLabel: "Participants",
requiredClientDataLabel: "Client data",
methodsLabel: "Method / system",
accessGrantsLabel: "Access",
modifiersLabel: "Add-ons / modifiers",
previewLabel: "Preview",
addIncludedItemLabel: "Add item",
addModifierLabel: "Add modifier",
decrementLabel: "Decrease",
incrementLabel: "Increase",
iconPickerLabel: "Choose icon",
actions: {
  editLabel: "Edit",
  duplicateLabel: "Duplicate",
  publishLabel: "Publish",
  draftLabel: "Move to draft",
  archiveLabel: "Archive"
}
```

- [ ] **Step 4: Update `ProductsCreateFlow`**

Modify `apps/astrologer-web/src/pages/products/components/ProductsCreateFlow.tsx`:

```tsx
import { ProductConstructorModal } from "./ProductConstructorModal";

// Replace ProductEditorModal rendering with:
{flow.editorDraft ? (
  <ProductConstructorModal
    copy={copy.editor}
    productCopy={productCopy}
    locale={productCopy === productCopyByLocale.ru ? "ru" : "en"}
    draft={flow.editorDraft}
    isSaving={flow.isSaving}
    error={flow.editorError}
    onDraftChange={flow.updateDraft}
    onSave={flow.saveDraft}
    onClose={flow.closeEditor}
  />
) : null}
```

Pass `locale` as an explicit prop from `ProductsPage` to `ProductsCreateFlow`; do not infer locale from copy object identity.

- [ ] **Step 5: Extend create flow hook for editing**

Modify `apps/astrologer-web/src/pages/products/hooks/useProductCreateFlow.ts`:

```ts
import type { ProductResponse } from "@elevenhouse/contracts";
import {
  createDefaultProductDraft,
  createProductDraftFromResponse,
  toCreateProductRequest,
  toUpdateProductRequest
} from "../../../features/products/model/productDraft";
import { useUpdateProductMutation } from "../../../features/products/model/useUpdateProductMutation";

type ProductCreateFlowState = {
  readonly isTypeModalOpen: boolean;
  readonly editorDraft: ProductFormDraft | null;
  readonly editingProductId: string | null;
  readonly editorError: string | null;
};

type ProductCreateFlowAction =
  | { readonly type: "openTypeSelection" }
  | { readonly type: "closeTypeSelection" }
  | { readonly type: "selectType"; readonly productType: ProductType }
  | { readonly type: "editProduct"; readonly product: ProductResponse }
  | { readonly type: "updateDraft"; readonly draft: ProductFormDraft }
  | { readonly type: "saveStarted" }
  | { readonly type: "saveSucceeded" }
  | { readonly type: "saveFailed"; readonly error: string }
  | { readonly type: "closeEditor" }
  | { readonly type: "returnToTypeSelection" }
  | { readonly type: "closeCreateFlow" };
```

Add `editingProductId: null` to `initialProductCreateFlowState`.

Add `editProduct` to the returned API:

```ts
readonly editProduct: (product: ProductResponse) => void;
```

Initialize the update mutation:

```ts
const updateProductMutation = useUpdateProductMutation();
const isSaving = createProductMutation.isPending || updateProductMutation.isPending;
```

Change `saveDraft`:

```ts
saveDraft: async () => {
  if (isSaving || !state.editorDraft?.title.trim()) {
    return;
  }

  dispatch({ type: "saveStarted" });

  try {
    if (state.editingProductId) {
      await updateProductMutation.mutateAsync({
        productId: state.editingProductId,
        body: toUpdateProductRequest(state.editorDraft)
      });
    } else {
      await createProductMutation.mutateAsync(toCreateProductRequest(state.editorDraft));
    }
    dispatch({ type: "saveSucceeded" });
  } catch {
    dispatch({ type: "saveFailed", error: genericError });
  }
}
```

Add reducer branch:

```ts
if (action.type === "editProduct") {
  return {
    isTypeModalOpen: false,
    editorDraft: createProductDraftFromResponse(action.product),
    editingProductId: action.product.id,
    editorError: null
  };
}
```

Ensure `selectType`, `returnToTypeSelection` and `closeCreateFlow` reset `editingProductId` to `null`.

- [ ] **Step 6: Add card action props**

Modify `ProductCardProps` in `apps/astrologer-web/src/pages/products/components/ProductCard.tsx`:

```ts
readonly actions: {
  readonly editLabel: string;
  readonly duplicateLabel: string;
  readonly publishLabel: string;
  readonly draftLabel: string;
  readonly archiveLabel: string;
  readonly onEdit: (product: ProductResponse) => void;
  readonly onDuplicate: (productId: string) => void;
  readonly onStatusChange: (productId: string, status: ProductResponse["status"]) => void;
};
```

Add footer action buttons:

```tsx
<span className={styles.productFooterSpacer} />
<button
  type="button"
  className={styles.productActionButton}
  data-product-action-edit="true"
  onClick={() => actions.onEdit(product)}
>
  {actions.editLabel}
</button>
<button
  type="button"
  className={styles.productActionButton}
  data-product-action-duplicate="true"
  onClick={() => actions.onDuplicate(product.id)}
>
  {actions.duplicateLabel}
</button>
<button
  type="button"
  className={styles.productActionButton}
  data-product-action-archive="true"
  onClick={() => actions.onStatusChange(product.id, "archived")}
>
  {actions.archiveLabel}
</button>
```

Add CSS:

```css
.productFooterSpacer {
  flex: 1 1 auto;
}

.productActionButton {
  padding: 6px 9px;
  border: 1px solid var(--products-line);
  border-radius: 9px;
  background: transparent;
  color: var(--eh-color-moon-500);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
}

.productActionButton:hover {
  color: var(--products-accent-text);
}
```

- [ ] **Step 7: Wire page actions**

In `apps/astrologer-web/src/pages/products/ProductsPage.tsx`, import hooks:

```ts
import { useArchiveProductMutation } from "../../features/products/model/useArchiveProductMutation";
import { useDuplicateProductMutation } from "../../features/products/model/useDuplicateProductMutation";
import { useMoveProductToDraftMutation } from "../../features/products/model/useMoveProductToDraftMutation";
import { usePublishProductMutation } from "../../features/products/model/usePublishProductMutation";
```

Create mutations:

```ts
const publishMutation = usePublishProductMutation();
const moveToDraftMutation = useMoveProductToDraftMutation();
const archiveMutation = useArchiveProductMutation();
const duplicateMutation = useDuplicateProductMutation();
```

Pass handlers to `ProductsPageView`:

```tsx
onEditProduct={createFlow.editProduct}
onDuplicateProduct={(productId) => {
  void duplicateMutation.mutateAsync(productId);
}}
onProductStatusChange={(productId, status) => {
  const mutation =
    status === "active"
      ? publishMutation
      : status === "draft"
        ? moveToDraftMutation
        : archiveMutation;

  void mutation.mutateAsync(productId);
}}
```

Add matching props through `ProductsPageView` and `ProductsResults` into `ProductCard`.

- [ ] **Step 8: Run focused tests**

Run:

```bash
pnpm test -- apps/astrologer-web/src/pages/products/components/ProductsPageComponents.test.tsx apps/astrologer-web/src/pages/products/ProductsPage.test.tsx apps/astrologer-web/src/common/i18n/astrologerCopy.test.ts
```

Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add apps/astrologer-web/src/common/i18n/astrologerCopy.ts apps/astrologer-web/src/pages/products apps/astrologer-web/src/features/products/model/useUpdateProductMutation.ts apps/astrologer-web/src/features/products/model/usePublishProductMutation.ts apps/astrologer-web/src/features/products/model/useMoveProductToDraftMutation.ts apps/astrologer-web/src/features/products/model/useArchiveProductMutation.ts apps/astrologer-web/src/features/products/model/useDuplicateProductMutation.ts
git commit -m "feat: wire product constructor to product actions"
```

---

## Task 8: Verification and Polish

**Files:**

- Modify only files touched by Tasks 1-7 if verification identifies concrete defects.

- [ ] **Step 1: Run focused product tests**

Run:

```bash
pnpm test -- apps/astrologer-web/src/features/products/model/productConstructorOptions.test.ts apps/astrologer-web/src/features/products/model/productDraft.test.ts apps/astrologer-web/src/features/products/model/productsQueryOptions.test.ts apps/astrologer-web/src/pages/products/components/ProductConstructorModal/ProductConstructorModal.test.tsx apps/astrologer-web/src/pages/products/components/ProductsPageComponents.test.tsx apps/astrologer-web/src/pages/products/ProductsPage.test.tsx
```

Expected: pass.

- [ ] **Step 2: Run design-system focused tests**

Run:

```bash
pnpm test -- packages/design-system/src/components/SelectableTile/SelectableTile.test.tsx packages/design-system/src/components/NumberStepper/NumberStepper.test.tsx packages/design-system/src/components/IconPicker/IconPicker.test.tsx
```

Expected: pass.

- [ ] **Step 3: Run app/package typechecks**

Run:

```bash
pnpm --filter @elevenhouse/design-system typecheck
pnpm --filter @elevenhouse/astrologer-web typecheck
```

Expected: both pass.

- [ ] **Step 4: Run app build**

Run:

```bash
pnpm --filter @elevenhouse/astrologer-web build
```

Expected: pass.

- [ ] **Step 5: Inspect local service state without starting processes**

Run:

```bash
lsof -iTCP:5174 -sTCP:LISTEN || true
lsof -iTCP:3002 -sTCP:LISTEN || true
```

Expected: command succeeds. If services are already running, browser verification may use them. If they are not running, report that visual runtime verification needs an explicitly started dev server; do not start one without direct user instruction.

- [ ] **Step 6: Run full verify if time and environment allow**

Run:

```bash
pnpm verify
```

Expected: pass. If this is too slow or blocked by unrelated existing work, record the exact failing command and failure reason in the final handoff.

- [ ] **Step 7: Final commit**

If Steps 1-6 required fixes after the previous commits:

```bash
git add packages/design-system apps/astrologer-web
git commit -m "fix: polish product constructor integration"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review Checklist

- Spec coverage: this plan implements the first inventory slice from `docs/architecture/design-reference-inventory.md`: product constructor, design-system primitives and product API actions.
- Out of scope: media upload/storage, real product analytics, public product page rendering and payment/booking integration. These require separate domain modules and contracts.
- Type consistency: constructor state uses `ProductFormDraft`; API payloads use `CreateProductRequest` and `UpdateProductRequest`; product actions use existing `ProductResponse["status"]`.
- Security: mutations use existing API wrappers with CSRF enabled.
- Verification: focused tests, typechecks, app build and non-invasive local process diagnostics are included.
