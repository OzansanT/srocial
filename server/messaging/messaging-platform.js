export class MessagingPlatform {
  constructor(name) {
    if (!name) throw new Error('Messaging platform name is required');
    this.name = name;
  }

  async connect() { throw new Error(`${this.name}.connect() is not implemented`); }
  async getTemplates() { throw new Error(`${this.name}.getTemplates() is not implemented`); }
  async validateRecipient() { throw new Error(`${this.name}.validateRecipient() is not implemented`); }
  async sendTemplate() { throw new Error(`${this.name}.sendTemplate() is not implemented`); }
  async sendMessage() { throw new Error(`${this.name}.sendMessage() is not implemented`); }
  async sendMedia() { throw new Error(`${this.name}.sendMedia() is not implemented`); }
  async handleWebhook() { throw new Error(`${this.name}.handleWebhook() is not implemented`); }
  async getMessageStatus() { throw new Error(`${this.name}.getMessageStatus() is not implemented`); }
}
