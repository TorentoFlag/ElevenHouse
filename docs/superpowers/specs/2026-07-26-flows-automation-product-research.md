# Flows And Automation Product Research

Date: 2026-07-26
Status: product/business research and architecture recommendation; no
implementation yet
Scope: astrologer-side funnels, automation builder, automation runtime,
AstroCalendar handoff, messaging/content/chart actions and safe approval model

> This document is a research artifact. Durable decisions must be reflected in
> product, architecture, API, security and testing docs when implementation
> starts.

## 1. Executive Verdict

ElevenHouse needs funnels before meaningful automation. The correct product is
not a generic marketing funnel clone and not a button in AstroCalendar that
pretends to send something. It should be a domain-specific practice automation
system for astrologers:

- trigger business and astrology events;
- collect missing client data;
- calculate charts and adjacent systems;
- draft or schedule content and messages;
- create tasks and handoffs;
- ask the astrologer to approve sensitive or commercial outbound steps;
- execute only after consent, frequency and channel rules pass;
- keep a complete run history with skipped reasons and retry state.

The first production version should default to `draft_only` and
`manual_approve` modes. Internal tasks, tags, chart calculations and AI drafts
can be automated earlier than external sends. Automatic outbound messages should
come later, after consent records, quiet hours, channel-specific limits and
idempotent delivery attempts are implemented end to end.

## 2. Product Question

Question: how should ElevenHouse build funnels so they cover the operational,
sales, content and astrology-specific needs of professional astrologers without
creating fake automation, privacy risk or fragile background behavior?

Decision affected:

- whether AstroCalendar automation can be enabled;
- Flow Builder information architecture;
- flow runtime and data model;
- Messaging/Telegram/email/SMS integration boundary;
- AI approval model;
- chart-engine automation hooks;
- CRM segmentation and analytics model;
- pricing/plan limits for automations.

Accessed: 2026-07-26.

## 3. Repository And Reference Evidence

### Product Boundaries

- ElevenHouse is a closed SaaS/CRM for astrologers. Client access is based on a
  direct relationship with a specific astrologer; discovery, search,
  recommendations and cross-promo are out of product scope.
- Client birth data, messages, recordings, AI usage and commercial outreach
  require explicit ownership, consent, auditability and data minimization.
- The existing AstroCalendar design intentionally left automation as future
  scope: the first AstroCalendar slice is read-only and must not enqueue
  messages, funnels, notifications or silent jobs.

### Flow Builder Reference

`ElevenHouseDesign/app/flow-data.jsx` shows a full builder vocabulary:

- node categories: trigger, action, AI, condition, delay, handoff;
- triggers: lead, purchase, incoming message, astrology event, segment change,
  completed form, booking, schedule/date, review, subscription renewal/churn,
  chart ready, journal entry;
- actions: send message, request data, build chart, offer slot, request
  payment, deliver result, open access, issue certificate, tag/segment, create
  task, webhook;
- calculation actions: natal, transits, progressions, directions, returns,
  synastry, composite, horary, astrocartography, vedic, child chart,
  numerology, destiny matrix, human design;
- content actions: publish post, subscriber post, broadcast;
- AI actions: classify, summarize, score, extract, reply, draft content;
- logic: if/else, chart-based condition, split, A/B, delay;
- human steps: handoff to astrologer and live video session.

Reference templates:

- `Авто-разбор в записи`;
- `Лид-магнит -> апселл`;
- `Реактивация спящих`;
- `Подготовка к живой сессии`;
- `Защита от no-show`;
- `Авто-черновики контента`;
- `Годовой прогноз (соляр)`;
- `Совместимость пары`;
- `Нумерологический портрет`;
- `Матрица судьбы`;
- `Дизайн человека`;
- `Астродневник: рефлексии`;
- empty custom funnel.

