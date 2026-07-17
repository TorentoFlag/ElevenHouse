# Numerology Toolbar Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep `Клиент + Партнёр` readable in the Numerology toolbar and move the rare presentation, linking and PDF commands into one accessible `Действия` menu.

**Architecture:** A pure numerology feature model converts existing view/link/PDF state into three action descriptors. `NumerologyPageView` maps those descriptors to the existing design-system `ActionMenu`; CSS groups context, participants and controls in a content-width-aware grid so the participant pair receives readable width before it moves as one unit to a second row. Existing controller callbacks and backend state machines remain unchanged.

**Tech Stack:** React 19, TypeScript 6, CSS Modules with CSS container queries, Vitest, existing `@elevenhouse/design-system` `ActionMenu`, Computer Use on the user's existing Chrome tab.

## Global Constraints

- Work in the shared checkout on `main`; do not create a branch, worktree or stash and do not switch/rebase/cherry-pick.
- Do not start, stop or restart Vite, APIs, workers, Docker, PostgreSQL, Redis or any other long-running process.
- Preserve the unowned edits in `useNumerologyPageController.ts`, `numerologyActionErrorModel.ts`, its test and all scheduling paths.
- Do not change contracts, APIs, domain logic, PDF jobs, persistence, presentation content or client-selection queries.
- Reuse `packages/design-system/src/components/ActionMenu/`; do not create another menu implementation.
- Keep `Расчёты`, participants, `Год` and `Совместимость` directly visible. Only presentation, linking and PDF move into `Действия`.
- `Клиент + Партнёр` remains one visual and DOM-order group and moves together before avatar-only collapse.
- Disabled or state-only menu rows expose an understandable text reason.
- No staging or commit is permitted unless the user grants explicit commit authority.

## Purpose / Big Picture

On `/numerology`, a saved compatibility result must show enough of both names
to distinguish the client from the partner at the user's current browser size.
The astrologer opens rare preparation commands from one `Действия` menu while
calculation context controls stay visible. At narrower content widths the
participant pair moves together instead of collapsing or separating.

## Progress

- [x] 2026-07-17: current production state, repository boundaries and external
  UX guidance inspected.
- [x] 2026-07-17: product decision and design spec approved.
- [x] 2026-07-17: implementation plan written and self-reviewed.
- [x] Task 1: pure toolbar action model (RED missing module; GREEN 4 tests).
- [x] Task 2: ActionMenu composition (RED 9 view tests; GREEN with preserved callbacks).
- [x] Task 3: content-width-aware responsive layout (RED 3 structure/style tests; GREEN).
- [ ] Task 4: runtime/design evidence and implementation-truth update (menu and desktop
  toolbar verified in Chrome; compatibility screenshot blocked after a full-page reload
  stopped exposing the app body even though Vite still returns 200 and all 448 module
  requests resolve except a non-runtime React Router type reference).

## Surprises & Discoveries

- The visible defect is driven by workspace content width, not browser viewport
  width: the expanded app sidebar leaves about 1070 pixels inside a 1290-pixel
  browser window, so the existing `@media` breakpoint does not fire.
- `useNumerologyPageController.ts` and a new action-error model already contain
  unowned concurrent changes. The approved implementation needs no controller
  edit and keeps the collision boundary outside owned paths.
- The existing Chrome tab reflected the new toolbar through HMR and exposed the
  menu items, disabled reasons and focus return. After a full reload the tab
  rendered a blank document while port 5174 and the Vite module graph remained
  healthy; process lifecycle is outside this task authority, so remaining
  compatibility screenshot acceptance cannot be claimed from that tab.

## Decision Log

- 2026-07-17, user: presentation, linking and PDF are rare pre-consultation
  actions, so all three belong in `Действия`.
- 2026-07-17, user and agent: pair readability has priority over one-click
  secondary commands; responsive reflow is content-width-aware.
