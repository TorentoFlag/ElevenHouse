# Раздел Отзывы: консенсус после спора ролей

## Формат

В споре участвовали роли:

- архитектор;
- дизайнер / design parity lead;
- developer lead;
- senior reviewer;
- QA lead.

Каждая роль сначала дала независимую позицию, затем получила критику остальных и ответила во втором раунде. Все роли работали read-only.

## Согласовано

Reviews нельзя делать как “страницу отзывов” первым шагом. Это доменный контур:

`право на отзыв -> версии отзыва -> модерация -> public projection/rating -> ответы -> споры -> case communication -> AI draft -> notifications/Flow -> audit`

Первым техническим основанием должен быть не UI, а доказуемый факт, что клиент получил конкретный продукт или услугу.

## Сохраненные продуктовые решения

Сохраняем решения пользователя:

- отзывы должны покрывать все продукты ElevenHouse;
- клиент может редактировать отзыв;
- новая версия после редактирования уходит на модерацию, старая остается публичной;
- окно отзыва обычно 14 дней после получения;
- AstroCalendar review window длится весь активный период плюс 14 дней после окончания;
- AstroDiary paid period использует обычное окно 14 дней от server-side activation/entitlement receipt;
- pack default policy: отзыв на каждую завершенную сессию пакета; whole-pack отзыв только при отдельном `pack_completed` receipt;
- course default policy: отзыв от server-owned course access grant; completion-based отзыв только при отдельном completion receipt;
- gift default policy: автор отзыва - фактический получатель подарка;
- клиент может публиковать отзыв без публичного имени;
- публичный label: `Секретный пользователь`;
- астролог видит полный контекст услуги или продукта даже для `Секретный пользователь`;
- refund/chargeback после публикации не меняет опубликованный отзыв: он остается как есть;
- ответы астролога модерируются;
- спор скрывает отзыв из публичной проекции сразу;
- AI-черновик входит в production scope;
- модератор может писать клиенту и астрологу из moderation case;
- в конце процесса нужен отдельный придирчивый дизайнерский review.

## Изменено после спора

### Отзывы по всем продуктам

Формулировка “любой продукт” остается product goal, но implementation должен идти через evidence registry.

Для каждого продуктового контура нужно доказать:

- что является конкретным reviewable instance;
- какой source id его идентифицирует;
- где находится факт получения/оказания/активного периода;
- от какой даты считается окно отзыва;
- какие состояния запрещают отзыв.

Оплата сама по себе не открывает отзыв.

Если у продукта нет reliable received/delivered lifecycle, это не исключает продукт из scope. Это означает, что Reviews delivery должен сначала реализовать или подключить missing lifecycle evidence для этого контура.

### Спор и мгновенное скрытие

Решение пользователя сохраняется: при споре отзыв скрывается сразу.

Компромисс ролей:

- скрытие является временным public visibility hold;
- статус должен быть вроде `временно скрыт из-за спора`, а не финальное удаление;
- спор требует обязательную причину;
- duplicate active dispute запрещен;
- действия idempotent и audited;
- нужны rate limits или abuse signals для астрологов, которые часто открывают необоснованные споры;
- модератор может восстановить отзыв без потери публичной версии;
- aggregate должен исключать временно скрытый отзыв и корректно восстанавливаться.

Архитектор предлагал auto-hide только для high-risk причин, но это конфликтует с текущим продуктовым решением. Итоговый рабочий компромисс: скрываем сразу, но только как auditable temporary hold с abuse controls и обязательным moderator review.

### Публикация без публичного имени

`Секретный пользователь` остается.

Но UI не должен обещать абсолютную анонимность. Нужно объяснить клиенту: имя и фото скрыты, но текст или контекст услуги могут косвенно раскрыть автора.

Для public/astrologer projections нужно минимизировать идентифицирующие детали:

- не отдавать order/session ids;
- не показывать служебные детали;
- астрологу показывать полный контекст услуги или продукта;
- не отдавать реальные имя/аватар/инициалы в API для астролога и public.

### AI-черновик

AI остается в production scope.

Guardrails:

- только backend route;
- только черновик;
- астролог явно отправляет ответ;
- отправленный ответ идет на модерацию;
- frontend не знает provider/model/prompt internals;
- input в AI минимальный;
- real client identity, payment data, moderator notes, case messages и audit не отправляются в AI;
- provider failure и unknown outcome должны быть observable и idempotent.

AI не модерирует отзывы и не принимает решений.

### Переписка модератора

Роли сошлись, что нельзя просто засунуть это в текущий Messaging, если он не доказывает раздельную видимость.

Нужен case-owned contour:

- moderator-client thread;
- moderator-astrologer thread;
- internal notes;
- party-specific visibility;
- notification outbox;
- append-only audit.

Клиент и астролог не видят сообщения друг друга.

### Flow

Принято:

- событие для Flow срабатывает один раз при первой одобренной публичной публикации отзыва;
- edits, restores, disputes, replies и rejected versions не должны повторно запускать тот же trigger;
- техническое имя события: `review_first_published`;
- название в UI для астролога: `Отзыв опубликован`;
- если нужен event на pending submission, это отдельное internal/moderation событие.

## Prerequisites перед implementation

- Карта reviewable instance создана: `docs/architecture/reviews-reviewable-instance-map.md`.
- Границы окна определены как UTC half-open range `[windowOpensAt, windowClosesAt)`.
- Refund/chargeback после публикации не меняет опубликованный отзыв: отзыв остается как есть.
- Не определены точные aggregate rules: округление, zero-state, hidden/disputed exclusion, restore.
- Public page сейчас не имеет полного production read model для отзывов.
- Admin moderation surface шире текущей finance/admin foundation.
- Нужен отдельный case communication contour или доказанное расширение существующего Messaging.
- AI draft требует provider/privacy architecture decision.
- Нужны reason codes и moderation policy taxonomy.

## Минимальные acceptance gates

- Для каждого текущего product contour есть received evidence или реализован prerequisite.
- Payment-only product никогда не открывает отзыв.
- Client submits anonymous review -> moderator approves -> public/astrologer видят `Секретный пользователь`, admin видит реального клиента.
- Published review edit -> pending version created -> old version public -> approval replaces -> rejection preserves old.
- Astrologer reply -> moderation required -> public only after approval.
- Dispute -> immediate public hide -> aggregate excludes -> moderator restore returns review and aggregate.
- AI draft -> editable draft only -> no publish/submit without astrologer -> reply still moderated.
- Moderator clarification -> client and astrologer messages separated -> internal note never leaks.
- Flow trigger -> exactly one event on first approved public publication.
- Browser parity -> astrologer desktop/mobile, request modal, client review states, public reviews modal, admin queue and production-only states.

## Решения пользователя перед архитектурным implementation plan

Подтверждено:

1. Для `Секретный пользователь` астролог видит полный контекст услуги или продукта.
2. При partially_refunded/refund/chargeback после уже опубликованного отзыва отзыв остается как есть.
3. Для pack, course и gift применяются default policies, описанные выше и в `docs/architecture/reviews-reviewable-instance-map.md`.

Открытых продуктовых решений перед архитектурным implementation plan не осталось.
