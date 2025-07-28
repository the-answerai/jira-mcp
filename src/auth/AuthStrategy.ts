/**
 * Authentication strategy interface for JIRA API requests
 */
export interface AuthStrategy {
  /**
   * Get headers required for authentication
   * @returns Promise resolving to Headers object with authentication headers
   */
  getAuthHeaders(): Promise<Headers>;

  /**
   * Get the authentication type name for logging/debugging
   */
  getType(): string;

  /**
   * Get the cloud ID for OAuth requests (OAuth strategies only)
   * @returns Promise resolving to cloud ID string
   */
  getCloudId?(): Promise<string>;
}