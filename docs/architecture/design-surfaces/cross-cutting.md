# Cross-Cutting Design Assets And Production Baseline

Use this file with the [design routing index](../design-reference-inventory.md).
It separates durable production boundaries from prototype-only design input.

## Design Project Facts

- `ElevenHouseDesign/ElevenHouse.html` is a single browser prototype using React
  UMD, Babel-in-browser, Three.js, JSX files and a demo router.
- Root views include landing, auth/onboarding, astrologer/client cabinets,
  public page and admin. Its screenshots cover desktop/mobile, checkout,
  client/admin, products, charts, flows and settings states.
- `uploads/` and screenshot assets are design/product input, not runtime code.
  Important product rules belong in canonical docs, contracts or code.

## Current Production Baseline

| Layer | Current implementation and routing fact |
| --- | --- |
| `public-api` | Health, client passwordless identity, direct-link join intents, relationship-scoped astrologer/purchase-option/slot reads, client birth data, booking/order/checkout commands and dispute-candidate submit/list exist. `client-consents` is reserved without a runtime module. Full public profile reads, client checkout UI and most cabinet modules remain incomplete. |
| `astrologer-api` | Identity; products; dictionary/AI; profile/media; availability/calendar/bookings; finance; CRM-client foundation; calculation/chart/numerology/matrix/Human Design/astro-calendar; messaging; platform billing; verification; AI; security and technical database/redis/clock/health modules are present. Public-page reads/edits, preferences, integrations and broader internal operations remain distinct contours. |
| `admin-api` | Separate `database`, `finance-authorizations`, `finance-policies`, `flow-runtime-control`, `health`, `identity`, `online-wallet-refunds`, `payout-evidence`, `refund-candidates` and `security` modules. Finance policy/risk/payout and refund approval use session auth, CSRF, idempotent commands, durable audit, WebAuthn authorization and sealed evidence. The admin API persists the V2 refund reservation/outbox but never treats that write as a provider outcome; canonical payment-worker processing remains the execution authority. |
| Contracts/domain/DB | Shared contracts cover identity, clients, products, dictionary, AI drafts, profile, media, billing, verification, calculations, finance, messaging and calendar/booking. Domain/DB cover accounts/sessions, relationships/birth data, products, dictionary/media, verification, calculations, booking/orders/payments, finance/ledger/payouts, messaging, outbox and auth-code delivery. |
| Frontends | `astrologer-web` has protected first slices for products, reference, settings/verification/billing, calendar, charts, numerology, matrix, Human Design, astro calendar, clients, inbox and finance. `client-web` has auth, `/a/:handle` join-intent handoff and `/me` relationship/birth-profile foundation. `admin-web` has finance-policy/risk settings; broader navigation and operations remain incomplete. |
| Frontend foundation | Production apps use shared contracts, Zod response parsing, React Query and the shared credentials/CSRF HTTP-client pattern. |

## Prototype Exclusions And Asset Ownership

| Design input | Production interpretation |
| --- | --- |
| `styles.css`, `icons.jsx` | Visual direction and icon vocabulary. Implement stable tokens/icons in `packages/design-system`; never copy global prototype CSS wholesale. |
| `tweaks-panel.jsx`, `DemoSwitch`, demo routing, `window.*`, localStorage | `design-only`; never production workflow/state authority. |
| `image-slot.js`, screenshot assets, `.image-slots.state.json` | Visual QA/media-placeholder input only. Production media requires object storage, CDN/media contracts and accessibility metadata. |
| `uploads/*.md`, `uploads/*.html` | Requirements/design input only; do not import into runtime. |
| `ios-frame.jsx` | Reference artifact. Build responsive web states rather than device-frame wrappers. |
| `astro-store.jsx` and design calculation helpers | Mock/demo state. Production calculations require domain ports, worker contracts and fixtures. |

## Design-System Extraction Boundary

Existing stable primitives include `Button`, `Card`, `Chip`, `IconButton`,
`IconPicker`, language/auth controls, modal/tabs/selectable tiles, navigation,
motion primitives and current shell/auth/products/reference icons.

Potential reusable primitives are command/create menus, notification popovers,
metric cards, status/action menus, form/list/modifier blocks, master-detail
shells, public-page blocks, calendar grid and ledger/money displays. Extract
only once their data/state contracts are stable. Do not turn unresolved booking,
payout or moderation transitions into shared UI behaviour.
