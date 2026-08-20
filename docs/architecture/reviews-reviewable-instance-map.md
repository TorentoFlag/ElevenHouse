# Reviews: карта reviewable instance и evidence

Дата среза: 2026-08-20.

Этот документ фиксирует, какой конкретный экземпляр продукта или услуги может
получить отзыв, какой production-факт доказывает получение, от какой даты
считается окно отзыва и какие состояния блокируют отправку. Карта является
основанием для Reviews schema/API/domain work; она не заменяет продуктовую
спецификацию:

- `docs/superpowers/specs/2026-08-20-reviews-section-product-spec.md`
- `docs/superpowers/specs/2026-08-20-reviews-section-debate-consensus.md`

## Базовая модель

Отзывы открываются не от оплаты, а от доказанного факта, что клиент получил
конкретный продукт, услугу или активный период услуги.

Единица отзыва:

```text
reviewable_instance = product contour + concrete source aggregate + client + astrologer + relationship
```

Минимальные поля будущего `reviewable_instances`:

- `kind` - тип экземпляра: booking, subscription period, delivered material,
  course completion, service period, etc.;
- `sourceAggregateId` - id authoritative source aggregate;
- `sourceEvidenceId` - id immutable receipt/event, если есть;
- `clientUserId`;
- `astrologerUserId`;
- `relationshipId`;
- `productId`;
- `orderId`, если продукт получен через checkout;
- `receivedAt`;
- `serviceStartsAt`, `serviceEndsAt`, если услуга периодная;
- `windowOpensAt`;
- `windowClosesAt`;
- `status`;
- `negativeStateReason`, если отправка отзыва запрещена.

Окна считаются в UTC как half-open range:

```text
[windowOpensAt, windowClosesAt)
```

UI отображает эти instants в timezone пользователя, но серверные проверки не
зависят от локального времени клиента.

## Общие блокировки

Отзыв нельзя отправить, если выполняется хотя бы одно условие:

- нет явной связи client-astrologer;
- связь archived/blocked;
- product/order/source aggregate не принадлежат этому астрологу;
- authenticated client не совпадает с client у source aggregate;
- source aggregate отменен, истек, revoked, invalidated или
  partially_refunded/refunded/chargeback случился до возникновения права на
  отзыв;
- нет authoritative received/delivered/completed/active-period evidence;
- окно отзыва закрыто;
- по этому `reviewable_instance` уже есть review;
- по review уже есть pending client version, ожидающая модерации.

Если refund или chargeback случился после первой публичной публикации, уже
опубликованный отзыв не меняется автоматически. Новая отправка по еще не
опубликованному invalidated/refunded/chargeback source не открывается.

## Текущие source facts

### Product model

`packages/validation/src/products/index.ts` задает текущие измерения продукта:

- `type`: `single`, `pack`, `async`, `sub`, `mini`, `course`, `custom`;
- `executionMode`: `live`, `async`, `instant`;
- `paymentModel`: `once`, `pack`, `sub`, `free`;
- `participantMode`: `solo`, `group`, `gift`;
- `subscriptionPeriod`: `week`, `month`, `year`;
- `accessGrants`: `content`, `channel`, `records`, `course`,
  `community`, `journal`.

`packages/db/src/schema/products/products.schema.ts` хранит эти измерения в
`products` и отдельно фиксирует shape AstroDiary через
`astro_diary_*` поля.

### Order model

`packages/db/src/schema/finance/orders.schema.ts` связывает заказ с
`clientUserId`, `astrologerUserId`, `productId` и optional `bookingId`.
Статусы заказа находятся в `packages/db/src/schema/finance/finance-values.ts`:

- позитивные финансовые состояния для дальнейшей проверки: `paid`,
  `fulfilled`;
- негативные состояния: `draft`, `pending_payment`, `cancelled`, `expired`,
  `partially_refunded`, `refunded`, `chargeback`.

Заказ сам по себе не является evidence получения. Он только связывает checkout
с продуктом, клиентом и астрологом.

### Booking model

`packages/db/src/schema/scheduling/bookings.schema.ts` хранит live booking:
`ownerUserId`, `clientUserId`, `productId`, `reservationId`,
`serviceStartAt`, `serviceEndAt`, snapshots и state.

`packages/db/src/schema/scheduling/booking-lifecycle-events.schema.ts`
хранит immutable booking history. Событие `completed` требует:

- `revision > 1`;
- `reasonCode is null`;
- `beforeStartAt/beforeEndAt/beforeTimeZone` заполнены;
- `afterStartAt/afterEndAt/afterTimeZone` пустые.

Для Reviews это самый сильный текущий terminal evidence live-услуги.

### Paid product fulfillment registry

`packages/domain/src/products/paid-product-fulfillment-registry.ts` сейчас
явно поддерживает только два paid-product shape:

- `single.once.live.solo`;
- точный AstroDiary paid period: `async.once.async.solo` с `journal` access
  grant и `astroDiaryConfig`.

Оба shape сейчас привязаны к `booking_completed` terminal evidence. Остальные
shape возвращают unsupported issue code. Для Reviews это не означает
исключение из scope; это означает, что delivery обязан добавить недостающий
received/delivered lifecycle перед открытием отзывов.

