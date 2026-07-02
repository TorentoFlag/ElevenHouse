# Phone Input Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to execute this plan.

## Goal

Add production-grade phone input support to the client auth registration form:

- Validate phone numbers for supported CIS/near-CIS countries excluding Ukraine and including Georgia.
- Support countries: `RU`, `BY`, `KZ`, `KG`, `AM`, `AZ`, `MD`, `TJ`, `UZ`, `TM`, `GE`.
- Use a mandatory phone mask/formatter while typing.
- Ignore letters and other non-phone characters.
- When a user enters `7`, normalize the field to `+7` and select Russia (`RU`) in the country dropdown.
- Add a compact country selector on the right side of the phone input with country code and flag.
- Update the phone placeholder when the user changes country manually.
- Submit normalized E.164 phone values to the auth API while keeping the UI formatted.

## Constraints

- Keep production code inside the existing app/package boundaries.
- Do not use the design reference project as production architecture or source code.
- Put reusable phone validation and formatting in `packages/validation`.
- Keep `packages/design-system` UI-only; it may receive country options and callbacks, but should not own auth business rules.
- Preserve existing auth form behavior for name/email and OTP.
- Do not include Ukraine in the country list.
- Do not touch unrelated in-progress changes in `apps/astrologer-api` or `packages/contracts` unless the current task requires it.

## Architecture

Use `libphonenumber-js` for phone parsing, formatting, and validation. The package is small enough for client-side auth and avoids maintaining country-specific regexes. Use the stricter `max` metadata entry point for validation because the requirement is explicit phone validation, not only length checks.

Data flow:

1. `packages/validation` defines supported countries and phone helpers.
2. `apps/client-web` owns auth page state:
   - selected phone country,
   - displayed formatted phone value,
   - normalized E.164 phone value for submission,
   - phone validation error state.
3. `packages/design-system` renders the input, country dropdown, error text, and styling.
4. Auth submission keeps sending `method: "phone"` with an E.164-like compact value such as `+79991234567`.

## Implementation Steps

### 1. Add Phone Validation Dependency

Run:

```bash
pnpm add libphonenumber-js --filter @elevenhouse/validation
```

Expected files changed:

- `packages/validation/package.json`
- `pnpm-lock.yaml`

### 2. Add Supported Country Metadata

Create `packages/validation/src/phone-countries.ts`.

Define an explicit country list:

```ts
export const supportedPhoneCountries = [
  {
    iso2: "RU",
    name: "Россия",
    flag: "🇷🇺",
    callingCode: "7",
    placeholder: "+7 999 123-45-67",
  },
  {
    iso2: "BY",
    name: "Беларусь",
    flag: "🇧🇾",
    callingCode: "375",
    placeholder: "+375 29 123-45-67",
  },
  {
    iso2: "KZ",
    name: "Казахстан",
    flag: "🇰🇿",
    callingCode: "7",
    placeholder: "+7 701 123 45 67",
  },
  {
    iso2: "KG",
    name: "Кыргызстан",
    flag: "🇰🇬",
    callingCode: "996",
    placeholder: "+996 700 123 456",
  },
  {
    iso2: "AM",
    name: "Армения",
    flag: "🇦🇲",
    callingCode: "374",
    placeholder: "+374 77 123456",
  },
  {
    iso2: "AZ",
    name: "Азербайджан",
    flag: "🇦🇿",
    callingCode: "994",
    placeholder: "+994 50 123 45 67",
  },
  {
    iso2: "MD",
    name: "Молдова",
    flag: "🇲🇩",
    callingCode: "373",
    placeholder: "+373 69 123 456",
  },
  {
    iso2: "TJ",
    name: "Таджикистан",
    flag: "🇹🇯",
    callingCode: "992",
    placeholder: "+992 92 123 4567",
  },
  {
    iso2: "UZ",
    name: "Узбекистан",
    flag: "🇺🇿",
    callingCode: "998",
    placeholder: "+998 90 123 45 67",
  },
  {
    iso2: "TM",
    name: "Туркменистан",
    flag: "🇹🇲",
    callingCode: "993",
    placeholder: "+993 65 123456",
  },
  {
    iso2: "GE",
    name: "Грузия",
    flag: "🇬🇪",
    callingCode: "995",
    placeholder: "+995 555 12 34 56",
  },
] as const;
```

Also export:

