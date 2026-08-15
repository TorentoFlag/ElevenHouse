<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **ElevenHouse** (36486 symbols, 93820 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/ElevenHouse/context` | Codebase overview, check index freshness |
| `gitnexus://repo/ElevenHouse/clusters` | All functional areas |
| `gitnexus://repo/ElevenHouse/processes` | All execution flows |
| `gitnexus://repo/ElevenHouse/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |
| Work in the Finance area (1571 symbols) | `.claude/skills/generated/finance/SKILL.md` |
| Work in the Finance-core area (964 symbols) | `.claude/skills/generated/finance-core/SKILL.md` |
| Work in the Flows area (757 symbols) | `.claude/skills/generated/flows/SKILL.md` |
| Work in the Model area (738 symbols) | `.claude/skills/generated/model/SKILL.md` |
| Work in the Postings area (661 symbols) | `.claude/skills/generated/postings/SKILL.md` |
| Work in the Charts area (264 symbols) | `.claude/skills/generated/charts/SKILL.md` |
| Work in the Scripts area (254 symbols) | `.claude/skills/generated/scripts/SKILL.md` |
| Work in the Api area (231 symbols) | `.claude/skills/generated/api/SKILL.md` |
| Work in the Components area (210 symbols) | `.claude/skills/generated/components/SKILL.md` |
| Work in the Messaging area (203 symbols) | `.claude/skills/generated/messaging/SKILL.md` |
| Work in the Astro-diary area (184 symbols) | `.claude/skills/generated/astro-diary/SKILL.md` |
| Work in the Ui area (176 symbols) | `.claude/skills/generated/ui/SKILL.md` |
| Work in the Provider-operations area (155 symbols) | `.claude/skills/generated/provider-operations/SKILL.md` |
| Work in the Human-design area (139 symbols) | `.claude/skills/generated/human-design/SKILL.md` |
| Work in the Arc-pay area (133 symbols) | `.claude/skills/generated/arc-pay/SKILL.md` |
| Work in the Chart_engine area (109 symbols) | `.claude/skills/generated/chart-engine/SKILL.md` |
| Work in the Calculation-pdf area (108 symbols) | `.claude/skills/generated/calculation-pdf/SKILL.md` |
| Work in the Numerology area (98 symbols) | `.claude/skills/generated/numerology/SKILL.md` |
| Work in the Matrix area (97 symbols) | `.claude/skills/generated/matrix/SKILL.md` |
| Work in the Calculations area (94 symbols) | `.claude/skills/generated/calculations/SKILL.md` |

<!-- gitnexus:end -->
