export interface LocatorEntry {
  /** The selector the test expects to work. */
  selector: string;
  /** Plain-English description, used by the heuristic and AI healers. */
  description: string;
  /** Known-good alternatives, tried before any guessing. */
  fallbacks?: string[];
}

export type HealStrategy = 'fallback' | 'heuristic' | 'ai';

export interface HealEvent {
  key: string;
  description: string;
  brokenSelector: string;
  healedSelector: string;
  strategy: HealStrategy;
  url: string;
  test?: string;
  timestamp: string;
  /** Short reason from the AI healer, when it was used. */
  reason?: string;
}
