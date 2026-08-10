# Client Design Surfaces

Use this file with the [design routing index](../design-reference-inventory.md).
Client surfaces are direct-link and relationship-scoped: they must never become
a public astrologer catalogue, discovery or recommendation product.

| Design area / reference | Production surface and ownership | Current readiness and boundary |
| --- | --- | --- |
| Public astrologer page (`page.jsx`, `page-data.jsx`) | `client-web` direct-link routes backed by `public-api`; `AstrologerProfile`, `PublicPage`, `Products`, `Availability`, `Reviews`, `LeadMagnets`, `Content`, `Promotions` | `partial`: `/a/:handle` creates/resolves a join intent, exposes safe public identity and carries pending context through client auth. Full public page/product/availability reads are missing; never expose discovery or a public catalogue. |
| Booking/checkout entry (`page.jsx`, `client.jsx`, `calendar-panels.jsx`) | `client-web` + `public-api`; `Booking`, `Availability`, `Orders`, `Payments`, `Products`, `ClientProfile` | `partial`: relationship-scoped purchase-option/slot reads and paid-hold command exist; `/me` lists linked astrologers with honest unavailable-slot state. Client slot selection, checkout UI, expiry/failure coverage remain missing. |
| Client registration during booking (`app.jsx`, `ClientRegister`) | `client-web` + `public-api`; `Identity`, `ClientProfile`, `Booking` | `partial`: public identity and direct-link relationship are real; auth consumes join token. Registration/booking is still a separate missing contour. |
| Client cabinet (`client.jsx`, `client-data.jsx`) | Authenticated `/me`; `ClientProfile`, `ClientAstrologerRelationship`, `Bookings`, `Orders`, `Sessions`, `Materials`, `Subscriptions`, `BirthData`, `Journal`, `Notifications` | `partial`: related astrologers, overview, direct-link selector, booking entry, canonical place picker and one client-owned birth-profile editor exist. Materials, feed, subscriptions and broader cabinet modules are missing. No consent-card/grant/profile-switch/per-booking-data-access workflow exists. |
| Sessions/materials (`client.jsx`, `session-call.jsx`) | Authenticated client routes; `Sessions`, `Bookings`, `Orders`, `Recordings`, `Materials`, `Media`, `Consent` | `missing`; recording playback and materials need consent, retention and access control. |
| Feed/subscriptions (`client.jsx`, `content-data.jsx`) | Authenticated client routes; `Content`, `Subscriptions`, `Orders`, `Payments`, `Notifications` | `missing`; any feed remains limited to explicitly related astrologers. |
| Birth data/charts/diary (`client.jsx`, `journal.jsx`) | Authenticated client routes; `BirthData`, `Charts`, `Journal`, `ClientProfile` | `partial`: one owner profile with CAS/audit history and place picker exist. Booking eligibility, Flow work items, readiness recheck and chart context remain incomplete. A linked astrologer acts only under active server-side relationship policy; missing data is an ordinary action/work item, never a consent wait. |
| Notifications/disputes (`client.jsx`, admin dispute views) | Client app plus `public-api`/`admin-api`; `Notifications`, `Disputes`, `Payments`, `Orders`, `AuditLog` | `partial`: owned-order dispute candidate submit/list, admin review and super-admin WebAuthn refund approval are real. Approval reserves the V2 payable position and seals a provider-operation outbox; only canonical payment-worker processing can confirm a provider outcome. Client support UI and live provider/browser acceptance remain pending. |

## Evidence Boundary

The client reference defines visual states only. Product direct-link and
relationship invariants are in [full functional scope](../../product/full-functional-scope.md);
API ownership and browser-security rules are in
[API boundaries](../../api/api-boundaries.md). Verify the exact authenticated
relationship/data state at runtime before claiming a visible client flow.