### Client relationship

`packages/db/src/schema/clients/client-astrologer-relationships.schema.ts`
фиксирует явную связь клиента и астролога. Для Reviews нужна active связь
между тем же `clientUserId` и `astrologerUserId`, которые указаны в source
aggregate.

### AstroDiary periods and entitlements

`packages/db/src/schema/client-subscriptions/client-subscriptions.schema.ts`
связывает subscription с `relationshipId`, `productId`, `journalEpochId` и
состоянием `pending_initial_payment`, `active`, `ended`, `revoked`.

`packages/db/src/schema/client-subscriptions/client-subscription-periods.schema.ts`
хранит half-open period range `startsAt < endsAt`.

`packages/db/src/schema/client-subscriptions/client-entitlements.schema.ts`
хранит entitlement `capability = 'astro_diary'`, `periodId`,
`startsAt`, `endsAt`, `state = active|ended|revoked`.

`packages/domain/src/client-entitlements/client-entitlement-policy.ts`
проверяет active entitlement через `startsAt <= at < endsAt`.

### AstroCalendar

`packages/db/src/schema/astro-calendar/*` сейчас хранит генерации и события
астролога: `ownerUserId`, date range, settings/request snapshots, readiness,
generated events и JSON payload/snapshots. В contracts/snapshots могут
встречаться client refs для расчета, но это не canonical client paid
service-period authority: нет first-class FK на `clientUserId`,
`relationshipId`, `productId`, `orderId` и lifecycle получения услуги
клиентом.

Следовательно, AstroCalendar Reviews нельзя открывать от
`astro_calendar_generations` и нельзя использовать JSON snapshots/client refs
как identity source для отзыва. Нужен отдельный клиентский service-period
source для купленной/полученной услуги AstroCalendar.

## Карта контуров

| Контур | Reviewable instance | Received evidence | Окно | Блокировки | Статус |
| --- | --- | --- | --- | --- | --- |
| Live solo booking: `single.once.live.solo`, checkout-backed | `booking:{bookingId}` + optional `order:{orderId}` | immutable `booking_lifecycle_events.eventKind = completed` и `bookings.state = completed`; order связывает checkout, если есть | `completed.occurredAt` + 14 дней | booking `hold`, `pending_payment`, `expired`, `cancelled`, `no_show`; order `draft`, `pending_payment`, `cancelled`, `expired`, `partially_refunded`, `refunded`, `chargeback` до права на отзыв | Поддержан current evidence |
| Live solo booking: manual/free valid service | `booking:{bookingId}` | immutable completed booking lifecycle | `completed.occurredAt` + 14 дней | нет active relationship; booking не completed; продукт/booking не принадлежат астрологу; ручная запись без валидного client/product context | Можно поддержать через booking evidence, без payment-only path |
| AstroDiary paid period | `astro_diary_period:{periodId}` или `client_subscription_period:{periodId}` | `client_entitlement_grants.capability = astro_diary` с `state active|ended`, связанный `periodId`; activation/period transition receipt | стандартно: `activation/entitlement receipt occurredAt` + 14 дней; если будет принято общее правило для period-based products, его нужно явно добавить в spec перед кодом | subscription `pending_initial_payment` или `revoked`; entitlement `revoked`; period mismatch; нет active relationship/product link | Есть current period/entitlement evidence; нужно связать Reviews instance с entitlement source, а не только с booking_completed registry |
| AstroCalendar service period | `astro_calendar_service_period:{periodId}` | будущий client service-period receipt: client, astrologer, relationship, product/order, `startsAt`, `endsAt`, active/ended/revoked | весь активный период услуги + 14 дней после `endsAt` | нет service-period authority; generation failed/stale не является получением услуги; refund/chargeback до публикации | Требуется prerequisite внутри Reviews delivery |
| Async once deliverable: non-AstroDiary materials/readings | `async_delivery:{deliveryId}` | delivery/fulfillment receipt: файл/текст/аудио/канал/материал выдан клиенту, immutable deliveredAt | `deliveredAt` + 14 дней | order не paid/fulfilled; delivery revoked/deleted before receipt; нет client-visible delivery receipt | Требуется prerequisite внутри Reviews delivery |
| Instant product | `instant_delivery:{deliveryId}` | immutable instant delivery/render/download/access receipt | `deliveredAt` + 14 дней | provider/render failure; access not granted; refund/chargeback before right opens | Требуется prerequisite внутри Reviews delivery |
| Mini product | `mini_delivery:{deliveryId}` | concrete delivery/access receipt | `deliveredAt` + 14 дней | нет received evidence; продукт не выдан | Требуется prerequisite внутри Reviews delivery |
| Course product | `course_access:{accessGrantId}` by default; `course_completion:{courseId}:{clientUserId}` только для продуктов с explicit completion receipt | server-owned course access grant или completion receipt | default access receipt + 14 дней; для периодного доступа - active period + 14 дней после окончания | no access grant; revoked access; frontend-only progress без server receipt | Требуется prerequisite для course access/completion receipt |
| Pack product | `pack_session:{bookingId}` by default | completed booking для каждой сессии пакета; whole-pack review только при отдельном `pack_completed` receipt | session completed + 14 дней; whole-pack completed + 14 дней только при `pack_completed` source | session pack fulfillment unsupported; нет completed session; попытка открыть whole-pack review без pack receipt | Требуется prerequisite для связи pack purchase с session receipts |
| Subscription product кроме AstroDiary | `subscription_period:{periodId}` | subscription period + entitlement/access grant receipt | `startsAt` до `endsAt + 14 дней` для периодной услуги | `pending_initial_payment`, `revoked`, нет period evidence | Требуется prerequisite внутри Reviews delivery |
| Group service/product | `group_participation:{eventId}:{clientUserId}` | attendance/completion receipt для конкретного участника | participant completion + 14 дней | group fulfillment unsupported; нет participant-specific evidence | Требуется prerequisite внутри Reviews delivery |
| Gift product | `gift_redemption:{redemptionId}` | redemption/recipient received receipt | receivedAt + 14 дней | gift fulfillment unsupported; reviewer не recipient; no redemption | Требуется prerequisite; default reviewer = recipient |
| Free product | зависит от product contour: booking/delivery/access | valid received evidence без payment requirement | receivedAt + 14 дней или service period + 14 дней | free product без факта получения; fake acquisition через UI | Требуется received evidence; payment не обязателен |
| Custom product | `custom_fulfillment:{fulfillmentId}` | explicit custom fulfillment receipt with product-defined metadata | receivedAt + 14 дней | custom fulfillment unsupported; metadata не доказывает client receipt | Требуется prerequisite внутри Reviews delivery |

