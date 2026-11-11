import { expect, test } from '../../src/fixtures';
import { CUSTOMER, PRODUCTS } from '../../src/utils/test-data';

test.describe('Checkout', () => {
  test('customer can place an order end to end', async ({ loggedIn, cartPage, checkoutPage }) => {
    let expectedTotal = 0;

    await test.step('Add two products and note their prices', async () => {
      const names = await loggedIn.itemNames();
      const prices = await loggedIn.itemPrices();
      for (const product of [PRODUCTS.backpack, PRODUCTS.boltTShirt]) {
        expectedTotal += prices[names.indexOf(product)];
        await loggedIn.addToCart(product);
      }
    });

    await test.step('Go to checkout and enter customer details', async () => {
      await loggedIn.openCart();
      await cartPage.checkout();
      await checkoutPage.fillInformation(CUSTOMER);
    });

    await test.step('Item total matches the product prices', async () => {
      expect(await checkoutPage.itemTotal()).toBeCloseTo(expectedTotal, 2);
    });

    await test.step('Finish and see the confirmation', async () => {
      await checkoutPage.finish();
      expect(await checkoutPage.confirmationHeader()).toBe('Thank you for your order!');
    });
  });

  test('missing postal code blocks checkout', async ({ loggedIn, cartPage, checkoutPage }) => {
    await loggedIn.addToCart(PRODUCTS.backpack);
    await loggedIn.openCart();
    await cartPage.checkout();
    await test.step('Continue without a postal code', () =>
      checkoutPage.fillInformation({ firstName: CUSTOMER.firstName, lastName: CUSTOMER.lastName }));
    await test.step('Postal-code-required error is shown', async () => {
      expect(await checkoutPage.errorText()).toContain('Postal Code is required');
    });
  });
});
