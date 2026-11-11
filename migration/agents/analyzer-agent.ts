import type { Action, AnalyzedFile, By, LegacyTest } from './types';

/**
 * Analyzer agent: reads a Selenium/TestNG Java file and produces a neutral
 * list of actions per test, plus "smells" (sleeps, absolute XPath) to fix.
 */
export class AnalyzerAgent {
  readonly name = 'Analyzer';

  analyze(file: string, source: string): AnalyzedFile {
    const className = source.match(/class\s+(\w+)/)?.[1] ?? 'LegacyTest';
    const tests: LegacyTest[] = [];
    const smells: string[] = [];

    const testRegex = /@Test[\s\S]*?void\s+(\w+)\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\s{4}\}/g;
    for (const match of source.matchAll(testRegex)) {
      const [, name, body] = match;
      const actions = body
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(parseStatement);
      tests.push({ name, actions });
      for (const a of actions) {
        if (a.kind === 'sleep') smells.push(`${name}: Thread.sleep(${a.ms}) — hard wait`);
        if ('by' in a && a.by === 'xpath' && a.value.startsWith('/html')) smells.push(`${name}: absolute XPath ${a.value}`);
        if (a.kind === 'unknown') smells.push(`${name}: could not parse "${a.raw}"`);
      }
    }
    return { file, className, tests, smells };
  }
}

const FIND = String.raw`driver\.findElement\(By\.(\w+)\("((?:[^"\\]|\\.)*)"\)\)`;

function parseStatement(raw: string): Action {
  let m: RegExpMatchArray | null;
  if ((m = raw.match(/driver\.(?:get|navigate\(\)\.to)\("([^"]+)"\)/))) return { kind: 'goto', url: m[1], raw };
  if ((m = raw.match(/Thread\.sleep\((\d+)\)/))) return { kind: 'sleep', ms: Number(m[1]), raw };
  if ((m = raw.match(new RegExp(`${FIND}\\.sendKeys\\("([^"]*)"\\)`))))
    return { kind: 'fill', by: m[1] as By, value: unescape(m[2]), text: m[3], raw };
  if ((m = raw.match(new RegExp(`${FIND}\\.click\\(\\)`)))) return { kind: 'click', by: m[1] as By, value: unescape(m[2]), raw };
  if ((m = raw.match(new RegExp(`Assert\\.assertEquals\\(${FIND}\\.getText\\(\\),\\s*"([^"]*)"\\)`))))
    return { kind: 'assertTextEquals', by: m[1] as By, value: unescape(m[2]), expected: m[3], raw };
  if ((m = raw.match(new RegExp(`Assert\\.assertTrue\\(${FIND}\\.getText\\(\\)\\.contains\\("([^"]*)"\\)\\)`))))
    return { kind: 'assertTextContains', by: m[1] as By, value: unescape(m[2]), expected: m[3], raw };
  return { kind: 'unknown', raw };
}

function unescape(s: string) {
  return s.replace(/\\"/g, '"');
}
