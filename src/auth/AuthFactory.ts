import { AuthStrategy } from "./AuthStrategy.js";
import { ApiTokenStrategy } from "./ApiTokenStrategy.js";
import { OAuthStrategy } from "./OAuthStrategy.js";

export type ConnectionType = "Api_Token" | "Oauth_2.0";

/**
 * Factory for creating authentication strategies based on configuration
 */
export class AuthFactory {
  static createAuthStrategy(
    connectionType: ConnectionType,
    config: {
      baseUrl?: string;
      // API Token config
      email?: string;
      apiToken?: string;
      // OAuth config
      clientId?: string;
      clientSecret?: string;
      refreshToken?: string;
      tokenStoragePath?: string;
    }
  ): AuthStrategy {
    switch (connectionType) {
      case "Api_Token":
        if (!config.email || !config.apiToken) {
          throw new Error(
            "JIRA_USER_EMAIL and JIRA_API_TOKEN environment variables are required for API Token authentication"
          );
        }
        if (!config.baseUrl) {
          throw new Error(
            "JIRA_BASE_URL environment variable is required for API Token authentication"
          );
        }
        return new ApiTokenStrategy(config.email, config.apiToken);

      case "Oauth_2.0":
        if (!config.clientId || !config.clientSecret || !config.refreshToken) {
          throw new Error(
            "JIRA_CLIENT_ID, JIRA_CLIENT_SECRET, and JIRA_REFRESH_TOKEN environment variables are required for OAuth 2.0 authentication"
          );
        }
        return new OAuthStrategy(
          config.clientId,
          config.clientSecret,
          config.refreshToken,
          config.tokenStoragePath
        );

      default:
        throw new Error(
          `Unsupported connection type: ${connectionType}. Supported types: Api_Token, Oauth_2.0`
        );
    }
  }
}