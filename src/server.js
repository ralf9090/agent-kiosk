import http from "node:http";
import { socialSearch, mapsLeads, webExtract, securityAudit } from "./providers.js";
import { CONFIG, PRICING, verifyAndSettlePayment } from "./x402.js";

const PORT = Number(process.env.PORT || 4020);

const FAVICON_ICO = Buffer.from(
  "AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAQAQAAAAAAAAAAAAAAAAAAAAAAAD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A",
  "base64"
);

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
  {
    name: "web_extract",
    description:
      "Extract clean, LLM-ready Markdown from any web URL while automatically scanning the page for hidden Prompt Injection traps targeting AI agents.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Full URL to extract (must start with http:// or https://)",
        },
        max_length: {
          type: "number",
          description: "Maximum markdown character length to return (500-25000, default: 8000)",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "security_audit",
    description:
      "Pre-flight security and scam radar for AI agents. Audits 0x smart contracts/tokens (honeypot check, buy/sell tax, mintable risk, DEX liquidity via GoPlus & DexScreener) or web URLs (phishing, wallet drainers, prompt injection).",
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "0x... token/contract address OR https://... URL to audit",
        },
        chain: {
          type: "string",
          enum: ["base", "ethereum", "bsc", "arbitrum", "polygon", "optimism"],
          description: "Blockchain network when target is a 0x address (default: 'base')",
        },
      },
      required: ["target"],
    },
  },
];

const ROUTE_HANDLERS = {
  "/v1/social-search": socialSearch,
  "/v1/maps-leads": mapsLeads,
  "/v1/web-extract": webExtract,
  "/v1/security-audit": securityAudit,
};

const TOOL_TO_ROUTE = {
  social_search: "/v1/social-search",
  maps_leads: "/v1/maps-leads",
  web_extract: "/v1/web-extract",
  security_audit: "/v1/security-audit",
};

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
    "Access-Control-Allow-Headers":
      "Content-Type, PAYMENT-SIGNATURE, X-PAYMENT, X-API-KEY, Authorization",
    "Access-Control-Expose-Headers":
      "PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-PAYMENT-RESPONSE",
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload, null, 2));
}

