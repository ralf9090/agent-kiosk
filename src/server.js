import http from "node:http";
import {
  socialSearch,
  mapsLeads,
  webExtract,
  securityAudit,
  tokenAlpha,
  domainIntel,
  packageAudit,
  academicSearch,
  walletProfiler,
  predictionMarkets,
  defiYields,
  githubIntel,
} from "./providers.js";
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
  {
    name: "token_alpha",
    description:
      "Real-time crypto & DeFi order-flow intelligence. Analyzes buy vs. sell transaction pressure, liquidity depth, volume velocity, FDV, and top DEX pools for any token ticker or contract address.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Token symbol (e.g., 'AERO', 'PEPE', 'VIRTUAL') or contract address (0x...)",
        },
        chain: {
          type: "string",
          enum: ["all", "base", "ethereum", "solana", "arbitrum", "bsc"],
          description: "Optional chain filter (default: 'all')",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "domain_intel",
    description:
      "B2B company & domain infrastructure intelligence. Resolves DNS records (A, MX, TXT, NS), identifies email provider (Google Workspace, M365, etc.), detects SaaS tech stack from TXT verification records, queries RDAP registration dates, and discovers active subdomains.",
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Target company domain or URL (e.g., 'stripe.com', 'vercel.com')",
        },
      },
      required: ["domain"],
    },
  },
  {
    name: "package_audit",
    description:
      "Open-source package & CVE security scanner for coding agents. Checks npm, PyPI, or Rust crates against Google OSV.dev for known security vulnerabilities, deprecation status, and latest stable version.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Package name (e.g., 'lodash', 'express', 'requests', 'tokio')",
        },
        ecosystem: {
          type: "string",
          enum: ["npm", "pypi", "crates.io"],
          description: "Package registry ecosystem (default: 'npm')",
        },
        version: {
          type: "string",
          description: "Optional specific version to audit (defaults to latest version)",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "academic_search",
    description:
      "Deep scientific & academic research tool. Queries OpenAlex and arXiv for peer-reviewed papers and preprints, returning citation counts, reconstructed abstracts, authors, and direct Open-Access PDF links.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Research topic or scientific query (e.g., 'autonomous AI agents', 'zero knowledge proofs')",
        },
        limit: {
          type: "number",
          description: "Number of papers to return (1-15, default: 5)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "wallet_profiler",
    description:
      "Multi-chain whale & wallet portfolio profiler across Base, Ethereum, Arbitrum, and Polygon. Returns live USDC and native ETH/POL balances, total outgoing transaction counts (nonce), wallet tier (Whale/Trader/Retail), and smart contract vs EOA detection.",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "0x... 40-hex EVM wallet or contract address to profile",
        },
      },
      required: ["address"],
    },
  },
  {
    name: "prediction_markets",
    description:
      "Query live prediction market odds & real-money implied probabilities (%) from Polymarket and Manifold Markets for any crypto, macro-economic, political, or technology event.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Event or topic to search (e.g., 'bitcoin', 'fed rate', 'AI', 'election')",
        },
        limit: {
          type: "number",
          description: "Number of markets to return (1-15, default: 5)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "defi_yields",
    description:
      "DeFi highest APY & yield radar powered by DeFiLlama. Finds top lending and liquidity pools for any token (USDC, ETH, USDT, WBTC) filtered by blockchain and minimum TVL.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Token symbol to earn yield on (default: 'USDC')",
        },
        chain: {
          type: "string",
          description: "Blockchain name such as 'Base', 'Ethereum', 'Arbitrum', 'Solana', or 'all' (default: 'Base')",
        },
        min_tvl_usd: {
          type: "number",
          description: "Minimum pool TVL in USD for safety filtering (default: 100000)",
        },
        limit: {
          type: "number",
          description: "Number of top pools to return (1-20, default: 5)",
        },
      },
    },
  },
  {
    name: "github_intel",
    description:
      "GitHub repository & open-source competitive intelligence. Pass 'owner/repo' for deep repository metrics and latest releases, or a keyword topic to find the fastest-growing repositories.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Repository 'owner/repo' (e.g., 'vercel/next.js') OR search topic (e.g., 'mcp server')",
        },
        limit: {
          type: "number",
          description: "Number of repositories when searching by topic (1-15, default: 5)",
        },
      },
      required: ["query"],
    },
  },
];

