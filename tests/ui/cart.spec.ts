import { expect, test } from '../../src/fixtures';
import { PRODUCTS } from '../../src/utils/test-data';

test.describe('Cart', () => {
  test('adding two products updates the badge and the cart', async ({ loggedIn, cartPage }) => {
    await test.step('Add the backpack and the bike light', async () => {
      await loggedIn.addToCart(PRODUCTS.backpack);
      await loggedIn.addToCart(PRODUCTS.bikeLight);
    });
    await test.step('Cart badge shows 2', async () => {
      expect(await loggedIn.cartCount()).toBe(2);
    });
    await test.step('Cart lists both products', async () => {
      await loggedIn.openCart();
      expect(await cartPage.itemNames()).toEqual([PRODUCTS.backpack, PRODUCTS.bikeLight]);
    });
  });
});
