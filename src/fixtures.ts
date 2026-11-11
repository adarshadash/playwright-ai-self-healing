import { test as base, expect } from '@playwright/test';
import { SelfHealingLocator } from './healing/self-healing-locator';
import { CartPage } from './pages/cart-page';
import { CheckoutPage } from './pages/checkout-page';
import { InventoryPage } from './pages/inventory-page';
import { LoginPage } from './pages/login-page';
import { USERS } from './utils/test-data';

interface Fixtures {
  healer: SelfHealingLocator;
  loginPage: LoginPage;
  inventoryPage: InventoryPage;
  cartPage: CartPage;
  checkoutPage: CheckoutPage;
  /** Lands on the inventory page as standard_user. */
  loggedIn: InventoryPage;
}

export const test = base.extend<Fixtures>({
  healer: async ({ page }, use, info) => use(new SelfHealingLocator(page, info.title)),
  loginPage: async ({ page }, use, info) => use(new LoginPage(page, info.title)),
  inventoryPage: async ({ page }, use, info) => use(new InventoryPage(page, info.title)),
  cartPage: async ({ page }, use, info) => use(new CartPage(page, info.title)),
  checkoutPage: async ({ page }, use, info) => use(new CheckoutPage(page, info.title)),
  loggedIn: async ({ loginPage, inventoryPage, page }, use) => {
    await loginPage.open();
    await loginPage.login(USERS.standard.username, USERS.standard.password);
    await expect(page).toHaveURL(/inventory/);
    await use(inventoryPage);
  },
});

export { expect };