- 2026-07-17, agent: reuse the existing design-system `ActionMenu` and preserve
  all controller callbacks/state machines.

## Outcomes & Retrospective

The production composition, pure state model and responsive layout are
implemented with behavioral coverage. Desktop toolbar and menu behavior were
observed in the existing Chrome tab. Full compatibility-state screenshot
acceptance remains pending because the existing dev tab became blank after a
full reload; no process was restarted under the repository lifecycle policy.

## Context and Orientation

`NumerologyPageView.tsx` owns page composition. `NumerologyPage.module.css`
owns its visual layout. `numerologyPageModel.ts` already derives link state,
and the controller already passes PDF label/disabled/title plus the three
callbacks. The new feature model only translates those existing values into
menu presentation data; it performs no mutation or calculation.

## Idempotence and Recovery

Tests, typecheck, build, browser reads and screenshot capture are safe to
repeat. The implementation does not add data writes. If a target file changes
concurrently, stop before patching, reread its full current content and diff,
then reapply only compatible owned edits. Do not restore, reset or stash any
foreign change.

## Artifacts and Notes

- Approved design: `docs/superpowers/specs/2026-07-17-numerology-toolbar-actions-design.md`.
- Execution plan: this file.
- Runtime evidence target: `.design-qa/numerology-toolbar-actions/`.

---

## File Map

- Create `apps/astrologer-web/src/features/numerology/model/numerologyToolbarActionsModel.ts`: pure action labels, icons, disabled states and reasons.
- Create `apps/astrologer-web/src/features/numerology/model/numerologyToolbarActionsModel.test.ts`: state-table tests.
- Modify `apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx`: compose `ActionMenu` and toolbar zones.
- Modify `apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx`: action, callback and layout contracts.
- Modify `apps/astrologer-web/src/pages/numerology/NumerologyPage.module.css`: grid, readable minimums, container queries and menu skin.
- Modify `docs/architecture/design-reference-inventory.md`: record the implemented deviation.
- Create `.design-qa/numerology-toolbar-actions/` only for browser evidence.

---

### Task 1: Pure toolbar action model

**Files:**
- Create: `apps/astrologer-web/src/features/numerology/model/numerologyToolbarActionsModel.test.ts`
- Create: `apps/astrologer-web/src/features/numerology/model/numerologyToolbarActionsModel.ts`

**Interfaces:**
- Consumes: `hasResult`, `isBusy`, `isCalculationLinked`, `linkDisabled`, `hasLinkableClient`, `pdfLabel`, `pdfDisabled`, `pdfTitle`.
- Produces: `buildNumerologyToolbarActions(input): readonly NumerologyToolbarAction[]` in stable `presentation`, `link`, `pdf` order.

- [ ] **Step 1: Write the failing state-table test**

