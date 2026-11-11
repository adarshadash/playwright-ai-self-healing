/**
 * Multi-agent Selenium → Playwright migration.
 *
 *   npm run migrate                      -> migrates migration/legacy-selenium/*.java
 *   npm run migrate -- path/to/java/dir  -> migrates another folder
 *
 * For every Java file, in parallel:
 *   Analyzer  -> parses tests into actions and flags smells
 *   Converter -> writes a Playwright spec (rules, or Claude if ANTHROPIC_API_KEY is set)
 *   Reviewer  -> checks the spec; errors go back to the Converter (max 2 rounds),
 *                and if Claude can't fix them the rule-based output is used.
 * Writes migration/output/*.spec.ts and migration/output/migration-report.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { AnalyzerAgent } from './agents/analyzer-agent';
import { ConverterAgent, type Conversion } from './agents/converter-agent';
import { ReviewerAgent } from './agents/reviewer-agent';
import type { MigrationResult } from './agents/types';

const INPUT_DIR = path.resolve(process.argv[2] ?? 'migration/legacy-selenium');
const OUTPUT_DIR = path.resolve('migration/output');
const MAX_REVIEW_ROUNDS = 2;
const CONCURRENCY = Number(process.env.MIGRATION_CONCURRENCY ?? 4);

const analyzer = new AnalyzerAgent();
const converter = new ConverterAgent();
const reviewer = new ReviewerAgent();

async function migrateFile(javaPath: string): Promise<MigrationResult> {
  const source = fs.readFileSync(javaPath, 'utf8');
  const file = path.relative(process.cwd(), javaPath);
  const log = (agent: string, msg: string) => console.log(`[${path.basename(javaPath)}] ${agent.padEnd(9)} ${msg}`);

  const analyzed = analyzer.analyze(file, source);
  const actionCount = analyzed.tests.reduce((n, t) => n + t.actions.length, 0);
  log(analyzer.name, `${analyzed.tests.length} test(s), ${actionCount} action(s), ${analyzed.smells.length} smell(s)`);

  let conversion: Conversion = await converter.convert(analyzed, source);
  log(converter.name, `draft written (${conversion.converter})`);

  let findings = reviewer.review(conversion.code);
  let rounds = 1;
  while (findings.some((f) => f.severity === 'error') && rounds < MAX_REVIEW_ROUNDS && conversion.converter === 'claude') {
    const errors = findings.filter((f) => f.severity === 'error').map((f) => f.message);
    log(reviewer.name, `sent back: ${errors.join('; ')}`);
    conversion = await converter.convert(analyzed, source, errors);
    findings = reviewer.review(conversion.code);
    rounds++;
  }
  if (findings.some((f) => f.severity === 'error') && conversion.converter === 'claude') {
    log(reviewer.name, 'Claude output still failing review — falling back to rule-based conversion');
    conversion = converter.convertWithRules(analyzed);
    findings = reviewer.review(conversion.code);
  }
  log(reviewer.name, findings.map((f) => `${f.severity}: ${f.message}`).join(' | '));

  const outputFile = path.join(OUTPUT_DIR, path.basename(javaPath).replace(/Test\.java$|\.java$/, '').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase() + '.migrated.spec.ts');
  fs.writeFileSync(outputFile, conversion.code);

  return {
    file,
    outputFile: path.relative(process.cwd(), outputFile),
    converter: conversion.converter,
    tests: analyzed.tests.length,
    actions: actionCount,
    unknownActions: analyzed.tests.flatMap((t) => t.actions).filter((a) => a.kind === 'unknown').length,
    sleepsRemoved: conversion.sleepsRemoved,
    brittleLocatorsReplaced: conversion.brittleLocatorsReplaced,
    findings,
    reviewRounds: rounds,
  };
}

async function runPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await worker(items[i]);
      }
    }),
  );
  return results;
}

function writeReport(results: MigrationResult[]) {
  const total = (k: keyof MigrationResult) => results.reduce((n, r) => n + (r[k] as number), 0);
  const report = [
    '# Selenium → Playwright migration report',
    '',
    `Generated ${new Date().toISOString()}`,
    '',
    `- Files: **${results.length}** · Tests: **${total('tests')}** · Actions: **${total('actions')}**`,
    `- Hard waits removed: **${total('sleepsRemoved')}** · Absolute XPaths moved to self-healing: **${total('brittleLocatorsReplaced')}**`,
    `- Statements needing manual work: **${total('unknownActions')}**`,
    '',
    '| Legacy file | Output | Converter | Tests | Review rounds | Findings |',
    '|---|---|---|---|---|---|',
    ...results.map(
      (r) =>
        `| \`${r.file}\` | \`${r.outputFile}\` | ${r.converter} | ${r.tests} | ${r.reviewRounds} | ${r.findings
          .map((f) => `${f.severity === 'error' ? '❌' : f.severity === 'warning' ? '⚠️' : 'ℹ️'} ${f.message}`)
          .join('<br>')} |`,
    ),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'migration-report.md'), report);
  console.log('\n' + report);
}

async function main() {
  const files = fs.readdirSync(INPUT_DIR).filter((f) => f.endsWith('.java')).map((f) => path.join(INPUT_DIR, f));
  if (!files.length) throw new Error(`No .java files found in ${INPUT_DIR}`);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`Migrating ${files.length} file(s) with ${Math.min(CONCURRENCY, files.length)} parallel agent pipeline(s)` +
    (process.env.ANTHROPIC_API_KEY ? ' — Claude enabled\n' : ' — rule-based (set ANTHROPIC_API_KEY to use Claude)\n'));
  writeReport(await runPool(files, CONCURRENCY, migrateFile));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
