#!/usr/bin/env node
/**
 * Standard MCP stdio server for local/registry integration (Smithery, Cursor, Claude Desktop)
 */
import readline from "node:readline";
import { MCP_TOOLS } from "./server.js";
import { socialSearch, mapsLeads } from "./providers.js";

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
          capabilities: { tools: {} },
          serverInfo: { name: "agent-kiosk", version: "1.0.0" },
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

    if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments || {};
      const output =
        toolName === "social_search"
          ? await socialSearch(args)
          : await mapsLeads(args);

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
