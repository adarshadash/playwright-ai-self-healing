import type { ReviewFinding } from './types';

/**
 * Reviewer agent: checks a converted spec against the migration rules.
 * Errors send the file back to the Converter; warnings go in the report.
 */
export class ReviewerAgent {
  readonly name = 'Reviewer';

  review(code: string): ReviewFinding[] {
    const findings: ReviewFinding[] = [];
    const tests = [...code.matchAll(/test\('([^']+)'[\s\S]*?\n  \}\);/g)];

    if (tests.length === 0) findings.push({ severity: 'error', message: 'No tests were generated.' });
    for (const [body, title] of tests) {
      if (!/expect\(/.test(body)) findings.push({ severity: 'error', message: `"${title}" has no assertion.` });
    }
    if (/waitForTimeout|Thread\.sleep|setTimeout\(/.test(code.replace(/\/\/.*$/gm, ''))) {
      findings.push({ severity: 'error', message: 'Hard wait found — rely on auto-waiting and web-first assertions.' });
    }
    if (/driver\.|By\.\w+\(/.test(code.replace(/\/\/.*$/gm, ''))) {
      findings.push({ severity: 'error', message: 'Selenium API left in the converted code.' });
    }

    const todos = (code.match(/TODO\(migration\)/g) ?? []).length;
    if (todos) findings.push({ severity: 'warning', message: `${todos} statement(s) need manual conversion (see TODOs).` });

    const xpaths = (code.match(/xpath=\/html/g) ?? []).length;
    if (xpaths) {
      findings.push({
        severity: 'warning',
        message: `${xpaths} absolute XPath locator(s) wrapped in self-healing — replace after the first healing report.`,
      });
    }

    const registryHits = (code.match(/healer\.get\('/g) ?? []).length;
    findings.push({ severity: 'info', message: `${registryHits} locator(s) routed through the self-healing registry.` });
    return findings;
  }
}
