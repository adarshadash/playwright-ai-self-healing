import { BasePage } from './base-page';

export class CartPage extends BasePage {
  async itemNames(): Promise<string[]> {
    const items = await this.el.get('cart.item');
    return (await items.locator('[data-test="inventory-item-name"], .inventory_item_name').allTextContents()).map((t) =>
      t.trim(),
    );
  }

  async checkout() {
    await this.click('cart.checkout');
  }
}
