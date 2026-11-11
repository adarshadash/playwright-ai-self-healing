import { expect, test } from '@playwright/test';
import { translateFailure } from '../../src/reporting/failure-translator';
import { heuristicCandidates } from '../../src/healing/self-healing-locator';

test.describe('Failure translator', () => {
  test('turns a bare 404 into an actionable message', () => {
    const r = translateFailure({
      message: 'Error: Request failed with status 404 for https://api.example.com/v1/orders/42',
      stepTitle: 'Fetch the order',
    });
    expect(r.category).toBe('Endpoint not found (404)');
    expect(r.summary).toContain('Step "Fetch the order"');
    expect(r.summary).toContain('https://api.example.com/v1/orders/42');
    expect(r.owner).toBe('Application');
  });

  test('turns an empty array into an "Empty data" finding', () => {
    const r = translateFailure({
      message: 'expect(received).toHaveLength(expected)\n\nExpected length: 6\nReceived length: 0\nReceived array:  []',
      stepTitle: 'Products are listed',
    });
    expect(r.category).toBe('Empty data');
    expect(r.owner).toBe('Test data');
  });

  test('explains a locator timeout', () => {
    const r = translateFailure({
      message: "locator.click: Timeout 5000ms exceeded.\nCall log:\n  - waiting for locator('[data-test=\"checkout\"]')",
      stepTitle: 'Go to checkout',
    });
    expect(r.category).toBe('Element not found or not ready');
  });

  test('flags a heal that ran out of options', () => {
    const r = translateFailure({ message: 'Self-healing could not find "cart.checkout". Tried 4 selector(s): a | b' });
    expect(r.category).toBe('Broken locator (UI changed)');
    expect(r.summary).toContain('cart.checkout');
  });

  test('captures expected and received values', () => {
    const r = translateFailure({
      message: 'expect(received).toBe(expected) // Object.is equality\n\nExpected: 2\nReceived: 1',
      stepTitle: 'Cart badge shows 2',
    });
    expect(r.category).toBe('Wrong value');
    expect(r).toMatchObject({ expected: '2', received: '1' });
  });

  test('detects an unreachable environment', () => {
    const r = translateFailure({ message: 'page.goto: net::ERR_NAME_NOT_RESOLVED at https://qa.example.com/' });
    expect(r.category).toBe('Environment unreachable');
    expect(r.owner).toBe('Environment');
  });

  test('never returns an empty explanation', () => {
    const r = translateFailure({ message: 'Something odd happened' });
    expect(r.category).toBe('Unclassified');
    expect(r.summary.length).toBeGreaterThan(10);
  });
});

test.describe('Heuristic healing candidates', () => {
  test('builds button selectors from a description', () => {
    const c = heuristicCandidates('Login button that submits the login form');
    expect(c).toContain('input[type="submit"][data-test*="login" i]');
  });

  test('builds input selectors from a description', () => {
    const c = heuristicCandidates('Zip or postal code input on checkout information page');
    expect(c).toContain('input[data-test*="postal" i]');
  });
});