- `PhoneCountryIso2`
- `SupportedPhoneCountry`
- `getSupportedPhoneCountry(iso2)`
- `getSupportedPhoneCountryByCallingCode(callingCode)`
- `isSupportedPhoneCountry(iso2)`

For shared calling code `7`, default inference should prefer `RU` unless the user manually selects `KZ`.

### 3. Add Core Phone Helpers

Create `packages/validation/src/phone.ts`.

Required public API:

```ts
export interface PhoneFormatResult {
  displayValue: string;
  normalizedValue: string;
  country: PhoneCountryIso2;
}

export interface PhoneValidationResult {
  valid: boolean;
  normalizedValue: string | null;
  country: PhoneCountryIso2 | null;
  reason: "empty" | "unsupported_country" | "invalid_number" | null;
}

export function sanitizePhoneInput(input: string): string;
export function inferPhoneCountry(input: string, fallbackCountry: PhoneCountryIso2): PhoneCountryIso2;
export function formatPhoneInput(input: string, country: PhoneCountryIso2): PhoneFormatResult;
export function validateSupportedPhoneNumber(input: string, country: PhoneCountryIso2): PhoneValidationResult;
export function getPhonePlaceholder(country: PhoneCountryIso2): string;
```

Behavior:

- `sanitizePhoneInput("abc+7 (999)")` returns `+7999`.
- `sanitizePhoneInput("7")` returns `+7`.
- A plus sign is preserved only at the start.
- Letters are ignored.
- If input starts with a supported calling code, infer the matching country.
- For `+7`, infer `RU` by default unless the selected country is already `KZ`.
- `formatPhoneInput` uses `AsYouType(country)` from `libphonenumber-js`.
- `validateSupportedPhoneNumber` uses `parsePhoneNumberFromString(value, country)` from `libphonenumber-js/max`.
- Validation requires:
  - valid parsed number,
  - country belongs to the supported list,
  - parsed country equals selected/inferred country,
  - returned `normalizedValue` is E.164.

Update `packages/validation/src/index.ts` to export the new modules.

### 4. Add Validation Tests

Create `packages/validation/src/phone.test.ts`.

Cover:

- letters are ignored,
- `7` becomes `+7`,
- `+7` defaults to `RU`,
- manually selected `KZ` remains `KZ` for `+7`,
- valid Russian number returns E.164,
- valid Georgian number returns E.164,
- invalid short number fails,
- unsupported country-like prefix fails,
- Ukraine prefix is not accepted as supported,
- placeholders are country-specific.

Run:

```bash
pnpm vitest run --config vitest.config.ts packages/validation/src/phone.test.ts
pnpm --filter @elevenhouse/validation typecheck
pnpm --filter @elevenhouse/validation build
```

### 5. Add Client Auth Phone Input Model

Create `apps/client-web/src/pages/auth/phoneInputModel.ts`.

Purpose: keep formatting, country inference, and normalized submission value testable outside React rendering.

Required API:

```ts
export interface PhoneInputState {
  displayValue: string;
  selectedCountry: PhoneCountryIso2;
  normalizedValue: string;
}

export function applyPhoneInputChange(
  previous: PhoneInputState,
  nextRawValue: string,
): PhoneInputState;

export function applyPhoneCountryChange(
  previous: PhoneInputState,
  nextCountry: PhoneCountryIso2,
): PhoneInputState;
```

Behavior:

- Typing letters does not change meaningful phone characters.
- Typing `7` changes display to `+7` and selected country to `RU`.
- Manual country change updates selected country and reformats the current value when possible.
- Manual country change does not silently replace an existing typed number with another country code; it only changes placeholder and future formatting unless the field is empty.

Create `apps/client-web/src/pages/auth/phoneInputModel.test.ts`.

Run:

```bash
pnpm vitest run --config vitest.config.ts apps/client-web/src/pages/auth/phoneInputModel.test.ts
```

### 6. Extend Design System Auth Form UI

Modify `packages/design-system/src/components/OtpAuthForm/OtpAuthForm.tsx`.

Add prop types:

```ts
export interface OtpAuthPhoneCountryOption {
  iso2: string;
  name: string;
  flag: string;
  callingCode: string;
}

export interface OtpAuthFormProps {
  // existing props...
  phoneCountry?: string;
  phoneCountries?: readonly OtpAuthPhoneCountryOption[];
  phoneError?: string | null;
  phonePlaceholder?: string;
  onPhoneCountryChange?: (country: string) => void;
}
```

