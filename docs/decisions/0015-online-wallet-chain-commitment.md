# ADR 0015: Online Wallet Chain Commitment and Transaction-Local Capture Derivation

Date: 2026-08-05

## Status

Accepted for the Finance baseline implementation.

## Context

`PayableLotReferenceState.stateDigest` hashes the complete source-lot lifetime
state: lots, operation history and chargeback restrictions. It is therefore a
valid offline rebuild/reconciliation oracle, but an online capture cannot
derive its next value from only a wallet head and one new root lot.

The sealed wallet writer already mutates only a bounded transition under one
PostgreSQL wallet advisory lock and wallet-revision CAS. Its receipt/binding
shape still includes the full-state digest, so treating a newly invented rolling
hash as that digest would silently weaken the existing integrity contract.

Also, a webhook capture mutation resolver that opens another database
transaction cannot share the caller's lock, row versions or uncommitted semantic
fact. It could construct a stale mutation before the final writer performs its
CAS.

## Decision

1. Retain `PayableLotReferenceState` and its full-state digest exclusively as
   an offline audit/reconciliation oracle. Do not hydrate it on the request or
   worker mutation path and do not substitute a chain digest for it.
2. Persist `finance_wallet_lot_commitment_chain` for every sealed wallet
   revision. PostgreSQL issues each commitment from the direct predecessor,
   exact operation-receipt digest and exact commit-binding digest. It is
   append-only and verifies predecessor continuity at transaction commit.
3. The chain is a separate online serialization/audit proof. It does not grant
   a mutation alone and does not represent source-lot full-state equivalence.
   The sealed journal, operation receipt, bounded locked lots, root-capture
   authority and wallet-revision CAS remain mandatory.
4. Any DB-backed client-order mutation resolver must receive the caller-owned
   `FinanceTransaction`. It acquires/retains the same wallet lock and reads the
   exact current rows within that transaction; it must not open a sibling
   transaction.
5. Client-order capture stays fail-closed until receipt construction is changed
   to carry an explicit bounded online chain proof in addition to, not instead
   of, the offline full-state audit digest. This ADR intentionally does not
   wire a client capture through the new chain yet.

## Online Receipt v2 Contract

`OnlineSaleCaptureReceipt` is the domain draft for that later wiring. It has
its own `kind = online_sale_capture_receipt` and `schemaVersion = 2`, and
contains only:

- wallet identity, expected/next wallet revision and predecessor commitment;
- one bounded active pending root lot and its canonical capture authority;
- frozen order economics, risk-policy and fulfillment snapshots already bound
  to that root lot;
- source identity, captured time and the receipt canonical digest.

It deliberately contains neither `previousLotStateDigest` nor
`nextLotStateDigest`. The database must own the final v2 receipt row, component
bindings, journal link proof, wallet CAS and newly issued chain commitment in
one transaction. The existing v1 receipt, journal proof and commit binding
columns are not a transport for v2 data; a follow-up must add an explicit v2
persistence graph or a versioned receipt registry with exact foreign-key
ownership before the client resolver is enabled.

## Consequences

- Every existing sealed wallet operation emits a DB-issued predecessor chain
  record atomically with its receipt, history, binding and lot-state snapshot.
- Reconciliation can independently compare the chain, normalized graph and
  full-state rebuild oracle.
- A later bounded client-capture builder must define its exact genesis and
  operation preimage, add it to the receipt/binding/proof contract, and prove
  concurrent captures serialize under the existing wallet advisory lock/CAS.
- Reusing `finance_wallet_lot_commitment_chain.commitment_digest` as
  `lot_state_digest`, or accepting it without the sealed graph, is prohibited.
