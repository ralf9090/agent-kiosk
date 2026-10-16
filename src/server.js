import http from "node:http";
import { socialSearch, mapsLeads } from "./providers.js";
import { CONFIG, PRICING, verifyAndSettlePayment } from "./x402.js";

const PORT = Number(process.env.PORT || 4020);

export const MCP_TOOLS = [
  {
    name: "social_search",
    description:
      "Search live social media discussions (Reddit, HackerNews, tech forums) for any topic, product, or trend. Returns clean structured JSON and LLM-ready Markdown without rate-limit blocks or API keys.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search keywords or topic (e.g., 'best AI coding agents', 'Stripe alternatives')",
        },
        platform: {
          type: "string",
          enum: ["all", "reddit", "hn"],
          description: "Target social platform (default: 'all')",
        },
        limit: {
          type: "number",
          description: "Number of results to return (1-25, default: 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "maps_leads",
    description:
      "Find local businesses, companies, and places in any city worldwide. Extracts business name, phone number, website URL, address, opening hours, and GPS coordinates for lead generation and verification.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Business type or name (e.g., 'cafe', 'dentist', 'lawyer')",
        },
        location: {
          type: "string",
          description: "City, region, or country (e.g., 'San Francisco', 'London', 'Istanbul')",
        },
        limit: {
          type: "number",
          description: "Number of leads to return (1-25, default: 10)",
        },
      },
      required: ["query"],
    },
  },
];

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error("Payload too large"));
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-PAYMENT, X-API-KEY, Authorization",
    "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload, null, 2));
}

export function createAppServer() {
  return http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      return sendJson(res, 200, { ok: true });
    }

    const proto = (req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
    const host = req.headers.host || `localhost:${PORT}`;
    const baseUrl = `${proto}://${host}`;
    const urlObj = new URL(req.url || "/", baseUrl);
    const pathname = urlObj.pathname;

    // 1. Agent Discovery: /llms.txt
    if (req.method === "GET" && pathname === "/llms.txt") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end(
        [
          "# Agent Kiosk — Instant Pay-Per-Call Data API (x402 & MCP)",
          "",
          "> No sign-up, no monthly subscription. Autonomous AI agents can query live social discussions and verified local business leads using HTTP x402 (Base USDC) or MCP.",
          "",
          "## Endpoints",
          `- POST ${baseUrl}/v1/social-search (${PRICING["/v1/social-search"].priceUsd} USDC via x402): Live Reddit & HackerNews discussions in clean JSON/Markdown.`,
          `- POST ${baseUrl}/v1/maps-leads (${PRICING["/v1/maps-leads"].priceUsd} USDC via x402): Business name, phone, website, address, and coordinates.`,
          `- POST ${baseUrl}/mcp : Model Context Protocol (JSON-RPC 2.0) server endpoint.`,
          `- GET ${baseUrl}/.well-known/x402.json : A2A & x402 machine discovery manifest.`,
        ].join("\n")
      );
    }

    // 2. A2A & x402 Discovery Manifests
    if (
      req.method === "GET" &&
      (pathname === "/.well-known/agent.json" ||
        pathname === "/.well-known/x402.json" ||
        pathname === "/")
    ) {
      return sendJson(res, 200, {
        name: "Agent Kiosk",
        version: "1.0.0",
        description:
          "Autonomous B2A Data Vending Machine: Instant Social Search & Business Leads via x402 and MCP.",
        protocols: ["x402", "mcp", "rest"],
        payment: {
          network: CONFIG.network,
          asset: "USDC",
          payTo: CONFIG.payToWallet,
        },
        endpoints: PRICING,
        mcp: {
          endpoint: `${baseUrl}/mcp`,
          tools: MCP_TOOLS.map((t) => t.name),
        },
      });
    }

    // 3. Paid x402 Endpoints: /v1/social-search and /v1/maps-leads
    if (req.method === "POST" && (pathname === "/v1/social-search" || pathname === "/v1/maps-leads")) {
      const resourceUrl = `${baseUrl}${pathname}`;
      const auth = await verifyAndSettlePayment(req, pathname, resourceUrl);

      if (!auth.authorized) {
        return sendJson(res, auth.statusCode, auth.challenge);
      }

      try {
        const body = await readJsonBody(req);
        const data =
          pathname === "/v1/social-search"
            ? await socialSearch(body)
            : await mapsLeads(body);

        const extraHeaders = auth.settlementHeader
          ? { "X-PAYMENT-RESPONSE": auth.settlementHeader }
          : {};

        return sendJson(
          res,
          200,
          {
            ok: true,
            payment_mode: auth.mode,
            tx_hash: auth.txHash || undefined,
            data,
          },
          extraHeaders
        );
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err.message });
      }
    }

    // 4. MCP HTTP Endpoint (JSON-RPC 2.0)
    // Discovery (initialize & tools/list) is open for registries; execution (tools/call) is gated by x402 / API key!
    if (req.method === "POST" && pathname === "/mcp") {
      try {
        const rpc = await readJsonBody(req);
        const { id, method, params } = rpc;

        if (method === "initialize") {
          return sendJson(res, 200, {
            jsonrpc: "2.0",
            id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: { tools: {} },
              serverInfo: { name: "agent-kiosk", version: "1.0.0" },
            },
          });
        }

        if (method === "tools/list") {
          return sendJson(res, 200, {
            jsonrpc: "2.0",
            id,
            result: { tools: MCP_TOOLS },
          });
        }

        if (method === "tools/call") {
          const toolName = params?.name;
          const args = params?.arguments || {};
          const mappedRoute =
            toolName === "maps_leads" ? "/v1/maps-leads" : "/v1/social-search";

          const auth = await verifyAndSettlePayment(req, mappedRoute, `${baseUrl}/mcp`);
          if (!auth.authorized) {
            return sendJson(res, 402, auth.challenge);
          }

          let output;
          if (toolName === "social_search") {
            output = await socialSearch(args);
          } else if (toolName === "maps_leads") {
            output = await mapsLeads(args);
          } else {
            return sendJson(res, 200, {
              jsonrpc: "2.0",
              id,
              error: { code: -32601, message: `Unknown tool: ${toolName}` },
            });
          }

          const extraHeaders = auth.settlementHeader
            ? { "X-PAYMENT-RESPONSE": auth.settlementHeader }
            : {};

          return sendJson(
            res,
            200,
            {
              jsonrpc: "2.0",
              id,
              result: {
                content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
              },
            },
            extraHeaders
          );
        }

        return sendJson(res, 200, {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Unsupported method: ${method}` },
        });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    return sendJson(res, 404, { error: "Not found. Visit / or /llms.txt for agent documentation." });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createAppServer();
  server.listen(PORT, () => {
    console.log(`Agent Kiosk running on http://localhost:${PORT}`);
  });
}
