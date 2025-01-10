# JIRA MCP Server

A Model Context Protocol (MCP) server implementation that provides access to JIRA data with relationship tracking and data cleaning for AI context windows.

## Features

- Search JIRA issues using JQL (maximum 50 results per request)
- Retrieve epic children with comment history (maximum 100 issues per request)
- Get detailed issue information including comments and related issues
- Extract issue mentions from Atlassian Document Format
- Track issue relationships (mentions, links, parent/child, epics)
- Clean and transform rich JIRA content

## Prerequisites

- Node.js
- TypeScript
- JIRA account with API access

## Environment Variables

```bash
JIRA_API_TOKEN=your_api_token
JIRA_BASE_URL=your_jira_instance_url  # e.g., https://your-domain.atlassian.net
JIRA_USER_EMAIL=your_email
```

## Installation & Setup

### 1. Clone the repository:
```bash
git clone [repository-url]
cd jira-mcp
```

### 2. Install dependencies and build:
```bash
npm install
npm run build
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
```json
{
  "mcpServers": {
    "jira": {
      "command": "node",
      "args": ["/absolute/path/to/jira-mcp/build/index.js"],
      "env": {
        "JIRA_API_TOKEN": "your_api_token",
        "JIRA_BASE_URL": "your_jira_instance_url",
        "JIRA_USER_EMAIL": "your_email"
      }
    }
  }
}
```

### 4. Restart the MCP server.
 Within Cline's MCP settings, restart the MCP server. Restart Claude Desktop to load the new MCP server.

## Development

Run tests:
```bash
npm test
```

To rebuild after changes:
```bash
npm run build
```

## Available MCP Tools

### search_issues
Search JIRA issues using JQL. Returns up to 50 results per request.

Input Schema:
```typescript
{
  searchString: string // JQL search string
}
```

### get_epic_children
Get all child issues in an epic including their comments and relationship data. Limited to 100 issues per request.

Input Schema:
```typescript
{
  epicKey: string // The key of the epic issue
}
```

### get_issue
Get detailed information about a specific JIRA issue including comments and all relationships.

Input Schema:
```typescript
{
  issueId: string // The ID or key of the JIRA issue
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

## Technical Details

- Built with TypeScript in strict mode
- Uses JIRA REST API v3
- Basic authentication with API tokens
- Batched API requests for related data
- Error handling with detailed messages
- Maximum limits:
  - Search results: 50 issues per request
  - Epic children: 100 issues per request

## Error Handling

- Basic error handling for API failures
- Network error detection
- Issue not found handling
- Error message formatting with status codes
- Error details logging to console
