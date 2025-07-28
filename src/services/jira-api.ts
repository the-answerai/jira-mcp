import {
  SearchIssuesResponse,
  CleanJiraIssue,
  CleanComment,
  AdfDoc,
  JiraCommentResponse,
  AddCommentResponse,
} from "../types/jira.js";
import { AuthStrategy } from "../auth/AuthStrategy.js";

export class JiraApiService {
  private baseUrl: string;
  private authStrategy: AuthStrategy;

  constructor(baseUrl: string, authStrategy: AuthStrategy) {
    this.baseUrl = baseUrl;
    this.authStrategy = authStrategy;
    
    // Validate that base URL is provided for API token authentication
    if (authStrategy.getType() === "API_TOKEN" && !baseUrl) {
      throw new Error("Base URL is required for API Token authentication");
    }
  }

  /**
   * Get the appropriate API base URL based on authentication strategy
   */
  private async getApiBaseUrl(): Promise<string> {
    if (this.authStrategy.getType() === "OAUTH_2.0" && this.authStrategy.getCloudId) {
      const cloudId = await this.authStrategy.getCloudId();
      return `https://api.atlassian.com/ex/jira/${cloudId}`;
    }
    return this.baseUrl;
  }

  private async handleFetchError(
    response: Response,
    url?: string,
  ): Promise<never> {
    // First, check for network errors
    if (!response.ok) {
      let message = response.statusText; // Default to status text
      let errorData = {};
      let responseText = "";
      
      try {
        responseText = await response.text();
        
        // Try to parse as JSON if it looks like JSON
        if (responseText.trim().startsWith('{') || responseText.trim().startsWith('[')) {
          errorData = JSON.parse(responseText);
          // Check for common JIRA error message structures
          if (
            Array.isArray((errorData as any).errorMessages) &&
            (errorData as any).errorMessages.length > 0
          ) {
            message = (errorData as any).errorMessages.join("; ");
          } else if ((errorData as any).message) {
            message = (errorData as any).message;
          } else if ((errorData as any).errorMessage) {
            message = (errorData as any).errorMessage;
          }
        } else {
          // Not JSON, likely HTML error page
          message = responseText.length > 200 
            ? `${responseText.substring(0, 200)}...` 
            : responseText;
        }
      } catch (e) {
        // Ignore JSON parsing errors if the body is not JSON or empty
        console.warn("Could not parse JIRA error response body as JSON.");
        if (responseText) {
          message = responseText.length > 200 
            ? `${responseText.substring(0, 200)}...` 
            : responseText;
        }
      }

      // Ensure message is not empty before including it
      const errorMessage = message ? `: ${message}` : "";
      throw new Error(
        `JIRA API Error${errorMessage} (Status: ${response.status})`,
      );
    }
    // This line should ideally not be reached if response.ok is true,
    // but kept for safety in case of unexpected fetch behavior.
    throw new Error("Unknown error occurred during fetch operation.");
  }

  /**
   * Extracts issue mentions from Atlassian document content
   * Looks for nodes that were auto-converted to issue links
   */
  private extractIssueMentions(
    content: any[],
    source: "description" | "comment",
    commentId?: string,
  ): CleanJiraIssue["relatedIssues"] {
    const mentions: NonNullable<CleanJiraIssue["relatedIssues"]> = [];

    // Recursively process content nodes
    const processNode = (node: any) => {
      // Check for inlineCard nodes (auto-converted issue mentions)
      if (node.type === "inlineCard" && node.attrs?.url) {
        const match = node.attrs.url.match(/\/browse\/([A-Z]+-\d+)/);
        if (match) {
          mentions.push({
            key: match[1],
            type: "mention",
            source,
            commentId,
          });
        }
      }

      // Check for text nodes that might contain issue keys
      if (node.type === "text" && node.text) {
        const matches = node.text.match(/[A-Z]+-\d+/g) || [];
        matches.forEach((key: string) => {
          mentions.push({
            key,
            type: "mention",
            source,
            commentId,
          });
        });
      }

      // Process child nodes
      if (node.content) {
        node.content.forEach(processNode);
      }
    };

    content.forEach(processNode);
    return [...new Map(mentions.map((m) => [m.key, m])).values()]; // Remove duplicates
  }