```ts
import { describe, expect, it } from "vitest";
import { buildNumerologyToolbarActions } from "./numerologyToolbarActionsModel";

describe("buildNumerologyToolbarActions", () => {
  it("builds the three preparation commands in stable order", () => {
    expect(buildNumerologyToolbarActions(baseInput())).toEqual([
      { id: "presentation", label: "Открыть презентацию", iconName: "arrowUpRight", disabled: false, description: null },
      { id: "link", label: "Привязать к клиенту", iconName: "pin", disabled: false, description: null },
      { id: "pdf", label: "Сформировать PDF", iconName: "doc", disabled: false, description: null }
    ]);
  });

  it("shows linked, unavailable and pending states with reasons", () => {
    expect(buildNumerologyToolbarActions(baseInput({ isCalculationLinked: true, linkDisabled: true }))[1]).toEqual({
      id: "link", label: "Привязано к клиенту", iconName: "check", disabled: true, description: null
    });
    const unavailable = buildNumerologyToolbarActions(baseInput({ hasResult: false, linkDisabled: true, hasLinkableClient: false, pdfDisabled: true, pdfTitle: "Сначала сохраните расчёт" }));
    expect(unavailable[0]).toMatchObject({ disabled: true, description: "Сначала выберите клиента" });
    expect(unavailable[1]).toMatchObject({ disabled: true, description: "Нужен CRM-участник" });
    expect(unavailable[2]).toMatchObject({ label: "Скачать PDF", disabled: true, description: "Сначала сохраните расчёт" });
    expect(buildNumerologyToolbarActions(baseInput({ pdfLabel: "PDF готовится…", pdfDisabled: true, pdfTitle: "PDF формируется" }))[2]).toMatchObject({
      label: "PDF готовится…", disabled: true, description: "PDF формируется"
    });
  });

  it("uses action-oriented ready and retry PDF labels", () => {
    expect(buildNumerologyToolbarActions(baseInput({ pdfLabel: "Скачать PDF", pdfTitle: "Скачать готовый PDF" }))[2]).toMatchObject({ label: "Скачать PDF", disabled: false });
    expect(buildNumerologyToolbarActions(baseInput({ pdfLabel: "Повторить", pdfTitle: "Повторить формирование PDF" }))[2]).toMatchObject({ label: "Повторить формирование PDF", disabled: false });
  });
});

function baseInput(patch: Partial<Parameters<typeof buildNumerologyToolbarActions>[0]> = {}): Parameters<typeof buildNumerologyToolbarActions>[0] {
  return { hasResult: true, isBusy: false, isCalculationLinked: false, linkDisabled: false, hasLinkableClient: true, pdfLabel: "PDF", pdfDisabled: false, pdfTitle: "Сформировать PDF", ...patch };
}
```

- [ ] **Step 2: Run the test and confirm RED**

```bash
pnpm exec vitest run apps/astrologer-web/src/features/numerology/model/numerologyToolbarActionsModel.test.ts
```

Expected: FAIL because the model file does not exist.

- [ ] **Step 3: Implement the pure model**

```ts
export type NumerologyToolbarActionId = "presentation" | "link" | "pdf";
export type NumerologyToolbarAction = {
  readonly id: NumerologyToolbarActionId;
  readonly label: string;
  readonly iconName: "arrowUpRight" | "pin" | "check" | "doc";
  readonly disabled: boolean;
  readonly description: string | null;
};
export type NumerologyToolbarActionsInput = {
  readonly hasResult: boolean; readonly isBusy: boolean;
  readonly isCalculationLinked: boolean; readonly linkDisabled: boolean;
  readonly hasLinkableClient: boolean; readonly pdfLabel: string;
  readonly pdfDisabled: boolean; readonly pdfTitle: string;
};

export function buildNumerologyToolbarActions(input: NumerologyToolbarActionsInput): readonly NumerologyToolbarAction[] {
  return [
    { id: "presentation", label: "Открыть презентацию", iconName: "arrowUpRight", disabled: !input.hasResult, description: input.hasResult ? null : "Сначала выберите клиента" },
    buildLinkAction(input),
    { id: "pdf", label: getPdfMenuLabel(input.pdfLabel, input.pdfTitle), iconName: "doc", disabled: input.pdfDisabled, description: input.pdfDisabled ? input.pdfTitle : null }
  ];
}

function buildLinkAction(input: NumerologyToolbarActionsInput): NumerologyToolbarAction {
  if (input.isCalculationLinked) return { id: "link", label: "Привязано к клиенту", iconName: "check", disabled: true, description: null };
  return {
    id: "link", label: "Привязать к клиенту", iconName: "pin", disabled: input.linkDisabled,
    description: input.linkDisabled ? (input.isBusy ? "Действие выполняется" : input.hasLinkableClient ? "Сначала сохраните расчёт" : "Нужен CRM-участник") : null
  };
}

function getPdfMenuLabel(label: string, title: string): string {
  if (title === "Сформировать PDF" || title === "Повторить формирование PDF") return title;
  if (label === "PDF" && title === "Сначала сохраните расчёт") return "Скачать PDF";
  return label;
}
```

