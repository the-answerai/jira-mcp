#!/usr/bin/env node
// Example integration of JIRA MCP Server with LangChain.js

// Import necessary modules
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { ChatAnthropic } from "@langchain/anthropic";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

async function main() {
    try {
        // Set up environment variables for JIRA MCP Server
        // In a real application, these would typically be read from an environment file or passed in
        process.env.JIRA_API_TOKEN = "your_api_token";
        process.env.JIRA_BASE_URL = "your_jira_instance_url";
        process.env.JIRA_USER_EMAIL = "your_email";

        // Create an MCP client configuration for JIRA
        const client = new MultiServerMCPClient({
            mcpServers: {
                // Local JIRA MCP Server setup
                jira: {
                    transport: "stdio",
                    command: "node",
                    args: ["../build/index.js"], // Path to the built JIRA MCP Server
                    // Environment variables will be automatically inherited
                },
            },
            // Optional configuration
            prefixToolNameWithServerName: true, // Tool names will be prefixed with "jira__"
            additionalToolNamePrefix: "mcp", // Final prefix will be "mcp__jira__"
        });

        // Get all available tools
        console.log("Loading MCP tools...");
        const tools = await client.getTools();

        // Log available tools (can be helpful for debugging)
        console.log("\nAvailable tools:");
        for (const tool of tools) {
            console.log(`- ${tool.name}`);
        }

        // Initialize a model with LangChain.js
        console.log("\nInitializing model...");
        const model = new ChatAnthropic({
            apiKey: process.env.ANTHROPIC_API_KEY, // Make sure to set this environment variable
            modelName: "claude-3-opus-20240229", // Or another Claude model of your choice
        });

        // Create a ReAct agent with LangGraph
        console.log("\nCreating ReAct agent...");
        const agent = createReactAgent({
            llm: model,
            tools,
        });

        // Run the agent with a JIRA-related query
        console.log("\nInvoking agent...");
        const response = await agent.invoke({
            messages: [
                {
                    role: "user",
                    content: "Search for all open bugs in the ENG project and give me a summary of the highest priority ones.",
                },
            ],
        });

        // Output the response
        console.log("\nAgent response:");
        console.log(response);
    } catch (error) {
        console.error("Error:", error);
    } finally {
        // Always clean up resources
        if (client) {
            await client.close();
        }
        process.exit(0);
    }
}

// Run the main function
main().catch(console.error); 