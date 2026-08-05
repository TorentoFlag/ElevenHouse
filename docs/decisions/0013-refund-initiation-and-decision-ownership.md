# 0013. Refund Initiation and Decision Ownership

Date: 2026-08-05

## Status

Accepted.

## Context

ElevenHouse is a company merchant: client money is accepted by ElevenHouse
through ArcPay, while the astrologer's balance is an internal payable
liability. A client dispute, a cancellation within the product policy and an
astrologer-caused cancellation are different product events, but none of them
is by itself evidence that ArcPay has refunded money.

The product requires a client to be able to open a dispute, an astrologer to
cancel a booking under its configured cancellation policy, and an internal
operator to resolve a disputed case with a full or partial refund. A direct
"refund any amount" action for an astrologer would bypass the applicable
policy, source evidence, accounting allocation and separation of duties.

## Decision

1. Client and astrologer actions create a **refund candidate**, never a
   provider refund or ledger reversal:
   - a client dispute is client-owned evidence submitted through the client
     surface;
   - an astrologer booking cancellation is evaluated by the server-owned
     cancellation/refund-policy decision port;
   - an astrologer cannot choose an arbitrary refund amount or invoke ArcPay
     directly.
2. Only an internal `admin-api` decision workflow may resolve a dispute to a
   full or partial monetary refund. It records the operator, reason,
   evidence references and exact amount in the audit trail.
3. The refund authority issuer resolves the order, original captured payment,
   tariff/economics snapshot, prior cumulative refund position and affected
   payable/payout lots under database locks. It then creates the exact
   immutable allocation authority and refund case approval in the same
   transaction that prepares the idempotent provider-operation intent.
4. ArcPay dispatch happens only after that transaction commits. A provider
   acknowledgement remains non-accounting evidence. The only transitions that
   change wallet, journal and order/payment refund state are verified canonical
   provider success/failure results applied by the payment worker.
5. A resolution cannot recompute allocation from a later live wallet state;
   terminal work rehydrates the durable allocation authority referenced by the
   refund case.

## Consequences

- UI labels such as “full refund” or “partial refund” represent a decision
  request, not success at ArcPay.
- An approved refund can be `provider_unknown`; it remains visible to internal
  operations and is reconciled instead of being silently retried as a new
  economic action.
- Booking-policy and dispute-resolution adapters may share the same refund
  authority issuer, but they keep distinct source/evidence semantics.
- Admin review queues are not a substitute for canonical provider result
  processing, and webhook browser responses never establish a refund.
