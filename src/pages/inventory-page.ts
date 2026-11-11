import { BasePage } from './base-page';

export type SortOption = 'az' | 'za' | 'lohi' | 'hilo';

export class InventoryPage extends BasePage {
  async title() {
    return this.text('inventory.title');
  }

  async itemNames(): Promise<string[]> {
    const names = await this.el.get('inventory.itemName');
    return (await names.allTextContents()).map((t) => t.trim());
  }

  async itemPrices(): Promise<number[]> {
    const prices = await this.el.get('inventory.itemPrice');
    return (await prices.allTextContents()).map((t) => Number(t.replace('$', '')));
  }

  async sortBy(option: SortOption) {
    await (await this.el.get('inventory.sort')).selectOption(option);
  }

  /** Adds a product by its visible name, e.g. "Sauce Labs Backpack". */
  async addToCart(productName: string) {
    const card = (await this.el.get('inventory.item')).filter({ hasText: productName });
    await card.getByRole('button', { name: /add to cart/i }).click();
  }

  async cartCount(): Promise<number> {
    const badge = this.page.locator('[data-test="shopping-cart-badge"], .shopping_cart_badge');
    if ((await badge.count()) === 0) return 0;
    return Number(await badge.first().textContent());
  }

  async openCart() {
    await this.click('header.cartLink');
  }
}
