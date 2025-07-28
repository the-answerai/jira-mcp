#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js"; // Use base Server
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { JiraApiService } from "./services/jira-api.js";
import { AuthFactory, ConnectionType } from "./auth/AuthFactory.js";

// Environment variables
const JIRA_CONNECTION_TYPE = (process.env.JIRA_CONNECTION_TYPE as ConnectionType) || "Api_Token";
const JIRA_BASE_URL = process.env.JIRA_BASE_URL as string;

// API Token variables
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN as string;
const JIRA_USER_EMAIL = process.env.JIRA_USER_EMAIL as string;

// OAuth variables
const JIRA_CLIENT_ID = process.env.JIRA_CLIENT_ID as string;
const JIRA_CLIENT_SECRET = process.env.JIRA_CLIENT_SECRET as string;
const JIRA_REFRESH_TOKEN = process.env.JIRA_REFRESH_TOKEN as string;
const JIRA_TOKEN_STORAGE_PATH = process.env.JIRA_TOKEN_STORAGE_PATH as string;

// Validate connection type
if (!["Api_Token", "Oauth_2.0"].includes(JIRA_CONNECTION_TYPE)) {
  throw new Error(
    `Invalid JIRA_CONNECTION_TYPE: ${JIRA_CONNECTION_TYPE}. Supported values: Api_Token, Oauth_2.0`
  );
}

// Validate base URL is required for API token authentication
if (JIRA_CONNECTION_TYPE === "Api_Token" && !JIRA_BASE_URL) {
  throw new Error("JIRA_BASE_URL environment variable is required for API Token authentication");
}

class JiraServer {
  private server: Server;
  private jiraApi: JiraApiService;

