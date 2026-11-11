/**
 * Turns raw Playwright/HTTP errors ("Timeout 5000ms exceeded", "404",
 * "Received: []") into something a person can act on in seconds:
 * what broke, the likely cause, and where to look first.
 */

export type FailureCategory =
  | 'Broken locator (UI changed)'
  | 'Element not found or not ready'
  | 'Ambiguous locator'
  | 'Page or navigation problem'
  | 'Endpoint not found (404)'
  | 'Server error (5xx)'
  | 'Not authorised (401/403)'
  | 'Empty data'
  | 'Wrong value'
  | 'Missing text'
  | 'Environment unreachable'
  | 'Test too slow'
  | 'Unclassified';

export type Owner = 'Test code' | 'Application' | 'Test data' | 'Environment';

export interface FailureInput {
  message: string;
  testTitle?: string;
  /** Title of the test.step that failed, e.g. "Cart badge shows 2". */
  stepTitle?: string;
}

export interface TranslatedFailure {
  category: FailureCategory;
  /** One sentence, written for a human, that names the business step. */
  summary: string;
  likelyCause: string;
  suggestedFix: string;
  owner: Owner;
  expected?: string;
  received?: string;
}

interface Rule {
  test: (msg: string) => boolean;
  build: (msg: string, where: string) => Omit<TranslatedFailure, 'expected' | 'received'>;
}

const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '');

