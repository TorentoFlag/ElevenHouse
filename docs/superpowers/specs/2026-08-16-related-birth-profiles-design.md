# Related Birth Profiles For Synastry

## Problem

Astrologers can currently run synastry only against two existing CRM clients linked to the astrologer. The client-cabinet reference shows a broader model: a client can save reusable birth profiles for themselves, a partner, and family members, then reuse those people in calculations and orders.

## Approved Direction

Partner and family members are client-owned related birth profiles, not login-capable CRM clients by default. Access for an astrologer is derived from the active client-astrologer relationship with the owner client.

Each related profile stores:

- `displayName`: the person name, for example `Иванов Иван Иванович`.
- `relationshipLabel`: the family/relationship label, for example `муж`, `партнер`, `мама`.
- birth data fields with the same normalization, unknown-time behavior, CAS revision, audit actor, and source semantics as the primary client birth profile.

## In Scope

- Client can create and update related birth profiles in the client cabinet.
- Astrologer can create and update related birth profiles for an actively linked client.
- Astrologer chart engine can select either an existing CRM client or a related birth profile as synastry/composite partner.
- Astrologer-created related profiles appear in the client's cabinet.
- Existing CRM-client synastry/composite flow remains supported.

## Out Of Scope

- Creating a login account for the related person.
- Promoting a related profile into a separate CRM client.
- Cross-astrologer sharing grants beyond the owner client's active relationships.
- Delete/archive lifecycle unless required by implementation constraints.

## Architecture

- Keep `client_birth_data` as the singleton primary/self birth profile.
- Add separate related-profile persistence owned by `client_user_id`.
- Add public `/me/related-birth-profiles` routes and astrologer `/clients/:clientUserId/related-birth-profiles` routes.
- Extend chart participant identity with a typed partner source:
  - `crm_client` with `clientId`.
  - `client_related_profile` with `clientId` owner and `relatedProfileId`.
- Keep chart create requests strict: no browser-supplied birth fields.
- Rehydrate all chart participant birth snapshots server-side.

## Acceptance

- A client-created partner/family profile appears in `/me` and can be used for eligible calculations.
- An astrologer-created related profile is owner-scoped, relationship-checked, auditable, visible to the client, and selectable in synastry.
- An unrelated, archived, or blocked astrologer relationship cannot read or mutate related profiles.
- Existing two-CRM-client synastry/composite requests still work.