const STANDARD_200_RESPONSE = {
  description: "Successful structured agent response",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          payment_mode: { type: "string" },
          data: { type: "object" },
        },
        required: ["ok", "data"],
      },
    },
  },
};

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

    // 0. Favicon for x402scan icon verification
    if (req.method === "GET" && pathname === "/favicon.ico") {
      res.writeHead(200, {
        "Content-Type": "image/x-icon",
        "Cache-Control": "public, max-age=86400",
      });
      return res.end(FAVICON_ICO);
    }

    // 1. Agent Discovery: /llms.txt
    if (req.method === "GET" && pathname === "/llms.txt") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end(
        [
          "# Agent Kiosk — Instant Pay-Per-Call Data & Security API (x402 v2 & MCP)",
          "",
          "> No sign-up, no monthly subscription. Autonomous AI agents can query live social discussions, verified business leads, clean web markdown, and on-chain token/URL security audits using HTTP x402 v2 (Base USDC) or MCP.",
          "",
          "## Endpoints",
          `- POST ${baseUrl}/v1/social-search ($${PRICING["/v1/social-search"].priceUsd} USDC): Live Reddit & HackerNews discussions in clean JSON/Markdown.`,
          `- POST ${baseUrl}/v1/maps-leads ($${PRICING["/v1/maps-leads"].priceUsd} USDC): Business name, phone, website, address, and coordinates.`,
          `- POST ${baseUrl}/v1/web-extract ($${PRICING["/v1/web-extract"].priceUsd} USDC): Clean URL-to-Markdown extractor with Prompt Injection detection.`,
          `- POST ${baseUrl}/v1/security-audit ($${PRICING["/v1/security-audit"].priceUsd} USDC): 0x Token/Contract Honeypot & URL Phishing/Injection scanner.`,
          `- POST ${baseUrl}/mcp : Model Context Protocol (JSON-RPC 2.0) server endpoint.`,
          `- GET ${baseUrl}/openapi.json : OpenAPI 3.1 specification.`,
        ].join("\n")
      );
    }

    // 2. OpenAPI 3.1 Spec with full input & output schemas (zero warnings on x402scan)
    if (req.method === "GET" && pathname === "/openapi.json") {
      return sendJson(res, 200, {
        openapi: "3.1.0",
        info: {
          title: "Agent Kiosk B2A API",
          version: "2.1.0",
          description:
            "Instant Pay-Per-Call Social Search, Local Business Leads, Clean Web Extraction, and On-Chain/URL Security Audits for AI Agents via x402 v2 (Base USDC) and MCP.",
          contact: {
            name: "Agent Kiosk Support",
            email: "ralf9090@users.noreply.github.com",
            url: "https://github.com/ralf9090/agent-kiosk",
          },
          "x-guidance":
            "Call POST /v1/social-search, /v1/maps-leads, /v1/web-extract, or /v1/security-audit. Unauthenticated requests return an HTTP 402 challenge with PAYMENT-REQUIRED header on Base (eip155:8453).",
        },
        servers: [{ url: baseUrl }],
        paths: {
          "/v1/social-search": {
            post: {
              operationId: "socialSearch",
              summary: PRICING["/v1/social-search"].description,
              "x-payment-info": {
                protocols: [{ x402: {} }],
                price: { mode: "fixed", currency: "USD", amount: PRICING["/v1/social-search"].priceUsd },
              },
              requestBody: {
                required: true,
                content: { "application/json": { schema: MCP_TOOLS[0].inputSchema } },
              },
              responses: {
                200: STANDARD_200_RESPONSE,
                402: { description: "x402 v2 Payment Required ($0.02 USDC on Base)" },
              },
            },
          },
          "/v1/maps-leads": {
            post: {
              operationId: "mapsLeads",
              summary: PRICING["/v1/maps-leads"].description,
              "x-payment-info": {
                protocols: [{ x402: {} }],
                price: { mode: "fixed", currency: "USD", amount: PRICING["/v1/maps-leads"].priceUsd },
              },
              requestBody: {
                required: true,
                content: { "application/json": { schema: MCP_TOOLS[1].inputSchema } },
              },
              responses: {
                200: STANDARD_200_RESPONSE,
                402: { description: "x402 v2 Payment Required ($0.03 USDC on Base)" },
              },
            },
          },
          "/v1/web-extract": {
            post: {
              operationId: "webExtract",
              summary: PRICING["/v1/web-extract"].description,
              "x-payment-info": {
                protocols: [{ x402: {} }],
                price: { mode: "fixed", currency: "USD", amount: PRICING["/v1/web-extract"].priceUsd },
              },
              requestBody: {
                required: true,
                content: { "application/json": { schema: MCP_TOOLS[2].inputSchema } },
              },
              responses: {
                200: STANDARD_200_RESPONSE,
                402: { description: "x402 v2 Payment Required ($0.01 USDC on Base)" },
              },
            },
          },
          "/v1/security-audit": {
            post: {
              operationId: "securityAudit",
              summary: PRICING["/v1/security-audit"].description,
              "x-payment-info": {
                protocols: [{ x402: {} }],
                price: { mode: "fixed", currency: "USD", amount: PRICING["/v1/security-audit"].priceUsd },
              },
              requestBody: {
                required: true,
                content: { "application/json": { schema: MCP_TOOLS[3].inputSchema } },
              },
              responses: {
                200: STANDARD_200_RESPONSE,
                402: { description: "x402 v2 Payment Required ($0.02 USDC on Base)" },
              },
            },
          },
        },
      });
    }

    // 3. A2A & x402 Discovery Manifests
    if (
      req.method === "GET" &&
      (pathname === "/.well-known/agent.json" ||
        pathname === "/.well-known/x402.json" ||
        pathname === "/.well-known/x402" ||
        pathname === "/")
    ) {
      return sendJson(res, 200, {
        name: "Agent Kiosk",
        version: "2.1.0",
        x402Version: 2,
        description:
          "Autonomous B2A Data & Security Vending Machine: Social Search, Business Leads, Web Markdown Extractor, and Smart Contract/URL Security Radar via x402 v2 and MCP.",
        protocols: ["x402", "mcp", "rest"],
        payment: {
          network: CONFIG.network,
          asset: CONFIG.usdcAsset,
          payTo: CONFIG.payToWallet,
        },
        resources: Object.keys(ROUTE_HANDLERS).map((r) => `${baseUrl}${r}`),
        endpoints: PRICING,
        mcp: {
          endpoint: `${baseUrl}/mcp`,
          tools: MCP_TOOLS.map((t) => t.name),
        },
      });
    }

    // 4. Paid x402 v2 Endpoints (all 4 routes)
    if ((req.method === "POST" || req.method === "GET") && ROUTE_HANDLERS[pathname]) {
      const resourceUrl = `${baseUrl}${pathname}`;
      const auth = await verifyAndSettlePayment(req, pathname, resourceUrl);

      if (!auth.authorized) {
        return sendJson(res, auth.statusCode, auth.challenge, {
          "PAYMENT-REQUIRED": auth.challengeHeader,
        });
      }

      try {
        const body =
          req.method === "POST"
            ? await readJsonBody(req)
            : Object.fromEntries(urlObj.searchParams.entries());

        const data = await ROUTE_HANDLERS[pathname](body);

        const extraHeaders = auth.settlementHeader
          ? {
              "PAYMENT-RESPONSE": auth.settlementHeader,
              "X-PAYMENT-RESPONSE": auth.settlementHeader,
            }
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

    // 5. MCP HTTP Endpoint (JSON-RPC 2.0)
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
              capabilities: { tools: {}, resources: {}, prompts: {} },
              serverInfo: { name: "agent-kiosk", version: "2.1.0" },
            },
          });
        }

        if (method === "notifications/initialized") {
          return sendJson(res, 200, { ok: true });
        }

        if (method === "tools/list") {
          return sendJson(res, 200, {
            jsonrpc: "2.0",
            id,
            result: { tools: MCP_TOOLS },
          });
        }

        if (method === "resources/list") {
          return sendJson(res, 200, {
            jsonrpc: "2.0",
            id,
            result: { resources: [] },
          });
        }

        if (method === "prompts/list") {
          return sendJson(res, 200, {
            jsonrpc: "2.0",
            id,
            result: { prompts: [] },
          });
        }

        if (method === "tools/call") {
          const toolName = params?.name;
          const args = params?.arguments || {};
          const mappedRoute = TOOL_TO_ROUTE[toolName];

          if (!mappedRoute) {
            return sendJson(res, 200, {
              jsonrpc: "2.0",
              id,
              error: { code: -32601, message: `Unknown tool: ${toolName}` },
            });
          }

          const auth = await verifyAndSettlePayment(req, mappedRoute, `${baseUrl}/mcp`);
          if (!auth.authorized) {
            return sendJson(res, 402, auth.challenge, {
              "PAYMENT-REQUIRED": auth.challengeHeader,
            });
          }

          const output = await ROUTE_HANDLERS[mappedRoute](args);

          const extraHeaders = auth.settlementHeader
            ? {
                "PAYMENT-RESPONSE": auth.settlementHeader,
                "X-PAYMENT-RESPONSE": auth.settlementHeader,
              }
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
