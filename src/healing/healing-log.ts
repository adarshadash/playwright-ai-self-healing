import fs from 'node:fs';
import path from 'node:path';
import type { HealEvent } from './types';

export const HEAL_LOG_DIR = path.resolve('reports/healing');

/**
 * Each worker writes its own file so parallel workers never clobber each other.
 * The heal script (scripts/heal-locators.ts) merges them.
 */
export function recordHeal(event: HealEvent): void {
  fs.mkdirSync(HEAL_LOG_DIR, { recursive: true });
  const file = path.join(HEAL_LOG_DIR, `heal-${process.pid}.jsonl`);
  fs.appendFileSync(file, JSON.stringify(event) + '\n');
}

export function readHealEvents(): HealEvent[] {
  if (!fs.existsSync(HEAL_LOG_DIR)) return [];
  return fs
    .readdirSync(HEAL_LOG_DIR)
    .filter((f) => f.endsWith('.jsonl'))
    .flatMap((f) =>
      fs
        .readFileSync(path.join(HEAL_LOG_DIR, f), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as HealEvent),
    );
}