## Детализация правил по спорным контурам

### Pack

По pack default policy: отзыв открывается на каждую completed session внутри
пакета. Один отзыв на весь пакет не открывается от заказа или оплаты. Если
позже продуктовый контур потребует отзыв именно на пакет, сначала нужен
`pack_completed` source aggregate.

### Course

Для курса default policy: отзыв открывается от server-owned access grant,
потому что для course product базовая ценность - выданный доступ к курсу.
Frontend progress не является evidence.

Если конкретный course contour будет иметь server-owned completion receipt и
продуктово должен оцениваться после прохождения, это отдельный
`reviewable_instance_kind = course_completion`.

В обоих вариантах нужен server-owned receipt, не frontend progress state.

### Gift

Для gift default policy: review author - получатель, потому что он фактически
получил продукт. Покупатель не получает отзыв по redemption получателя. Если
покупателю понадобится отдельный feedback contour, это будет другой
`reviewable_instance_kind`, чтобы не смешивать две роли.

### AstroCalendar

Текущая AstroCalendar generation не является услугой клиента. Она не может
быть evidence для публичного отзыва, потому что:

- owner - astrologer;
- client refs находятся только в JSON calculation context, а не в canonical
  review identity;
- нет first-class relationship/order/product binding;
- нет client service period authority;
- generation status `ready` означает готовность расчета, а не получение
  услуги клиентом.

Reviews delivery должен добавить или подключить AstroCalendar service-period
source. Для него окно уже принято: active service period + 14 дней после
окончания.

## Правила aggregate и publication dependency

В public rating входят только отзывы, у которых:

- есть approved current public version;
- review visibility = public visible;
- нет active dispute hold;
- review не hidden by moderation.

При споре отзыв сразу выходит из public projection и aggregate. При restore
он возвращается в projection и aggregate без новой first-publication event.

Первые публичные публикации должны создавать отдельный immutable receipt:

```text
review_publication_events(reviewId, firstApprovedVersionId, publishedAt)
```

Этот receipt является источником события Flow `review_first_published`.
Редактирование, повторное одобрение новой версии, restore, reply и dispute не
создают повторный first-publication event.

## Implementation prerequisites

Перед backend реализацией Reviews нужно закрыть эти источники:

1. Зафиксировать окончательные `reviewableInstanceKind` в contracts.
2. Для каждого unsupported contour добавить source lifecycle/receipt в domain
   и DB либо доказать существующий current source.
3. Для AstroDiary привязать Reviews instance к `client_entitlement_grants` /
   `client_subscription_periods`, чтобы период был виден как service period.
4. Для AstroCalendar добавить client service-period authority, потому что
   текущие generation/event tables не подходят.
5. Для async/materials/instant/course/custom добавить delivery/access/completion
   receipt, а не использовать order `paid`.
6. Для pack выбрать granularity: session-level или whole-pack completion.
7. Для gift зафиксировать reviewer identity: recipient by default.

## Acceptance for Slice 0

- Для каждого текущего product contour есть явный source или explicit
  prerequisite внутри Reviews delivery.
- В карте нет пути, где order/payment сам открывает отзыв.
- Live booking path опирается на immutable completed lifecycle event.
- AstroDiary path опирается на subscription period/entitlement, а не на UI.
- AstroCalendar отмечен как needing service-period authority, потому что
  current generation tables не являются клиентской услугой.
- Unsupported contours не вынесены "на потом"; для каждого указан
  prerequisite, который должен быть реализован для полного Reviews scope.
