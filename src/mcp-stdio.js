#!/usr/bin/env node
/**
 * Standard MCP stdio server for local/registry integration (Smithery, Cursor, Claude Desktop)
 */
import readline from "node:readline";
import { MCP_TOOLS } from "./server.js";
import { socialSearch, mapsLeads, webExtract, securityAudit } from "./providers.js";

const HANDLERS = {
  social_search: socialSearch,
  maps_leads: mapsLeads,
  web_extract: webExtract,
  security_audit: securityAudit,
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function sendRpc(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

rl.on("line", async (line) => {
  if (!line.trim()) return;
  try {
    const rpc = JSON.parse(line);
    const { id, method, params } = rpc;

    if (method === "initialize") {
      return sendRpc({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {}, resources: {}, prompts: {} },
          serverInfo: { name: "agent-kiosk", version: "2.1.0" },
        },
      });
    }

    if (method === "notifications/initialized") {
      return;
    }

    if (method === "tools/list") {
      return sendRpc({
        jsonrpc: "2.0",
        id,
        result: { tools: MCP_TOOLS },
      });
    }

    if (method === "resources/list") {
      return sendRpc({
        jsonrpc: "2.0",
        id,
        result: { resources: [] },
      });
    }

    if (method === "prompts/list") {
      return sendRpc({
        jsonrpc: "2.0",
        id,
        result: { prompts: [] },
      });
    }

    if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments || {};
      const fn = HANDLERS[toolName];
      if (!fn) {
        return sendRpc({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Unknown tool: ${toolName}` },
        });
      }

      const output = await fn(args);
      return sendRpc({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        },
      });
    }
  } catch (err) {
    sendRpc({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: err.message },
    });
  }
});
