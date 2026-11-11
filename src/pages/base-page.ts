import type { Page } from '@playwright/test';
import { SelfHealingLocator } from '../healing/self-healing-locator';

export abstract class BasePage {
  protected readonly el: SelfHealingLocator;

  constructor(protected readonly page: Page, testTitle?: string) {
    this.el = new SelfHealingLocator(page, testTitle);
  }

  protected async click(key: string) {
    await (await this.el.get(key)).click();
  }

  protected async fill(key: string, value: string) {
    await (await this.el.get(key)).fill(value);
  }

  protected async text(key: string) {
    return (await (await this.el.get(key)).first().textContent())?.trim() ?? '';
  }
}