- [ ] **Step 4: Run Task 1 test and confirm GREEN**

Expected: 3 tests pass.

- [ ] **Step 5: Review owned diff; do not stage without authority**

```bash
git diff -- apps/astrologer-web/src/features/numerology/model/numerologyToolbarActionsModel.ts apps/astrologer-web/src/features/numerology/model/numerologyToolbarActionsModel.test.ts
git diff --check -- apps/astrologer-web/src/features/numerology/model/numerologyToolbarActionsModel.ts apps/astrologer-web/src/features/numerology/model/numerologyToolbarActionsModel.test.ts
```

---

### Task 2: Replace standalone buttons with ActionMenu

**Files:**
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx`

**Interfaces:**
- Consumes Task 1 descriptors and existing `onOpenPresentation`, `onLink`, `onPdf` callbacks.
- Produces one `ActionMenu` labeled `Действия` and no standalone presentation/link/PDF buttons.

- [ ] **Step 1: Add failing menu and callback tests**

```ts
import { ActionMenu, type ActionMenuItem } from "@elevenhouse/design-system/components/ActionMenu";

it("moves rare commands into one labeled menu", () => {
  const view = NumerologyPageView({ ...baseProps(), selectedResponse: response({ source: "crm_client", clientId: "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e" }), pdfLabel: "Скачать PDF", pdfDisabled: false, pdfTitle: "Скачать готовый PDF" });
  const menu = findRequiredElementByType<Parameters<typeof ActionMenu>[0]>(view, ActionMenu);
  expect(menu.props.label).toBe("Действия");
  expect(menu.props.triggerAriaLabel).toBe("Действия расчёта");
  expect(menu.props.items.map((item) => item.id)).toEqual(["presentation", "link", "pdf"]);
  expect(findOptionalButtonByText(view, "Презентация")).toBeNull();
  expect(findOptionalButtonByText(view, "Привязать")).toBeNull();
  expect(findOptionalButtonByText(view, "Скачать PDF")).toBeNull();
});

it("maps each enabled menu item to its existing callback once", () => {
  const onOpenPresentation = vi.fn(), onLink = vi.fn(), onPdf = vi.fn();
  const view = NumerologyPageView({ ...baseProps(), selectedResponse: response({ source: "crm_client", clientId: "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e" }), pdfDisabled: false, pdfTitle: "Сформировать PDF", onOpenPresentation, onLink, onPdf });
  const items = findRequiredElementByType<Parameters<typeof ActionMenu>[0]>(view, ActionMenu).props.items;
  items.find((item) => item.id === "presentation")?.onSelect();
  items.find((item) => item.id === "link")?.onSelect();
  items.find((item) => item.id === "pdf")?.onSelect();
  expect(onOpenPresentation).toHaveBeenCalledOnce();
  expect(onLink).toHaveBeenCalledOnce();
  expect(onPdf).toHaveBeenCalledOnce();
});

it("keeps PDF and link disabled reasons inside the menu labels", () => {
  const view = NumerologyPageView({
    ...baseProps(),
    selectedResponse: response({ source: "manual", clientId: null }),
    pdfLabel: "PDF готовится…",
    pdfDisabled: true,
    pdfTitle: "PDF формируется"
  });
  expect(getActionMenuItem(view, "link").disabled).toBe(true);
  expect(includesText(getActionMenuItem(view, "link").label, "Нужен CRM-участник")).toBe(true);
  expect(getActionMenuItem(view, "pdf").disabled).toBe(true);
  expect(includesText(getActionMenuItem(view, "pdf").label, "PDF формируется")).toBe(true);
});

it("keeps the approved menu icons and compatibility presentation action", () => {
  const view = NumerologyPageView(compatibilityPropsWithLongNames());
  expect(getActionMenuIconName(view, "presentation")).toBe("arrowUpRight");
  expect(getActionMenuIconName(view, "link")).toBe("pin");
  expect(getActionMenuIconName(view, "pdf")).toBe("doc");
  expect(getActionMenuItem(view, "presentation")).toBeDefined();
});

