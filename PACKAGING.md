# Publishing JIRA MCP Server as an NPM Package

This guide explains how to package and publish the JIRA MCP Server as an npm package for easy distribution and installation.

## Prerequisites

1. A GitHub account with access to this repository
2. An npm account with publish permissions
3. GitHub repository secrets configured (`NPM_TOKEN`)

## Publishing Automatically via GitHub Actions

### Option 1: Push to Main/Master Branch

The simplest way to publish a new version is to push changes to the main/master branch. The GitHub Action will:

1. Automatically detect changes
2. Determine the appropriate version bump based on commit messages:
   - Commits containing "BREAKING" or "MAJOR" trigger a major version bump
   - Commits containing "feat", "feature", or "minor" trigger a minor version bump
   - All other commits trigger a patch version bump
3. Tag the new version in Git
4. Publish the package to npm and GitHub Packages

### Option 2: Create a Release

1. Go to the GitHub repository page
2. Click on "Releases" in the right sidebar
3. Click "Create a new release"
4. Choose a tag version (e.g., `v1.0.0`)
5. Fill in the release title and description
6. Click "Publish release"

The GitHub Action will automatically trigger and publish the package to npm with the version from the release tag.

### Option 3: Manual Trigger

1. Go to the GitHub repository page
2. Navigate to the "Actions" tab
3. Select the "Publish NPM Package" workflow
4. Click "Run workflow"
5. Optionally specify a version override (e.g., `1.0.1`)
6. Click "Run workflow"

The GitHub Action will run and publish the package with the specified version.

## What the Publishing Process Does

The GitHub Actions workflow automates the following:

1. Checks out the repository code
2. Sets up Node.js and pnpm
3. Updates the package.json with the following changes:
   - Renames the package to `@answerai/jira-mcp` for npm and `@bradtaylor/jira-mcp` for GitHub Packages
   - Sets the version based on commit messages, release tag, or manually specified version
   - Adds `publishConfig` to make the package public
   - Updates repository information
   - Adds binary field for CLI usage
4. Builds the project
5. Creates a simplified README for the npm package
6. Publishes to npm Registry
7. Publishes to GitHub Packages
8. Creates a git tag for the new version (for push to main/master)

## Installing and Using the Published Package

After publishing, users can install the package globally:

```bash
npm install -g @answerai/jira-mcp
```

Then configure their Claude Desktop or Cline client with:

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

## Setting Up Repository Secrets

For the GitHub Action to work properly, you need to set up the following repository secrets:

1. Go to the repository settings
2. Navigate to "Secrets and variables" → "Actions"
3. Add the following secret:
   - `NPM_TOKEN`: Your npm authentication token

To generate an npm token:

1. Log in to your npm account via the command line: `npm login`
2. Create a new access token: `npm token create`
3. Save the token securely and add it to GitHub repository secrets

## Versioning Strategy

We follow Semantic Versioning (SemVer):

- **Major version (X.0.0)**: Breaking changes
- **Minor version (0.X.0)**: New features, no breaking changes
- **Patch version (0.0.X)**: Bug fixes and minor improvements

When committing changes, use these prefixes in your commit messages to control the version bump:

- `BREAKING: ` or `MAJOR: ` for major version bumps
- `feat: `, `feature: `, or `minor: ` for minor version bumps
- Any other commit message will result in a patch version bump

## Troubleshooting Publishing Issues

If you encounter publishing issues:

1. Check the GitHub Actions logs for specific error messages
2. Verify that your npm token has the correct permissions
3. Ensure you have proper access to the npm organization
4. Check that the package name is not already taken
5. Verify the version number is higher than the previous published version