const RULES: Rule[] = [
  {
    test: (m) => /Self-healing could not find/i.test(m),
    build: (m, where) => ({
      category: 'Broken locator (UI changed)',
      summary: `${where}: the element "${m.match(/find "([^"]+)"/)?.[1] ?? '?'}" is gone and could not be healed.`,
      likelyCause: 'The page markup changed (renamed id/data-test, removed element) beyond what fallbacks, heuristics and AI could match.',
      suggestedFix: 'Open the trace, find the element\'s new attributes and update locators/locators.json (or run `npm run heal`).',
      owner: 'Test code',
    }),
  },
  {
    test: (m) => /strict mode violation/i.test(m),
    build: (m, where) => ({
      category: 'Ambiguous locator',
      summary: `${where}: the locator matched ${m.match(/resolved to (\d+) elements/)?.[1] ?? 'several'} elements instead of one.`,
      likelyCause: 'The selector is too generic, or the page now shows duplicates (e.g. a list rendered twice).',
      suggestedFix: 'Narrow the locator with a data-test attribute, filter({ hasText }) or a parent container.',
      owner: 'Test code',
    }),
  },
  {
    test: (m) => /browserType\.launch|Executable doesn't exist|playwright install/i.test(m),
    build: (_m, where) => ({
      category: 'Environment unreachable',
      summary: `${where}: the browser could not start on this machine.`,
      likelyCause: 'Playwright browsers are not installed (or not the version this Playwright release expects).',
      suggestedFix: 'Run `npx playwright install --with-deps chromium` on the runner, then re-run.',
      owner: 'Environment',
    }),
  },
  {
    test: (m) => /ECONNREFUSED|ENOTFOUND|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_INTERNET_DISCONNECTED/i.test(m),
    build: (_m, where) => ({
      category: 'Environment unreachable',
      summary: `${where}: the application could not be reached at all.`,
      likelyCause: 'The environment is down, the URL/BASE_URL is wrong, or the runner has no network access.',
      suggestedFix: 'Open BASE_URL in a browser from the runner; check deployment status before touching tests.',
      owner: 'Environment',
    }),
  },
  {
    test: (m) => /\b(status|statusCode|code)?\W{0,3}404\b|Not Found/i.test(m) && !/locator/i.test(m),
    build: (m, where) => ({
      category: 'Endpoint not found (404)',
      summary: `${where}: the server answered "404 Not Found"${urlIn(m) ? ` for ${urlIn(m)}` : ''}.`,
      likelyCause: 'The endpoint or page path was renamed/removed, or the test points at the wrong environment or API version.',
      suggestedFix: 'Compare the requested path with the current API spec/routes; check BASE_URL and version prefix.',
      owner: 'Application',
    }),
  },
  {
    test: (m) => /\b(401|403)\b|Unauthorized|Forbidden/i.test(m),
    build: (_m, where) => ({
      category: 'Not authorised (401/403)',
      summary: `${where}: the request was rejected as unauthorised.`,
      likelyCause: 'Expired or missing token, wrong test user, or the user lacks the role this step needs.',
      suggestedFix: 'Refresh test credentials/secrets and confirm the test user\'s permissions.',
      owner: 'Test data',
    }),
  },
  {
    test: (m) => /\b5\d\d\b.*(error|status)|(status|error).*\b5\d\d\b|Internal Server Error|Bad Gateway|Service Unavailable/i.test(m),
    build: (_m, where) => ({
      category: 'Server error (5xx)',
      summary: `${where}: the server failed while handling the request.`,
      likelyCause: 'An application bug or a failing downstream dependency — not a test problem.',
      suggestedFix: 'Check server logs for the same timestamp and raise a defect with the trace attached.',
      owner: 'Application',
    }),
  },
  {
    test: (m) => /Received (array|length): *(\[\s*\]|0)\b|Received: *\[\s*\]|Expected length: *\d+\s*Received length: *0/i.test(m),
    build: (_m, where) => ({
      category: 'Empty data',
      summary: `${where}: nothing came back — the list or response was empty.`,
      likelyCause: 'Test data is missing (not seeded / cleaned up), a filter excluded everything, or the page had not loaded its items yet.',
      suggestedFix: 'Verify the seed data exists for this user/env; if timing, wait for the list to render before reading it.',
      owner: 'Test data',
    }),
  },
  {
    test: (m) => /waiting for (locator|getBy)|locator\.\w+: Timeout|waitFor.*Timeout/i.test(m),
    build: (m, where) => ({
      category: 'Element not found or not ready',
      summary: `${where}: the element ${m.match(/(locator|getBy\w+)\(([^)]+)\)/)?.[0] ?? ''} never appeared or was not actionable.`.replace('  ', ' '),
      likelyCause: 'The previous step did not lead to the expected page, the element is hidden/disabled, or the page is slow.',
      suggestedFix: 'Check the screenshot: are we on the right page? If yes, the element changed — update the locator.',
      owner: 'Test code',
    }),
  },
  {
    test: (m) => /toHaveURL|page\.goto|net::ERR|Navigation/i.test(m),
    build: (_m, where) => ({
      category: 'Page or navigation problem',
      summary: `${where}: the browser did not end up on the expected page.`,
      likelyCause: 'A click or login did not navigate (validation error, wrong credentials), or a redirect changed.',
      suggestedFix: 'Look at the failure screenshot for an error banner; confirm the user and data used in this step.',
      owner: 'Application',
    }),
  },
  {
    test: (m) => /toContain|toHaveText|toContainText/i.test(m),
    build: (_m, where) => ({
      category: 'Missing text',
      summary: `${where}: the expected text was not on the page.`,
      likelyCause: 'The message wording changed, or a different message (e.g. another error) was shown.',
      suggestedFix: 'Compare expected vs received below; update the expectation if the copy change is intended.',
      owner: 'Application',
    }),
  },
  {
    test: (m) => /expect\(.*\)\.(toBe|toEqual|toStrictEqual|toBeCloseTo|toMatchObject)/i.test(m),
    build: (_m, where) => ({
      category: 'Wrong value',
      summary: `${where}: the app showed a different value than expected.`,
      likelyCause: 'A real behaviour change or bug (calculation, sort order, count) — or stale test data.',
      suggestedFix: 'Compare expected vs received below; reproduce manually before changing the test.',
      owner: 'Application',
    }),
  },
  {
    test: (m) => /Test timeout of \d+ms exceeded/i.test(m),
    build: (_m, where) => ({
      category: 'Test too slow',
      summary: `${where}: the whole test ran out of time.`,
      likelyCause: 'The environment is slow, or the test waited on something that never happened.',
      suggestedFix: 'Check the trace timeline for the longest action; compare with the last green run.',
      owner: 'Environment',
    }),
  },
];

function urlIn(msg: string): string | undefined {
  return msg.match(/https?:\/\/[^\s"'`)]+/)?.[0];
}

function extract(msg: string, label: 'Expected' | 'Received'): string | undefined {
  const m = msg.match(new RegExp(`${label}(?: string| array| length| value)?: *(.+)`));
  return m?.[1]?.trim();
}

export function translateFailure(input: FailureInput): TranslatedFailure {
  const message = stripAnsi(input.message ?? '');
  const where = input.stepTitle ? `Step "${input.stepTitle}"` : input.testTitle ? `Test "${input.testTitle}"` : 'This test';
  const rule = RULES.find((r) => r.test(message));
  const base = rule
    ? rule.build(message, where)
    : {
        category: 'Unclassified' as const,
        summary: `${where} failed: ${message.split('\n')[0].slice(0, 160)}`,
        likelyCause: 'No known pattern matched this error.',
        suggestedFix: 'Open the trace and screenshot; consider adding a rule to failure-translator.ts.',
        owner: 'Test code' as const,
      };
  return { ...base, expected: extract(message, 'Expected'), received: extract(message, 'Received') };
}
