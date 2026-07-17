# Локализованное представление совместимости в нумерологии

**Дата:** 2026-07-17
**Статус:** согласовано пользователем; письменная самопроверка завершена
**Surface:** Numerology compatibility в `astrologer-web`, AI context в
`astrologer-api`, RU/EN Numerology PDF в `workers`

## Outcome

Астролог видит понятные русские или английские объяснения совместимости без
внутренних идентификаторов `key_numbers`, `lifePath`, `mixed`,
`strength_lines`, `inner_world` и relation codes. Один детерминированный
locale-aware presenter формирует одинаковую терминологию для web, PDF и AI
context.

Формулы, пороги, relation/conclusion codes, число пары, counts и checksum
расчёта не меняются.

## Product meaning

Пользователь уже согласовал два уровня текста:

1. Детерминированный audit fact объясняет, какие значения сравнивались, какова
   абсолютная разница и в какую категорию она попала.
2. Кураторская или AI-интерпретация остаётся отдельным контентом и не
   подменяется автоматически сгенерированным психологическим советом.

Пример RU comparison:

> Число жизненного пути: 2 и 5. Разница — 3. По методике это категория
> «Различие».

Пример RU conclusion:

> Совпадения и близкие значения — 10; различия и напряжения — 12. Итог:
> смешанная совместимость.

Эквивалентный EN-текст использует те же числовые факты и локализованные labels.

## Current evidence and root cause

`packages/domain/src/numerology/methods/pythagorean-ru/compatibility.ts`
возвращает структурированные значения, но также собирает `explanation` через
raw enum/code strings. Это поле проходит через strict result contract.

`apps/astrologer-web/.../numerologyWorkspaceModel.ts` уже локализует labels,
но передаёт raw `comparison.explanation`, `zone.explanation` и
`conclusion.explanation` без преобразования. Поэтому внутренние коды попадают в
карточки и detail panel.

`apps/astrologer-api/.../numerology-ai-context.ts` делает то же для AI prompt.
PDF renderer независимо содержит корректные RU/EN catalogs и строит чистый
текст, из-за чего термины между consumers могут расходиться.

## Chosen architecture

Добавляется focused shared workspace package
`@elevenhouse/numerology-presentation`. Он зависит только от
`@elevenhouse/contracts` для типов и экспортирует чистые функции:

- `getNumerologyCompatibilityLabels(locale)`;
- `formatNumerologyComparison(comparison, locale)`;
- `formatNumerologyZone(zone, locale)`;
- `formatNumerologyConclusion(conclusion, locale)`.

Функции не читают React context, environment, DB или browser state. Locale
передаётся явно как `ru | en`; неизвестный code получает безопасный
человекочитаемый fallback: snake_case и camelCase разбиваются на отдельные
слова, поэтому техническая запись не показывается дословно. Валидный расчёт
при этом не отбрасывается.

Presentation package владеет общими labels для:

- comparison blocks;
- key numbers, psychomatrix digits и strength lines;
- relations;
- compatibility zones;
- conclusion codes.

`astrologer-web` использует presenter при построении workspace model и detail
panel. Текущий interface locale передаётся из уже существующего `useI18n`;
default `ru` сохраняется только для прямых model tests/legacy call sites.

PDF renderer использует shared functions для comparison rows, zone labels,
relations и conclusion text, сохраняя собственные document-layout labels.

AI context сохраняет typed `block`, `code`, `relation` и conclusion code как
машиночитаемые данные, но его `explanation` формируется presenter'ом в locale
prompt. Таким образом модель получает и stable codes, и понятный текст без
русско-английского смешения.

## Compatibility and data boundary

Raw `explanation` остаётся обязательным полем current domain/result contract в
этом change. Причины:

- старые сохранённые results и strict parsing остаются валидными;
- checksum и lifecycle recalculation не меняются;
- scope не превращается в data migration и contract-versioning change.

Это поле считается internal deterministic audit payload. Web, PDF и AI не
имеют права отображать или передавать его как user-facing copy. Focused tests
закрепляют этот запрет.

