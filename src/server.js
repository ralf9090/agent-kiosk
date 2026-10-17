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
  tokenDueDiligence,
  b2bCompanyDossier,
  whaleAlphaRadar,
  complianceCheck,
  defiSwapQuote,
  withCache,
} from "./providers.js";
import {
  CONFIG,
  PRICING,
  verifyAndSettlePayment,
  issuePrepaidPass,
  attestResponse,
} from "./x402.js";

const PORT = Number(process.env.PORT || 4020);

export const TELEMETRY = {
  started_at_utc: new Date().toISOString(),
  total_requests: 0,
  mcp_discoveries: 0,
  mcp_teaser_previews: 0,
  x402_challenges_issued: 0,
  paid_calls_succeeded: 0,
  by_route: {},
  recent_events: [],
};

function recordTelemetry(type, route, req, detail = "") {
  if (route) {
    if (!TELEMETRY.by_route[route]) {
      TELEMETRY.by_route[route] = { challenges: 0, teasers: 0, paid: 0 };
    }
    if (type === "x402_challenge") TELEMETRY.by_route[route].challenges += 1;
    if (type === "mcp_teaser") TELEMETRY.by_route[route].teasers += 1;
    if (type === "paid_call") TELEMETRY.by_route[route].paid += 1;
  }
  const ua = String(req?.headers?.["user-agent"] || "unknown-agent").slice(0, 70);
  TELEMETRY.recent_events.unshift({
    time_utc: new Date().toISOString(),
    type,
    route: route || req?.url || "/",
    detail,
    user_agent: ua,
  });
  if (TELEMETRY.recent_events.length > 25) {
    TELEMETRY.recent_events.length = 25;
  }
}

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
  {
    name: "token_due_diligence",
    description:
      "Institutional 3-in-1 Token Due Diligence Report ($0.10 USDC). Combines GoPlus on-chain honeypot/tax security audit, DexScreener DEX order-flow alpha & liquidity depth, and live Reddit/HN social sentiment into a composite investment grade (A-F).",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Token symbol (e.g., 'AERO', 'VIRTUAL', 'PEPE') or 0x contract address",
        },
        chain: {
          type: "string",
          enum: ["base", "ethereum", "solana", "arbitrum", "bsc", "all"],
          description: "Blockchain network (default: 'base')",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "b2b_company_dossier",
    description:
      "Complete 4-in-1 B2B Sales & Competitive Intelligence Dossier ($0.10 USDC). Combines DNS/MX/SaaS tech stack infrastructure, clean website extraction, local business contact/phone leads, and live social mentions.",
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Company domain name (e.g., 'stripe.com', 'vercel.com')",
        },
        company: {
          type: "string",
          description: "Optional company brand name (e.g., 'Stripe')",
        },
        location: {
          type: "string",
          description: "Optional HQ or target city for physical lead lookup (default: 'San Francisco')",
        },
      },
      required: ["domain"],
    },
  },
  {
    name: "whale_alpha_radar",
    description:
      "Complete Multi-Chain Whale Portfolio & DeFi Yield Optimizer Report ($0.10 USDC). Profiles any 0x wallet across 4 EVM chains (Base, Ethereum, Arbitrum, Polygon), matches idle USDC/ETH balances against top DeFiLlama yield pools, and calculates projected annual yield.",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "0x... 40-hex EVM wallet address to profile and optimize",
        },
      },
      required: ["address"],
    },
  },
  {
    name: "compliance_check",
    description:
      "Institutional AML, Sanctions (OFAC), Phishing, Mixer, and Malicious Counterparty Compliance Screening ($0.05 USDC). Screens any 0x EVM address against GoPlus Security (Base + Ethereum) and 4-chain RPC footprint before autonomous agents execute transfers.",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "0x... 40-hex EVM wallet or contract address to screen for AML/sanctions",
        },
      },
      required: ["address"],
    },
  },
  {
    name: "defi_swap_quote",
    description:
      "Executable DeFi Swap & Cross-Chain Bridge Action Calldata Builder ($0.05 USDC). Queries LI.FI and ParaSwap aggregators to compute the best DEX/Bridge route and returns ready-to-sign EVM transaction calldata (to, data, value, gasLimit) on Base, Ethereum, Arbitrum, Polygon, and Optimism.",
    inputSchema: {
      type: "object",
      properties: {
        from_token: {
          type: "string",
          description: "Source token symbol (e.g., 'USDC', 'ETH', 'AERO') or 0x contract address",
        },
        to_token: {
          type: "string",
          description: "Destination token symbol (e.g., 'ETH', 'USDC', 'AERO', 'cbBTC') or 0x address",
        },
        amount: {
          type: "string",
          description: "Amount of from_token to swap (human-readable e.g. '10' or atomic units)",
        },
        from_chain: {
          type: "string",
          enum: ["base", "ethereum", "arbitrum", "polygon", "optimism"],
          description: "Source blockchain network (default: 'base')",
        },
        to_chain: {
          type: "string",
          enum: ["base", "ethereum", "arbitrum", "polygon", "optimism"],
          description: "Destination blockchain network (default: same as from_chain)",
        },
        wallet: {
          type: "string",
          description: "Optional 0x sender wallet address for transaction simulation",
        },
      },
      required: ["from_token", "to_token"],
    },
  },
  {
    name: "buy_prepaid_pass",
    description:
      "Mint a 30-Day Prepaid API Key Pass (ak_live_...) for $5.00 USDC on Base via x402. Unlocks all 18 Agent Kiosk REST & MCP intelligence tools for 30 days via the X-API-KEY header without per-call x402 signing (ideal for LangChain, n8n, Make.com, OpenAI Actions, and Python/JS bots).",
    inputSchema: {
      type: "object",
      properties: {
        agent_name: {
          type: "string",
          description: "Optional identifier or name for your agent/workflow",
        },
      },
    },
  },
  {
    name: "x402_ping",
    description:
      "Ultra-low-cost ($0.001 USDC) x402 v2 & v1 wallet verification ping, payment settlement test, latency check, and round-trip echo endpoint on Base Mainnet.",
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Optional message string to echo back upon verified settlement",
        },
      },
    },
  },
].map((tool) => ({
  ...tool,
  annotations: {
    title: tool.name
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" "),
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
}));

