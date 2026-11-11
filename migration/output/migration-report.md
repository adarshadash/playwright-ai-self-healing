# Selenium → Playwright migration report

Generated 2026-11-11T20:21:54.549Z

- Files: **2** · Tests: **3** · Actions: **26**
- Hard waits removed: **3** · Absolute XPaths moved to self-healing: **1**
- Statements needing manual work: **0**

| Legacy file | Output | Converter | Tests | Review rounds | Findings |
|---|---|---|---|---|---|
| `migration/legacy-selenium/CheckoutTest.java` | `migration/output/checkout.migrated.spec.ts` | rules | 1 | 1 | ℹ️ 11 locator(s) routed through the self-healing registry. |
| `migration/legacy-selenium/LoginTest.java` | `migration/output/login.migrated.spec.ts` | rules | 2 | 1 | ⚠️ 1 absolute XPath locator(s) wrapped in self-healing — replace after the first healing report.<br>ℹ️ 6 locator(s) routed through the self-healing registry. |
