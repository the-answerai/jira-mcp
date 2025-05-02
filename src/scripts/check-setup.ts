#!/usr/bin/env node

// Check JIRA MCP Server Setup
// This script verifies the environment variables and connection to JIRA

// Required environment variables
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_USER_EMAIL = process.env.JIRA_USER_EMAIL;

// Color codes for terminal output
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";

console.log(`${CYAN}JIRA MCP Server Setup Check${RESET}\n`);

// Check for environment variables
let missingVars = false;

if (!JIRA_API_TOKEN) {
  console.log(`${RED}❌ JIRA_API_TOKEN is missing${RESET}`);
  missingVars = true;
} else {
  console.log(`${GREEN}✓ JIRA_API_TOKEN is set${RESET}`);
}

if (!JIRA_BASE_URL) {
  console.log(`${RED}❌ JIRA_BASE_URL is missing${RESET}`);
  missingVars = true;
} else {
  console.log(`${GREEN}✓ JIRA_BASE_URL is set to ${JIRA_BASE_URL}${RESET}`);
}

if (!JIRA_USER_EMAIL) {
  console.log(`${RED}❌ JIRA_USER_EMAIL is missing${RESET}`);
  missingVars = true;
} else {
  console.log(`${GREEN}✓ JIRA_USER_EMAIL is set to ${JIRA_USER_EMAIL}${RESET}`);
}

if (missingVars) {
  console.log(
    `\n${RED}Environment variables are missing. Please set them in your Claude Desktop or Cline configuration.${RESET}`
  );
  process.exit(1);
}

// Test connection to JIRA
console.log(`\n${CYAN}Testing connection to JIRA...${RESET}`);

// Define interface for JIRA project
interface JiraProject {
  name: string;
  key: string;
}

// Define interface for JIRA user
interface JiraUser {
  displayName: string;
  emailAddress: string;
}

async function testConnection() {
  try {
    // Create auth string for basic authentication
    const authString = `Basic ${Buffer.from(
      `${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}`
    ).toString("base64")}`;

    // Make a test request to JIRA API
    const response = await fetch(`${JIRA_BASE_URL}/rest/api/3/myself`, {
      method: "GET",
      headers: {
        Authorization: authString,
        Accept: "application/json",
      },
    });

    if (response.ok) {
      const userData = (await response.json()) as JiraUser;
      console.log(`${GREEN}✓ Successfully connected to JIRA${RESET}`);
      console.log(
        `${GREEN}✓ Authenticated as: ${userData.displayName} (${userData.emailAddress})${RESET}`
      );

      console.log(`\n${CYAN}Testing JIRA project access...${RESET}`);

      // Test project access
      const projectsResponse = await fetch(
        `${JIRA_BASE_URL}/rest/api/3/project`,
        {
          method: "GET",
          headers: {
            Authorization: authString,
            Accept: "application/json",
          },
        }
      );

      if (projectsResponse.ok) {
        const projects = (await projectsResponse.json()) as JiraProject[];
        console.log(
          `${GREEN}✓ Access to ${projects.length} JIRA projects${RESET}`
        );

        if (projects.length > 0) {
          console.log(`${CYAN}Sample projects:${RESET}`);
          for (const project of projects.slice(0, 3)) {
            console.log(`  - ${project.name} (${project.key})`);
          }
        }

        console.log(
          `\n${GREEN}✅ Setup check complete. The JIRA MCP Server is configured correctly.${RESET}`
        );
      } else {
        console.log(
          `${RED}❌ Could not access JIRA projects. Status: ${projectsResponse.status}${RESET}`
        );
        console.log(
          `${YELLOW}Make sure your API token has sufficient permissions.${RESET}`
        );
      }
    } else {
      console.log(
        `${RED}❌ Failed to connect to JIRA. Status: ${response.status}${RESET}`
      );
      if (response.status === 401) {
        console.log(
          `${YELLOW}Authentication failed. Please check your JIRA_USER_EMAIL and JIRA_API_TOKEN.${RESET}`
        );
      } else if (response.status === 404) {
        console.log(
          `${YELLOW}JIRA instance not found. Please check your JIRA_BASE_URL.${RESET}`
        );
      } else {
        console.log(
          `${YELLOW}Unknown error. Please check your JIRA instance and try again.${RESET}`
        );
      }
    }
  } catch (error) {
    console.log(
      `${RED}❌ Connection error: ${
        error instanceof Error ? error.message : String(error)
      }${RESET}`
    );
    console.log(
      `${YELLOW}Please check your network connection and JIRA_BASE_URL.${RESET}`
    );
  }
}

await testConnection();
