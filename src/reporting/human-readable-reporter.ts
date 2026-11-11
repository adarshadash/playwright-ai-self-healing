import fs from 'node:fs';
import path from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult, TestStep } from '@playwright/test/reporter';
import { readHealEvents } from '../healing/healing-log';
import { translateFailure, type TranslatedFailure } from './failure-translator';

interface FailureRow extends TranslatedFailure {
  test: string;
  file: string;
  project: string;
  retry: number;
  attachments: { name: string; path?: string }[];
  rawError: string;
}

/**
 * Writes reports/failure-report.md and reports/failure-report.html.
 * Each failure names the business step that broke, the likely cause, who should
 * look first and a suggested fix — so triage doesn't start from a stack trace.
 */
export default class HumanReadableReporter implements Reporter {
  private readonly outputDir: string;
  private failures: FailureRow[] = [];
  private finalStatus = new Map<string, TestResult['status']>();
  private flaky = new Set<string>();
  private startedAt = Date.now();

  constructor(options: { outputDir?: string } = {}) {
    this.outputDir = path.resolve(options.outputDir ?? 'reports');
  }

  onBegin() {
    this.startedAt = Date.now();
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const id = test.id;
    if (result.status === 'passed' && result.retry > 0) this.flaky.add(id);
    this.finalStatus.set(id, result.status);
    if (result.status === 'passed' || result.status === 'skipped') {
      this.failures = this.failures.filter((f) => !(f.test === test.titlePath().slice(1).join(' › ') && f.project === projectOf(test)));
      return;
    }

    const error = result.errors[0] ?? result.error;
    const message = error?.message ?? String(error?.value ?? 'Unknown error');
    const failedStep = deepestFailedStep(result.steps);
    const translated = translateFailure({ message, testTitle: test.title, stepTitle: failedStep?.title });

    this.failures.push({
      ...translated,
      test: test.titlePath().slice(1).join(' › '),
      file: path.relative(process.cwd(), test.location.file) + ':' + test.location.line,
      project: projectOf(test),
      retry: result.retry,
      attachments: result.attachments.map((a) => ({ name: a.name, path: a.path })),
      rawError: message.replace(/\u001b\[[0-9;]*m/g, '').split('\n').slice(0, 12).join('\n'),
    });
  }

  onEnd(result: FullResult) {
    // Keep only the last attempt per test.
    const latest = new Map<string, FailureRow>();
    for (const f of this.failures) latest.set(`${f.project}|${f.test}`, f);
    const failures = [...latest.values()];

    const statuses = [...this.finalStatus.values()];
    const passed = statuses.filter((s) => s === 'passed').length;
    const heals = readHealEvents();
    const minutes = ((Date.now() - this.startedAt) / 60_000).toFixed(1);

    fs.mkdirSync(this.outputDir, { recursive: true });
    fs.writeFileSync(path.join(this.outputDir, 'failure-report.md'), toMarkdown(failures, { passed, total: statuses.length, flaky: this.flaky.size, heals: heals.length, minutes, status: result.status }));
    fs.writeFileSync(path.join(this.outputDir, 'failure-report.html'), toHtml(failures, { passed, total: statuses.length, flaky: this.flaky.size, heals: heals.length, minutes, status: result.status }));

    if (failures.length) {
      console.log(`\n── Human-readable failure summary (${failures.length}) ──`);
      for (const f of failures) {
        console.log(`✖ ${f.test}\n  ${f.category} · owner: ${f.owner}\n  ${f.summary}\n  Fix: ${f.suggestedFix}`);
      }
    }
    if (heals.length) console.log(`\n🩹 ${heals.length} locator(s) self-healed this run — see reports/healing (run "npm run heal").`);
    console.log(`📄 Failure report: ${path.relative(process.cwd(), path.join(this.outputDir, 'failure-report.html'))}\n`);
  }

  printsToStdio() {
    return false;
  }
}

function projectOf(test: TestCase) {
  return test.parent.project()?.name ?? '';
}

function deepestFailedStep(steps: TestStep[]): TestStep | undefined {
  for (const step of steps) {
    if (!step.error) continue;
    const inner = deepestFailedStep(step.steps.filter((s) => s.category === 'test.step'));
    if (inner) return inner;
    if (step.category === 'test.step') return step;
  }
  return undefined;
}

interface Totals {
  passed: number;
  total: number;
  flaky: number;
  heals: number;
  minutes: string;
  status: string;
}

function countBy<T>(items: T[], key: (t: T) => string) {
  const map = new Map<string, number>();
  for (const i of items) map.set(key(i), (map.get(key(i)) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function toMarkdown(failures: FailureRow[], t: Totals): string {
  const lines = [
    '# Test run — failure report',
    '',
    `**${t.passed}/${t.total} passed** · ${failures.length} failed · ${t.flaky} flaky · ${t.heals} locator heal(s) · ${t.minutes} min · run status: ${t.status}`,
    '',
  ];
  if (!failures.length) return lines.concat('All tests passed. ✅', '').join('\n');
  lines.push('## Failures by cause', '', '| Cause | Count |', '|---|---|', ...countBy(failures, (f) => f.category).map(([c, n]) => `| ${c} | ${n} |`), '');
  lines.push('## Who should look first', '', ...countBy(failures, (f) => f.owner).map(([o, n]) => `- **${o}**: ${n}`), '');
  lines.push('## Details', '');
  for (const f of failures) {
    lines.push(
      `### ✖ ${f.test}`,
      '',
      `- **What happened:** ${f.summary}`,
      `- **Cause type:** ${f.category} (owner: ${f.owner})`,
      `- **Likely cause:** ${f.likelyCause}`,
      `- **Suggested fix:** ${f.suggestedFix}`,
      ...(f.expected || f.received ? [`- **Expected:** \`${f.expected ?? '—'}\` · **Received:** \`${f.received ?? '—'}\``] : []),
      `- **Where:** \`${f.file}\` (${f.project}, attempt ${f.retry + 1})`,
      '',
      '<details><summary>Raw error</summary>',
      '',
      '```',
      f.rawError,
      '```',
      '</details>',
      '',
    );
  }
  return lines.join('\n');
}

const esc = (s = '') => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function toHtml(failures: FailureRow[], t: Totals): string {
  const cards = failures
    .map(
      (f) => `
  <article class="card">
    <header><span class="tag">${esc(f.category)}</span><span class="owner">Owner: ${esc(f.owner)}</span></header>
    <h3>${esc(f.test)}</h3>
    <p class="summary">${esc(f.summary)}</p>
    <dl>
      <dt>Likely cause</dt><dd>${esc(f.likelyCause)}</dd>
      <dt>Suggested fix</dt><dd>${esc(f.suggestedFix)}</dd>
      ${f.expected || f.received ? `<dt>Expected / received</dt><dd><code>${esc(f.expected ?? '—')}</code> → <code>${esc(f.received ?? '—')}</code></dd>` : ''}
      <dt>Where</dt><dd><code>${esc(f.file)}</code> · ${esc(f.project)} · attempt ${f.retry + 1}</dd>
      ${f.attachments.filter((a) => a.path).map((a) => `<dt>${esc(a.name)}</dt><dd><code>${esc(path.relative(process.cwd(), a.path!))}</code></dd>`).join('')}
    </dl>
    <details><summary>Raw error</summary><pre>${esc(f.rawError)}</pre></details>
  </article>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Failure report</title>
<style>
  :root{--bg:#f7f7f5;--fg:#1d1d1b;--muted:#6b6b66;--card:#fff;--line:#e4e4df;--bad:#b42318;--ok:#027a48;--tag:#fdecea}
  @media (prefers-color-scheme:dark){:root{--bg:#161615;--fg:#ededea;--muted:#a3a39d;--card:#1f1f1d;--line:#33332f;--bad:#f97066;--ok:#47cd89;--tag:#3a1d1a}}
  body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
  main{max-width:900px;margin:0 auto;padding:24px 16px}
  .stats{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 24px}
  .stat{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 12px}
  .stat b{display:block;font-size:20px}
  .card{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--bad);border-radius:8px;padding:16px;margin-bottom:16px}
  .card header{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:13px}
  .tag{background:var(--tag);color:var(--bad);border-radius:4px;padding:2px 8px;font-weight:600}
  .owner{color:var(--muted)}
  h3{margin:8px 0 4px;font-size:16px} .summary{font-weight:500}
  dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;margin:8px 0} dt{color:var(--muted)} dd{margin:0}
  pre{white-space:pre-wrap;font-size:12px;background:var(--bg);padding:8px;border-radius:6px}
  .pass{color:var(--ok);font-weight:600}
</style></head>
<body><main>
  <h1>Test run — failure report</h1>
  <div class="stats">
    <div class="stat"><b>${t.passed}/${t.total}</b>passed</div>
    <div class="stat"><b>${failures.length}</b>failed</div>
    <div class="stat"><b>${t.flaky}</b>flaky</div>
    <div class="stat"><b>${t.heals}</b>locator heals</div>
    <div class="stat"><b>${t.minutes}</b>minutes</div>
  </div>
  ${failures.length ? cards : '<p class="pass">All tests passed ✅</p>'}
</main></body></html>`;
}