  constructor() {
    this.server = new Server(
      {
        name: "jira-mcp",
        version: "0.2.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Create authentication strategy
    const authStrategy = AuthFactory.createAuthStrategy(JIRA_CONNECTION_TYPE, {
      baseUrl: JIRA_BASE_URL,
      email: JIRA_USER_EMAIL,
      apiToken: JIRA_API_TOKEN,
      clientId: JIRA_CLIENT_ID,
      clientSecret: JIRA_CLIENT_SECRET,
      refreshToken: JIRA_REFRESH_TOKEN,
      tokenStoragePath: JIRA_TOKEN_STORAGE_PATH,
    });

    this.jiraApi = new JiraApiService(JIRA_BASE_URL || "", authStrategy);

    this.setupToolHandlers();

    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "search_issues",
          description: "Search JIRA issues using JQL",
          inputSchema: {
            type: "object",
            properties: {
              searchString: {
                type: "string",
                description: "JQL search string",
              },
            },
            required: ["searchString"],
            additionalProperties: false,
          },
        },
        {
          name: "get_epic_children",
          description:
            "Get all child issues in an epic including their comments",
          inputSchema: {
            type: "object",
            properties: {
              epicKey: {
                type: "string",
                description: "The key of the epic issue",
              },
            },
            required: ["epicKey"],
            additionalProperties: false,
          },
        },
        {
          name: "get_issue",
          description:
            "Get detailed information about a specific JIRA issue including comments",
          inputSchema: {
            type: "object",
            properties: {
              issueId: {
                type: "string",
                description: "The ID or key of the JIRA issue",
              },
            },
            required: ["issueId"],
            additionalProperties: false,
          },
        },
        {
          name: "create_issue",
          description: "Create a new JIRA issue",
          inputSchema: {
            type: "object",
            properties: {
              projectKey: {
                type: "string",
                description: "The project key where the issue will be created",
              },
              issueType: {
                type: "string",
                description:
                  'The type of issue to create (e.g., "Bug", "Story", "Task")',
              },
              summary: {
                type: "string",
                description: "The issue summary/title",
              },
              description: {
                type: "string",
                description: "The issue description",
              },
              fields: {
                type: "object",
                description: "Additional fields to set on the issue",
                additionalProperties: true,
              },
            },
            required: ["projectKey", "issueType", "summary"],
            additionalProperties: false,
          },
        },
        {
          name: "update_issue",
          description: "Update an existing JIRA issue",
          inputSchema: {
            type: "object",
            properties: {
              issueKey: {
                type: "string",
                description: "The key of the issue to update",
              },
              fields: {
                type: "object",
                description: "Fields to update on the issue",
                additionalProperties: true,
              },
            },
            required: ["issueKey", "fields"],
            additionalProperties: false,
          },
        },
        {
          name: "get_transitions",
          description: "Get available status transitions for a JIRA issue",
          inputSchema: {
            type: "object",
            properties: {
              issueKey: {
                type: "string",
                description: "The key of the issue to get transitions for",
              },
            },
            required: ["issueKey"],
            additionalProperties: false,
          },
        },
        {
          name: "transition_issue",
          description:
            "Change the status of a JIRA issue by performing a transition",
          inputSchema: {
            type: "object",
            properties: {
              issueKey: {
                type: "string",
                description: "The key of the issue to transition",
              },
              transitionId: {
                type: "string",
                description: "The ID of the transition to perform",
              },
              comment: {
                type: "string",
                description: "Optional comment to add with the transition",
              },
            },
            required: ["issueKey", "transitionId"],
            additionalProperties: false,
          },
        },
        {
          name: "add_attachment",
          description: "Add a file attachment to a JIRA issue",
          inputSchema: {
            type: "object",
            properties: {
              issueKey: {
                type: "string",
                description: "The key of the issue to add attachment to",
              },
              fileContent: {
                type: "string",
                description: "Base64 encoded content of the file",
              },
              filename: {
                type: "string",
                description: "Name of the file to be attached",
              },
            },
            required: ["issueKey", "fileContent", "filename"],
            additionalProperties: false,
          },
        },
        {
          name: "add_comment",
          description: "Add a comment to a JIRA issue",
          inputSchema: {
            type: "object",
            properties: {
              issueIdOrKey: {
                type: "string",
                description: "The ID or key of the issue to add the comment to",
              },
              body: {
                type: "string",
                description: "The content of the comment (plain text)",
              },
            },
            required: ["issueIdOrKey", "body"],
            additionalProperties: false,
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const args = request.params.arguments as Record<string, unknown>;

        switch (request.params.name) {
          case "search_issues": {
            if (!args.searchString || typeof args.searchString !== "string") {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Search string is required"
              );
            }
            const response = await this.jiraApi.searchIssues(args.searchString);
            return {
              content: [
                { type: "text", text: JSON.stringify(response, null, 2) },
              ],
            };
          }
          case "get_epic_children": {
            if (!args.epicKey || typeof args.epicKey !== "string") {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Epic key is required"
              );
            }
            const response = await this.jiraApi.getEpicChildren(args.epicKey);
            return {
              content: [
                { type: "text", text: JSON.stringify(response, null, 2) },
              ],
            };
          }
          case "get_issue": {
            if (!args.issueId || typeof args.issueId !== "string") {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Issue ID is required"
              );
            }
            const response = await this.jiraApi.getIssueWithComments(
              args.issueId
            );
            return {
              content: [
                { type: "text", text: JSON.stringify(response, null, 2) },
              ],
            };
          }
          case "create_issue": {
            // Basic validation
            if (
              !args.projectKey ||
              typeof args.projectKey !== "string" ||
              !args.issueType ||
              typeof args.issueType !== "string" ||
              !args.summary ||
              typeof args.summary !== "string"
            ) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "projectKey, issueType, and summary are required"
              );
            }
            const response = await this.jiraApi.createIssue(
              args.projectKey,
              args.issueType,
              args.summary,
              args.description as string | undefined,
              args.fields as Record<string, unknown> | undefined
            );
            return {
              content: [
                { type: "text", text: JSON.stringify(response, null, 2) },
              ],
            };
          }
          case "update_issue": {
            if (
              !args.issueKey ||
              typeof args.issueKey !== "string" ||
              !args.fields ||
              typeof args.fields !== "object"
            ) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "issueKey and fields object are required"
              );
            }
            await this.jiraApi.updateIssue(args.issueKey, args.fields);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { message: `Issue ${args.issueKey} updated successfully` },
                    null,
                    2
                  ),
                },
              ],
            };
          }
          case "get_transitions": {
            if (!args.issueKey || typeof args.issueKey !== "string") {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Issue key is required"
              );
            }
            const response = await this.jiraApi.getTransitions(args.issueKey);
            return {
              content: [
                { type: "text", text: JSON.stringify(response, null, 2) },
              ],
            };
          }
          case "transition_issue": {
            if (
              !args.issueKey ||
              typeof args.issueKey !== "string" ||
              !args.transitionId ||
              typeof args.transitionId !== "string"
            ) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "issueKey and transitionId are required"
              );
            }
            await this.jiraApi.transitionIssue(
              args.issueKey,
              args.transitionId,
              args.comment as string | undefined
            );
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      message: `Issue ${
                        args.issueKey
                      } transitioned successfully${
                        args.comment ? " with comment" : ""
                      }`,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }
          case "add_attachment": {
            if (
              !args.issueKey ||
              typeof args.issueKey !== "string" ||
              !args.fileContent ||
              typeof args.fileContent !== "string" ||
              !args.filename ||
              typeof args.filename !== "string"
            ) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "issueKey, fileContent, and filename are required"
              );
            }
            const fileBuffer = Buffer.from(args.fileContent, "base64");
            const result = await this.jiraApi.addAttachment(
              args.issueKey,
              fileBuffer,
              args.filename
            );
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      message: `File ${args.filename} attached successfully to issue ${args.issueKey}`,
                      attachmentId: result.id,
                      filename: result.filename,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }
          case "add_comment": {
            if (
              !args.issueIdOrKey ||
              typeof args.issueIdOrKey !== "string" ||
              !args.body ||
              typeof args.body !== "string"
            ) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "issueIdOrKey and body are required"
              );
            }
            const response = await this.jiraApi.addCommentToIssue(
              args.issueIdOrKey,
              args.body
            );
            return {
              content: [
                { type: "text", text: JSON.stringify(response, null, 2) },
              ],
            };
          }
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        // Keep generic error handling
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          error instanceof Error ? error.message : "Unknown error occurred"
        );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("JIRA MCP server running on stdio");
  }
}

const server = new JiraServer();
server.run().catch(console.error);