  private cleanComment(comment: {
    id: string;
    body?: {
      content?: any[];
    };
    author?: {
      displayName?: string;
    };
    created: string;
    updated: string;
  }): CleanComment {
    const body = comment.body?.content
      ? this.extractTextContent(comment.body.content)
      : "";
    const mentions = comment.body?.content
      ? this.extractIssueMentions(comment.body.content, "comment", comment.id)
      : [];

    return {
      id: comment.id,
      body,
      author: comment.author?.displayName,
      created: comment.created,
      updated: comment.updated,
      mentions: mentions,
    };
  }

  /**
   * Recursively extracts text content from Atlassian Document Format nodes
   */
  private extractTextContent(content: any[]): string {
    if (!Array.isArray(content)) return "";

    return content
      .map((node) => {
        if (node.type === "text") {
          return node.text || "";
        }
        if (node.content) {
          return this.extractTextContent(node.content);
        }
        return "";
      })
      .join("");
  }

  private cleanIssue(issue: any): CleanJiraIssue {
    const description = issue.fields?.description?.content
      ? this.extractTextContent(issue.fields.description.content)
      : "";

    const cleanedIssue: CleanJiraIssue = {
      id: issue.id,
      key: issue.key,
      summary: issue.fields?.summary,
      status: issue.fields?.status?.name,
      created: issue.fields?.created,
      updated: issue.fields?.updated,
      description,
      relatedIssues: [],
    };

    // Extract mentions from description
    if (issue.fields?.description?.content) {
      const mentions = this.extractIssueMentions(
        issue.fields.description.content,
        "description",
      );
      if (mentions.length > 0) {
        cleanedIssue.relatedIssues = mentions;
      }
    }

    // Add formal issue links if they exist
    if (issue.fields?.issuelinks?.length > 0) {
      const links = issue.fields.issuelinks.map((link: any) => {
        const linkedIssue = link.inwardIssue || link.outwardIssue;
        const relationship = link.type.inward || link.type.outward;
        return {
          key: linkedIssue.key,
          summary: linkedIssue.fields?.summary,
          type: "link" as const,
          relationship,
          source: "description" as const,
        };
      });

      cleanedIssue.relatedIssues = [
        ...(cleanedIssue.relatedIssues || []),
        ...links,
      ];
    }

    // Add parent if exists
    if (issue.fields?.parent) {
      cleanedIssue.parent = {
        id: issue.fields.parent.id,
        key: issue.fields.parent.key,
        summary: issue.fields.parent.fields?.summary,
      };
    }

    // Add epic link if exists
    if (issue.fields?.customfield_10014) {
      // Epic Link field
      cleanedIssue.epicLink = {
        id: issue.fields.customfield_10014,
        key: issue.fields.customfield_10014,
        summary: undefined, // We'll need a separate request to get epic details
      };
    }

    // Add subtasks if exist
    if (issue.fields?.subtasks?.length > 0) {
      cleanedIssue.children = issue.fields.subtasks.map((subtask: any) => ({
        id: subtask.id,
        key: subtask.key,
        summary: subtask.fields?.summary,
      }));
    }

    return cleanedIssue;
  }