`ElevenHouseDesign/app/flow-engine.jsx` makes the chart engine a first-class
automation action: calculate from client data, choose calculation type, select
outputs and route the result to client materials, astrologer brief or AI
interpretation.

### AstroCalendar Reference

`ElevenHouseDesign/app/astro-calendar-data.jsx` connects event opportunities to
funnels:

- birthday -> birthday greeting or loyalty offer;
- Mercury retrograde -> content series or sales pause;
- personal transit -> soft touchpoint or forecast offer;
- new moon -> lead magnet and live event;
- solar window -> annual forecast offer;
- Venus ingress -> synastry offer;
- full moon -> recap/live/deadline;
- sleeping client birthday -> reactivation;
- eclipse corridor -> recorded reading.

The product inference is clear: AstroCalendar should not be the automation
engine. It should be a source of eligible events and a context-rich entry point
into flows.

### Cross-Surface Signals

The reference also shows funnel awareness outside `/flows`:

- CRM clients can display current funnel name and step.
- Inbox conversations can show "in funnel" context.
- Dashboard includes tasks from funnels and conversion metrics.
- Analytics includes funnel performance and automation load.
- Product constructor treats a free lead magnet as an entry into a funnel.
- Plans/tariffs include automation and funnel features.

Therefore Flows is a shared business capability, not a single page.

## 4. Web Research

### Sources