async function pingHandler(params = {}, auth = null) {
  const echoMsg = String(params.message || params.ping || params.q || "hello-x402").trim();
  return {
    status: "pong",
    verified: Boolean(auth && auth.authorized),
    payment_mode: auth?.mode || "preview",
    service: "Agent Kiosk",
    version: "2.5.0",
    protocol: "x402 v2 & v1 + MCP (Attested)",
    network: CONFIG.network,
    asset: "USDC",
    echo: echoMsg,
    payer: auth?.payer || null,
    tx_hash: auth?.txHash || null,
    server_time_utc: new Date().toISOString(),
    catalog_summary: {
      total_endpoints: 19,
      core_tools_usdc: "0.01 - 0.03",
      action_and_compliance_usdc: "0.05 (/v1/defi-swap-quote, /v1/compliance-check)",
      mega_combo_dossiers_usdc: "0.10 (/v1/token-due-diligence, /v1/b2b-company-dossier, /v1/whale-alpha-radar)",
      prepaid_30d_pass_usdc: "5.00 (/v1/buy-pass)",
    },
  };
}

async function buyPassHandler(params = {}, auth = null) {
  if (!auth || !auth.authorized) {
    return {
      status: "PAYMENT_REQUIRED_FOR_LIVE_KEY",
      tier: "PRO_30D_PASS",
      price_usdc: "5.00",
      valid_days: 30,
      api_key:
        "[LOCKED — Send POST /v1/buy-pass with $5.00 USDC x402 payment on Base to mint your live 30-day ak_live_... API key]",
      usage_instructions:
        "Once minted, pass header 'X-API-KEY: ak_live_...' on any /v1/* or /mcp request to unlock full unmasked data for 30 days without signing individual x402 transactions.",
    };
  }
  const issued = issuePrepaidPass({
    payer: auth.payer || params.agent_name || "x402-buyer",
    txHash: auth.txHash || null,
    days: 30,
  });
  return {
    ...issued,
    usage_instructions:
      "Pass header 'X-API-KEY: " +
      issued.api_key +
      "' (or 'Authorization: Bearer " +
      issued.api_key +
      "') on any POST /v1/* or POST /mcp request to receive full unmasked datasets for 30 days.",
  };
}

function cachedProvider(name, fn, ttlMs = 45_000) {
  return async (params = {}) => {
    const key = `prov:${name}:${JSON.stringify(params)}`;
    return withCache(key, ttlMs, () => fn(params));
  };
}

