export class SocialPlatform {
  constructor(name) {
    if (!name) throw new Error('Platform name is required');
    this.name = name;
  }

  async connect() { throw new Error(`${this.name}.connect() is not implemented`); }
  async refreshToken() { throw new Error(`${this.name}.refreshToken() is not implemented`); }
  async validatePost() { throw new Error(`${this.name}.validatePost() is not implemented`); }
  async uploadMedia() { throw new Error(`${this.name}.uploadMedia() is not implemented`); }
  async publish() { throw new Error(`${this.name}.publish() is not implemented`); }
  async getStatus() { throw new Error(`${this.name}.getStatus() is not implemented`); }
}
