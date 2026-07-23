# Chart Engine Child Chart Browser Proof

Date: 2026-07-23

Route:

- `http://localhost:5174/chart-engine?clientId=ba3e415c-963f-4693-9073-02f653ebb2e7&mode=child_chart`

Runtime evidence:

- Existing local services used: `astrologer-web` on `5174`, `astrologer-api` on `3002`, PostgreSQL on `5432`.
- Initial route rendered `Детская карта`, active `Детская` mode, `Рассчитать детскую`, and disabled `PDF` with title `PDF для детской карты будет отдельным контуром`.
- Browser calculation called `POST /api/charts/natal/jobs` and returned `201`.
- Job polling returned `GET /api/charts/jobs/12d267ad-66a8-4bb4-a24a-7d1ce7ad46e5` `200`.
- Saved result loaded through `GET /api/charts/calculations/6d6ec738-1918-4aa1-a72a-23da42188db6` `200`.
- Result URL preserved child view mode: `mode=child_chart&calculationId=6d6ec738-1918-4aa1-a72a-23da42188db6`.
- UI showed `Детская карта рассчитана`, `Актуальная карта`, populated wheel, rail summaries and planet table.
- Interpretation tab called `/api/dictionary/entries/by-codes` with only `child.*` codes and returned `200` then `304`.
- Missing child Dictionary entries showed honest `В справочнике пока нет записи child...` text and `Создать трактовку` links to `/reference`.
- Hard reload preserved `mode=child_chart`, restored the natal calculation as `Детская карта`, and kept `PDF` disabled.
- DevTools console after calculate/interpretations reported no warn/error/issue messages.
