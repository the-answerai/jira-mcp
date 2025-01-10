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
        version: '0.1.0',
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