  private async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    return await this.fetchWithRetry(url, init);
  }

  /**
   * Fetch with automatic retry on token expiration for OAuth
   */
  private async fetchWithRetry<T>(url: string, init?: RequestInit, isRetry: boolean = false): Promise<T> {
    const baseUrl = await this.getApiBaseUrl();
    const headers = await this.authStrategy.getAuthHeaders();
    
    // Merge any additional headers from init
    if (init?.headers) {
      const additionalHeaders = new Headers(init.headers);
      for (const [key, value] of additionalHeaders.entries()) {
        headers.set(key, value);
      }
    }

    const fullUrl = baseUrl + url;

    const response = await fetch(fullUrl, {
      ...init,
      headers,
    });

    // Handle token expiration for OAuth
    if (!response.ok && (response.status === 401 || response.status === 403) && !isRetry) {
      if (this.authStrategy.getType() === "OAUTH_2.0" && "handleTokenExpiration" in this.authStrategy) {
        try {
          // Refresh token and get the new access token
          const newAccessToken = await (this.authStrategy as any).handleTokenExpiration();
          
          // Create new headers with the fresh token
          const newHeaders = new Headers({
            Authorization: `Bearer ${newAccessToken}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          });
          
          // Merge any additional headers from init
          if (init?.headers) {
            const additionalHeaders = new Headers(init.headers);
            for (const [key, value] of additionalHeaders.entries()) {
              if (key.toLowerCase() !== 'authorization') { // Don't override our fresh auth header
                newHeaders.set(key, value);
              }
            }
          }

          // Make retry request with fresh token
          const retryResponse = await fetch(fullUrl, {
            ...init,
            headers: newHeaders,
          });

          if (!retryResponse.ok) {
            await this.handleFetchError(retryResponse, url);
          }

          return retryResponse.json();
        } catch (error) {
          // If token refresh fails, proceed with original error handling
        }
      }
    }

    if (!response.ok) {
      await this.handleFetchError(response, url);
    }

    return response.json();
  }

  async searchIssues(searchString: string): Promise<SearchIssuesResponse> {
    const params = new URLSearchParams({
      jql: searchString,
      maxResults: "50",
      fields: [
        "id",
        "key",
        "summary",
        "description",
        "status",
        "created",
        "updated",
        "parent",
        "subtasks",
        "customfield_10014", // Epic Link field
        "issuelinks", // For formal issue links
      ].join(","),
      expand: "names,renderedFields",
    });

    const data = await this.fetchJson<any>(`/rest/api/3/search?${params}`);

    return {
      total: data.total,
      issues: data.issues.map((issue: any) => this.cleanIssue(issue)),
    };
  }

  async getEpicChildren(epicKey: string): Promise<CleanJiraIssue[]> {
    const params = new URLSearchParams({
      jql: `"Epic Link" = ${epicKey}`,
      maxResults: "100",
      fields: [
        "id",
        "key",
        "summary",
        "description",
        "status",
        "created",
        "updated",
        "parent",
        "subtasks",
        "customfield_10014", // Epic Link field
        "issuelinks", // For formal issue links
      ].join(","),
      expand: "names,renderedFields",
    });

    const data = await this.fetchJson<any>(`/rest/api/3/search?${params}`);

    // Get comments for each child issue
    const issuesWithComments = await Promise.all(
      data.issues.map(async (issue: any) => {
        const commentsData = await this.fetchJson<any>(
          `/rest/api/3/issue/${issue.key}/comment`,
        );
        const cleanedIssue = this.cleanIssue(issue);
        const comments = commentsData.comments.map((comment: any) =>
          this.cleanComment(comment),
        );

        // Add comment mentions to related issues
        const commentMentions = comments.flatMap(
          (comment: CleanComment) => comment.mentions,
        );
        cleanedIssue.relatedIssues = [
          ...cleanedIssue.relatedIssues,
          ...commentMentions,
        ];

        cleanedIssue.comments = comments;
        return cleanedIssue;
      }),
    );

    return issuesWithComments;
  }

  async getIssueWithComments(issueId: string): Promise<CleanJiraIssue> {
    const params = new URLSearchParams({
      fields: [
        "id",
        "key",
        "summary",
        "description",
        "status",
        "created",
        "updated",
        "parent",
        "subtasks",
        "customfield_10014", // Epic Link field
        "issuelinks", // For formal issue links
      ].join(","),
      expand: "names,renderedFields",
    });

    let issueData, commentsData;
    try {
      [issueData, commentsData] = await Promise.all([
        this.fetchJson<any>(`/rest/api/3/issue/${issueId}?${params}`),
        this.fetchJson<any>(`/rest/api/3/issue/${issueId}/comment`),
      ]);
    } catch (error: any) {
      // Check if the error is the specific 404 for the main issue fetch
      if (error instanceof Error && error.message.includes("(Status: 404)")) {
        // Check if the error message contains the generic 404 status text we expect from handleFetchError
        // This indicates the primary issue fetch failed with 404
        throw new Error(`Issue not found: ${issueId}`);
      }
      // Re-throw other errors
      throw error;
    }

    const issue = this.cleanIssue(issueData);
    const comments = commentsData.comments.map((comment: any) =>
      this.cleanComment(comment),
    );

    // Add comment mentions to related issues
    const commentMentions = comments.flatMap(
      (comment: CleanComment) => comment.mentions,
    );
    issue.relatedIssues = [...issue.relatedIssues, ...commentMentions];

    issue.comments = comments;

    // If there's an epic link, fetch its details
    if (issue.epicLink) {
      try {
        const epicData = await this.fetchJson<any>(
          `/rest/api/3/issue/${issue.epicLink.key}?fields=summary`,
        );
        issue.epicLink.summary = epicData.fields?.summary;
      } catch (error) {
        console.error("Failed to fetch epic details:", error);
      }
    }

    return issue;
  }

  async createIssue(
    projectKey: string,
    issueType: string,
    summary: string,
    description?: string,
    fields?: Record<string, any>,
  ): Promise<{ id: string; key: string }> {
    const payload = {
      fields: {
        project: {
          key: projectKey,
        },
        summary,
        issuetype: {
          name: issueType,
        },
        ...(description && { description }),
        ...fields,
      },
    };

    return this.fetchJson<{ id: string; key: string }>("/rest/api/3/issue", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async updateIssue(
    issueKey: string,
    fields: Record<string, any>,
  ): Promise<void> {
    await this.fetchJson(`/rest/api/3/issue/${issueKey}`, {
      method: "PUT",
      body: JSON.stringify({ fields }),
    });
  }

  async getTransitions(
    issueKey: string,
  ): Promise<Array<{ id: string; name: string; to: { name: string } }>> {
    const data = await this.fetchJson<any>(
      `/rest/api/3/issue/${issueKey}/transitions`,
    );
    return data.transitions;
  }

  async transitionIssue(
    issueKey: string,
    transitionId: string,
    comment?: string,
  ): Promise<void> {
    const payload: any = {
      transition: { id: transitionId },
    };

    if (comment) {
      payload.update = {
        comment: [
          {
            add: {
              body: {
                type: "doc",
                version: 1,
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: comment,
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
      };
    }

    await this.fetchJson(`/rest/api/3/issue/${issueKey}/transitions`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async addAttachment(
    issueKey: string,
    file: Buffer,
    filename: string,
  ): Promise<{ id: string; filename: string }> {
    return await this.addAttachmentWithRetry(issueKey, file, filename);
  }

  /**
   * Add attachment with automatic retry on token expiration for OAuth
   */
  private async addAttachmentWithRetry(
    issueKey: string,
    file: Buffer,
    filename: string,
    isRetry: boolean = false
  ): Promise<{ id: string; filename: string }> {
    const formData = new FormData();
    formData.append("file", new Blob([file]), filename);

    const baseUrl = await this.getApiBaseUrl();
    const headers = await this.authStrategy.getAuthHeaders();
    headers.delete("Content-Type"); // Let the browser set the correct content type for FormData
    headers.set("X-Atlassian-Token", "no-check"); // Required for file uploads

    const response = await fetch(
      `${baseUrl}/rest/api/3/issue/${issueKey}/attachments`,
      {
        method: "POST",
        headers,
        body: formData,
      },
    );

    // Handle token expiration for OAuth
    if (!response.ok && (response.status === 401 || response.status === 403) && !isRetry) {
      if (this.authStrategy.getType() === "OAUTH_2.0" && "handleTokenExpiration" in this.authStrategy) {
        try {
          // Refresh token and retry once
          await (this.authStrategy as any).handleTokenExpiration();
          return await this.addAttachmentWithRetry(issueKey, file, filename, true);
        } catch (error) {
          // If token refresh fails, proceed with original error handling
          console.error("Token refresh failed during attachment retry:", error);
        }
      }
    }

    if (!response.ok) {
      await this.handleFetchError(response);
    }

    const data = await response.json();
    // JIRA returns an array with one item for single file upload
    const attachment = data[0];
    return {
      id: attachment.id,
      filename: attachment.filename,
    };
  }

  /**
   * Converts plain text to a basic Atlassian Document Format (ADF) structure.
   */
  private createAdfFromBody(text: string): AdfDoc {
    return {
      version: 1,
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: text,
            },
          ],
        },
      ],
    };
  }

  /**
   * Adds a comment to a JIRA issue.
   */
  async addCommentToIssue(
    issueIdOrKey: string,
    body: string,
  ): Promise<AddCommentResponse> {
    const adfBody = this.createAdfFromBody(body);

    const payload = {
      body: adfBody,
      // visibility can be added here if needed
    };

    const response = await this.fetchJson<JiraCommentResponse>(
      `/rest/api/3/issue/${issueIdOrKey}/comment`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );

    // Clean the response for the MCP tool
    return {
      id: response.id,
      author: response.author.displayName,
      created: response.created,
      updated: response.updated,
      body: this.extractTextContent(response.body.content), // Extract plain text from returned ADF
    };
  }
}
