# Client Web I18n Language Switcher Design

## Context

ElevenHouse must support Russian and English from launch. The current client auth page renders Russian UI copy directly in `AuthPage.tsx` and in the shared `OtpAuthForm` defaults. `packages/i18n` currently only defines supported locales and a validator. The auth form brand header does not include the RU/EN switcher shown in the provided visual reference.

The approved direction is to implement application-wide locale state for `client-web`, not an auth-only switch. The design must keep `packages/design-system` as reusable UI and keep app/runtime concerns such as persistence and browser locale detection outside visual components.

## Goals

- Add a functional RU/EN switcher to the auth form brand row.
- Make locale state application-wide in `client-web`.
- Use `packages/i18n` as the shared locale infrastructure package.
- Translate auth form copy, document title, validation messages, phone select labels, and accessible labels for the auth screen.
- Persist the selected locale across sessions.
- Update `<html lang>` whenever locale changes.
- Keep the design-system form controlled and reusable.

## Non-Goals

- Do not introduce a full external i18n library for this feature.
- Do not localize every page in `client-web` in this implementation.
- Do not change auth API contracts or backend behavior.
- Do not refactor unrelated phone validation code or other product flows.
- Do not treat the design reference folder as production frontend architecture.

## Architecture

`packages/i18n` becomes the shared locale state package for frontend apps:

- `supportedLocales`, `SupportedLocale`, and `isSupportedLocale` remain the base model.
- Add `defaultLocale`, locale labels, and helpers for resolving the initial locale.
- Add typed dictionary support for the current app copy shape.
- Add a React `I18nProvider` and `useI18n` hook.

Initial locale priority:

1. Valid saved `localStorage` preference.
2. First supported browser language from `navigator.languages`.
3. `defaultLocale`, currently `ru`.

Runtime effects:

- `setLocale(nextLocale)` updates React state.
- The selected locale is saved to `localStorage`.
- `document.documentElement.lang` is updated to the active locale.
- Storage failures are ignored so private browsing or disabled storage does not break rendering.

`client-web` integration:

- Wrap `RouterProvider` in `I18nProvider` from `App.tsx`.
- Keep `Application` focused on infrastructure objects such as `HttpClient` and `QueryClient`; do not move browser locale state into it.
- `AuthPage.tsx` reads `locale`, `setLocale`, and translated copy through `useI18n`.
- Auth validation remains in `AuthPage.tsx`, but all user-facing messages come from dictionaries.

## Design-System Component Contract

`OtpAuthForm` remains a controlled presentational component. It must not import app dictionaries, read `localStorage`, inspect `navigator`, or mutate `document`.

Add optional language switcher props:

- `localeSwitcher?: { locale: SupportedLocale-like string; options: readonly LocaleOption[]; ariaLabel: string; onLocaleChange(locale: string): void }`
- `LocaleOption`: `{ locale: string; label: string; shortLabel: string }`

The form renders no language switcher when the prop is omitted, preserving existing consumers and tests.

Visual placement:

- The brand header becomes a row with logo content on the left and the compact language segmented control on the right.
- The control visually follows the screenshot: dark pill container, gold active segment, RU/EN short labels.
- Use the existing `SegmentedIndicator` motion primitive where possible so the behavior matches existing segmented controls.
- The layout must not overlap the brand on narrow screens; it may wrap or reduce spacing.

Accessibility:

- The control has an accessible label from copy, for example "Language" or "Язык".
- Each option is a native button with clear selected state.
- The selected locale is exposed through `aria-pressed` on the option buttons.
- Visible labels use `RU` and `EN`; accessible labels use full locale names.

## Dictionaries

The first dictionary scope is `client-web` auth copy:

- document title
- auth section aria label
- brand subtitle
- auth mode tab labels
- titles and descriptions
- field labels and placeholders
- hint and submit labels
- validation errors
- phone country select aria label
- language switcher aria label and locale names

The copy shape must be typed so missing locale keys are compile-time errors.

## Data Flow

1. `App` mounts `I18nProvider`.
2. Provider resolves initial locale from storage, browser settings, or default.
3. Auth route renders `AuthPage`.
4. `AuthPage` maps dictionary copy into `OtpAuthForm` `copy` and error props.
5. User clicks `RU` or `EN`.
6. `OtpAuthForm` calls `onLocaleChange`.
7. Provider updates locale state, storage, and `<html lang>`.
8. `AuthPage` re-renders with translated copy while preserving entered form values and auth mode.

## Error Handling

- Unsupported locale values from storage or browser settings are ignored.
- Failed storage reads/writes are caught and do not block the app.
- Missing provider usage must fail loudly via `useI18n` throwing a clear error.
- Locale changes must not clear auth form inputs or touched state.

## Testing

Unit tests:

- `packages/i18n`: accepts launch locales, rejects unsupported locales, resolves storage preference first, resolves browser locale fallback, falls back to default, tolerates storage errors.
- `packages/design-system`: `OtpAuthForm` still renders without switcher, renders switcher when provided, marks active locale, calls `onLocaleChange`, and supports translated copy.
- `client-web`: provider is wired in `App`, auth copy is selected by locale, document title changes with locale where feasible.

Verification commands:

- `pnpm --filter @elevenhouse/i18n typecheck`
- `pnpm --filter @elevenhouse/design-system typecheck`
- `pnpm --filter @elevenhouse/client-web typecheck`
- Relevant Vitest tests for i18n, design-system auth form, and client auth/page wiring.

## Open Decisions

No open product decisions remain for this feature. The implementation must use the application-wide provider approach approved on June 20, 2026.