Удаление или optional-миграция raw field — отдельное future contract решение,
потому что оно затронет persisted JSON, checksums и backward compatibility.

## Alternatives considered

### Локальные replacements в каждом consumer

Минимальный patch, но сохраняет три каталога, допускает новый drift и легко
пропускает следующий raw code. Отклонено.

### Локализовать strings прямо в domain engine

Устраняет текущий RU-баг, но внедряет UI locale в deterministic domain,
усложняет checksum и не решает одновременную RU/EN генерацию одного result.
Отклонено.

### Удалить explanation из contract сейчас

Архитектурно чище в конечном состоянии, но требует миграции persisted results
и явного contract-versioning решения. Для текущего presentation bug это
избыточный и рискованный scope. Отложено.

## UI and visual contract

Layout, размеры, spacing, badges, colors, expansion interaction и responsive
geometry карточек не меняются. Меняется только текст:

- закрытая карточка по-прежнему может показывать однострочный preview;
- раскрытая карточка показывает полный локализованный audit fact;
- более длинный текст переносится уже реализованным expanded state;
- relation badge и заголовок используют тот же shared catalog, что explanation.

Exact visual reference остаётся Numerology row в
`docs/architecture/design-reference-inventory.md` и соответствующие
`ElevenHouseDesign/app/numerology*.jsx`. Поскольку reference не определяет
новый текст, intentional difference ограничен согласованной формулировкой;
геометрия и interactive states остаются без отклонений.

## Error and fallback behavior

- Unsupported locale невозможен на типовом уровне; API boundaries продолжают
  валидировать `ru | en`.
- Неизвестный indicator/line code форматируется нейтрально через разделение
  snake_case/camelCase и не ломает отчёт. Такой случай должен быть заметен в
  тесте при добавлении нового канонического code.
- Presenter не маскирует invalid numeric result и не пересчитывает relation.
- Consumer не использует raw explanation как silent fallback.

## Behavioral acceptance

- RU web cards/detail/summary не содержат raw compatibility codes.
- EN web presentation использует английские labels и предложения для того же
  result.
- RU и EN PDF comparison/conclusion text используют shared terminology и не
  содержат raw codes.
- RU и EN AI context explanations соответствуют locale prompt, сохраняют
  typed codes отдельно и не содержат identity/birth data beyond the existing
  privacy contract.
- Формулы, 22 comparisons, 4 zones, counts и conclusion code не меняются.
- Старый result payload со своим raw `explanation` продолжает strict parse и
  отображается через current presenter.

## Testing and evidence

Behavioral TDD начинается с package-level tests на все canonical codes, RU/EN
и representative unknown-code fallback. Затем failing consumer tests
доказывают, что web и AI больше не доверяют raw explanation. PDF tests
проверяют shared copy в обоих locale.

После targeted green выполняются typecheck/build для нового package и трёх
consumers, affected Numerology test surface, root ESLint по изменённым files и
repository gate `pnpm verify`, если его не блокируют чужие concurrent changes.

Runtime acceptance использует уже открытую вкладку Chrome и уже запущенные
services без restart. Для RU и, если доступно в текущем UI, EN проверяются
expanded comparison, conclusion/detail, DOM text, keyboard state, console и
network. Screenshots сохраняются в
`.design-qa/numerology-compatibility-presentation/`. Если runtime locale/state
недоступны, соответствующая часть остаётся explicitly blocked; automated
checks её не заменяют.

## Scope boundaries and authority

In scope: shared presenter package, consumer adapters/tests, package manifests,
living plan and task evidence.

Out of scope: изменение нумерологических формул, психологические
интерпретации, persisted-result migration, publication copy, редизайн карточек,
service lifecycle, DB mutations, commit/push/deploy.

Commit не выполняется без отдельной authority пользователя. Существующие
calendar, profile, DB, availability и другие shared-main изменения считаются
unowned и не затрагиваются.
