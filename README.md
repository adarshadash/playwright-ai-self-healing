# Playwright AI Self-Healing Framework

A Playwright + TypeScript framework, demoed on [Sauce Demo](https://www.saucedemo.com), that shows three ideas I used to modernise a legacy Selenium suite:

1. **Multi-agent Selenium → Playwright migration** — Analyzer, Converter and Reviewer agents turn Java/TestNG tests into Playwright specs, in parallel.
2. **Self-healing locators** — a cheap-first ladder (fallbacks → heuristics → Claude API) keeps tests running when the UI changes, and a weekly or on-demand job promotes healed selectors back into the locator registry.
3. **Human-readable failure reports** — raw errors like `Timeout 5000ms exceeded`, `404` or `Received: []` become "what broke, likely cause, who should look, how to fix".

> In the production suite this approach was built for (≈300 UI tests), daily run stability went up by about 30% and execution time dropped from 1 h 45 min to about 1 h. This repo is a public, self-contained demo of the same techniques.

---

## Architecture

```
locators/locators.json        ← one registry: selector + description + fallbacks per element
src/
  healing/
    self-healing-locator.ts   ← primary → fallbacks → heuristics → Claude
    claude-healer.ts          ← asks Claude for a selector from a trimmed DOM
    healing-log.ts            ← every heal is logged (per worker, merge-safe)
  reporting/
    failure-translator.ts     ← rules: raw error → category, cause, owner, fix
    human-readable-reporter.ts← custom Playwright reporter (Markdown + HTML)
  pages/                      ← Page Objects built on the healer
  fixtures.ts                 ← typed fixtures (healer, pages, loggedIn)
tests/
  ui/                         ← Sauce Demo specs (login, inventory, cart, checkout, healing demo)
  unit/                       ← browser-free tests for the translator and heuristics
migration/
  legacy-selenium/*.java      ← sample legacy tests
  agents/                     ← Analyzer, Converter, Reviewer
  orchestrator.ts             ← runs the agent pipeline per file, in parallel
  output/                     ← generated Playwright specs + migration report
scripts/heal-locators.ts      ← weekly / on-demand registry update
.github/workflows/            ← daily regression + weekly Claude healing PR
```

### How a test run flows through the files

```mermaid
flowchart TD
    CMD(["npx playwright test"]) --> CFG["playwright.config.ts<br/>baseURL, projects, reporters"]
    CFG --> PROJ{"Project"}
    PROJ -->|chromium| UI["tests/ui/*.spec.ts"]
    PROJ -->|migrated| MIG["migration/output/*.migrated.spec.ts"]
    PROJ -->|unit| UNIT["tests/unit/*.spec.ts<br/>no browser"]

    UI --> FIX["src/fixtures.ts<br/>healer, page objects, loggedIn"]
    MIG --> FIX
    FIX --> DATA["src/utils/test-data.ts<br/>users, products, customer"]
    FIX --> PO["src/pages/*-page.ts<br/>Login, Inventory, Cart, Checkout"]
    PO --> BASE["src/pages/base-page.ts<br/>click / fill / text by key"]
    BASE --> HEAL["src/healing/self-healing-locator.ts<br/>get(key)"]
    FIX -->|healer fixture| HEAL

    HEAL --> REG[("locators/locators.json<br/>selector, description, fallbacks")]
    HEAL --> P1{"Primary selector found?"}
    P1 -->|yes| ACT["Playwright action / assertion<br/>on saucedemo.com"]
    P1 -->|no| P2{"A fallback matches?"}
    P2 -->|yes| LOG
    P2 -->|no| P3{"Heuristic from description<br/>matches exactly one?"}
    P3 -->|yes| LOG
    P3 -->|no| P4{"ANTHROPIC_API_KEY set?"}
    P4 -->|yes| AI["src/healing/claude-healer.ts<br/>trimmed DOM to Claude"]
    AI -->|valid selector| LOG
    AI -->|no match| ERR["HealingError"]
    P4 -->|no| ERR
    LOG["src/healing/healing-log.ts<br/>recordHeal()"] --> JSONL[("reports/healing/heal-PID.jsonl")]
    LOG --> ACT

    ACT --> RESULT["Test result"]
    ERR --> RESULT
    UNIT --> RESULT
    RESULT --> REP["src/reporting/human-readable-reporter.ts<br/>onTestEnd"]
    RESULT --> HTML["Playwright HTML report<br/>reports/html"]
    REP -->|failed tests| TR["src/reporting/failure-translator.ts<br/>cause, owner, fix"]
    TR --> REP
    JSONL --> REP
    REP -->|onEnd| OUT[("reports/failure-report.md + .html")]

    JSONL --> HS["scripts/heal-locators.ts<br/>npm run heal / heal:apply"]
    HS --> SUM[("reports/healing/healing-summary.md")]
    HS -->|--apply| REG
```

### How the migration produces the `migrated` tests

```mermaid
flowchart LR
    CMD(["npm run migrate"]) --> ORC["migration/orchestrator.ts<br/>parallel pipeline per file"]
    JAVA[("migration/legacy-selenium/*.java")] --> ORC
    ORC --> AN["agents/analyzer-agent.ts<br/>parse actions, flag smells"]
    AN --> CV["agents/converter-agent.ts<br/>rules or Claude"]
    REG[("locators/locators.json")] --> CV
    CV --> RV["agents/reviewer-agent.ts<br/>assertions, no hard waits"]
    RV -->|errors, max 2 rounds| CV
    RV -->|approved| OUT[("migration/output/*.migrated.spec.ts")]
    RV --> RPT[("migration/output/migration-report.md")]
    OUT --> RUN["Run as the migrated project<br/>uses self-healing"]
```

### Scheduled jobs

```mermaid
flowchart LR
    D(["Daily, push, PR"]) --> DR[".github/workflows/daily-regression.yml<br/>AI healing off"]
    DR --> T1["npx playwright test"] --> S1["npm run heal"] --> A1[("Job summary + report artifacts")]
    W(["Weekly or on demand"]) --> WH[".github/workflows/weekly-heal.yml<br/>Claude healing on"]
    WH --> T2["npx playwright test"] --> S2["npm run heal:apply"] --> PR[("Pull request<br/>updated locators.json")]
```

### Self-healing ladder

| Tier | When it runs | Cost |
|---|---|---|
| Primary selector | Always (waits up to 4 s for the page) | free |
| Known fallbacks | Primary missing | free, instant |
| Heuristics from the element's description (`data-test`, `id`, `name`, `placeholder`, `aria-label`) | No fallback matched; must match exactly one element | free, instant |
| **Claude API** with a trimmed DOM | Only if `ANTHROPIC_API_KEY` is set and `AI_HEALING` isn't `off` | 1 API call |

Every heal is written to `reports/healing/`. `npm run heal` summarises them; `npm run heal:apply` promotes the most frequent healed selector to primary and keeps the old one as a fallback. The **weekly workflow** runs the suite with Claude enabled, applies the heals and opens a pull request — so locators are fixed for good, not re-healed every day.

### Failure report

`reports/failure-report.html` and `.md` list each failure with the **business step** that failed (from `test.step` titles), a cause category, an owner (Test code / Application / Test data / Environment), expected vs received, and a suggested fix. Example:

```
✖ Cart › adding two products updates the badge and the cart
  Wrong value · owner: Application
  Step "Cart badge shows 2": the app showed a different value than expected.
  Fix: Compare expected vs received below; reproduce manually before changing the test.
```

### Migration agents

```
Analyzer  → parses @Test methods into actions, flags smells (Thread.sleep, absolute XPath)
Converter → writes a Playwright spec (rule-based, or Claude when a key is set)
Reviewer  → enforces rules (assertions present, no hard waits, no Selenium API)
            errors go back to the Converter (max 2 rounds), then fall back to rules
```

Known selectors are mapped to registry keys, so migrated tests get self-healing for free. Absolute XPaths are wrapped in the healer with a description instead of copied as-is.

---

## Getting started

```bash
npm ci
npx playwright install --with-deps chromium

npm test                 # all projects: UI, migrated, unit
npm run test:heal-demo   # watch locators heal from stale selectors
npm run heal             # summarise heals from the last run
npm run migrate          # re-run the Selenium → Playwright agents
npm run report           # open the Playwright HTML report
```

Optional: copy `.env.example` to `.env` (or export the variables) and set `ANTHROPIC_API_KEY` to enable the Claude tiers. Everything works without it.

For CI, add `ANTHROPIC_API_KEY` as a repository secret for the weekly healing job.

## Tech

Playwright Test · TypeScript · Anthropic SDK (Claude) · GitHub Actions

## License

MIT
