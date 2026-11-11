import { expect, test } from '../../src/fixtures';

test.describe('Inventory', () => {
  test('shows all six products', async ({ loggedIn }) => {
    const names = await loggedIn.itemNames();
    expect(names, 'product list should not be empty').toHaveLength(6);
  });

  test('sorts by price, low to high', async ({ loggedIn }) => {
    await test.step('Choose "Price (low to high)"', () => loggedIn.sortBy('lohi'));
    await test.step('Prices are in ascending order', async () => {
      const prices = await loggedIn.itemPrices();
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
    });
  });

  test('sorts by name, Z to A', async ({ loggedIn }) => {
    await test.step('Choose "Name (Z to A)"', () => loggedIn.sortBy('za'));
    await test.step('Names are in reverse alphabetical order', async () => {
      const names = await loggedIn.itemNames();
      expect(names).toEqual([...names].sort().reverse());
    });
  });
});
