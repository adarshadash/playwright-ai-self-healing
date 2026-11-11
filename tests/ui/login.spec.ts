import { expect, test } from '../../src/fixtures';
import { USERS } from '../../src/utils/test-data';

test.describe('Login', () => {
  test('standard user can log in and sees the product list', async ({ loginPage, inventoryPage, page }) => {
    await test.step('Open the login page', () => loginPage.open());
    await test.step('Log in as standard_user', () =>
      loginPage.login(USERS.standard.username, USERS.standard.password));
    await test.step('Products page is shown', async () => {
      await expect(page).toHaveURL(/inventory\.html/);
      expect(await inventoryPage.title()).toBe('Products');
    });
  });

  test('locked out user sees a clear error', async ({ loginPage }) => {
    await loginPage.open();
    await test.step('Log in as locked_out_user', () =>
      loginPage.login(USERS.lockedOut.username, USERS.lockedOut.password));
    await test.step('Locked-out error is shown', async () => {
      expect(await loginPage.errorText()).toContain('this user has been locked out');
    });
  });

  test('empty credentials are rejected', async ({ loginPage }) => {
    await loginPage.open();
    await test.step('Submit the form without credentials', () => loginPage.login('', ''));
    await test.step('Username-required error is shown', async () => {
      expect(await loginPage.errorText()).toContain('Username is required');
    });
  });
});
