#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { JiraApiService } from './services/jira-api.js';

const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN ?? '';
const JIRA_BASE_URL = process.env.JIRA_BASE_URL ?? '';
const JIRA_USER_EMAIL = process.env.JIRA_USER_EMAIL ?? '';

if (!JIRA_API_TOKEN || !JIRA_BASE_URL || !JIRA_USER_EMAIL) {
  throw new Error('JIRA_API_TOKEN, JIRA_USER_EMAIL and JIRA_BASE_URL environment variables are required');
}

class JiraServer {
  private server: Server;
  private jiraApi: JiraApiService;

  constructor() {
    this.server = new Server(
      {
        name: 'jira-mcp',
        version: '0.2.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.jiraApi = new JiraApiService(JIRA_BASE_URL, JIRA_USER_EMAIL, JIRA_API_TOKEN);

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'search_issues',
          description: 'Search JIRA issues using JQL',
          inputSchema: {
            type: 'object',
            properties: {
              searchString: {
                type: 'string',
                description: 'JQL search string',
              },
            },
            required: ['searchString'],
            additionalProperties: false,
          },
        },
        {
          name: 'get_epic_children',
          description: 'Get all child issues in an epic including their comments',
          inputSchema: {
            type: 'object',
            properties: {
              epicKey: {
                type: 'string',
                description: 'The key of the epic issue',
              },
            },
            required: ['epicKey'],
            additionalProperties: false,
          },
        },
        {
          name: 'get_issue',
          description: 'Get detailed information about a specific JIRA issue including comments',
          inputSchema: {
            type: 'object',
            properties: {
              issueId: {
                type: 'string',
                description: 'The ID or key of the JIRA issue',
              },
            },
            required: ['issueId'],
            additionalProperties: false,
          },
        },
        {
          name: 'create_issue',
          description: 'Create a new JIRA issue',
          inputSchema: {
            type: 'object',
            properties: {
              projectKey: {
                type: 'string',
                description: 'The project key where the issue will be created',
              },
              issueType: {
                type: 'string',
                description: 'The type of issue to create (e.g., "Bug", "Story", "Task")',
              },
              summary: {
                type: 'string',
                description: 'The issue summary/title',
              },
              description: {
                type: 'string',
                description: 'The issue description',
              },
              fields: {
                type: 'object',
                description: 'Additional fields to set on the issue',
                additionalProperties: true,
              },
            },
            required: ['projectKey', 'issueType', 'summary'],
            additionalProperties: false,
          },
        },
        {
          name: 'update_issue',
          description: 'Update an existing JIRA issue',
          inputSchema: {
            type: 'object',
            properties: {
              issueKey: {
                type: 'string',
                description: 'The key of the issue to update',
              },
              fields: {
                type: 'object',
                description: 'Fields to update on the issue',
                additionalProperties: true,
              },
            },
            required: ['issueKey', 'fields'],
            additionalProperties: false,
          },
        },
        {
          name: 'get_transitions',
          description: 'Get available status transitions for a JIRA issue',
          inputSchema: {
            type: 'object',
            properties: {
              issueKey: {
                type: 'string',
                description: 'The key of the issue to get transitions for',
              },
            },
            required: ['issueKey'],
            additionalProperties: false,
          },
        },
        {
          name: 'transition_issue',
          description: 'Change the status of a JIRA issue by performing a transition',
          inputSchema: {
            type: 'object',
            properties: {
              issueKey: {
                type: 'string',
                description: 'The key of the issue to transition',
              },
              transitionId: {
                type: 'string',
                description: 'The ID of the transition to perform',
              },
              comment: {
                type: 'string',
                description: 'Optional comment to add with the transition',
              },
            },
            required: ['issueKey', 'transitionId'],
            additionalProperties: false,
          },
        },
        {
          name: 'add_attachment',
          description: 'Add a file attachment to a JIRA issue',
          inputSchema: {
            type: 'object',
            properties: {
              issueKey: {
                type: 'string',
                description: 'The key of the issue to add attachment to',
              },
              fileContent: {
                type: 'string',
                description: 'Base64 encoded content of the file',
              },
              filename: {
                type: 'string',
                description: 'Name of the file to be attached',
              },
            },
            required: ['issueKey', 'fileContent', 'filename'],
            additionalProperties: false,
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'search_issues': {
            const { searchString } = request.params.arguments as { searchString: string };
            if (!searchString) {
              throw new McpError(ErrorCode.InvalidParams, 'Search string is required');
            }

            const response = await this.jiraApi.searchIssues(searchString);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          case 'get_epic_children': {
            const { epicKey } = request.params.arguments as { epicKey: string };
            if (!epicKey) {
              throw new McpError(ErrorCode.InvalidParams, 'Epic key is required');
            }

            const response = await this.jiraApi.getEpicChildren(epicKey);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          case 'get_issue': {
            const { issueId } = request.params.arguments as { issueId: string };
            if (!issueId) {
              throw new McpError(ErrorCode.InvalidParams, 'Issue ID is required');
            }

            const response = await this.jiraApi.getIssueWithComments(issueId);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          case 'create_issue': {
            const { projectKey, issueType, summary, description, fields } = request.params.arguments as {
              projectKey: string;
              issueType: string;
              summary: string;
              description?: string;
              fields?: Record<string, any>;
            };

            const response = await this.jiraApi.createIssue(projectKey, issueType, summary, description, fields);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          case 'update_issue': {
            const { issueKey, fields } = request.params.arguments as {
              issueKey: string;
              fields: Record<string, any>;
            };

            await this.jiraApi.updateIssue(issueKey, fields);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ message: `Issue ${issueKey} updated successfully` }, null, 2),
                },
              ],
            };
          }

          case 'get_transitions': {
            const { issueKey } = request.params.arguments as { issueKey: string };
            if (!issueKey) {
              throw new McpError(ErrorCode.InvalidParams, 'Issue key is required');
            }

            const response = await this.jiraApi.getTransitions(issueKey);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          case 'transition_issue': {
            const { issueKey, transitionId, comment } = request.params.arguments as {
              issueKey: string;
              transitionId: string;
              comment?: string;
            };

            await this.jiraApi.transitionIssue(issueKey, transitionId, comment);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ 
                    message: `Issue ${issueKey} transitioned successfully${comment ? ' with comment' : ''}` 
                  }, null, 2),
                },
              ],
            };
          }

          case 'add_attachment': {
            const { issueKey, fileContent, filename } = request.params.arguments as {
              issueKey: string;
              fileContent: string;
              filename: string;
            };

            // Convert base64 to Buffer
            const fileBuffer = Buffer.from(fileContent, 'base64');
            
            const result = await this.jiraApi.addAttachment(issueKey, fileBuffer, filename);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    message: `File ${filename} attached successfully to issue ${issueKey}`,
                    attachmentId: result.id,
                    filename: result.filename
                  }, null, 2),
                },
              ],
            };
          }

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          error instanceof Error ? error.message : 'Unknown error occurred'
        );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('JIRA MCP server running on stdio');
  }
}

const server = new JiraServer();
server.run().catch(console.error);
