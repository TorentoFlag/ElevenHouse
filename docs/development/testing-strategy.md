# Testing Strategy

Проверка является частью реализации. Уровень доказательств выбирается по
затронутой зависимости, а финальный отчёт отделяет проверенное поведение от
непроверенного.

## TDD contract

1. Write or update the smallest failing test that proves the requested behavior.
2. Run it and confirm the failure is caused by missing or incorrect behavior.
3. Implement the smallest production change that makes it pass.
4. Run the targeted test again.
5. Refactor only while the targeted test stays green.
6. Expand verification according to the changed dependency surface.

Тест должен проверять наблюдаемое production-поведение, а не факт вызова mock.
Не добавляй test-only API в production-код и не подменяй зависимость до того,
как понятны её side effects и полный контракт данных.

## Evidence levels

### 1. Pure domain and contracts

Проверяет схемы, формулы, инварианты и use cases без инфраструктуры. Пример:

```bash
pnpm test packages/contracts/src/numerology.test.ts packages/domain/src/numerology
```

### 2. Adapters and integration

Проверяет SQL constraints, транзакции, concurrency и hydration на существующей
локальной инфраструктуре. Интеграционные тесты должны изолировать собственные
данные и следовать правилам `commands.md`.

### 3. API

Проверяет parsing, auth/CSRF metadata, HTTP translation и contract-shaped
responses на service/controller/e2e уровне.

### 4. Frontend

Проверяет query/mutation state, отображение валидированного ответа, отсутствие
локальной бизнес-арифметики и пользовательские состояния компонента.

### 5. Browser flow

Проверяет реальную авторизованную поверхность, network-backed данные,
интеракции и видимое соответствие каноническому дизайну. Browser evidence не
заменяется только DOM unit-тестом.

### 6. Repository verification

Для shared contracts/domain/db, app composition или нескольких поверхностей
заверши широкой проверкой:

```bash
pnpm verify
```

## Final evidence report

Финальный отчёт обязан перечислять:

- какие targeted и broad проверки запущены и с каким результатом;
- какие browser/integration/process-dependent проверки пропущены;
- почему они пропущены;
- какой residual risk остаётся;
- какие чужие изменения замечены и не затронуты.

Нельзя использовать формулировку «готово» для видимого пользовательского scope,
если обязательный уровень evidence не выполнен.

