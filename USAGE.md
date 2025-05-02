# Using the JIRA MCP Server

This document explains how to use the JIRA MCP Server after installing it from npm.

## Installation

Install the package globally:

```bash
npm install -g @answerai/jira-mcp
```

## Configuration

### 1. Set up JIRA API Access

1. Log in to your Atlassian account
2. Go to Account Settings > Security > Create and manage API tokens
3. Click "Create API token"
4. Give your token a name (e.g., "MCP JIRA Integration")
5. Copy the token value (you won't be able to see it again)

### 2. Configure Claude Desktop or Cline

#### Claude Desktop

Add the following to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows**: `%APPDATA%\Claude Desktop\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "jira": {
      "command": "answerai-jira-mcp",
      "env": {
        "JIRA_API_TOKEN": "your_api_token",
        "JIRA_BASE_URL": "your_jira_instance_url",
        "JIRA_USER_EMAIL": "your_email"
      }
    }
  }
}
```

#### Cline

Add the following to your Cline configuration file:

**macOS**: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`  
**Windows**: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`  
**Linux**: `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

```json
{
  "mcpServers": {
    "jira": {
      "command": "answerai-jira-mcp",
      "env": {
        "JIRA_API_TOKEN": "your_api_token",
        "JIRA_BASE_URL": "your_jira_instance_url",
        "JIRA_USER_EMAIL": "your_email"
      }
    }
  }
}
```

Replace the following values:
- `your_api_token`: Your JIRA API token
- `your_jira_instance_url`: Your JIRA instance URL (e.g., `https://your-domain.atlassian.net`)
- `your_email`: The email associated with your JIRA account

### 3. Verify Your Setup

Verify your setup by running:

```bash
answerai-jira-mcp-check
```

This will check if your environment variables are set correctly and test your connection to JIRA.

### 4. Restart Claude or Cline

After configuration, restart Claude Desktop or VS Code (for Cline) to load the updated MCP configuration.

## Available Tools

The JIRA MCP Server provides the following tools to interact with JIRA:

### search_issues

Search JIRA issues using JQL.

Example:
```
project = "ENG" AND status = "In Progress"
```

### get_epic_children

Get all issues in an epic including their comments.

Example:
```
ENG-123
```

### get_issue

Get detailed information about a specific JIRA issue.

Example:
```
ENG-456
```

### create_issue

Create a new JIRA issue.

Example:
```
Create a bug in the ENG project titled "Authentication failure on login page"
```

### update_issue

Update fields of an existing JIRA issue.

Example:
```
Update ENG-789 to set the priority to High and assign it to John
```

### add_attachment

Add a file attachment to a JIRA issue.

Example:
```
Attach a screenshot to ENG-123
```

### add_comment

Add a comment to a JIRA issue.

Example:
```
Add a comment to ENG-456: "I've investigated this issue and found that it's related to the recent database migration."
```

## Troubleshooting

### Connection Issues

If you're experiencing connection issues:

1. Check that your JIRA API token is valid
2. Verify that your JIRA instance URL is correct and includes the protocol (https://)
3. Make sure your email address is correct and has access to the JIRA instance
4. Check your network connection and firewall settings

### Permission Issues

If you're seeing permission errors:

1. Ensure your JIRA account has appropriate permissions for the operations you're trying to perform
2. Check that your API token has sufficient scope
3. Verify that you have access to the projects you're trying to query

### Log Files

For detailed logs, check the Claude or Cline application logs.

## Need Help?

If you need further assistance:

1. Check the GitHub repository for updates or known issues
2. Open an issue on the GitHub repository
3. Contact the maintainer via GitHub 