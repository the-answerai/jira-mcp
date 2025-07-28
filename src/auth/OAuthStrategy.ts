import { AuthStrategy } from "./AuthStrategy.js";
import { promises as fs, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";

interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  cloud_id?: string;
  cloud_id_expires_at?: number;
}

interface AccessibleResource {
  id: string;
  url: string;
  name: string;
  scopes: string[];
}

/**
 * OAuth 2.0 authentication strategy for JIRA
 * Uses filesystem-stored tokens with automatic refresh and rotation
 */
export class OAuthStrategy implements AuthStrategy {
  private clientId: string;
  private clientSecret: string;
  private initialRefreshToken: string;
  private tokenStoragePath: string;
  private readonly ATLASSIAN_TOKEN_ENDPOINT = "https://auth.atlassian.com/oauth/token";

  constructor(clientId: string, clientSecret: string, initialRefreshToken: string, tokenStoragePath?: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.initialRefreshToken = initialRefreshToken;
    this.tokenStoragePath = tokenStoragePath || join(homedir(), ".jira-mcp", "tokens.json");
  }

  async getAuthHeaders(): Promise<Headers> {
    const accessToken = await this.getValidAccessToken();
    return new Headers({
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    });
  }

  getType(): string {
    return "OAUTH_2.0";
  }

  /**
   * Get the cloud ID for API requests
   */
  async getCloudId(): Promise<string> {
    try {
      const storedTokens = this.loadStoredTokens();
      const now = Date.now();
      
      // Check if we have a cached cloud ID that's still valid (cache for 1 hour)
      if (storedTokens?.cloud_id && storedTokens.cloud_id_expires_at && now < storedTokens.cloud_id_expires_at) {
        return storedTokens.cloud_id;
      }
      
      const cloudId = await this.fetchAccessibleResources();
      
      // Cache the cloud ID for 1 hour
      if (storedTokens) {
        storedTokens.cloud_id = cloudId;
        storedTokens.cloud_id_expires_at = now + (60 * 60 * 1000); // 1 hour
        this.storeTokens(storedTokens);
      }
      
      return cloudId;
    } catch (error) {
      throw new Error(`Failed to get cloud ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  private async getValidAccessToken(): Promise<string> {
    try {
      const storedTokens = this.loadStoredTokens();
      
      if (storedTokens?.access_token) {
        // Check if token is expired (if we have expiry info)
        if (storedTokens.expires_at && Date.now() >= storedTokens.expires_at) {
          return await this.refreshAndStoreTokens(storedTokens.refresh_token);
        }
        return storedTokens.access_token;
      }
    } catch (error) {
      // If we can't load stored tokens, continue to bootstrap
    }

    // No stored tokens, use initial refresh token to bootstrap
    return await this.refreshAndStoreTokens(this.initialRefreshToken);
  }

  /**
   * Handle token expiration by refreshing with stored refresh token
   */
  async handleTokenExpiration(): Promise<string> {
    const storedTokens = this.loadStoredTokens();
    if (!storedTokens?.refresh_token) {
      throw new Error("No stored refresh token available for token refresh");
    }
    const newAccessToken = await this.refreshAndStoreTokens(storedTokens.refresh_token);
    return newAccessToken;
  }

  /**
   * Fetch accessible resources to get cloud ID for JIRA instance
   */
  private async fetchAccessibleResources(): Promise<string> {
    const accessToken = await this.getValidAccessToken();
    
    try {
      const response = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch accessible resources (Status: ${response.status}): ${errorText}`);
      }

      const resources: AccessibleResource[] = await response.json();

      // Find JIRA resource with required scopes
      const jiraResource = resources.find(resource => 
        resource.scopes.some(scope => scope.includes('jira'))
      );

      if (!jiraResource) {
        throw new Error("No JIRA resource found in accessible resources");
      }

      return jiraResource.id;

    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch accessible resources: ${error.message}`);
      }
      throw new Error("Failed to fetch accessible resources: Unknown error");
    }
  }

  /**
   * Refresh tokens and store the new ones
   */
  private async refreshAndStoreTokens(refreshToken: string): Promise<string> {
    const payload = {
      grant_type: "refresh_token",
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
    };

    try {
      const response = await fetch(this.ATLASSIAN_TOKEN_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let errorMessage = `Token refresh failed (Status: ${response.status})`;
        let responseText = "";
        
        try {
          responseText = await response.text();
          
          // Try to parse as JSON if it looks like JSON
          if (responseText.trim().startsWith('{') || responseText.trim().startsWith('[')) {
            const errorData = JSON.parse(responseText);
            if (errorData.error_description) {
              errorMessage += `: ${errorData.error_description}`;
            } else if (errorData.error) {
              errorMessage += `: ${errorData.error}`;
            }
          } else {
            errorMessage += `: ${responseText.substring(0, 200)}`;
          }
        } catch (e) {
          errorMessage += responseText ? `: ${responseText.substring(0, 200)}` : "";
        }
        throw new Error(errorMessage);
      }

      const responseText = await response.text();
      const tokenData = JSON.parse(responseText);
      
      if (!tokenData.access_token || !tokenData.refresh_token) {
        throw new Error("Incomplete token data received from OAuth endpoint");
      }

      // Calculate expiry time if provided
      const expiresAt = tokenData.expires_in 
        ? Date.now() + (tokenData.expires_in * 1000) - 60000 // 1 minute buffer
        : undefined;

      const tokensToStore: StoredTokens = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt,
      };

      this.storeTokens(tokensToStore);
      return tokenData.access_token;

    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`OAuth token refresh failed: ${error.message}`);
      }
      throw new Error("OAuth token refresh failed: Unknown error");
    }
  }

  /**
   * Load tokens from filesystem
   */
  private loadStoredTokens(): StoredTokens | null {
    try {
      if (!existsSync(this.tokenStoragePath)) {
        return null;
      }

      const data = readFileSync(this.tokenStoragePath, "utf8");
      const tokens = JSON.parse(data);
      
      // Validate token structure
      if (!tokens.access_token || !tokens.refresh_token) {
        return null;
      }

      return tokens;
    } catch (error) {
      return null;
    }
  }

  /**
   * Store tokens to filesystem with secure permissions
   */
  private storeTokens(tokens: StoredTokens): void {
    try {
      // Ensure directory exists
      const dir = dirname(this.tokenStoragePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true, mode: 0o700 });
      }

      // Write tokens with secure permissions
      writeFileSync(this.tokenStoragePath, JSON.stringify(tokens, null, 2), { mode: 0o600 });
    } catch (error) {
      throw new Error(`Failed to store tokens: ${error}`);
    }
  }
}