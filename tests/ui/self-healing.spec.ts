import { expect, test } from '../../src/fixtures';
import { readHealEvents } from '../../src/healing/healing-log';
import { USERS } from '../../src/utils/test-data';

/**
 * Simulates what happens after a UI change: the selectors below are deliberately
 * out of date. The tests still pass, and each heal is logged for the weekly job.
 */
test.describe('Self-healing locators', () => {
  test.beforeEach(async ({ loginPage }) => loginPage.open());

  test('heals from a known fallback', async ({ healer, page }) => {
    const username = await healer.get({
      key: 'demo.username',
      selector: '#username-v1', // stale id from an "older" release
      description: 'Username text input on the login page',
      fallbacks: ['[data-test="username"]'],
    });
    await username.fill(USERS.standard.username);
    await expect(page.locator('[data-test="username"]')).toHaveValue(USERS.standard.username);
  });

  test('heals from the description when no fallback is known', async ({ healer, page }) => {
    await page.locator('[data-test="username"]').fill(USERS.standard.username);
    await page.locator('[data-test="password"]').fill(USERS.standard.password);

    const loginButton = await healer.get({
      key: 'demo.loginButton',
      selector: 'button.btn-login-legacy', // never existed in this markup
      description: 'Login button that submits the login form',
    });
    await loginButton.click();
    await expect(page).toHaveURL(/inventory\.html/);
  });

  test('every heal is recorded for review', async ({ healer }) => {
    await healer.get({
      key: 'demo.password',
      selector: '#pwd',
      description: 'Password text input on the login page',
      fallbacks: ['[data-test="password"]'],
    });
    const event = readHealEvents().find((e) => e.key === 'demo.password' && e.test === test.info().title);
    expect(event, 'heal event should be written to reports/healing').toBeDefined();
    expect(event).toMatchObject({ brokenSelector: '#pwd', healedSelector: '[data-test="password"]', strategy: 'fallback' });
  });
});
