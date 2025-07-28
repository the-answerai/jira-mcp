# JIRA MCP Server

A Model Context Protocol (MCP) server implementation that provides access to JIRA data with relationship tracking, optimized data payloads, and data cleaning for AI context windows.

ℹ️ There is a separate MCP server [for Confluence](https://github.com/cosmix/confluence-mcp)

## Features

- Search JIRA issues using JQL (maximum 50 results per request)
- Retrieve epic children with comment history and optimized payloads (maximum 100 issues per request)
- Get detailed issue information including comments and related issues
- Create, update, and manage JIRA issues
- Add comments to issues
- Extract issue mentions from Atlassian Document Format
- Track issue relationships (mentions, links, parent/child, epics)
- Clean and transform rich JIRA content for AI context efficiency
- Support for file attachments with secure multipart upload handling

## Prerequisites

- [Node.js](https://nodejs.org/) (v18.0.0 or higher)
- [pnpm](https://pnpm.io/installation) (v8.0.0 or higher)
- JIRA account with API access

## Environment Variables

The server supports two authentication methods: API Token (default) and OAuth 2.0.

### API Token Authentication (Default)

```bash
JIRA_CONNECTION_TYPE=Api_Token  # Optional, defaults to Api_Token
JIRA_BASE_URL=your_jira_instance_url  # e.g., https://your-domain.atlassian.net
JIRA_API_TOKEN=your_api_token
JIRA_USER_EMAIL=your_email
```

### OAuth 2.0 Authentication

```bash
JIRA_CONNECTION_TYPE=Oauth_2.0
JIRA_CLIENT_ID=your_oauth_client_id
JIRA_CLIENT_SECRET=your_oauth_client_secret
JIRA_REFRESH_TOKEN=your_initial_refresh_token
JIRA_TOKEN_STORAGE_PATH=/custom/path/to/tokens.json  # Optional, defaults to ~/.jira-mcp/tokens.json
```

**OAuth 2.0 Behavior**: 
- Uses Atlassian's rotating refresh tokens (one-time use)
- Stores both access and refresh tokens securely in filesystem
- Automatically refreshes expired tokens and retries failed requests
- On first run, uses `JIRA_REFRESH_TOKEN` from environment to bootstrap the process
- Subsequently uses stored refresh tokens from filesystem
- Token storage defaults to `~/.jira-mcp/tokens.json` with secure permissions (600)
- **No base URL required** - JIRA instance is discovered automatically via cloud ID

## Installation & Setup

### 1. Clone the repository:

```bash
git clone [repository-url]
cd jira-mcp
```

### 2. Install dependencies and build:

```bash
pnpm install
pnpm run build
```

### 3. Configure the MCP server:

Edit the appropriate configuration file:

**macOS:**

- Cline: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows:**

- Cline: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
- Claude Desktop: `%APPDATA%\Claude Desktop\claude_desktop_config.json`

**Linux:**

- Cline: `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- Claude Desktop: _sadly doesn't exist yet_

Add the following configuration under the `mcpServers` object:

**API Token Configuration:**
```json
{
  "mcpServers": {
    "jira": {
      "command": "node",
      "args": ["/absolute/path/to/jira-mcp/build/index.js"],
      "env": {
        "JIRA_CONNECTION_TYPE": "Api_Token",
        "JIRA_BASE_URL": "your_jira_instance_url",
        "JIRA_API_TOKEN": "your_api_token",
        "JIRA_USER_EMAIL": "your_email"
      }
    }
  }
}
```

**OAuth 2.0 Configuration:**
```json
{
  "mcpServers": {
    "jira": {
      "command": "node",
      "args": ["/absolute/path/to/jira-mcp/build/index.js"],
      "env": {
        "JIRA_CONNECTION_TYPE": "Oauth_2.0",
        "JIRA_CLIENT_ID": "your_oauth_client_id",
        "JIRA_CLIENT_SECRET": "your_oauth_client_secret",
        "JIRA_REFRESH_TOKEN": "your_initial_refresh_token",
        "JIRA_TOKEN_STORAGE_PATH": "/custom/path/tokens.json"
      }
    }
  }
}
```

**Notes**: 
- `JIRA_TOKEN_STORAGE_PATH` is optional and defaults to `~/.jira-mcp/tokens.json`
- `JIRA_BASE_URL` is not required for OAuth - the JIRA instance is discovered automatically

### 4. Restart the MCP server.

Within Cline's MCP settings, restart the MCP server. Restart Claude Desktop to load the new MCP server.

## Development

Run tests:

```bash
pnpm test
```

Watch mode for development:

```bash
pnpm run dev
```

To rebuild after changes:

```bash
pnpm run build
```

## Available MCP Tools

### search_issues

Search JIRA issues using JQL. Returns up to 50 results per request.

Input Schema:

```typescript
{
  searchString: string; // JQL search string
}
```

### get_epic_children

Get all child issues in an epic including their comments and relationship data. Limited to 100 issues per request.

Input Schema:

```typescript
{
  epicKey: string; // The key of the epic issue
}
```

### get_issue

Get detailed information about a specific JIRA issue including comments and all relationships.

Input Schema:

```typescript
{
  issueId: string; // The ID or key of the JIRA issue
}
```

### create_issue

Create a new JIRA issue with specified fields.

Input Schema:

```typescript
{
  projectKey: string, // The project key where the issue will be created
  issueType: string, // The type of issue (e.g., "Bug", "Story", "Task")
  summary: string, // The issue summary/title
  description?: string, // Optional issue description
  fields?: { // Optional additional fields
    [key: string]: any
  }
}
```

### update_issue

Update fields of an existing JIRA issue.

Input Schema:

```typescript
{
  issueKey: string, // The key of the issue to update
  fields: { // Fields to update
    [key: string]: any
  }
}
```

### add_attachment

Add a file attachment to a JIRA issue.

Input Schema:

```typescript
{
  issueKey: string, // The key of the issue
  fileContent: string, // Base64 encoded file content
  filename: string // Name of the file to be attached
}
```

### add_comment

Add a comment to a JIRA issue. Accepts plain text and converts it to the required Atlassian Document Format internally.

Input Schema:

```typescript
{
  issueIdOrKey: string, // The ID or key of the issue to add the comment to
  body: string // The content of the comment (plain text)
}
```

## Data Cleaning Features

- Extracts text from Atlassian Document Format
- Tracks issue mentions in descriptions and comments
- Maintains formal issue links with relationship types
- Preserves parent/child relationships
- Tracks epic associations
- Includes comment history with author information
- Removes unnecessary metadata from responses
- Recursively processes content nodes for mentions
- Deduplicates issue mentions

## Technical Details

- Built with TypeScript in strict mode
- Uses Bun runtime for improved performance
- Vite for optimized builds
- Uses JIRA REST API v3
- **Dual Authentication Support:**
  - Basic authentication with API tokens (default)
  - OAuth 2.0 with automatic token refresh per request
- Batched API requests for related data
- Optimized response payloads for AI context windows
- Efficient transformation of complex Atlassian structures
- Robust error handling with OAuth-specific error messages
- Rate limiting considerations
- Maximum limits:
  - Search results: 50 issues per request
  - Epic children: 100 issues per request
- Support for multipart form data for secure file attachments
- Automatic content type detection and validation
- **OAuth Security**: Secure filesystem token storage with automatic refresh and retry logic

## Error Handling

The server implements a comprehensive error handling strategy:

- Network error detection and appropriate messaging
- HTTP status code handling (especially 404 for issues)
- Detailed error messages with status codes
- Error details logging to console
- Input validation for all parameters
- Safe error propagation through MCP protocol
- Specialized handling for common JIRA API errors
- **OAuth-specific error handling:**
  - Automatic token refresh on 401/403 responses
  - Token refresh failures with clear messaging
  - Expired refresh token detection
  - Invalid OAuth credential validation
  - Connection type validation
  - Filesystem token storage error handling
  - Automatic retry logic for expired tokens
- Base64 validation for attachments
- Multipart request failure handling
- Rate limit detection
- Attachment parameter validation

## LICENCE

This project is licensed under the MIT License - see the [LICENCE](LICENCE) file for details.