function getActionMenuItem(root: ReactElement, id: string): ActionMenuItem {
  const item = findRequiredElementByType<Parameters<typeof ActionMenu>[0]>(root, ActionMenu)
    .props.items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Action menu item not found: ${id}`);
  return item;
}

function getActionMenuIconName(root: ReactElement, id: string): string | null {
  const icon = getActionMenuItem(root, id).icon;
  return isValidElement(icon) && icon.type === Icon
    ? ((icon.props as { iconName?: string }).iconName ?? null)
    : null;
}

function compatibilityPropsWithLongNames(): NumerologyPageViewProps {
  const props = baseProps();
  return {
    ...props,
    formState: {
      ...props.formState,
      mode: "compatibility",
      subject: {
        ...createParticipantFormState("crm_client"),
        clientId: "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e",
        displayName: "Голубев Антон Александрович",
        fullName: "Голубев Антон Александрович",
        birthDate: "2000-08-19"
      },
      partner: {
        ...createParticipantFormState("crm_client"),
        clientId: "4ab63db1-4f78-4d59-9b75-c21fc3ec9f6e",
        displayName: "Кошкина Яна Владимировна",
        fullName: "Кошкина Яна Владимировна",
        birthDate: "2002-03-16"
      }
    }
  };
}
```

Replace the old tests named `disables link action for manual-only calculations`,
`enables link for CRM-linked participants`, `shows the save-first PDF tooltip`,
`exposes ready and retry PDF actions`, `keeps a queued PDF visibly pending`,
`keeps reference action buttons at fixed content width`, `matches the reference
action row icons and button set`, and the presentation assertion in the
compatibility test with the exact menu tests above. Keep their unrelated saved
calculation, Year and compatibility assertions unchanged. Remove the obsolete
`.toolButtonLinked` CSS expectations.

- [ ] **Step 2: Run the page test and confirm RED**

```bash
pnpm exec vitest run apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx
```

Expected: FAIL because the page does not render `ActionMenu`.

- [ ] **Step 3: Compose descriptors into ActionMenu without changing props or controller**

```tsx
import { ActionMenu, type ActionMenuItem } from "@elevenhouse/design-system/components/ActionMenu";
import "@elevenhouse/design-system/components/ActionMenu.css";
import { buildNumerologyToolbarActions, type NumerologyToolbarAction, type NumerologyToolbarActionId } from "../../features/numerology/model/numerologyToolbarActionsModel";

const toolbarActions = buildNumerologyToolbarActions({
  hasResult: Boolean(pageModel.model), isBusy, isCalculationLinked: pageModel.isCalculationLinked,
  linkDisabled: pageModel.linkDisabled, hasLinkableClient: Boolean(pageModel.linkableClientId),
  pdfLabel, pdfDisabled, pdfTitle
});
const toolbarActionHandlers = { presentation: onOpenPresentation, link: onLink, pdf: onPdf } satisfies Record<NumerologyToolbarActionId, () => void>;

<ActionMenu className={styles.toolbarActionsMenu} label="Действия" triggerAriaLabel="Действия расчёта" align="end" items={createToolbarActionMenuItems(toolbarActions, toolbarActionHandlers)} />

function createToolbarActionMenuItems(actions: readonly NumerologyToolbarAction[], handlers: Readonly<Record<NumerologyToolbarActionId, () => void>>): readonly ActionMenuItem[] {
  return actions.map((action) => ({
    id: action.id,
    label: <span className={styles.toolbarActionLabel}><span>{action.label}</span>{action.description ? <small className={styles.toolbarActionDescription}>{action.description}</small> : null}</span>,
    icon: <Icon iconName={action.iconName} width={15} height={15} aria-hidden="true" />,
    disabled: action.disabled, onSelect: handlers[action.id]
  }));
}
```

Delete only the three direct buttons. Keep Year and Compatibility unchanged.

- [ ] **Step 4: Run Task 1 and Task 2 tests and confirm GREEN**

```bash
pnpm exec vitest run apps/astrologer-web/src/features/numerology/model/numerologyToolbarActionsModel.test.ts apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx
```

- [ ] **Step 5: Review owned diff; do not stage without authority**

```bash
git diff -- apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx
git diff --check -- apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx
```

---

### Task 3: Protect participant readability with content-width reflow

**Files:**
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPage.module.css`

**Interfaces:**
- Produces `.toolbarLayout`, `.contextStrip`, `.clientStrip`, `.toolbarSpacer`, `.controlStrip`, menu label styles and `numerology-toolbar` container queries.

- [ ] **Step 1: Add failing layout contracts**

```ts
it("protects participant readability with content-width reflow", () => {
  const css = readFileSync(new URL("./NumerologyPage.module.css", import.meta.url), "utf8");
  expect(getCssRule(css, ".toolbar")).toContain("container-type: inline-size;");
  expect(getCssRule(css, ".toolbar")).toContain("container-name: numerology-toolbar;");
  expect(getCssRule(css, ".clientStrip")).toContain("min-width: 352px;");
  expect(getCssRule(css, ".clientStrip > div")).toContain("min-width: 156px;");
  expect(css).toContain("@container numerology-toolbar (max-width: 1040px)");
  expect(css).toContain('grid-template-areas: "context controls" "participants participants";');
  expect(css).toContain("@container numerology-toolbar (max-width: 700px)");
});

it("keeps both compatibility selectors and the plus sign in one group", () => {
  const view = NumerologyPageView(compatibilityPropsWithLongNames());
  const group = findElements(view).find((element) => element.props.className === styles.clientStrip);
  expect(group).toBeDefined();
  expect(group ? findElements(group).filter((element) => element.type === ClientSearchCombobox) : []).toHaveLength(2);
  expect(group ? elementIncludesText(group, "+") : false).toBe(true);
});

```

- [ ] **Step 2: Run page tests and confirm RED**

Expected: missing toolbar zone and container-query contracts.

- [ ] **Step 3: Group existing JSX zones**

```tsx
<header className={styles.toolbar} role="toolbar" aria-label="Инструменты нумерологии">
  <div className={styles.toolbarLayout}>
    <div className={styles.contextStrip}>
      <div className={styles.titleGroup}>
        <span className={styles.iconBox}>#</span>
        <h1 className={styles.title} id="numerology-title">
          Нумерология
        </h1>
      </div>
      <NumerologyCalculationMenu
        items={savedItems}
        selectedCalculationId={selectedResponse?.calculation.id ?? null}
        disabled={isBusy}
        onSelect={onSelectSaved}
        onCreate={onOpenCreate}
        onRecalculate={onOpenRecalculate}
        onArchive={onRequestArchive}
      />
    </div>
    <div className={styles.clientStrip}>
      <ClientSearchCombobox
        label="Клиент"
        value={subjectClientId}
        placeholder="Выбрать клиента"
        selectedClient={selectedSubjectClient}
        excludeClientIds={partnerClientId ? [partnerClientId] : []}
        disabled={pageModel.isClientSelectionDisabled}
        onSelect={onSelectSubjectClient}
      />
      {isCompatibilityMode ? (
        <>
          <span className={styles.clientPlus}>+</span>
          <ClientSearchCombobox
            label="Партнер"
            value={partnerClientId}
            placeholder="Выбрать партнера"
            selectedClient={selectedPartnerClient}
            excludeClientIds={subjectClientId ? [subjectClientId] : []}
            disabled={pageModel.isClientSelectionDisabled}
            onSelect={onSelectPartnerClient}
          />
        </>
      ) : null}
    </div>
    <div className={styles.toolbarSpacer} />
    <div className={styles.controlStrip}>
      <NumerologyYearPicker
        selectedYear={selectedYear}
        isOpen={isYearPickerOpen && !isCompatibilityMode}
        isPeriodVisible={isPeriodVisible}
        isPreviewPending={isPreviewPending}
        errorMessage={isCompatibilityMode ? null : periodErrorMessage}
        disabled={!pageModel.model || isCompatibilityMode}
        onToggle={onToggleYearPicker}
        onApply={onApplyYear}
        onHide={onHidePeriod}
        onRetry={onRetryPeriod}
      />
      <button
        type="button"
        className={isCompatibilityMode ? styles.toolButtonActive : styles.toolButton}
        aria-pressed={isCompatibilityMode}
        disabled={!pageModel.model}
        onClick={onToggleCompatibilityMode}
        title="Нумерологическая совместимость пары"
      >
        <Icon iconName="users" width={15} height={15} aria-hidden="true" />
        Совместимость
      </button>
      <ActionMenu
        className={styles.toolbarActionsMenu}
        label="Действия"
        triggerAriaLabel="Действия расчёта"
        align="end"
        items={createToolbarActionMenuItems(toolbarActions, toolbarActionHandlers)}
      />
    </div>
  </div>
</header>
```

The block above is the complete toolbar replacement. No callback or selector
prop changes outside this block.

- [ ] **Step 4: Implement grid, minimums and container queries**

```css
.toolbar { display: block; flex: 0 0 auto; height: auto; min-height: 60px; padding: 0 20px; border-bottom: 1px solid var(--numerology-line); background: var(--numerology-subhead); container-name: numerology-toolbar; container-type: inline-size; }
.toolbarLayout { display: grid; width: 100%; min-height: 59px; align-items: center; gap: 12px; grid-template-areas: "context participants spacer controls"; grid-template-columns: auto minmax(352px, 560px) minmax(12px, 1fr) auto; }
.contextStrip, .controlStrip { display: flex; min-width: 0; align-items: center; gap: 12px; }
.contextStrip { grid-area: context; }
.clientStrip { display: flex; width: 100%; min-width: 352px; align-items: center; gap: 8px; grid-area: participants; }
.clientStrip > div { min-width: 156px; }
.clientPlus { flex: 0 0 auto; color: var(--eh-color-muted); }
.toolbarSpacer { min-width: 12px; grid-area: spacer; }
.controlStrip { justify-content: flex-end; grid-area: controls; }
.toolbarActionsMenu :global(.ehActionMenu__trigger) { min-height: 37px; padding: 10px 16px; border-color: var(--numerology-line-strong); border-radius: 14px; background: rgb(30 27 62); color: var(--eh-color-moon-120); font-size: 13px; font-weight: 600; }
.toolbarActionsMenu :global(.ehActionMenu__popover) { min-width: 230px; }
.toolbarActionLabel { display: grid; gap: 2px; }
.toolbarActionDescription { color: var(--eh-color-muted); font-size: 10.5px; font-weight: 500; }
@container numerology-toolbar (max-width: 1040px) {
  .toolbarLayout { grid-template-areas: "context controls" "participants participants"; grid-template-columns: minmax(0, 1fr) auto; padding: 10px 0; }
  .toolbarSpacer { display: none; }
  .clientStrip { width: min(560px, 100%); }
}
@container numerology-toolbar (max-width: 700px) {
  .toolbarLayout { grid-template-areas: "context" "participants" "controls"; grid-template-columns: minmax(0, 1fr); }
  .contextStrip, .controlStrip { width: 100%; overflow-x: auto; }
  .controlStrip { justify-content: flex-start; }
  .clientStrip { min-width: 0; overflow-x: auto; }
}
```

Remove `.toolButtonLinked` rules. Retain `.toolButton` and `.toolButtonActive`. Remove only the old viewport-driven toolbar wrap and duplicate mobile `.clientStrip` rules; keep unrelated workspace responsive rules.

- [ ] **Step 5: Run focused tests, lint, typecheck and build**

```bash
pnpm exec vitest run apps/astrologer-web/src/features/numerology/model/numerologyToolbarActionsModel.test.ts apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx
pnpm exec eslint apps/astrologer-web/src/features/numerology/model/numerologyToolbarActionsModel.ts apps/astrologer-web/src/features/numerology/model/numerologyToolbarActionsModel.test.ts apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-web build
```

Expected: all commands exit 0.

- [ ] **Step 6: Review owned diff; do not stage without authority**

```bash
git diff -- apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx apps/astrologer-web/src/pages/numerology/NumerologyPage.module.css
git diff --check -- apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx apps/astrologer-web/src/pages/numerology/NumerologyPage.module.css
```

---

### Task 4: Browser acceptance and implementation truth

**Files:**
- Modify: `docs/architecture/design-reference-inventory.md`
- Create during verification: `.design-qa/numerology-toolbar-actions/{01-reference-current-window.png,02-production-current-window.png,03-production-menu-open.png,04-production-mobile.png,evidence.md}`

- [ ] **Step 1: Confirm existing lifecycle without starting services**

```bash
lsof -nP -iTCP:5174 -sTCP:LISTEN
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:5174/numerology
```

Expected: existing listener and `200 text/html`; otherwise mark browser acceptance blocked.

- [ ] **Step 2: Verify in the user's existing Chrome tab**

Open the saved compatibility result with long names. At the current 1290×768 window confirm readable name fragments and one toolbar row. Open `Действия` and confirm order, icons, linked state and current PDF state. Exercise Tab, Enter/Space, Up/Down and Escape/focus return. Open and close presentation from the menu. Resize the existing window to confirm the participant pair moves together below the first row and remains one horizontally stable group at mobile width. Do not trigger a new link or PDF mutation solely for QA.

- [ ] **Step 3: Capture and record evidence**

Save exact reference/production/menu/mobile screenshots and write `evidence.md` with route, role, RU locale, viewports, approved deviation, interactions, console/network observation and blocked states.

- [ ] **Step 4: Update the Numerology inventory row**

Append: `The rare pre-consultation presentation, client-link and PDF commands share the accessible Действия menu; the client/partner group preserves readable names and moves together using content-width-aware toolbar reflow.`

- [ ] **Step 5: Run affected and repository gates**

```bash
pnpm exec vitest run apps/astrologer-web/src/features/numerology/model/numerologyToolbarActionsModel.test.ts apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx packages/design-system/src/components/ActionMenu/ActionMenu.test.tsx
pnpm exec eslint apps/astrologer-web/src/features/numerology/model/numerologyToolbarActionsModel.ts apps/astrologer-web/src/features/numerology/model/numerologyToolbarActionsModel.test.ts apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-web build
pnpm docs:check:test
pnpm docs:check
pnpm verify
git diff --check
```

If `pnpm verify` fails only in an unowned dirty path, preserve the output and report that exact repository-gate blocker; do not edit the foreign path.

- [ ] **Step 6: Final ownership review and gated commit**

```bash
git diff -- apps/astrologer-web/src/features/numerology/model/numerologyToolbarActionsModel.ts apps/astrologer-web/src/features/numerology/model/numerologyToolbarActionsModel.test.ts apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx apps/astrologer-web/src/pages/numerology/NumerologyPage.module.css docs/architecture/design-reference-inventory.md docs/superpowers/specs/2026-07-17-numerology-toolbar-actions-design.md docs/superpowers/plans/2026-07-17-numerology-toolbar-actions.md
git status --short
```

If explicit commit authority is later granted and no foreign staged entries exist, stage exactly the owned paths above, run `git diff --cached --check`, and commit as `fix(numerology): group toolbar preparation actions`. Otherwise leave them unstaged.
