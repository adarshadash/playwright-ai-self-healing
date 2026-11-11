import { BasePage } from './base-page';

export interface Customer {
  firstName: string;
  lastName: string;
  postalCode: string;
}

export class CheckoutPage extends BasePage {
  async fillInformation(customer: Partial<Customer>) {
    if (customer.firstName !== undefined) await this.fill('checkout.firstName', customer.firstName);
    if (customer.lastName !== undefined) await this.fill('checkout.lastName', customer.lastName);
    if (customer.postalCode !== undefined) await this.fill('checkout.postalCode', customer.postalCode);
    await this.click('checkout.continue');
  }

  async errorText() {
    return this.text('checkout.error');
  }

  async itemTotal(): Promise<number> {
    const label = await this.text('checkout.itemTotal');
    return Number(label.replace(/[^0-9.]/g, ''));
  }

  async finish() {
    await this.click('checkout.finish');
  }

  async confirmationHeader() {
    return this.text('checkout.completeHeader');
  }
}
