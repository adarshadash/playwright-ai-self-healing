import type { Locator, Page } from '@playwright/test';
import registry from '../../locators/locators.json';
import { aiHealingEnabled, suggestSelector } from './claude-healer';
import { recordHeal } from './healing-log';
import type { HealStrategy, LocatorEntry } from './types';

const PRIMARY_TIMEOUT = Number(process.env.PRIMARY_LOCATOR_TIMEOUT_MS ?? 4_000);

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'on', 'in', 'of', 'to', 'for', 'and', 'or', 'that', 'with', 'page', 'text',
  'input', 'button', 'link', 'field', 'shown', 'showing', 'inside', 'list', 'icon', 'header',
  'label', 'message', 'which', 'this', 'is', 'card',
]);

export class HealingError extends Error {
  constructor(public readonly key: string, public readonly tried: string[]) {
    super(
      `Self-healing could not find "${key}". Tried ${tried.length} selector(s): ${tried.join(' | ')}`,
    );
    this.name = 'HealingError';
  }
}

/**
 * Finds elements through a ladder of strategies, cheapest first:
 *   1. primary selector from locators/locators.json
 *   2. known fallbacks from the same entry
 *   3. heuristic guesses built from the element's description
 *   4. Claude API (only if ANTHROPIC_API_KEY is set)
 * Every heal is logged so the weekly job can fix the registry for good.
 */
export class SelfHealingLocator {
  constructor(private readonly page: Page, private readonly testTitle?: string) {}

  async get(keyOrEntry: string | (LocatorEntry & { key: string })): Promise<Locator> {
    const { key, entry } = this.resolve(keyOrEntry);
    const tried: string[] = [entry.selector];

    if (await this.exists(entry.selector, PRIMARY_TIMEOUT)) {
      return this.page.locator(entry.selector);
    }

    for (const selector of entry.fallbacks ?? []) {
      tried.push(selector);
      if (await this.exists(selector)) return this.healed(key, entry, selector, 'fallback');
    }

    for (const selector of heuristicCandidates(entry.description)) {
      tried.push(selector);
      if (await this.exists(selector, 0, true)) {
        return this.healed(key, entry, selector, 'heuristic');
      }
    }

    if (aiHealingEnabled()) {
      const suggestion = await suggestSelector({
        brokenSelector: entry.selector,
        description: entry.description,
        dom: await this.trimmedDom(),
        url: this.page.url(),
      }).catch(() => null);
      if (suggestion) {
        tried.push(suggestion.selector);
        if (await this.exists(suggestion.selector)) {
          return this.healed(key, entry, suggestion.selector, 'ai', suggestion.reason);
        }
      }
    }

    throw new HealingError(key, tried);
  }

  private resolve(keyOrEntry: string | (LocatorEntry & { key: string })) {
    if (typeof keyOrEntry !== 'string') return { key: keyOrEntry.key, entry: keyOrEntry };
    const entry = (registry as Record<string, LocatorEntry>)[keyOrEntry];
    if (!entry) throw new Error(`Unknown locator key "${keyOrEntry}" — add it to locators/locators.json`);
    return { key: keyOrEntry, entry };
  }

  /**
   * The primary selector gets a real wait (the page may still be loading).
   * Once it has failed the page has settled, so alternatives are checked
   * instantly — dozens of heuristic guesses cost milliseconds, not seconds.
   */
  private async exists(selector: string, timeout = 0, unique = false) {
    try {
      const locator = this.page.locator(selector);
      if (timeout > 0) await locator.first().waitFor({ state: 'attached', timeout });
      const count = await locator.count();
      return unique ? count === 1 : count > 0;
    } catch {
      return false;
    }
  }

  private healed(
    key: string,
    entry: LocatorEntry,
    selector: string,
    strategy: HealStrategy,
    reason?: string,
  ): Locator {
    recordHeal({
      key,
      description: entry.description,
      brokenSelector: entry.selector,
      healedSelector: selector,
      strategy,
      url: this.page.url(),
      test: this.testTitle,
      timestamp: new Date().toISOString(),
      reason,
    });
    console.warn(`[self-healing] ${key}: "${entry.selector}" → "${selector}" (${strategy})`);
    return this.page.locator(selector);
  }

  private trimmedDom(): Promise<string> {
    return this.page.evaluate(() => {
      const clone = document.body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('script, style, svg, noscript, link, meta').forEach((n) => n.remove());
      clone.querySelectorAll('*').forEach((el) => {
        for (const attr of Array.from(el.attributes)) {
          if (attr.name === 'style' || attr.value.length > 120) el.removeAttribute(attr.name);
        }
      });
      return clone.outerHTML.replace(/\s{2,}/g, ' ').slice(0, 15_000);
    });
  }
}

/** Builds attribute-based guesses from the plain-English description. */
export function heuristicCandidates(description: string): string[] {
  const lower = description.toLowerCase();
  const words = lower
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  let tags = [''];
  if (/\bbutton\b/.test(lower)) tags = ['button', 'input[type="submit"]', 'input[type="button"]'];
  else if (/\binput\b|\bfield\b/.test(lower)) tags = ['input'];
  else if (/\blink\b/.test(lower)) tags = ['a'];

  const attrs = ['data-test', 'id', 'name', 'placeholder', 'aria-label', 'value'];
  const candidates: string[] = [];
  for (const word of words) {
    for (const tag of tags) {
      for (const attr of attrs) candidates.push(`${tag}[${attr}*="${word}" i]`);
    }
  }
  // Last resort for "submit" style buttons: the form's only submit control.
  if (/\bbutton\b/.test(lower) && /submit|login|log in|sign in|continue/.test(lower)) {
    candidates.push('input[type="submit"]', 'button[type="submit"]');
  }
  return [...new Set(candidates)];
}
