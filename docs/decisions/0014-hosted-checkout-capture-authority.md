# 0014. Hosted Checkout Capture Authority

Date: 2026-08-05

## Status

Accepted.

## Context

For a client order, ElevenHouse first asks ArcPay to create a hosted checkout
session. That provider operation proves only that the buyer can be directed to
an ArcPay payment surface. It is not an authorization or capture of the
client's money and it has no ArcPay payment identifier.

Later ArcPay delivers `payment.captured`. ArcPay documents this as the signal
to fulfil the order, while also documenting that it is not terminal: the
payment can subsequently settle, be refunded or become a chargeback. The
webhook is delivery evidence, not sufficient authority to move a balance on
its own. ArcPay's canonical payment read (`GET /payments/{id}`) supplies the
correlated payment identifier, merchant `external_id`, amount, currency and
captured status. It is also the required recovery path when a webhook is late
or a provider response is uncertain.

The existing provider-operation result for `checkout_session_create` is
therefore deliberately terminal for a different fact: creation of the hosted
session. Reusing it as a capture result would falsely assert that its
`providerOperationId` is the payment ID and would mix two independently
idempotent provider facts.

ArcPay owns the cardholder-data surface for hosted checkout and H2H-hosted
payment modes. ElevenHouse does not receive or store PAN/CVV from this flow.
Finance private objects are operational evidence payloads: provider requests,
provider responses, signed webhook bodies and canonical reads. They are stored
in a private versioned object bucket and bound from PostgreSQL by object
VersionId, byte length and SHA-256 digest. Server-side object encryption is not
part of this authority model.

## Decision

1. Hosted-checkout session creation and a hosted payment capture are distinct
   authorities. A successful checkout-session operation never authorizes an
   economic capture.
2. A verified capture is represented by one immutable, provider-scoped
   `payment_transition` semantic fact in the finance webhook inbox. Its natural
   identity is the ArcPay payment ID plus the `captured` transition; it binds
   the already-open economic payment session, provider account, canonical
   response artifact, exact amount/currency and observed time.
3. The payment worker stores an HMAC-verified webhook before acknowledging it,
   then reads ArcPay canonically outside the database transaction. It accepts a
   capture only when `id`, `external_id`, provider account, amount, currency and
   captured/settled state agree with the locked client-order checkout authority.
4. In one fenced database transaction, the worker records the semantic fact,
   advances the inbox checkpoint and applies the capture transition, journal,
   wallet and order/booking effects. The capture tables reference the semantic
   fact as their authority; they do not reference the checkout-session result.
5. Browser return URLs and the initial HPP session response are client UX
   facts only. They may show a pending/success hint, but cannot fulfil an order
   or credit an astrologer's wallet.
6. Finance artifact storage requires private bucket access, object versioning
   and digest verification. It does not require SSE-KMS because cardholder data
   stays with ArcPay; do not configure fake KMS identities for these artifacts.

## Consequences

- Duplicate delivery, a crash after ArcPay capture and an inbox retry converge
  on one semantic fact and one financial application.
- A capture cannot be silently manufactured from a HPP session ID; the worker
  needs the ArcPay payment ID from a verified webhook or a separately
  correlated reconciliation read.
- The model remains compatible with one-stage and two-stage payment methods:
  the financial transition happens only at capture. `authorized` may later be
  modeled as a non-money-moving state without changing this rule.
- Settlement, refund, chargeback and fiscal receipt polling remain separate
  facts. In particular, a fiscal receipt's asynchronous status is not a reason
  to post a capture without valid fiscal configuration.
- Production checkout readiness depends on a private versioned object bucket
  and retention-policy rows. Missing object versioning remains a hard failure;
  missing provider-side encryption does not block this payment contour.