const ROUTE_HANDLERS = {
  "/v1/ping": pingHandler,
  "/v1/social-search": cachedProvider("social", socialSearch, 45_000),
  "/v1/maps-leads": cachedProvider("maps", mapsLeads, 120_000),
  "/v1/web-extract": cachedProvider("web", webExtract, 90_000),
  "/v1/security-audit": cachedProvider("sec", securityAudit, 60_000),
  "/v1/token-alpha": cachedProvider("alpha", tokenAlpha, 30_000),
  "/v1/domain-intel": cachedProvider("domain", domainIntel, 180_000),
  "/v1/package-audit": cachedProvider("pkg", packageAudit, 180_000),
  "/v1/academic-search": cachedProvider("acad", academicSearch, 180_000),
  "/v1/wallet-profiler": cachedProvider("wallet", walletProfiler, 45_000),
  "/v1/prediction-markets": cachedProvider("pred", predictionMarkets, 45_000),
  "/v1/defi-yields": cachedProvider("yields", defiYields, 90_000),
  "/v1/github-intel": cachedProvider("gh", githubIntel, 120_000),
  "/v1/token-due-diligence": tokenDueDiligence,
  "/v1/b2b-company-dossier": b2bCompanyDossier,
  "/v1/whale-alpha-radar": whaleAlphaRadar,
  "/v1/compliance-check": complianceCheck,
  "/v1/defi-swap-quote": defiSwapQuote,
  "/v1/buy-pass": buyPassHandler,
};

