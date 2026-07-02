# Account and Role Model

## Account identity

ElevenHouse uses one user account model across all product surfaces. A user account can hold more than one role at the same time, for example `client` and `astrologer`.

Authentication identities, sessions and role assignments are separate concepts:

- User account: the durable platform account.
- User profile: self-declared profile attributes for the account.
- Auth identity: a login method linked to a user account, such as email/password or a future OAuth provider.
- Session: an authenticated runtime session for one user account.
- Role assignment: a role granted to a user account.

## User profile

`users` is the durable account shell and stores account lifecycle state. Self-declared
profile attributes live in `user_profiles`.

`user_profiles.display_name` stores the answer to "Как к вам обращаться". It is not a
legal name and must not be used as KYC data. Future legal identity and KYC records
must live in a separate identity verification contour with its own audit, retention
and access rules.

## Canonical roles

The canonical platform roles are:

- `client`: buys services, content and subscriptions from an astrologer.
- `astrologer`: sells services and manages CRM workflows.
- `moderator`: handles verification, content, reviews, reports and dispute queues within granted permissions.
- `admin`: manages platform operations through domain use cases and audit logs.
- `super_admin`: highest internal platform role for sensitive platform-level administration.

## Role categories

Customer-facing roles:

- `client`
- `astrologer`

Internal platform roles:

- `moderator`
- `admin`
- `super_admin`

Internal roles are only for ElevenHouse platform staff. They must not be granted through public registration or astrologer onboarding.
Public registration grants only `client`. The `astrologer` role may be added to the
same account later, but only through a dedicated astrologer onboarding or authorized
internal workflow with explicit server-side authorization.

## Authorization invariants

- `client` and `astrologer` may coexist on one account.
- Public registration must not self-assign `astrologer`, `moderator`, `admin` or `super_admin`.
- `moderator`, `admin` and `super_admin` are internal roles.
- Admin and super-admin actions must call domain use cases and write audit log entries.
- `super_admin` should be reserved for actions that can change platform-wide security, financial, role or operational settings.
- Frontend applications must not infer authorization from app selection alone; API surfaces must enforce roles explicitly.
