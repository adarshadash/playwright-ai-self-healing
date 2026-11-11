import { BasePage } from './base-page';

export class LoginPage extends BasePage {
  async open() {
    await this.page.goto('/');
  }

  async login(username: string, password: string) {
    await this.fill('login.username', username);
    await this.fill('login.password', password);
    await this.click('login.submit');
  }

  async errorText() {
    return this.text('login.error');
  }
}