const TOOL_TO_ROUTE = {
  x402_ping: "/v1/ping",
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
  token_due_diligence: "/v1/token-due-diligence",
  b2b_company_dossier: "/v1/b2b-company-dossier",
  whale_alpha_radar: "/v1/whale-alpha-radar",
  compliance_check: "/v1/compliance-check",
  defi_swap_quote: "/v1/defi-swap-quote",
  buy_prepaid_pass: "/v1/buy-pass",
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, PAYMENT-SIGNATURE, X-PAYMENT, X-PAYMENT-SIGNATURE, X-API-KEY, Authorization, Mcp-Session-Id, Last-Event-Id",
    "Access-Control-Expose-Headers":
      "PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-PAYMENT-RESPONSE, Mcp-Session-Id",
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

    TELEMETRY.total_requests += 1;

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

    // 0b. Live Telemetry & On-Chain Base USDC Wallet Dashboard: GET /stats & GET /v1/stats
    if (req.method === "GET" && (pathname === "/stats" || pathname === "/v1/stats")) {
      let walletData = null;
      try {
        walletData = await withCache(`stats:wallet:${CONFIG.payToWallet}`, 30_000, () =>
          walletProfiler({ address: CONFIG.payToWallet })
        );
      } catch {
        walletData = null;
      }

      const baseChain = walletData?.chains?.find((c) => c.chain === "base") || null;
      const statsPayload = {
        service: "Agent Kiosk",
        version: "2.5.0",
        pay_to_wallet: CONFIG.payToWallet,
        onchain_wallet: {
          base_usdc_balance: baseChain?.usdc_balance ?? 0,
          base_eth_balance: baseChain?.native_balance ?? 0,
          total_multichain_usdc: walletData?.totals?.total_usdc ?? 0,
          total_multichain_eth: walletData?.totals?.total_eth ?? 0,
        },
        funnel_telemetry: TELEMETRY,
      };

      if (pathname === "/v1/stats" || !(req.headers.accept || "").includes("text/html")) {
        return sendJson(res, 200, statsPayload);
      }

      const routeRows = Object.entries(PRICING)
        .map(([route, info]) => {
          const rStat = TELEMETRY.by_route[route] || { challenges: 0, teasers: 0, paid: 0 };
          return `<tr><td><code>${route}</code></td><td>$${info.priceUsd} USDC</td><td>${rStat.teasers}</td><td>${rStat.challenges}</td><td><strong>${rStat.paid}</strong></td></tr>`;
        })
        .join("");

      const eventRows = TELEMETRY.recent_events
        .map(
          (ev) =>
            `<tr><td>${ev.time_utc.slice(11, 19)} UTC</td><td><code>${ev.type}</code></td><td><code>${ev.route}</code></td><td>${ev.user_agent}</td></tr>`
        )
        .join("");

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(`<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agent Kiosk — Canlı Satış & Bot Trafik Paneli</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background:#0b0f19; color:#e2e8f0; max-width:1080px; margin:0 auto; padding:32px 20px; line-height:1.6; }
    h1, h2 { color:#fff; }
    .cards { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px; margin:20px 0; }
    .card { background:#111827; border:1px solid #1f2937; border-radius:10px; padding:16px; }
    .card .lbl { color:#94a3b8; font-size:13px; }
    .card .val { color:#38bdf8; font-size:26px; font-weight:700; margin-top:4px; }
    table { width:100%; border-collapse:collapse; margin:16px 0; background:#111827; border-radius:8px; overflow:hidden; }
    th, td { padding:10px 12px; text-align:left; border-bottom:1px solid #1f2937; font-size:13px; }
    th { background:#1e293b; color:#94a3b8; }
    code { background:#1e293b; color:#38bdf8; padding:2px 6px; border-radius:4px; }
    a { color:#38bdf8; text-decoration:none; }
  </style>
</head>
<body>
  <p><a href="/">← Ana Sayfaya Dön (19 Araç)</a> | <a href="/v1/stats">JSON Verisi (/v1/stats)</a></p>
  <h1>📊 Agent Kiosk — Canlı Cüzdan & Bot Trafik Paneli (v2.5.0)</h1>
  <p>Cüzdan: <code>${CONFIG.payToWallet}</code> (<a href="https://basescan.org/address/${CONFIG.payToWallet}#tokentxns" target="_blank">BaseScan USDC İşlemleri ↗</a>)</p>
  <div class="cards">
    <div class="card"><div class="lbl">Base USDC Bakiyesi</div><div class="val">$${statsPayload.onchain_wallet.base_usdc_balance} USDC</div></div>
    <div class="card"><div class="lbl">Toplam 4-Zincir USDC</div><div class="val">$${statsPayload.onchain_wallet.total_multichain_usdc} USDC</div></div>
    <div class="card"><div class="lbl">Toplam Bot İsteği</div><div class="val">${TELEMETRY.total_requests}</div></div>
    <div class="card"><div class="lbl">MCP Keşif / Tadımlık</div><div class="val">${TELEMETRY.mcp_discoveries} / ${TELEMETRY.mcp_teaser_previews}</div></div>
    <div class="card"><div class="lbl">402 Ödeme İstemi</div><div class="val">${TELEMETRY.x402_challenges_issued}</div></div>
    <div class="card"><div class="lbl">Başarılı Ödeme / Pass</div><div class="val">${TELEMETRY.paid_calls_succeeded}</div></div>
  </div>
  <h2>Uç Nokta Bazlı Bot Hunisi (19 Araç)</h2>
  <table>
    <thead><tr><th>Uç Nokta</th><th>Fiyat</th><th>MCP Tadımlık</th><th>402 İstemi</th><th>Ödenen Çağrı</th></tr></thead>
    <tbody>${routeRows}</tbody>
  </table>
  <h2>Son Gelen 25 Bot İsteği (Canlı Akış)</h2>
  <table>
    <thead><tr><th>Saat</th><th>Tür</th><th>Uç Nokta / Araç</th><th>Bot (User-Agent)</th></tr></thead>
    <tbody>${eventRows || '<tr><td colspan="4">Henüz istek kaydı yok.</td></tr>'}</tbody>
  </table>
</body>
</html>`);
    }

    // 1. Agent Discovery: /llms.txt
    if (req.method === "GET" && pathname === "/llms.txt") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      const lines = [
        "# Agent Kiosk — 19-in-1 Autonomous B2A Data, Action Calldata, Compliance & Security Supermarket (x402 v2 & MCP)",
        "",
        "> No sign-up, no monthly subscription. Autonomous AI agents can query 19 specialized attested tools (including $0.001 wallet ping, 12 core APIs, $0.05 DeFi Swap/Bridge Calldata Builder, $0.05 AML/OFAC Compliance Screening, 3 $0.10 360-dossiers, and $5.00 30-day VIP API Pass) using HTTP x402 v2 (Base USDC) or Model Context Protocol (MCP).",
        "",
        "## Endpoints",
        ...Object.entries(PRICING).map(
          ([route, info]) => `- POST ${baseUrl}${route} ($${info.priceUsd} USDC): ${info.description}`
        ),
        `- POST ${baseUrl}/mcp : Model Context Protocol (JSON-RPC 2.0) server endpoint (${MCP_TOOLS.length} tools).`,
        `- GET ${baseUrl}/stats : Live agent funnel telemetry & Base USDC wallet dashboard.`,
        `- GET ${baseUrl}/llms-full.txt : Full LLM tool schemas & integration reference.`,
        `- GET ${baseUrl}/openapi.json : OpenAPI 3.1 specification.`,
      ];
      return res.end(lines.join("\n"));
    }

    // 1b. Extended LLM Reference: /llms-full.txt
    if (req.method === "GET" && pathname === "/llms-full.txt") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      const blocks = MCP_TOOLS.map((t) => {
        const route = TOOL_TO_ROUTE[t.name];
        const p = PRICING[route];
        return `### Tool: ${t.name}\n- **x402 Endpoint:** POST ${baseUrl}${route}\n- **Price:** $${p.priceUsd} USDC on Base (${CONFIG.network})\n- **PayTo Wallet:** ${CONFIG.payToWallet}\n- **Description:** ${t.description}\n- **Input Schema:** \`${JSON.stringify(t.inputSchema)}\``;
      });
      return res.end(
        [
          "# Agent Kiosk — Complete LLM & Autonomous Agent Integration Reference",
          "",
          `Base URL: ${baseUrl}`,
          `MCP Streamable-HTTP Endpoint: ${baseUrl}/mcp`,
          `Smithery MCP URL: https://agent-kiosk--batuhansenavci.run.tools`,
          `Official MCP Registry ID: io.github.ralf9090/agent-kiosk`,
          `x402scan Server ID: a1af2789-615a-4324-b3f1-83b97834ece8`,
          "",
          `## Available Tools (${MCP_TOOLS.length})`,
          "",
          ...blocks,
        ].join("\n\n")
      );
    }

    // 1c. IndexNow Verification Key File
    if (req.method === "GET" && pathname === "/a1af2789615a4324b3f183b97834ece8.txt") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("a1af2789615a4324b3f183b97834ece8");
    }

    // 1d. Standard MCP & AI Plugin Discovery Manifests
    if (req.method === "GET" && pathname === "/.well-known/mcp.json") {
      return sendJson(res, 200, {
        mcpVersion: "2024-11-05",
        name: "io.github.ralf9090/agent-kiosk",
        title: "Agent Kiosk — 19-in-1 B2A Intelligence, Action & Compliance x402 API",
        version: "2.5.0",
        description:
          "19-in-1 autonomous intelligence & action MCP server & x402 API: Executable DeFi Swap/Bridge Calldata, AML/OFAC Wallet Compliance, Token Due Diligence, B2B Company Dossier, Whale Alpha Radar, smart contract security audit, prediction markets, DeFi yields, B2B leads, research, and 30-day Prepaid API Pass.",
        endpoints: {
          streamableHttp: `${baseUrl}/mcp`,
          smithery: "https://agent-kiosk--batuhansenavci.run.tools",
        },
        tools: MCP_TOOLS,
      });
    }

    if (req.method === "GET" && pathname === "/.well-known/ai-plugin.json") {
      return sendJson(res, 200, {
        schema_version: "v1",
        name_for_human: "Agent Kiosk",
        name_for_model: "agent_kiosk",
        description_for_human:
          "19-in-1 B2A Intelligence, Action Calldata & Compliance API & MCP Server via x402 (Base USDC).",
        description_for_model:
          "Build executable DeFi swap/bridge calldata, screen wallets for AML/OFAC sanctions, query 360-degree token/company/whale dossiers, social discussions, local business leads, clean web markdown, 0x contract honeypot audits, DEX buy/sell order-flow alpha, prediction market odds, DeFi yields, domain DNS/SaaS intelligence, package CVE checks, academic papers, and GitHub stats.",
        auth: { type: "none" },
        api: { type: "openapi", url: `${baseUrl}/openapi.json` },
        logo_url: `${baseUrl}/favicon.ico`,
        contact_email: "ralf9090@users.noreply.github.com",
        legal_info_url: "https://github.com/ralf9090/agent-kiosk/blob/main/LICENSE",
      });
    }

    // 2. OpenAPI 3.1 Spec with full input & output schemas for all 19 endpoints
    if (req.method === "GET" && pathname === "/openapi.json") {
      const openApiPaths = {};
      for (const tool of MCP_TOOLS) {
        const route = TOOL_TO_ROUTE[tool.name];
        const priceInfo = PRICING[route];
        openApiPaths[route] = {
          post: {
            operationId: tool.name,
            summary: priceInfo.description,
            tags: priceInfo.tags || ["agents", "x402", "attested"],
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
          version: "2.5.0",
          description:
            "19-in-1 Pay-Per-Call Intelligence, Action Calldata & Compliance Supermarket for AI Agents: DeFi Swap/Bridge Calldata Builder, AML/OFAC Sanctions Screening, Token 360 Due Diligence, B2B Company Dossier, Whale Alpha Radar, Social Search, Business Leads, Clean Web Extraction, Smart Contract Security, DeFi Order-Flow Alpha, Whale Wallet Profiler, Prediction Markets, DeFi Yields, Domain Intelligence, Package CVE Audits, Academic Research, GitHub Intelligence, 30-Day Prepaid Pass, and x402 Ping via x402 v2 (Base USDC) and MCP.",
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

    // 2b. SEO & AI Crawler Indexing: /robots.txt & /sitemap.xml (19 URLs)
    if (req.method === "GET" && pathname === "/robots.txt") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end(`User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`);
    }

    if (req.method === "GET" && pathname === "/sitemap.xml") {
      const toolUrls = Object.keys(ROUTE_HANDLERS).map(
        (r) => `  <url><loc>${baseUrl}/tools/${r.replace("/v1/", "")}</loc></url>`
      );
      res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" });
      return res.end(
        [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          `  <url><loc>${baseUrl}/</loc></url>`,
          `  <url><loc>${baseUrl}/stats</loc></url>`,
          `  <url><loc>${baseUrl}/llms.txt</loc></url>`,
          `  <url><loc>${baseUrl}/llms-full.txt</loc></url>`,
          `  <url><loc>${baseUrl}/openapi.json</loc></url>`,
          ...toolUrls,
          `</urlset>`,
        ].join("\n")
      );
    }

    // 2c. Individual SEO Tool Landing Pages: GET /tools/:slug
    if (req.method === "GET" && pathname.startsWith("/tools/")) {
      const slug = pathname.replace("/tools/", "").trim();
      const route = `/v1/${slug}`;
      const tool = MCP_TOOLS.find((t) => TOOL_TO_ROUTE[t.name] === route);
      const price = PRICING[route];

      if (tool && price) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${tool.name} — x402 USDC API & MCP Tool | Agent Kiosk</title>
  <meta name="description" content="${price.description}" />
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebAPI",
    name: `Agent Kiosk - ${tool.name}`,
    description: tool.description,
    documentation: `${baseUrl}/openapi.json`,
    url: `${baseUrl}${route}`,
    offers: {
      "@type": "Offer",
      price: price.priceUsd,
      priceCurrency: "USD",
    },
  })}</script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background:#0b0f19; color:#e2e8f0; max-width:880px; margin:0 auto; padding:32px 20px; line-height:1.6; }
    a { color:#38bdf8; }
    code, pre { background:#111827; color:#a7f3d0; padding:4px 8px; border-radius:6px; border:1px solid #1f2937; }
    pre { padding:16px; overflow-x:auto; }
  </style>
</head>
<body>
  <p><a href="/">← Back to Agent Kiosk (All ${MCP_TOOLS.length} Tools)</a></p>
  <h1>⚡ <code>${tool.name}</code> — x402 v2 & MCP Tool</h1>
  <p>${tool.description}</p>
  <ul>
    <li><strong>x402 Endpoint:</strong> <code>POST ${baseUrl}${route}</code></li>
    <li><strong>Price:</strong> <strong>$${price.priceUsd} USDC</strong> on Base Mainnet (<code>${CONFIG.network}</code>)</li>
    <li><strong>MCP Endpoint:</strong> <code>${baseUrl}/mcp</code> (Tool name: <code>${tool.name}</code>)</li>
  </ul>
  <h2>Input JSON Schema</h2>
  <pre>${JSON.stringify(tool.inputSchema, null, 2)}</pre>
</body>
</html>`);
      }
    }

    // 3. Browser Storefront on GET / (when Accept includes text/html) + A2A/x402 JSON Discovery Manifests
    if (
      req.method === "GET" &&
      pathname === "/" &&
      (req.headers.accept || "").includes("text/html")
    ) {
      const toolRows = MCP_TOOLS.map((t) => {
        const route = TOOL_TO_ROUTE[t.name];
        const slug = route.replace("/v1/", "");
        const p = PRICING[route];
        return `<tr><td><a href="/tools/${slug}" style="color:#38bdf8;text-decoration:none;"><code>${t.name}</code></a></td><td><code>POST ${route}</code></td><td><strong>$${p.priceUsd} USDC</strong></td><td>${p.description}</td></tr>`;
      }).join("");

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agent Kiosk — 19-in-1 x402 v2 & MCP Intelligence, Action & Compliance API</title>
  <meta name="description" content="Instant pay-per-call B2A data, DeFi Swap/Bridge Calldata Builder, AML/OFAC Compliance Screening, Token 360 Due Diligence, B2B Dossiers, Whale Portfolio Radar, and B2B leads via x402 (Base USDC) and MCP." />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background:#0b0f19; color:#e2e8f0; max-width:1040px; margin:0 auto; padding:32px 20px; line-height:1.6; }
    h1, h2 { color:#fff; }
    .badges a { display:inline-block; margin-right:10px; margin-bottom:8px; padding:6px 12px; border-radius:6px; background:#1e293b; color:#38bdf8; text-decoration:none; font-weight:600; font-size:14px; border:1px solid #334155; }
    table { width:100%; border-collapse:collapse; margin:20px 0; background:#111827; border-radius:8px; overflow:hidden; }
    th, td { padding:12px 14px; text-align:left; border-bottom:1px solid #1f2937; font-size:14px; }
    th { background:#1e293b; color:#94a3b8; }
    code { background:#1e293b; color:#38bdf8; padding:2px 6px; border-radius:4px; font-size:13px; }
    pre { background:#111827; padding:16px; border-radius:8px; overflow-x:auto; border:1px solid #1f2937; color:#a7f3d0; }
  </style>
</head>
<body>
  <h1>⚡ Agent Kiosk — 19-in-1 Autonomous B2A Intelligence, Action & Compliance Supermarket</h1>
  <p>No API keys, no sign-ups, no monthly subscriptions. Built for autonomous AI agents paying per request via <strong>x402 v2 (Base USDC)</strong> or connecting via <strong>Model Context Protocol (MCP)</strong>.</p>
  <div class="badges">
    <a href="https://www.x402scan.com/server/a1af2789-615a-4324-b3f1-83b97834ece8">🔵 x402scan (19/19 Verified)</a>
    <a href="https://glama.ai/mcp/servers/ralf9090/agent-kiosk">🟢 Glama.ai (Rated B)</a>
    <a href="https://smithery.ai/servers/batuhansenavci/agent-kiosk">🟠 Smithery.ai</a>
    <a href="/stats">📊 Live Agent & Wallet Dashboard (/stats)</a>
    <a href="/openapi.json">📄 OpenAPI 3.1</a>
    <a href="/llms-full.txt">🤖 /llms-full.txt</a>
  </div>
  <h2>19 Live Attested Endpoints & MCP Tools (Base Mainnet USDC)</h2>
  <table>
    <thead><tr><th>MCP Tool</th><th>x402 Endpoint</th><th>Price</th><th>Description</th></tr></thead>
    <tbody>${toolRows}</tbody>
  </table>
  <h2>Quick Connect (MCP Client / Claude / Cursor / VS Code)</h2>
  <pre>{
  "mcpServers": {
    "agent-kiosk": {
      "url": "${baseUrl}/mcp"
    }
  }
}</pre>
</body>
</html>`);
    }

    if (
      req.method === "GET" &&
      (pathname === "/.well-known/agent.json" ||
        pathname === "/.well-known/x402.json" ||
        pathname === "/.well-known/x402" ||
        pathname === "/")
    ) {
      return sendJson(res, 200, {
        name: "Agent Kiosk",
        version: "2.5.0",
        x402Version: 2,
        attested: true,
        description:
          "19-in-1 Autonomous B2A Data, Executable DeFi Calldata, AML Compliance & Security Supermarket via x402 v2 (Base USDC) and MCP.",
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

    // 4. Paid x402 v2/v1 Endpoints (all 19 routes)
    if ((req.method === "POST" || req.method === "GET") && ROUTE_HANDLERS[pathname]) {
      const resourceUrl = `${baseUrl}${pathname}`;
      const auth = await verifyAndSettlePayment(req, pathname, resourceUrl);

      if (!auth.authorized) {
        TELEMETRY.x402_challenges_issued += 1;
        recordTelemetry("x402_challenge", pathname, req);
        return sendJson(res, auth.statusCode, auth.challenge, {
          "PAYMENT-REQUIRED": auth.challengeHeader,
        });
      }

      try {
        const queryParams = Object.fromEntries(urlObj.searchParams.entries());
        const jsonBody = req.method === "POST" ? await readJsonBody(req) : {};
        const body = { ...queryParams, ...jsonBody };

        const data = await ROUTE_HANDLERS[pathname](body, auth);
        const attestation = attestResponse(pathname, data);

        TELEMETRY.paid_calls_succeeded += 1;
        recordTelemetry("paid_call", pathname, req, auth.mode);

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
            attestation,
            data,
          },
          extraHeaders
        );
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err.message });
      }
    }

    // 5a. MCP HTTP GET Discovery / Health Check
    if (req.method === "GET" && pathname === "/mcp") {
      TELEMETRY.mcp_discoveries += 1;
      recordTelemetry("mcp_get", "/mcp", req);
      return sendJson(res, 200, {
        name: "agent-kiosk",
        version: "2.5.0",
        protocol: "mcp-streamable-http",
        protocolVersion: "2024-11-05",
        attested: true,
        endpoint: `${baseUrl}/mcp`,
        toolsCount: MCP_TOOLS.length,
        tools: MCP_TOOLS.map((t) => t.name),
      });
    }

    // 5b. MCP HTTP Endpoint (JSON-RPC 2.0)
    if (req.method === "POST" && pathname === "/mcp") {
      try {
        const rpc = await readJsonBody(req);
        const { id, method, params } = rpc;

        if (method === "initialize") {
          TELEMETRY.mcp_discoveries += 1;
          recordTelemetry("mcp_init", "/mcp", req);
          const requestedVersion = params?.protocolVersion;
          const supportedVersions = ["2024-11-05", "2025-03-26", "2025-06-18"];
          const negotiatedVersion = supportedVersions.includes(requestedVersion)
            ? requestedVersion
            : "2024-11-05";

          return sendJson(res, 200, {
            jsonrpc: "2.0",
            id,
            result: {
              protocolVersion: negotiatedVersion,
              capabilities: { tools: {}, resources: {}, prompts: {} },
              serverInfo: { name: "agent-kiosk", version: "2.5.0" },
            },
          });
        }

        if (method === "ping" || method === "logging/setLevel") {
          return sendJson(res, 200, {
            jsonrpc: "2.0",
            id,
            result: {},
          });
        }

        if (method && method.startsWith("notifications/")) {
          return sendJson(res, 200, { ok: true });
        }

        if (method === "tools/list") {
          TELEMETRY.mcp_discoveries += 1;
          recordTelemetry("mcp_tools_list", "/mcp", req);
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

        if (method === "resources/templates/list") {
          return sendJson(res, 200, {
            jsonrpc: "2.0",
            id,
            result: { resourceTemplates: [] },
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
            req.headers["payment-signature"] ||
              req.headers["x-payment"] ||
              req.headers["x-payment-signature"]
          );
          const auth = await verifyAndSettlePayment(req, mappedRoute, `${baseUrl}${mappedRoute}`);

          if (!auth.authorized && hasPaymentAttempt) {
            TELEMETRY.x402_challenges_issued += 1;
            recordTelemetry("x402_challenge", mappedRoute, req, "mcp-failed-sig");
            return sendJson(res, 402, auth.challenge, {
              "PAYMENT-REQUIRED": auth.challengeHeader,
            });
          }

          if (!auth.authorized) {
            // Freemium Teaser Mode for MCP (Smithery / Cursor / Claude):
            // Returns HTTP 200 OK with 1 teaser item + exact x402 USDC payment instructions to unlock full data
            TELEMETRY.mcp_teaser_previews += 1;
            recordTelemetry("mcp_teaser", mappedRoute, req, toolName);

            const teaserArgs = { ...args, limit: 2, max_length: 600 };
            const rawPreview = await ROUTE_HANDLERS[mappedRoute](teaserArgs, null);
            const priceUsd = PRICING[mappedRoute]?.priceUsd || "0.02";
            const lockNote = `[LOCKED — Pay $${priceUsd} USDC on Base via x402 POST ${baseUrl}${mappedRoute} OR use a $5.00 30-Day Prepaid Pass (POST ${baseUrl}/v1/buy-pass) to unlock full dataset]`;

            const teaserPayload = {
              tier: "FREE_MCP_TEASER_PREVIEW",
              notice: `Showing limited preview. Unlock full unmasked results by calling POST ${baseUrl}${mappedRoute} with x402 payment ($${priceUsd} USDC on Base) OR mint a 30-day X-API-KEY pass ($5.00 USDC at POST ${baseUrl}/v1/buy-pass).`,
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
                transaction_request: rawPreview.transaction_request
                  ? {
                      ...rawPreview.transaction_request,
                      data: lockNote,
                    }
                  : undefined,
                llm_markdown: rawPreview.llm_markdown
                  ? `${rawPreview.llm_markdown.slice(0, 450)}\n\n... ${lockNote}`
                  : undefined,
              },
              attestation: attestResponse(mappedRoute, rawPreview),
              x402_unlock_full_data: {
                endpoint: `${baseUrl}${mappedRoute}`,
                method: "POST",
                price_usdc: priceUsd,
                network: CONFIG.network,
                usdc_contract: CONFIG.usdcAsset,
                pay_to_wallet: CONFIG.payToWallet,
                prepaid_30d_pass_endpoint: `${baseUrl}/v1/buy-pass`,
                prepaid_30d_pass_price_usdc: "5.00",
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

          const output = await ROUTE_HANDLERS[mappedRoute](args, auth);
          const attestation = attestResponse(mappedRoute, output);
          TELEMETRY.paid_calls_succeeded += 1;
          recordTelemetry("paid_call", mappedRoute, req, `mcp:${auth.mode}`);

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
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({ ...output, attestation }, null, 2),
                  },
                ],
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
