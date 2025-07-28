import { AuthStrategy } from "./AuthStrategy.js";

/**
 * API Token authentication strategy for JIRA
 * Uses Basic authentication with email and API token
 */
export class ApiTokenStrategy implements AuthStrategy {
  private email: string;
  private apiToken: string;

  constructor(email: string, apiToken: string) {
    this.email = email;
    this.apiToken = apiToken;
  }

  async getAuthHeaders(): Promise<Headers> {
    const auth = Buffer.from(`${this.email}:${this.apiToken}`).toString("base64");
    return new Headers({
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    });
  }

  getType(): string {
    return "API_TOKEN";
  }
}