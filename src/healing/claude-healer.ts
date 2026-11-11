import Anthropic from '@anthropic-ai/sdk';

export interface AiSuggestion {
  selector: string;
  reason: string;
}

const MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-5-5';

/** True when the AI tier can run: a key is set and AI healing isn't switched off. */
export function aiHealingEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY && process.env.AI_HEALING !== 'off';
}

/**
 * Ask Claude for a replacement CSS selector, given the broken one,
 * what the element is for, and a trimmed copy of the current DOM.
 */
export async function suggestSelector(input: {
  brokenSelector: string;
  description: string;
  dom: string;
  url: string;
}): Promise<AiSuggestion | null> {
  if (!aiHealingEnabled()) return null;

  const client = new Anthropic();
  const prompt = [
    'You repair broken UI test locators.',
    `Page URL: ${input.url}`,
    `Broken selector: ${input.brokenSelector}`,
    `The element is: ${input.description}`,
    '',
    'Current DOM (scripts and styles removed, may be truncated):',
    '```html',
    input.dom,
    '```',
    '',
    'Return ONLY a JSON object: {"selector": "<one CSS selector matching exactly one element>", "reason": "<one short sentence>"}.',
    'Prefer data-test, id, name or aria attributes over classes or positions. Never use nth-child unless nothing else is unique.',
  ].join('\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as AiSuggestion;
    return parsed.selector ? parsed : null;
  } catch {
    return null;
  }
}