- [Customer.io automation triggers](https://docs.customer.io/messaging/send/automations/triggers/)
  - trigger, filters, exit conditions, frequency settings and object
  relationships in mature lifecycle automation.
- [Klaviyo flows](https://help.klaviyo.com/hc/en-us/articles/115002774932)
  - trigger types, trigger/profile filters, actions and logic steps.
- [Mailchimp Customer Journey](https://mailchimp.com/help/create-customer-journey/)
  - customer journey map concepts, starting points, rules/actions and journey
  status metrics.
- [Braze Quiet Hours](https://www.braze.com/docs/user_guide/messaging/messaging_fundamentals/quiet_hours)
  - local-time quiet hours and their distinction from frequency caps and rate
  limits.
- [Twilio Messaging Policy](https://www.twilio.com/en-us/legal/messaging-policy)
  - consent, sender identity, purpose clarity, withdrawal and proof retention
  for messaging.
- [FTC CAN-SPAM guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
  - commercial email requirements such as accurate headers, non-deceptive
  subjects, ad identification, physical address and opt-out.
- [ICO valid consent guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/consent/what-is-valid-consent/)
  - consent must be freely given, specific, informed and unambiguous; records
  and easy withdrawal matter.
- [Telegram Bot API](https://core.telegram.org/bots/api)
  - business bot updates, business connection rights and `can_reply` rights for
  private chats with recent incoming messages.

### Findings

- Sourced fact: mature automation products separate entry trigger, trigger
  filters, profile/audience filters, exit conditions and re-entry/frequency
  settings. ElevenHouse should copy this conceptual separation, not necessarily
  the UI.
- Sourced fact: flow steps commonly include messages, data updates, waits,
  conditional branches, percentage splits, webhooks and status metrics.
- Sourced fact: mature messaging platforms distinguish quiet hours, frequency
  capping and rate limiting. ElevenHouse needs all three because astrologers
  will use personal, emotional and commercial touchpoints.
- Sourced fact: commercial outbound messaging needs consent, sender/purpose
  clarity, opt-out/withdrawal and proof retention. This applies especially to
  email/SMS and should still inform Telegram/client-chat trust design.
- Sourced fact: Telegram Business bot permissions include a right to reply in
  private chats with recent incoming messages. Flow runtime must check current
  channel capability at send time, not only at flow design time.
- Repository evidence: the current AstroCalendar spec explicitly forbids fake
  automation and marks sends/funnels as later scope.
- Repository evidence: chart calculations are already moving toward canonical
  server-backed results, so flows should consume calculation contracts/events
  rather than reimplement astrology in the browser.
- Inference: ElevenHouse should ship a conservative automation engine first:
  generate drafts, tasks and calculation artifacts with clear approval states;
  only then allow explicit auto-send modes per channel and template.

## 5. What Astrologers Actually Need Covered

### Practice Operations

1. Capture a new lead from the personal page.
2. Ask for birth date, birth time, birth place and topic of request.
3. Detect missing/approximate birth time and route to a clarification step.
4. Confirm or remind about a booked session.
5. Build a natal/transit/synastry/solar/etc. chart before the session.
6. Produce an astrologer brief from client profile, request and chart.
7. Create manual tasks when a human decision is required.
8. Track no-show risk, unpaid orders and stale client data.

### Revenue

1. Lead magnet -> nurture -> paid reading.
2. Async product purchase -> data collection -> calculation -> interpretation
   draft -> delivery -> follow-up.
3. Post-session upsell to a related service.
4. Birthday/solar-return offer.
5. Reactivation of sleeping clients using a natural astrological reason.
6. Synastry/compatibility offer around relationship periods.
7. Subscription renewal, retention and churn prevention.

### Content And Community

1. Turn global astro events into draft posts, broadcasts or subscriber content.
2. Plan content around Moon phases, retrogrades, ingresses and eclipses.
3. Segment audience by interest without exposing sensitive chart details.
4. Pause or adjust promotional tone during high-risk periods.

### Client Care And Trust

1. Send soft, non-pushy support touchpoints during heavy transits.
2. Avoid contacting people too often.
3. Respect channel consent and opt-outs.
4. Show when automation is waiting for astrologer approval.
5. Explain why a client was or was not contacted.

## 6. Recommended Product Model

### Core Objects

- `FlowTemplate`: reusable product template with goal, category, graph draft,
  required inputs and recommended approval mode.
- `Flow`: astrologer-owned automation configured from a template or blank graph.
- `FlowVersion`: immutable published graph. Runs execute against versions, not
  mutable drafts.
- `FlowNode`: typed node with category, operation key, config and validation.
- `FlowEdge`: graph connection with optional branch label and condition.
- `TriggerDefinition`: normalized trigger contract with source event schema.
- `FlowRun`: one subject entering one published flow version.
- `FlowStepRun`: execution record for a node.
- `FlowAudienceSnapshot`: frozen eligibility context used for audit/debug.
- `FlowApproval`: pending human decision for message, AI output, delivery or
  risky action.
- `FlowDeliveryAttempt`: channel delivery attempt with provider response,
  idempotency key, retry state and failure reason.
- `FlowSuppression`: opt-out, quiet-hour hold, frequency cap, manual stop,
  no-contact window or channel block.
- `FlowMetric`: aggregated active/waiting/completed/conversion/error counters.

### Trigger Sources

- CRM: client created, segment changed, tag added, profile updated, birth data
  completed, client became inactive.
- Products/orders: lead magnet claimed, paid product purchased, payment failed,
  order completed, material delivered.
- Booking: slot confirmed, session soon, no-show, session completed, review
  received.
- Messaging: incoming message, no reply after N time, topic classified,
  external channel connected/disconnected.
- Chart engine: chart ready, calculation failed, missing birth data,
  interpretation missing.
- AstroCalendar: global astro event, personal transit, solar window, birthday.
- Content/journal: post draft requested, journal entry submitted, subscription
  renewal/churn event.
- Manual: astrologer starts a flow for one client or a selected segment.

### Node Categories

- Trigger nodes: define entry source and re-entry policy.
- Filter nodes: constrain audience before run creation.
- Condition nodes: profile, segment, order, booking, consent, chart and AI
  conditions.
- Action nodes: internal task, tag/segment update, data request, calculation,
  payment request, material delivery, message draft/send, webhook.
- AI nodes: classify, extract, score, summarize, reply draft, interpretation
  draft, content draft.
- Delay/wait nodes: wait duration, wait until date/time, wait for event, wait
  until condition or timeout.
- Handoff nodes: create approval/task and pause until human action.
- Terminal nodes: completed, suppressed, goal reached, failed, expired.

## 7. Execution Logic

### Event Ingestion

All candidate entries should become normalized automation events:

```text
source
sourceEventId
ownerAstrologerId
subjectType
subjectId
occurredAtUtc
payload
dedupeKey
```

Every event must be idempotent. A repeated payment webhook, booking update or
AstroCalendar generation should not start duplicate runs unless the published
flow explicitly allows re-entry.

### Eligibility

A flow can start only when all checks pass:

- flow is live and published;
- trigger matches source and payload;
- owner/relationship scope is valid;
- trigger filters pass;
- profile/audience filters pass;
- plan limits allow another active automation;
- re-entry policy allows this subject to enter;
- suppression list does not block contact;
- channel consent and current provider capability are available for any send;
- quiet hours and frequency caps decide whether to send now, hold or skip.

### Run Snapshot

When a run starts, it should materialize a snapshot:

- flow version;
- subject identifiers;
- trigger payload;
- selected client fields needed by nodes;
- consent/channel state;
- relevant chart/result ids;
- relevant dictionary/interpretation references;
- timezone;
- plan/limit state.

This prevents later profile edits from rewriting history and makes audits
understandable.

### Step Execution

Recommended state machine:

```text
pending -> running -> waiting -> approval_required -> completed
                  -> skipped -> failed_retryable -> failed_terminal
                  -> suppressed -> expired -> canceled
```

Rules:

- each step has an idempotency key;
- external side effects write a delivery/action attempt before provider call;
- retryable provider errors stay observable;
- hidden fallback messages are forbidden;
- AI output that will reach a client starts as a draft unless the flow has an
  explicit auto-send approval mode and the channel allows it;
- chart calculations delegate to chart-worker/chart-engine and store canonical
  result references;
- data requests and missing birth data branch honestly instead of silently
  skipping.

### Approval Modes

- `draft_only`: generate drafts/tasks only; astrologer sends manually.
- `manual_approve`: flow pauses for astrologer approval before outbound or
  client-visible delivery.
- `auto_internal`: automate internal tasks, tags, calculations and briefs.
- `auto_send`: send externally without per-message approval. This should be
  disabled in the first release and require explicit per-flow/channel enablement
  later.

## 8. Funnel Library To Cover Astrologers

### First Wave

1. `Подготовка к живой сессии`
   - trigger: booking confirmed;
   - actions: request birth data, build chart, create astrologer brief, send
     reminder;
   - reason: operational value, low commercial risk, immediate fit with booking
     and chart engine.

2. `Авто-разбор в записи`
   - trigger: paid async product;
   - actions: request data, calculate chart, create AI interpretation draft,
     approval, deliver material, follow-up;
   - reason: core revenue workflow from reference.

3. `Лид-магнит -> апселл`
   - trigger: free product/lead magnet claimed;
   - actions: deliver free value, nurture, AI score, offer paid session;
   - reason: converts personal-page traffic into CRM value.

4. `Реактивация спящих`
   - trigger: inactive segment plus personal AstroCalendar event;
   - actions: draft caring message, wait for response, optional offer,
     no-contact delay;
   - reason: strong ElevenHouse-specific differentiator.

5. `Post-session follow-up`
   - trigger: session completed or material delivered;
   - actions: summary, review request, related offer, task if unanswered;
   - reason: improves retention and gives clear conversion metrics.

### Second Wave

6. `Поздравление с днем рождения`
   - birthday contact, optional loyalty gift, opt-out aware.

7. `Годовой прогноз / соляр`
   - solar window, annual forecast offer, chart calculation hook.

8. `Касание по транзиту`
   - significant transit, supportive or commercial template depending on
     segment and consent.

9. `Совместимость пары`
   - relationship content/offer, partner data request, synastry calculation.

10. `Контент к ретро-Меркурию`
    - global event, AI content drafts, publication approval, sales-tone warning.

11. `Лунный контент-план`
    - new/full moon content prompts, subscriber posts, live-event setup.

12. `Защита от no-show`
    - prepayment/reminders/no-show task; must respect booking/payment contracts.

13. `Подписка / комьюнити retention`
    - renewal, inactivity, subscriber content and churn prevention.

14. `Астродневник`
    - weekly prompts based on Moon/calendar, client journal entry follow-up.

15. `Отзывы и рекомендации`
    - review request after successful service, referral prompt only after
      explicit positive signal.

## 9. UI Requirements

### `/flows` List

The list should answer three questions in one scan:

- which automations are live;
- where people are stuck;
- which flows bring revenue or require approval.

Recommended card data:

- name, status and approval mode;
- trigger summary;
- active, waiting, approvals, completed and conversion;
- last run and last issue;
- linked products/segments/channels;
- disabled reason if plan, consent or setup blocks execution.

### Template Gallery

Templates should be grouped by astrologer job, not technical category:

- Sales;
- Service delivery;
- Retention;
- Content;
- AstroCalendar;
- Client care;
- Advanced/custom.

Each template should show:

- what it automates;
- required integrations/data;
- default approval mode;
- expected channel;
- risk level;
- setup checklist.

### Builder

Reference structure fits production:

- left palette with node groups;
- canvas with graph;
- right inspector for selected node;
- top controls for draft/publish, simulate, activate, pause;
- tabs: Overview, Builder, Runs, Approvals, Logs, Settings.

Production additions:

- validation panel with blocking issues;
- "why this cannot run" copy;
- simulation mode with sample client/event;
- version history;
- per-node test result;
- keyboard and focus states for graph controls.

### Run History

Every flow needs a readable run detail page:

- trigger event;
- snapshot;
- timeline of nodes;
- generated drafts;
- approvals;
- delivery attempts;
- skipped/suppressed reasons;
- retry actions;
- final outcome.

This is not optional. Without run history, automation failures become invisible
and support/debugging will be expensive.

### Approval Inbox

Astrologers need a single queue for pending automation decisions:

- AI message draft;
- AI interpretation draft;
- content draft;
- client delivery approval;
- payment/offer confirmation;
- manual handoff task.

Actions:

- approve/send;
- edit then approve;
- snooze;
- reject;
- stop this run;
- stop this flow for this client.

### AstroCalendar Integration

AstroCalendar event card should not "send" directly. It should open a flow
start/setup modal:

- selected event;
- affected clients/audience;
- suggested templates;
- required consent/channel checks;
- first action preview;
- create draft flow, start manual run or add to existing flow.

## 10. Architecture Recommendation

### Packages And Apps

- `packages/contracts/src/flows.ts`
  - public schemas for flows, graph nodes, runs, approvals, templates and API
    DTOs.
- `packages/domain/src/flows/*`
  - flow validation, eligibility, state transitions, idempotency and audit
    decisions.
- `packages/db/src/schema/flows.ts`
  - persistence for flows, versions, runs, step runs, approvals, delivery
    attempts and suppressions.
- `apps/astrologer-api/src/modules/flows`
  - owner-scoped flow CRUD, publish, run reads, approval actions, simulation and
    manual start endpoints.
- `apps/workers`
  - orchestration worker for flow runs and step scheduling.
- Existing workers/providers:
  - `chart-worker` for chart calculations;
  - notification/messaging workers for outbound delivery;
  - AI services through existing AI boundaries, not direct UI calls.
- `apps/astrologer-web/src/features/flows`
  - list, template gallery, builder, run detail, approval inbox and
    AstroCalendar handoff UI.

Avoid a new deployable app for the first slice unless existing worker capacity
or ownership becomes a proven bottleneck.

### API Surface

Recommended endpoints:

```text
GET    /flows
POST   /flows
GET    /flows/:id
PATCH  /flows/:id/draft
POST   /flows/:id/publish
POST   /flows/:id/activate
POST   /flows/:id/pause
POST   /flows/:id/simulate
POST   /flows/:id/manual-runs
GET    /flows/:id/runs
GET    /flow-runs/:runId
POST   /flow-runs/:runId/cancel
GET    /flow-approvals
POST   /flow-approvals/:approvalId/approve
POST   /flow-approvals/:approvalId/reject
POST   /flow-approvals/:approvalId/snooze
GET    /flow-templates
POST   /astro-calendar/events/:eventId/flow-drafts
```

All mutating endpoints need CSRF and idempotency where repeated submission can
create side effects.

### Persistence Notes

Minimum tables:

- `flows`;
- `flow_versions`;
- `flow_nodes`;
- `flow_edges`;
- `flow_triggers`;
- `flow_runs`;
- `flow_step_runs`;
- `flow_approvals`;
- `flow_delivery_attempts`;
- `flow_suppressions`;
- `automation_events`;
- `flow_metrics_daily`.

Keep graph config as validated JSON inside version records plus extracted
columns for common filters/status. Do not let the frontend own the executable
graph format without contract validation.

### Event And Queue Model

Recommended flow:

```text
domain event/webhook/calendar event
  -> automation_events insert with dedupe key
  -> trigger matcher selects live flow versions
  -> eligibility creates flow_runs
  -> worker executes steps
  -> side-effect adapters create attempts/jobs
  -> approvals pause/resume runs
  -> metrics/read models update
```

## 11. Security, Privacy And Trust

Required gates:

- owner-scoped client relationship before any flow can include a client;
- consent purpose and channel checks before outbound messages;
- opt-out and no-contact suppressions;
- quiet hours in recipient timezone;
- frequency caps per client/channel/flow/template;
- current provider capability check at send time;
- audit log for AI drafts, approvals and external sends;
- data minimization for AI prompts and webhooks;
- no raw birth data in webhook payloads unless explicitly configured and
  disclosed;
- clear distinction between transactional service messages and marketing
  outreach;
- easy stop/cancel controls for astrologer and opt-out handling for client.

Trust copy should be blunt:

- "Ждет вашего подтверждения";
- "Не отправлено: нет согласия на Telegram";
- "Удержано до 10:00 по часовому поясу клиента";
- "Пропущено: клиент уже получил 2 касания за 7 дней";
- "Нужны данные рождения";
- "Канал Telegram не разрешает ответ сейчас".

## 12. Analytics

Flow analytics should focus on operational health before growth metrics:

- active runs;
- waiting on client;
- waiting on approval;
- completed;
- suppressed;
- failed retryable;
- failed terminal;
- median time to completion;
- manual time saved;
- conversion by template;
- revenue influenced;
- opt-outs/unsubscribes;
- send error rate;
- approval edit rate for AI drafts.

For first release, avoid overclaiming attribution. Use "influenced revenue" or
"orders after flow touch" until attribution logic is mature.

## 13. Plan And Limits

The reference tariff model includes automation/funnel capabilities. Product
limits should be enforceable at runtime:

- number of active flows;
- number of active runs;
- monthly AI actions;
- monthly outbound messages;
- premium node availability, for example A/B split, webhook, auto-send;
- templates included per plan.

Plan limit failure must be visible in validation and run history. It must not
silently pause a flow.

## 14. Phased Implementation

### Phase 0: Spec And Contracts

- finalize product decisions and graph schema;
- define flow state machine;
- define trigger/event contracts;
- define approval and delivery attempt contracts;
- update canonical product/API/architecture docs.

### Phase 1: Flow Foundation

- templates and draft flow CRUD;
- graph validation;
- publish immutable versions;
- no execution side effects yet;
- UI list, template gallery and builder shell.

### Phase 2: Runs, Simulation And Internal Actions

- manual run start and simulation;
- run/step state machine;
- internal task/tag actions;
- chart calculation action via worker;
- approval inbox;
- full run history.

### Phase 3: Messaging-Safe Delivery

- message draft nodes;
- manual approve/send;
- channel consent and provider capability checks;
- quiet hours, frequency caps, suppressions;
- delivery attempts and retries.

### Phase 4: AstroCalendar Handoff

- AstroCalendar event -> suggested flow template;
- create prefilled flow draft from event;
- start manual run for eligible clients;
- explain skipped clients and missing data.

### Phase 5: AI And Revenue Expansion

- AI scoring and reply/content/interpretation drafts;
- async product delivery;
- post-session upsell;
- lead magnet series;
- analytics dashboard;
- A/B split later, after enough volume.

### Phase 6: Controlled Auto-Send

- explicit per-flow/channel opt-in;
- stricter plan gate;
- compliance copy and consent audit;
- kill switch and anomaly monitoring.

## 15. Recommended First Implementation Slice

Start with "Flow foundation + manual/internal run":

1. Add contracts and DB schema for flows, versions, events, runs, step runs and
   approvals.
2. Add built-in templates for:
   - `Подготовка к живой сессии`;
   - `Авто-разбор в записи`;
   - `Лид-магнит -> апселл`;
   - `Реактивация спящих`;
   - `Post-session follow-up`.
3. Build `/flows` list, template gallery and builder shell matching reference.
4. Implement publish/version validation.
5. Implement simulation and manual run for internal actions only.
6. Add approval inbox for generated drafts/tasks.
7. Do not enable external auto-send yet.

This gives astrologers real value and creates the runtime spine for the later
AstroCalendar automation button.

## 16. Rejected Alternatives

- Direct AstroCalendar "Автоматизировать" button with no flow runtime:
  rejected because it creates fake success and hides side effects.
- Generic Zapier-style builder first:
  rejected because it under-serves astrology-specific jobs and over-expands
  provider/security scope.
- Browser-local flow execution:
  rejected because runs must survive reloads, retries and provider failures.
- AI auto-reply by default:
  rejected because birth data, emotional context and commercial outreach require
  trust, consent and approval.
- Put all flows inside AstroCalendar:
  rejected because funnels also originate from CRM, bookings, products, inbox,
  chart calculations, content and subscriptions.
- Build analytics before run history:
  rejected because aggregated numbers without inspectable runs are not
  operationally trustworthy.

## 17. Open Product Decisions

Recommended defaults are included so implementation can proceed after approval:

- First release approval posture:
  - recommendation: `draft_only` + `manual_approve`, no `auto_send`.
- First outbound channels:
  - recommendation: internal chat drafts and Telegram drafts first; email/SMS
    sends later after compliance-specific unsubscribe and address handling.
- First templates:
  - recommendation: the five templates listed in the first implementation
    slice.
- Pricing limits:
  - recommendation: enforce active-flow and AI-action limits from launch, but
    keep internal tasks/calculation runs generous enough that the product does
    not feel broken.
- AstroCalendar integration timing:
  - recommendation: after Phase 2 runtime exists and before full external
    auto-send.

## 18. Definition Of Done For Flows

Flows are real only when all of this exists:

- owner-scoped API and DB persistence;
- immutable published versions;
- validated graph contracts;
- event ingestion and idempotent run creation;
- stateful run and step history;
- manual approval queue;
- honest skipped/suppressed/failure states;
- consent/channel/frequency/quiet-hour gates before sends;
- chart-engine and AI actions routed through backend/workers;
- UI parity with the reference for list, gallery, builder, run detail and
  approvals;
- browser evidence for create -> publish -> simulate/run -> approve -> reload;
- tests for contracts, domain transitions, API authorization, worker idempotency
  and frontend states.