const ROUTE_HANDLERS = {
  "/v1/social-search": socialSearch,
  "/v1/maps-leads": mapsLeads,
  "/v1/web-extract": webExtract,
  "/v1/security-audit": securityAudit,
  "/v1/token-alpha": tokenAlpha,
  "/v1/domain-intel": domainIntel,
  "/v1/package-audit": packageAudit,
  "/v1/academic-search": academicSearch,
  "/v1/wallet-profiler": walletProfiler,
  "/v1/prediction-markets": predictionMarkets,
  "/v1/defi-yields": defiYields,
  "/v1/github-intel": githubIntel,
};

const TOOL_TO_ROUTE = {
  social_search: "/v1/social-search",
  maps_leads: "/v1/maps-leads",
  web_extract: "/v1/web-extract",
  security_audit: "/v1/security-audit",
  token_alpha: "/v1/token-alpha",
  domain_intel: "/v1/domain-intel",
  package_audit: "/v1/package-audit",
  academic_search: "/v1/academic-search",
  wallet_profiler: "/v1/wallet-profiler",
  prediction_markets: "/v1/prediction-markets",
  defi_yields: "/v1/defi-yields",
  github_intel: "/v1/github-intel",
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
      const lines = [
        "# Agent Kiosk — 8-in-1 Autonomous B2A Data, Market Alpha & Security Supermarket (x402 v2 & MCP)",
        "",
        "> No sign-up, no monthly subscription. Autonomous AI agents can query 8 specialized intelligence tools using HTTP x402 v2 (Base USDC) or Model Context Protocol (MCP).",
        "",
        "## Endpoints",
        ...Object.entries(PRICING).map(
          ([route, info]) => `- POST ${baseUrl}${route} ($${info.priceUsd} USDC): ${info.description}`
        ),
        `- POST ${baseUrl}/mcp : Model Context Protocol (JSON-RPC 2.0) server endpoint (8 tools).`,
        `- GET ${baseUrl}/openapi.json : OpenAPI 3.1 specification.`,
      ];
      return res.end(lines.join("\n"));
    }

    // 2. OpenAPI 3.1 Spec with full input & output schemas for all 8 endpoints
    if (req.method === "GET" && pathname === "/openapi.json") {
      const openApiPaths = {};
      for (const tool of MCP_TOOLS) {
        const route = TOOL_TO_ROUTE[tool.name];
        const priceInfo = PRICING[route];
        openApiPaths[route] = {
          post: {
            operationId: tool.name,
            summary: priceInfo.description,
            "x-payment-info": {
              protocols: [{ x402: {} }],
              price: { mode: "fixed", currency: "USD", amount: priceInfo.priceUsd },
            },
            requestBody: {
              required: true,
              content: { "application/json": { schema: tool.inputSchema } },
            },
            responses: {
              200: STANDARD_200_RESPONSE,
              402: { description: `x402 v2 Payment Required ($${priceInfo.priceUsd} USDC on Base)` },
            },
          },
        };
      }

      return sendJson(res, 200, {
        openapi: "3.1.0",
        info: {
          title: "Agent Kiosk B2A API",
          version: "2.2.0",
          description:
            "8-in-1 Pay-Per-Call Intelligence Supermarket for AI Agents: Social Search, Business Leads, Clean Web Extraction, Smart Contract Security, DeFi Order-Flow Alpha, Domain Intelligence, Package CVE Audits, and Academic Research via x402 v2 (Base USDC) and MCP.",
          contact: {
            name: "Agent Kiosk Support",
            email: "ralf9090@users.noreply.github.com",
            url: "https://github.com/ralf9090/agent-kiosk",
          },
          "x-guidance":
            "Call any /v1/* endpoint via POST with JSON body. Unauthenticated requests return an HTTP 402 challenge with PAYMENT-REQUIRED header on Base (eip155:8453).",
        },
        servers: [{ url: baseUrl }],
        paths: openApiPaths,
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
        version: "2.2.0",
        x402Version: 2,
        description:
          "8-in-1 Autonomous B2A Data, Market Alpha & Security Supermarket via x402 v2 (Base USDC) and MCP.",
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

    // 4. Paid x402 v2 Endpoints (all 8 routes)
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
              serverInfo: { name: "agent-kiosk", version: "2.2.0" },
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

          const hasPaymentAttempt = Boolean(
            req.headers["payment-signature"] || req.headers["x-payment"]
          );
          const auth = await verifyAndSettlePayment(req, mappedRoute, `${baseUrl}${mappedRoute}`);

          if (!auth.authorized && hasPaymentAttempt) {
            return sendJson(res, 402, auth.challenge, {
              "PAYMENT-REQUIRED": auth.challengeHeader,
            });
          }

          if (!auth.authorized) {
            // Freemium Teaser Mode for MCP (Smithery / Cursor / Claude):
            // Returns HTTP 200 OK with 1 teaser item + exact x402 USDC payment instructions to unlock full data
            const teaserArgs = { ...args, limit: 2, max_length: 600 };
            const rawPreview = await ROUTE_HANDLERS[mappedRoute](teaserArgs);
            const priceUsd = PRICING[mappedRoute]?.priceUsd || "0.02";
            const lockNote = `[LOCKED — Pay $${priceUsd} USDC on Base via x402 POST ${baseUrl}${mappedRoute} to unlock full dataset]`;

            const teaserPayload = {
              tier: "FREE_MCP_TEASER_PREVIEW",
              notice: `Showing limited preview. Unlock full unmasked results (up to 25 items, phone numbers, full markdown & alpha signals) by calling POST ${baseUrl}${mappedRoute} with x402 v2 payment ($${priceUsd} USDC on Base).`,
              preview_data: {
                ...rawPreview,
                items: rawPreview.items ? rawPreview.items.slice(0, 1) : undefined,
                leads: rawPreview.leads
                  ? rawPreview.leads.slice(0, 1).map((l) => ({
                      ...l,
                      phone: l.phone ? lockNote : null,
                      email: l.email ? lockNote : null,
                    }))
                  : undefined,
                top_pools: rawPreview.top_pools ? rawPreview.top_pools.slice(0, 1) : undefined,
                pools: rawPreview.pools ? rawPreview.pools.slice(0, 1) : undefined,
                papers: rawPreview.papers ? rawPreview.papers.slice(0, 1) : undefined,
                markets: rawPreview.markets ? rawPreview.markets.slice(0, 1) : undefined,
                repositories: rawPreview.repositories ? rawPreview.repositories.slice(0, 1) : undefined,
                active_subdomains: rawPreview.active_subdomains
                  ? rawPreview.active_subdomains.slice(0, 2)
                  : undefined,
                llm_markdown: rawPreview.llm_markdown
                  ? `${rawPreview.llm_markdown.slice(0, 450)}\n\n... ${lockNote}`
                  : undefined,
              },
              x402_unlock_full_data: {
                endpoint: `${baseUrl}${mappedRoute}`,
                method: "POST",
                price_usdc: priceUsd,
                network: CONFIG.network,
                usdc_contract: CONFIG.usdcAsset,
                pay_to_wallet: CONFIG.payToWallet,
                payment_required_challenge: auth.challenge,
              },
            };

            return sendJson(
              res,
              200,
              {
                jsonrpc: "2.0",
                id,
                result: {
                  content: [{ type: "text", text: JSON.stringify(teaserPayload, null, 2) }],
                },
              },
              { "PAYMENT-REQUIRED": auth.challengeHeader }
            );
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
