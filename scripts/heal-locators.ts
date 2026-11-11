/**
 * Weekly / on-demand locator maintenance.
 *
 *   npm run heal          -> writes reports/healing/healing-summary.md (dry run)
 *   npm run heal:apply    -> also updates locators/locators.json
 *
 * Reads every heal logged during the test run, keeps the most frequent healed
 * selector per key, promotes it to primary and keeps the old one as a fallback.
 * Keys that are not in the registry (e.g. demo.*) are reported but never written.
 */
import fs from 'node:fs';
import path from 'node:path';
import { HEAL_LOG_DIR, readHealEvents } from '../src/healing/healing-log';
import type { HealEvent, LocatorEntry } from '../src/healing/types';

const REGISTRY_PATH = path.resolve('locators/locators.json');
const apply = process.argv.includes('--apply');

const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')) as Record<string, LocatorEntry>;
const events = readHealEvents();

if (events.length === 0) {
  console.log('No heals recorded — every primary locator worked. Nothing to do.');
  process.exit(0);
}

const byKey = new Map<string, HealEvent[]>();
for (const event of events) byKey.set(event.key, [...(byKey.get(event.key) ?? []), event]);

const rows: string[] = [];
let updated = 0;

for (const [key, keyEvents] of byKey) {
  const counts = new Map<string, number>();
  for (const e of keyEvents) counts.set(e.healedSelector, (counts.get(e.healedSelector) ?? 0) + 1);
  const [bestSelector, hits] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const latest = keyEvents[keyEvents.length - 1];
  const inRegistry = key in registry;

  let action = 'report only (not in registry)';
  if (inRegistry) {
    const entry = registry[key];
    if (entry.selector === bestSelector) {
      action = 'already up to date';
    } else if (apply) {
      entry.fallbacks = [...new Set([entry.selector, ...(entry.fallbacks ?? [])])].filter((s) => s !== bestSelector);
      entry.selector = bestSelector;
      action = '✅ promoted to primary';
      updated++;
    } else {
      action = 'would promote (run with --apply)';
    }
  }

  rows.push(
    `| \`${key}\` | \`${latest.brokenSelector}\` | \`${bestSelector}\` | ${latest.strategy} | ${hits}/${keyEvents.length} | ${action} |`,
  );
}

if (apply && updated > 0) fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n');

const summary = [
  `# Locator healing summary`,
  ``,
  `Generated ${new Date().toISOString()} from ${events.length} heal event(s).`,
  ``,
  `| Locator key | Broken selector | Healed selector | Strategy | Hits | Action |`,
  `|---|---|---|---|---|---|`,
  ...rows,
  ``,
  apply ? `${updated} registry entr${updated === 1 ? 'y' : 'ies'} updated.` : `Dry run — registry not changed.`,
].join('\n');

fs.mkdirSync(HEAL_LOG_DIR, { recursive: true });
fs.writeFileSync(path.join(HEAL_LOG_DIR, 'healing-summary.md'), summary + '\n');
console.log(summary);