Render the phone field as one composed control:

- input keeps `type="tel"`, `inputMode="tel"`, `autoComplete="tel"`,
- country selector is on the right side,
- closed selector shows flag, ISO2, and `+callingCode`,
- dropdown lists all supported countries,
- selected country button has accessible label,
- phone error uses the same smooth error treatment as name/email errors.

Do not move auth validation logic into the design system.

Modify `packages/design-system/src/components/OtpAuthForm/OtpAuthForm.css`.

Add classes:

- `.ehOtpAuthForm__phoneControl`
- `.ehOtpAuthForm__phoneInput`
- `.ehOtpAuthForm__phoneCountryButton`
- `.ehOtpAuthForm__phoneCountryMenu`
- `.ehOtpAuthForm__phoneCountryOption`

Visual requirements:

- Match existing form typography.
- Keep the selector compact and aligned vertically with the input.
- Do not cause input height changes on open/close.
- Keep mobile width stable.

Update `packages/design-system/src/components/OtpAuthForm/OtpAuthForm.test.tsx`.

Cover:

- renders current country,
- calls `onPhoneCountryChange`,
- renders phone error,
- keeps phone input accessible as a telephone input.

Run:

```bash
pnpm vitest run --config vitest.config.ts packages/design-system/src/components/OtpAuthForm/OtpAuthForm.test.tsx
pnpm --filter @elevenhouse/design-system typecheck
pnpm --filter @elevenhouse/design-system build
```

### 7. Integrate In Client Auth Page

Modify `apps/client-web/src/pages/auth/AuthPage.tsx`.

Add state:

```ts
const [phoneCountry, setPhoneCountry] = useState<PhoneCountryIso2>("RU");
const [phoneTouched, setPhoneTouched] = useState(false);
```

Phone value handling:

- Replace direct phone updates with `applyPhoneInputChange`.
- Use `applyPhoneCountryChange` for manual selector changes.
- Store formatted display value in `authValues.phone`.
- Derive normalized phone value through `validateSupportedPhoneNumber`.
- On submit, send normalized E.164 phone value.
- Disable submit when phone is invalid.
- Show a clear Russian error for invalid phone, for example `Введите корректный номер телефона`.

Pass to `OtpAuthForm`:

- `phoneCountry`
- `phoneCountries={supportedPhoneCountries}`
- `phonePlaceholder={getPhonePlaceholder(phoneCountry)}`
- `phoneError`
- `onPhoneCountryChange`

Run:

```bash
pnpm vitest run --config vitest.config.ts apps/client-web/src/pages/auth/AuthPage.test.tsx apps/client-web/src/pages/auth/phoneInputModel.test.ts
pnpm --filter @elevenhouse/client-web typecheck
```

### 8. Manual UI Verification

Start client web dev server:

```bash
pnpm --filter @elevenhouse/client-web dev
```

Verify in browser:

- Type `7`; field becomes `+7`, dropdown shows `RU` and Russian flag.
- Type letters; they do not appear in the phone field.
- Type a valid Russian number; submit becomes available when name/email are valid.
- Select `GE`; placeholder changes to Georgian example.
- Type a valid Georgian number; validation passes.
- Select `KZ`; `+7` remains possible but country stays `KZ` after manual selection.
- Try a Ukrainian number; it does not validate as a supported country.
- Dropdown fits the auth form on mobile and desktop.

If the dev server is already running on the default port, use the existing URL or the next free port reported by Vite.

## Final Verification

Run the focused checks:

```bash
pnpm vitest run --config vitest.config.ts packages/validation/src/phone.test.ts apps/client-web/src/pages/auth/phoneInputModel.test.ts packages/design-system/src/components/OtpAuthForm/OtpAuthForm.test.tsx apps/client-web/src/pages/auth/AuthPage.test.tsx
pnpm --filter @elevenhouse/validation build
pnpm --filter @elevenhouse/design-system build
pnpm --filter @elevenhouse/client-web typecheck
```

Before completion:

- Review `git diff -- packages/validation packages/design-system apps/client-web pnpm-lock.yaml`.
- Confirm unrelated `apps/astrologer-api` or `packages/contracts` changes were not modified by this task.
- If committing, use explicit paths or `git commit --only` because the workspace may contain unrelated changes from other agents.
