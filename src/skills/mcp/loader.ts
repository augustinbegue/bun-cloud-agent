import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import type { ToolSet } from "ai";

export interface MCPSkillConfig {
  name: string;
  transport:
    | { type: "http"; url: string; headers?: Record<string, string> }
    | { type: "stdio"; command: string; args?: string[]; env?: Record<string, string> };
}

/** Active MCP clients for lifecycle management */
const activeClients: MCPClient[] = [];

export async function loadMCPSkills(configs: MCPSkillConfig[]): Promise<ToolSet> {
  const tools: ToolSet = {};

  for (const config of configs) {
    try {
      let client: MCPClient;

      if (config.transport.type === "stdio") {
        const transport = new Experimental_StdioMCPTransport({
          command: config.transport.command,
          args: config.transport.args,
          env: config.transport.env,
        });
        client = await createMCPClient({ transport });
      } else {
        client = await createMCPClient({
          transport: {
            type: "http",
            url: config.transport.url,
            headers: config.transport.headers,
          },
        });
      }

      activeClients.push(client);
      const mcpTools = await client.tools();
      Object.assign(tools, mcpTools);
      console.log(`[mcp] Loaded ${Object.keys(mcpTools).length} tools from ${config.name}`);
    } catch (error) {
      console.error(`[mcp] Failed to load ${config.name}:`, error);
    }
  }

  return tools;
}

export async function closeMCPClients(): Promise<void> {
  for (const client of activeClients) {
    try {
      await client.close();
    } catch {
      // ignore close errors
    }
  }
  activeClients.length = 0;
}
