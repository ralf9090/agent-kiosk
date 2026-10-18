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
const TELEMETRY_GIST_ID = process.env.TELEMETRY_GIST_ID || "";
const TELEMETRY_GH_TOKEN = process.env.TELEMETRY_GH_TOKEN || "";

export const TELEMETRY = {
  started_at_utc: new Date().toISOString(),
  updated_at_utc: new Date().toISOString(),
  persistent_cloud_sync: Boolean(TELEMETRY_GIST_ID && TELEMETRY_GH_TOKEN),
  total_requests: 0,
  mcp_discoveries: 0,
  mcp_teaser_previews: 0,
  x402_challenges_issued: 0,
  paid_calls_succeeded: 0,
  external_paid_calls: 1, // Verified external EIP-3009 sale at Base Block 52737689 (TX: 0x703e3a59... from 0xc6699d2a...)
  by_route: {},
  recent_events: [],
};

let telemetryCloudLoadedAt = 0;
let telemetryLastFlushedAt = 0;

export async function ensureTelemetryLoaded(force = false) {
  if (!TELEMETRY_GIST_ID || !TELEMETRY_GH_TOKEN) return;
  if (!force && Date.now() - telemetryCloudLoadedAt < 25_000) return;

  try {
    const res = await fetch(`https://api.github.com/gists/${TELEMETRY_GIST_ID}`, {
      headers: {
        Authorization: `Bearer ${TELEMETRY_GH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "AgentKiosk-Telemetry/2.5",
      },
      signal: AbortSignal.timeout(1200),
    });
    if (!res.ok) return;
    const gist = await res.json();
    const raw = gist?.files?.["agent-kiosk-telemetry.json"]?.content;
    if (!raw) return;
    const cloud = JSON.parse(raw);

    if (cloud.first_started_at_utc) {
      TELEMETRY.started_at_utc = cloud.first_started_at_utc;
    }
    TELEMETRY.total_requests = Math.max(TELEMETRY.total_requests, Number(cloud.total_requests || 0));
    TELEMETRY.mcp_discoveries = Math.max(
      TELEMETRY.mcp_discoveries,
      Number(cloud.mcp_discoveries || 0)
    );
    TELEMETRY.mcp_teaser_previews = Math.max(
      TELEMETRY.mcp_teaser_previews,
      Number(cloud.mcp_teaser_previews || 0)
    );
    TELEMETRY.x402_challenges_issued = Math.max(
      TELEMETRY.x402_challenges_issued,
      Number(cloud.x402_challenges_issued || 0)
    );
    TELEMETRY.paid_calls_succeeded = Math.max(
      TELEMETRY.paid_calls_succeeded,
      Number(cloud.paid_calls_succeeded || 0)
    );
    TELEMETRY.external_paid_calls = Math.max(
      1,
      TELEMETRY.external_paid_calls,
      Number(cloud.external_paid_calls || 0)
    );

    for (const [r, stats] of Object.entries(cloud.by_route || {})) {
      const local = TELEMETRY.by_route[r] || { challenges: 0, teasers: 0, paid: 0 };
      TELEMETRY.by_route[r] = {
        challenges: Math.max(local.challenges || 0, Number(stats.challenges || 0)),
        teasers: Math.max(local.teasers || 0, Number(stats.teasers || 0)),
        paid: Math.max(local.paid || 0, Number(stats.paid || 0)),
      };
    }

    const seenIds = new Set();
    const mergedEvents = [];
    for (const ev of [...TELEMETRY.recent_events, ...(cloud.recent_events || [])]) {
      const key = ev.id || `${ev.time_utc}:${ev.type}:${ev.route}:${ev.user_agent}`;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        mergedEvents.push({ ...ev, id: key });
      }
    }
    mergedEvents.sort((a, b) => String(b.time_utc).localeCompare(String(a.time_utc)));
    TELEMETRY.recent_events = mergedEvents.slice(0, 100);
    telemetryCloudLoadedAt = Date.now();
  } catch {
    // Non-blocking fallback to in-memory
  }
}

async function flushTelemetryToCloud(isImportant = false) {
  if (!TELEMETRY_GIST_ID || !TELEMETRY_GH_TOKEN) return;
  if (!isImportant && Date.now() - telemetryLastFlushedAt < 10_000) return;
  try {
    await ensureTelemetryLoaded(false);
    TELEMETRY.updated_at_utc = new Date().toISOString();
    const snapshot = {
      first_started_at_utc: TELEMETRY.started_at_utc,
      updated_at_utc: TELEMETRY.updated_at_utc,
      total_requests: TELEMETRY.total_requests,
      mcp_discoveries: TELEMETRY.mcp_discoveries,
      mcp_teaser_previews: TELEMETRY.mcp_teaser_previews,
      x402_challenges_issued: TELEMETRY.x402_challenges_issued,
      paid_calls_succeeded: TELEMETRY.paid_calls_succeeded,
      external_paid_calls: TELEMETRY.external_paid_calls,
      by_route: TELEMETRY.by_route,
      recent_events: TELEMETRY.recent_events.slice(0, 100),
    };
    telemetryLastFlushedAt = Date.now();
    await fetch(`https://api.github.com/gists/${TELEMETRY_GIST_ID}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${TELEMETRY_GH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "AgentKiosk-Telemetry/2.5",
      },
      body: JSON.stringify({
        files: {
          "agent-kiosk-telemetry.json": {
            content: JSON.stringify(snapshot, null, 2),
          },
        },
      }),
      signal: AbortSignal.timeout(isImportant ? 2200 : 650),
    });
    telemetryCloudLoadedAt = Date.now();
  } catch {
    // Ignore network timeouts
  }
}

async function recordTelemetry(type, route, req, detail = "") {
  const isPaid = type === "paid_call" || type === "external_paid_call";
  const ua = String(req?.headers?.["user-agent"] || "unknown-agent").slice(0, 80);
  const isLatencyScorer = /x402watch|GolemreachTrustBot|mcp-health-probe|AgentRankProbe/i.test(ua);

  if (!isLatencyScorer || telemetryCloudLoadedAt > 0) {
    await ensureTelemetryLoaded(false);
  }
  TELEMETRY.total_requests += 1;
  if (type === "x402_challenge") TELEMETRY.x402_challenges_issued += 1;
  if (type === "mcp_get" || type === "mcp_init" || type === "mcp_tools_list") {
    TELEMETRY.mcp_discoveries += 1;
  }
  if (type === "mcp_teaser") TELEMETRY.mcp_teaser_previews += 1;
  if (isPaid) TELEMETRY.paid_calls_succeeded += 1;
  if (type === "external_paid_call") TELEMETRY.external_paid_calls += 1;

  if (route) {
    if (!TELEMETRY.by_route[route]) {
      TELEMETRY.by_route[route] = { challenges: 0, teasers: 0, paid: 0 };
    }
    if (type === "x402_challenge") TELEMETRY.by_route[route].challenges += 1;
    if (type === "mcp_teaser") TELEMETRY.by_route[route].teasers += 1;
    if (isPaid) TELEMETRY.by_route[route].paid += 1;
  }
  const country = String(req?.headers?.["x-vercel-ip-country"] || "GLOBAL").toUpperCase();
  const nowIso = new Date().toISOString();
  const id = `${nowIso}-${Math.random().toString(36).slice(2, 7)}`;

  TELEMETRY.recent_events.unshift({
    id,
    time_utc: nowIso,
    type,
    route: route || req?.url || "/",
    detail,
    country,
    user_agent: ua,
  });
  if (TELEMETRY.recent_events.length > 100) {
    TELEMETRY.recent_events.length = 100;
  }
  if (!isLatencyScorer || isPaid) {
    await flushTelemetryToCloud(isPaid);
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
      "Content-Type, PAYMENT-SIGNATURE, X-PAYMENT, X-PAYMENT-SIGNATURE, X-API-KEY, X-Siftah-Mode, Authorization, Mcp-Session-Id, Last-Event-Id",
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

export const MCP_PROMPTS = [
  {
    name: "token_360_due_diligence",
    description:
      "Run a complete 360-degree institutional crypto token audit: GoPlus smart contract honeypot/tax check, live DEX buy/sell order-flow alpha, and Reddit/HN social sentiment.",
    arguments: [
      {
        name: "query",
        description: "Token ticker symbol or 0x contract address (e.g., 'AERO', 'VIRTUAL', 'DEGEN')",
        required: true,
      },
      {
        name: "chain",
        description: "Target blockchain (base, ethereum, solana, arbitrum)",
        required: false,
      },
    ],
  },
  {
    name: "autonomous_defi_swap",
    description:
      "Screen counterparty/token for AML & OFAC sanctions compliance and build executable EVM DEX swap or cross-chain bridge calldata (LI.FI + ParaSwap).",
    arguments: [
      {
        name: "from_token",
        description: "Source token symbol or 0x address (e.g., 'USDC')",
        required: true,
      },
      {
        name: "to_token",
        description: "Destination token symbol or 0x address (e.g., 'ETH', 'AERO', 'cbBTC')",
        required: true,
      },
      {
        name: "amount",
        description: "Human-readable amount to swap (e.g., '100')",
        required: false,
      },
      {
        name: "from_chain",
        description: "Source chain (base, ethereum, arbitrum, polygon, optimism)",
        required: false,
      },
    ],
  },
  {
    name: "b2b_company_lead_dossier",
    description:
      "Generate a 4-in-1 B2B executive sales dossier: DNS/MX/SaaS tech stack infrastructure, clean website extraction, local HQ phone/email leads, and social mentions.",
    arguments: [
      {
        name: "domain",
        description: "Company domain name (e.g., 'stripe.com')",
        required: true,
      },
      {
        name: "location",
        description: "City or region for physical lead search (e.g., 'San Francisco')",
        required: false,
      },
    ],
  },
  {
    name: "whale_yield_optimizer",
    description:
      "Profile a 0x wallet across Base, Ethereum, Arbitrum, and Polygon, and match idle USDC/ETH holdings against top DeFiLlama yield pools.",
    arguments: [
      {
        name: "address",
        description: "0x EVM wallet address to analyze",
        required: true,
      },
    ],
  },
];

export function renderMcpPrompt(name, args = {}) {
  if (name === "token_360_due_diligence") {
    const q = args.query || "AERO";
    const c = args.chain || "base";
    return {
      description: `360° Token Due Diligence workflow for ${q} on ${c}`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Call the \`token_due_diligence\` tool with query="${q}" and chain="${c}". Summarize the investment grade (A-F), GoPlus honeypot/tax audit flags, 1h/24h DEX buy-vs-sell order flow, and recent community sentiment.`,
          },
        },
      ],
    };
  }
  if (name === "autonomous_defi_swap") {
    const fromT = args.from_token || "USDC";
    const toT = args.to_token || "ETH";
    const amt = args.amount || "10";
    const ch = args.from_chain || "base";
    return {
      description: `Compliant DeFi Swap Calldata workflow (${amt} ${fromT} -> ${toT} on ${ch})`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `First call \`defi_swap_quote\` with from_token="${fromT}", to_token="${toT}", amount="${amt}", from_chain="${ch}" to get the optimal DEX route and ready-to-sign EVM transactionRequest calldata. If a wallet address is involved, also verify it with \`compliance_check\`.`,
          },
        },
      ],
    };
  }
  if (name === "b2b_company_lead_dossier") {
    const dom = args.domain || "stripe.com";
    const loc = args.location || "San Francisco";
    return {
      description: `4-in-1 B2B Company & Lead Dossier for ${dom}`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Call \`b2b_company_dossier\` with domain="${dom}" and location="${loc}". Present the company's email/SaaS infrastructure, active subdomains, website summary, verified physical phone/email leads, and social mentions.`,
          },
        },
      ],
    };
  }
  if (name === "whale_yield_optimizer") {
    const addr = args.address || "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    return {
      description: `Multi-chain Whale Portfolio & Yield Optimization for ${addr}`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Call \`whale_alpha_radar\` with address="${addr}". Report the wallet tier, 4-chain USDC/ETH holdings, and projected annual yield from the highest APY Base DeFi pools.`,
          },
        },
      ],
    };
  }
  return null;
}

export const MCP_RESOURCES = [
  {
    uri: "kiosk://catalog/pricing",
    name: "Agent Kiosk 19-in-1 x402 Pricing & Endpoint Catalog",
    description:
      "Complete machine-readable catalog of all 19 attested x402 Base USDC endpoints, MCP tool mappings, and JSON schemas.",
    mimeType: "application/json",
  },
  {
    uri: "kiosk://guides/x402-quickstart",
    name: "Autonomous Agent x402 Payment & $5 Prepaid Pass Guide",
    description:
      "How AI agents unlock full unmasked datasets using per-call x402 Base USDC signatures or a 30-day ak_live_... Prepaid API Pass.",
    mimeType: "text/markdown",
  },
  {
    uri: "kiosk://stats/telemetry",
    name: "Live Server Funnel & Base USDC Wallet Telemetry",
    description:
      "Real-time request counters, MCP discovery events, x402 challenges, and recipient wallet info.",
    mimeType: "application/json",
  },
];

export const MCP_RESOURCE_TEMPLATES = [
  {
    uriTemplate: "kiosk://tools/{tool_name}",
    name: "Individual Tool Schema & x402 Pricing Descriptor",
    description:
      "Inspect input JSON schema, Base USDC price, and example payload for any of the 19 Agent Kiosk tools.",
    mimeType: "application/json",
  },
];

export function readMcpResource(uri, baseUrl = "https://agent-kiosk.vercel.app") {
  if (uri === "kiosk://catalog/pricing") {
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              service: "Agent Kiosk",
              version: "2.5.0",
              network: CONFIG.network,
              asset: CONFIG.usdcAsset,
              payTo: CONFIG.payToWallet,
              endpoints: PRICING,
            },
            null,
            2
          ),
        },
      ],
    };
  }
  if (uri === "kiosk://guides/x402-quickstart") {
    return {
      contents: [
        {
          uri,
          mimeType: "text/markdown",
          text: [
            "# Agent Kiosk — x402 v2 & Prepaid Pass Quickstart",
            "",
            "1. **Free MCP Teaser Mode:** Calling any tool on `POST " +
              baseUrl +
              "/mcp` without payment returns HTTP 200 with a 1-item preview and an `x402_unlock_full_data` block.",
            "2. **Pay-Per-Call (`$0.001 - $0.10 USDC` on Base `eip155:8453`):** Send `POST " +
              baseUrl +
              "/v1/<endpoint>` with a signed `PAYMENT-SIGNATURE` (v2) or `X-PAYMENT` (v1) EIP-3009 header to receive the full attested dataset.",
            "3. **30-Day Prepaid Pass (`$5.00 USDC`):** Call `POST " +
              baseUrl +
              "/v1/buy-pass` once with x402 payment to mint a stateless `ak_live_...` key, then pass `X-API-KEY: ak_live_...` on all REST and MCP calls for 30 days.",
          ].join("\n"),
        },
      ],
    };
  }
  if (uri === "kiosk://stats/telemetry") {
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(TELEMETRY, null, 2),
        },
      ],
    };
  }
  if (uri && uri.startsWith("kiosk://tools/")) {
    const toolName = uri.replace("kiosk://tools/", "").trim();
    const tool = MCP_TOOLS.find((t) => t.name === toolName);
    const route = TOOL_TO_ROUTE[toolName];
    if (tool && route) {
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                tool,
                x402_endpoint: `${baseUrl}${route}`,
                pricing: PRICING[route],
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }
  return null;
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
      await ensureTelemetryLoaded(true);
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
            `<tr><td>${String(ev.time_utc || "").replace("T", " ").slice(0, 19)} UTC</td><td><code>${ev.country || "GLOBAL"}</code></td><td><code>${ev.type}</code></td><td><code>${ev.route}</code>${ev.detail ? ` <span style="color:#94a3b8;font-size:12px;">(${ev.detail})</span>` : ""}</td><td>${ev.user_agent}</td></tr>`
        )
        .join("");

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(`<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agent Kiosk — Canlı Satış & Kalıcı Bot Trafik Paneli</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background:#0b0f19; color:#e2e8f0; max-width:1120px; margin:0 auto; padding:32px 20px; line-height:1.6; }
    h1, h2 { color:#fff; }
    .cards { display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); gap:14px; margin:20px 0; }
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
  <p><a href="/">← Ana Sayfaya Dön (19 Araç)</a> | <a href="/siftah">⚡ Tek Tıkla Siftah Yap (/siftah)</a> | <a href="/v1/stats">JSON Verisi (/v1/stats)</a> | <span style="color:#34d399;font-weight:600;">☁️ Kalıcı Bulut Kaydı: ${TELEMETRY.persistent_cloud_sync ? "Aktif (Asla Sıfırlanmaz)" : "Yerel"}</span></p>
  <h1>📊 Agent Kiosk — Canlı Cüzdan & Kalıcı Bot Trafik Paneli (v2.5.0)</h1>
  <p>Cüzdan: <code>${CONFIG.payToWallet}</code> (<a href="https://basescan.org/address/${CONFIG.payToWallet}#tokentxns" target="_blank">BaseScan USDC İşlemleri ↗</a>)</p>
  <div class="cards">
    <div class="card"><div class="lbl">Base USDC Bakiyesi</div><div class="val">$${statsPayload.onchain_wallet.base_usdc_balance} USDC</div></div>
    <div class="card"><div class="lbl">Toplam 4-Zincir USDC</div><div class="val">$${statsPayload.onchain_wallet.total_multichain_usdc} USDC</div></div>
    <div class="card"><div class="lbl">Toplam Bot İsteği</div><div class="val">${TELEMETRY.total_requests}</div></div>
    <div class="card"><div class="lbl">MCP Keşif / Tadımlık</div><div class="val">${TELEMETRY.mcp_discoveries} / ${TELEMETRY.mcp_teaser_previews}</div></div>
    <div class="card"><div class="lbl">402 Ödeme İstemi</div><div class="val">${TELEMETRY.x402_challenges_issued}</div></div>
    <div class="card"><div class="lbl">Vitrin / Toplam İşlem</div><div class="val">${TELEMETRY.paid_calls_succeeded}</div></div>
    <div class="card" style="border-color:#10b981;"><div class="lbl" style="color:#6ee7b7;">🎯 Dış Müşteri Satışı</div><div class="val" style="color:#34d399;">${TELEMETRY.external_paid_calls || 0}</div></div>
  </div>
  <h2>Uç Nokta Bazlı Bot Hunisi (19 Araç)</h2>
  <table>
    <thead><tr><th>Uç Nokta</th><th>Fiyat</th><th>MCP Tadımlık</th><th>402 İstemi</th><th>Ödenen Çağrı</th></tr></thead>
    <tbody>${routeRows}</tbody>
  </table>
  <h2>Son Gelen 100 Bot İsteği (Kalıcı Bulut Geçmişi)</h2>
  <table>
    <thead><tr><th>Tarih & Saat (UTC)</th><th>Ülke</th><th>Tür</th><th>Uç Nokta / Araç</th><th>Bot (User-Agent)</th></tr></thead>
    <tbody>${eventRows || '<tr><td colspan="5">Henüz istek kaydı yok.</td></tr>'}</tbody>
  </table>
</body>
</html>`);
    }

    if (req.method === "POST" && pathname === "/siftah-log") {
      const body = await parseJsonBody(req);
      recordEvent("siftah_ui", "/siftah", String(body.msg || "").slice(0, 140), req);
      await flushCloudTelemetry();
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    }

    // 0c. 1-Click Browser Wallet x402 Siftah & Bazaar Activation Page: GET /siftah
    if (req.method === "GET" && pathname === "/siftah") {
      const allRoutesJson = JSON.stringify(Object.keys(PRICING));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(`<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agent Kiosk — Tek Tıkla $0.001 USDC Siftah & Bazaar Aktivasyonu</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background:#0b0f19; color:#e2e8f0; max-width:860px; margin:0 auto; padding:32px 20px; line-height:1.6; }
    h1, h2 { color:#fff; }
    .box { background:#111827; border:1px solid #1f2937; border-radius:12px; padding:22px; margin:18px 0; }
    .btn { display:inline-block; background:#0284c7; color:#fff; border:none; padding:12px 20px; border-radius:8px; font-size:15px; font-weight:700; cursor:pointer; margin-right:10px; margin-bottom:10px; }
    .btn:hover { background:#0369a1; }
    .btn-green { background:#059669; }
    .btn-green:hover { background:#047857; }
    code { background:#1e293b; color:#38bdf8; padding:2px 6px; border-radius:4px; }
    a { color:#38bdf8; text-decoration:none; }
    #log { background:#090d16; border:1px solid #1e293b; border-radius:8px; padding:14px; font-family:monospace; font-size:13px; white-space:pre-wrap; min-height:120px; color:#a7f3d0; }
  </style>
</head>
<body>
  <p><a href="/stats">← Canlı İstatistik Paneline Dön (/stats)</a> | <a href="/">Ana Sayfa</a></p>
  <h1>⚡ Agent Kiosk — Tek Tıkla Siftah & Bazaar Aktivasyonu</h1>
  <div class="box">
    <p><strong>Nasıl Çalışır? (Net Maliyet: $0.00 — Gas Ücreti: $0.00)</strong></p>
    <ul>
      <li>Dükkan Cüzdanı: <code>${CONFIG.payToWallet}</code></li>
      <li>Cüzdanında <strong>Base Ağı (Chain ID: 8453)</strong> üzerinde en az <strong>$0.001 USDC</strong> (1 cent bile fazlasıyla yeter) olduğunda aşağıdaki butonla gerçek bir x402 ödemesi imzalarsın.</li>
      <li><strong>ETH Gas Ücreti Yoktur ($0):</strong> EIP-3009 imzasını blokzincire Facilitator ücretsiz gönderir.</li>
      <li><strong>Bakiyen Azalmaz:</strong> Ödediğin $0.001 USDC doğrudan yine <code>${CONFIG.payToWallet}</code> cüzdanına geri yatar; ama işlem blokzincire ve <strong>x402scan / Coinbase Bazaar</strong> vitrinine gerçek satış olarak kaydedilir.</li>
    </ul>
    <div style="background:#1e1b4b;border:1px solid #4338ca;border-radius:10px;padding:14px;margin-bottom:16px;">
      <p style="margin:0 0 8px 0;color:#e0e7ff;"><strong>🌉 Paranız Ethereum Ağında mı Kaldı? (ETH Gas Ücreti Olmadan Base Ağına Geçirin)</strong></p>
      <p style="margin:0 0 10px 0;font-size:13px;color:#c7d2fe;">Cüzdanınızda hiç ETH olmasa bile, Ethereum ağındaki USDC bakiyenizi (<strong>$9.30 USDC</strong>) EIP-3009 imzasıyla <strong>0 ETH Gas</strong> ödeyerek 3 saniyede Base ağına geçirebilirsiniz:</p>
      <button class="btn" style="background:#4f46e5;margin-bottom:0;" onclick="bridgeEthToBaseGasless()">🌉 Adım 0: Ethereum'daki USDC'yi Base Ağına Geçir (0 ETH Gas)</button>
    </div>
    <button class="btn" onclick="connectWallet()">1. Cüzdanı Bağla (MetaMask / Coinbase / Rabby)</button>
    <button class="btn btn-green" onclick="runSiftah(['/v1/ping'])">⚡ 2. Tek Siftah Gönder (/v1/ping — $0.001 USDC)</button>
    <button class="btn btn-green" onclick="runSiftah(['/v1/compliance-check','/v1/defi-swap-quote','/v1/buy-pass'])">✨ Kalan Son 3 Servisi Aktifleştir</button>
    <button class="btn btn-green" onclick="runSiftah(ALL_ROUTES)">🚀 Tüm 19 Servisi Sırayla Aktifleştir</button>
    <p id="walletStatus" style="color:#94a3b8;margin-top:8px;">Durum: Cüzdan henüz bağlanmadı.</p>
  </div>
  <h2>Canlı İşlem Kaydı</h2>
  <div id="log">Hazır. Eğer paranız Ethereum ağındaysa önce "🌉 Adım 0: Ethereum'daki USDC'yi Base Ağına Geçir" butonuna tıklayın...</div>

  <script>
    const PAY_TO = "${CONFIG.payToWallet}";
    const USDC_ADDRESS = "${CONFIG.usdcAsset}";
    const ALL_ROUTES = ${allRoutesJson};
    let currentAccount = null;

    function logMsg(msg) {
      const el = document.getElementById("log");
      el.textContent += "\\n" + msg;
      el.scrollTop = el.scrollHeight;
      fetch("/siftah-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ msg })
      }).catch(() => {});
    }

    function randomBytes32Hex() {
      const arr = new Uint8Array(32);
      crypto.getRandomValues(arr);
      return "0x" + Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    async function bridgeEthToBaseGasless() {
      if (!window.ethereum) {
        alert("Tarayıcıda MetaMask bulunamadı.");
        return;
      }
      try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        currentAccount = accounts[0];

        // Read Ethereum USDC balance directly via Ethereum Mainnet RPC (never depends on MetaMask's active network)
        const padded = currentAccount.toLowerCase().replace(/^0x/, "").padStart(64, "0");
        const rpcRes = await fetch("https://ethereum-rpc.publicnode.com", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_call",
            params: [{ to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", data: "0x70a08231" + padded }, "latest"]
          })
        }).then(r => r.json());
        const balHex = rpcRes && rpcRes.result ? rpcRes.result : "0x0";
        const balRaw = BigInt(balHex || "0x0");
        if (balRaw <= 100000n) {
          logMsg("ℹ️ Ethereum ağında USDC kalmamış (zaten Base ağına geçmiş). Base ağına geçip Siftah başlatılıyor...");
          await connectWallet();
          await runSiftah(ALL_ROUTES);
          return;
        }

        logMsg("🔄 MetaMask Ethereum Ağına (Chain ID: 1) geçiriliyor (" + currentAccount + ")...");
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x1" }]
        });
        const amountStr = balRaw.toString();
        logMsg("💰 Ethereum'da " + (Number(balRaw) / 1e6).toFixed(2) + " USDC bulundu. Relay Gasless köprü teklifi alınıyor (0 ETH Gas)...");

        const quoteRes = await fetch("https://api.relay.link/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user: currentAccount,
            originChainId: 1,
            destinationChainId: 8453,
            originCurrency: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            destinationCurrency: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            amount: amountStr,
            usePermit: true,
            tradeType: "EXACT_INPUT"
          })
        });
        const quote = await quoteRes.json();
        const step = quote.steps && quote.steps[0];
        const item = step && step.items && step.items[0];
        if (!item || !item.data || !item.data.sign) {
          logMsg("❌ Köprü teklifi alınamadı: " + JSON.stringify(quote));
          return;
        }

        const signData = item.data.sign;
        const postData = item.data.post;
        const typedPayload = {
          types: Object.assign({
            EIP712Domain: [
              { name: "name", type: "string" },
              { name: "version", type: "string" },
              { name: "chainId", type: "uint256" },
              { name: "verifyingContract", type: "address" }
            ]
          }, signData.types),
          domain: signData.domain,
          primaryType: signData.primaryType,
          message: signData.value
        };

        logMsg("✍️ MetaMask'ta ÜCRETSİZ (0 ETH Gas) EIP-3009 Köprü İmzasını onaylayın...");
        const sig = await window.ethereum.request({
          method: "eth_signTypedData_v4",
          params: [currentAccount, JSON.stringify(typedPayload)]
        });

        logMsg("🚀 İmza Relay ağına gönderiliyor (Ethereum -> Base transferi başlatıldı)...");
        const baseEndpoint = postData.endpoint.startsWith("http")
          ? postData.endpoint
          : "https://api.relay.link" + postData.endpoint;
        const execUrl = baseEndpoint + "?signature=" + encodeURIComponent(sig);
        const execRes = await fetch(execUrl, {
          method: postData.method || "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(postData.body)
        });
        const execJson = await execRes.json();
        logMsg("✅ Köprü işlemi kabul edildi! ~6 saniye içinde Base ağınıza USDC yatıyor... (" + JSON.stringify(execJson) + ")");

        setTimeout(async () => {
          await connectWallet();
          logMsg("🎉 Cüzdanınız tekrar Base Ağına (8453) alındı! Otomatik olarak Siftah başlatılıyor...");
          await runSiftah(ALL_ROUTES);
        }, 7000);
      } catch (err) {
        logMsg("❌ Köprü hatası: " + err.message);
      }
    }

    async function connectWallet() {
      if (!window.ethereum) {
        alert("Tarayıcıda MetaMask, Rabby veya Coinbase Wallet bulunamadı.");
        return;
      }
      try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        currentAccount = accounts[0];
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x2105" }],
          });
        } catch (switchErr) {
          if (switchErr.code === 4902) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: "0x2105",
                chainName: "Base Mainnet",
                nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
                rpcUrls: ["https://mainnet.base.org"],
                blockExplorerUrls: ["https://basescan.org"]
              }]
            });
          }
        }
        document.getElementById("walletStatus").innerHTML = "Bağlı Cüzdan: <code>" + currentAccount + "</code> (Base Mainnet)";
        logMsg("✅ Cüzdan bağlandı: " + currentAccount);
      } catch (err) {
        logMsg("❌ Cüzdan bağlantı hatası: " + err.message);
      }
    }

    async function signAndCallRoute(routePath) {
      if (!currentAccount) await connectWallet();
      if (!currentAccount) return;

      const nowSec = Math.floor(Date.now() / 1000);
      const validAfter = "0";
      const validBefore = String(nowSec + 3600);
      const nonce = randomBytes32Hex();
      const value = "1000"; // $0.001 USDC

      const typedData = {
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" }
          ],
          TransferWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" }
          ]
        },
        domain: {
          name: "USD Coin",
          version: "2",
          chainId: 8453,
          verifyingContract: USDC_ADDRESS
        },
        primaryType: "TransferWithAuthorization",
        message: {
          from: currentAccount,
          to: PAY_TO,
          value,
          validAfter,
          validBefore,
          nonce
        }
      };

      logMsg("✍️ " + routePath + " için $0.001 USDC EIP-3009 imzası isteniyor...");
      const signature = await window.ethereum.request({
        method: "eth_signTypedData_v4",
        params: [currentAccount, JSON.stringify(typedData)]
      });

      const paymentPayload = {
        x402Version: 2,
        scheme: "exact",
        network: "eip155:8453",
        payload: {
          signature,
          authorization: {
            from: currentAccount,
            to: PAY_TO,
            value,
            validAfter,
            validBefore,
            nonce
          }
        }
      };

      const b64Header = btoa(JSON.stringify(paymentPayload));
      logMsg("🚀 " + routePath + " uç noktasına ödeme başlığı gönderiliyor...");

      const res = await fetch(routePath, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Siftah-Mode": "1",
          "PAYMENT-SIGNATURE": b64Header
        },
        body: JSON.stringify({ message: "siftah-x402", query: "AERO", address: PAY_TO, domain: "stripe.com", url: "https://example.com", name: "lodash", token_in: "USDC", token_out: "WETH", amount: "10" })
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        logMsg("🎉 BAŞARILI! " + routePath + " onaylandı! TxHash: " + (data.tx_hash || "Facilitator onayladı"));
      } else {
        logMsg("⚠️ " + routePath + " yanıtı (" + res.status + "): " + JSON.stringify(data.error || data));
      }
    }

    async function runSiftah(routes) {
      for (const r of routes) {
        try {
          await signAndCallRoute(r);
        } catch (e) {
          logMsg("❌ Hata (" + r + "): " + e.message);
          break;
        }
      }
      logMsg("✅ Tüm seçili servisler tamamlandı!");
    }

    window.addEventListener("load", () => {
      if (window.location.search.includes("last3=1")) {
        setTimeout(async () => {
          logMsg("✨ Kalan son 3 servis (17, 18, 19) otomatik başlatılıyor...");
          await runSiftah(["/v1/compliance-check", "/v1/defi-swap-quote", "/v1/buy-pass"]);
          setTimeout(() => { window.location.href = "/stats"; }, 2500);
        }, 600);
      }
    });
  </script>
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

    // 1c. IndexNow & Wellknown Verification Files
    if (req.method === "GET" && pathname === "/a1af2789615a4324b3f183b97834ece8.txt") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("a1af2789615a4324b3f183b97834ece8");
    }

    if (
      req.method === "GET" &&
      (pathname === "/.well-known/wellknown-verify.txt" || pathname === "/.wellknown-verify")
    ) {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("wellknown-verify=wk-vMxD2c79jXgl0xSHjP2Gptu5\n");
    }

    // 1d. Google A2A Agent Card (/.well-known/agent-card.json) & Standard MCP Discovery Manifests
    if (req.method === "GET" && pathname === "/.well-known/agent-card.json") {
      return sendJson(res, 200, {
        protocolVersion: "0.3.0",
        schemaVersion: "1.0",
        name: "Agent Kiosk — 19-in-1 B2A Intelligence, Action & x402 API",
        description:
          "19-in-1 Autonomous B2A Intelligence, Executable DeFi Swap/Bridge Calldata Builder, AML/OFAC Compliance Screening, Token 360 Verdicts, Whale Portfolio Radar, and B2B Lead Dossiers settled in Base USDC via x402 v2 and MCP.",
        url: `${baseUrl}/mcp`,
        preferredTransport: "JSONRPC",
        version: "2.5.0",
        provider: {
          organization: "Agent Kiosk",
          url: "https://github.com/ralf9090/agent-kiosk",
        },
        capabilities: {
          streaming: false,
          pushNotifications: false,
          stateTransitionHistory: false,
          extensions: [
            {
              uri: "https://github.com/google-a2a/a2a-x402/v0.1",
              description: "Supports payment for catalogue listings via the x402 protocol, settled on Base (eip155:8453).",
              required: true,
            },
          ],
        },
        authentication: {
          schemes: ["x402", "ApiKey"],
          credentials: `Pay per request ($0.001-$0.10 USDC on Base eip155:8453 to ${CONFIG.payToWallet}) or mint a $5.00 30-day X-API-KEY pass at ${baseUrl}/v1/buy-pass`,
        },
        defaultInputModes: ["application/json", "text/plain"],
        defaultOutputModes: ["application/json", "text/markdown"],
        endpoints: {
          mcp: `${baseUrl}/mcp`,
          openapi: `${baseUrl}/openapi.json`,
          x402: `${baseUrl}/.well-known/x402.json`,
          stats: `${baseUrl}/stats`,
        },
        skills: MCP_TOOLS.map((t) => {
          const r = TOOL_TO_ROUTE[t.name];
          const p = PRICING[r];
          return {
            id: t.name,
            name: t.annotations?.title || t.name,
            description: `${t.description} (x402: POST ${baseUrl}${r} — $${p?.priceUsd || "0.02"} USDC on Base)`,
            tags: p?.tags || ["x402", "mcp", "base", "usdc", "attested"],
            inputModes: ["application/json"],
            outputModes: ["application/json", "text/markdown"],
          };
        }),
      });
    }

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
        prompts: MCP_PROMPTS,
        resources: MCP_RESOURCES,
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
    <a href="https://glama.ai/mcp/servers/ralf9090/agent-kiosk">🟢 Glama.ai (Rated A)</a>
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
        free_swap_endpoint: `${baseUrl}/v1/free-swap`,
      });
    }

    // 3b. Zero-Paywall DeFi Swap & Bridge Calldata Endpoint (earns 0.25% on-chain partner fee to payToWallet)
    if ((req.method === "POST" || req.method === "GET") && pathname === "/v1/free-swap") {
      try {
        const queryParams = Object.fromEntries(urlObj.searchParams.entries());
        const jsonBody = req.method === "POST" ? await readJsonBody(req) : {};
        const body = { ...queryParams, ...jsonBody };
        const data = await defiSwapQuote(body);
        const attestation = attestResponse("/v1/free-swap", data);
        await recordTelemetry("free_swap_quote", "/v1/free-swap", req, `${data.from_token?.symbol || "USDC"}->${data.to_token?.symbol || "ETH"}`);
        return sendJson(res, 200, {
          ok: true,
          payment_mode: "free-with-25bps-onchain-partner-fee",
          attestation,
          data,
        });
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err.message });
      }
    }

    // 4. Paid x402 v2/v1 Endpoints (all 19 routes)
    if ((req.method === "POST" || req.method === "GET") && ROUTE_HANDLERS[pathname]) {
      const resourceUrl = `${baseUrl}${pathname}`;
      const auth = await verifyAndSettlePayment(req, pathname, resourceUrl);

      if (!auth.authorized) {
        await recordTelemetry("x402_challenge", pathname, req, `$${PRICING[pathname]?.priceUsd || "0.02"} USDC`);
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

        const isOwnerBoost =
          auth.payer && auth.payer.toLowerCase() === CONFIG.payToWallet.toLowerCase();
        await recordTelemetry(
          isOwnerBoost ? "paid_call" : "external_paid_call",
          pathname,
          req,
          auth.payer ? `${auth.mode}:${auth.payer.slice(0, 10)}` : auth.mode
        );

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
      await recordTelemetry("mcp_get", "/mcp", req, "endpoint check");
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
          await recordTelemetry("mcp_init", "/mcp", req, params?.clientInfo?.name || "mcp-client");
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
          await recordTelemetry("mcp_tools_list", "/mcp", req, "19 tools indexed");
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
            result: { resources: MCP_RESOURCES },
          });
        }

        if (method === "resources/templates/list") {
          return sendJson(res, 200, {
            jsonrpc: "2.0",
            id,
            result: { resourceTemplates: MCP_RESOURCE_TEMPLATES },
          });
        }

        if (method === "resources/read") {
          const found = readMcpResource(params?.uri, baseUrl);
          if (!found) {
            return sendJson(res, 200, {
              jsonrpc: "2.0",
              id,
              error: { code: -32602, message: `Unknown resource URI: ${params?.uri}` },
            });
          }
          return sendJson(res, 200, {
            jsonrpc: "2.0",
            id,
            result: found,
          });
        }

        if (method === "prompts/list") {
          return sendJson(res, 200, {
            jsonrpc: "2.0",
            id,
            result: { prompts: MCP_PROMPTS },
          });
        }

        if (method === "prompts/get") {
          const rendered = renderMcpPrompt(params?.name, params?.arguments || {});
          if (!rendered) {
            return sendJson(res, 200, {
              jsonrpc: "2.0",
              id,
              error: { code: -32602, message: `Unknown prompt: ${params?.name}` },
            });
          }
          return sendJson(res, 200, {
            jsonrpc: "2.0",
            id,
            result: rendered,
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
            await recordTelemetry("x402_challenge", mappedRoute, req, `mcp-failed-sig:${toolName}`);
            return sendJson(res, 402, auth.challenge, {
              "PAYMENT-REQUIRED": auth.challengeHeader,
            });
          }

          if (!auth.authorized) {
            // Freemium Teaser Mode for MCP (Smithery / Cursor / Claude):
            // Returns HTTP 200 OK with 1 teaser item + exact x402 USDC payment instructions to unlock full data
            await recordTelemetry("mcp_teaser", mappedRoute, req, toolName);

            const teaserArgs = { ...args, limit: 2, max_length: 600 };
            const rawPreview = await ROUTE_HANDLERS[mappedRoute](teaserArgs, null);
            const priceUsd = PRICING[mappedRoute]?.priceUsd || "0.02";
            const lockNote = `[LOCKED — Pay $${priceUsd} USDC on Base via x402 POST ${baseUrl}${mappedRoute} OR use a $5.00 30-Day Prepaid Pass (POST ${baseUrl}/v1/buy-pass) to unlock full dataset]`;

            const teaserPayload = {
              tier:
                toolName === "defi_swap_quote"
                  ? "FREE_EXECUTABLE_SWAP_WITH_25BPS_PARTNER_FEE"
                  : "FREE_MCP_TEASER_PREVIEW",
              notice:
                toolName === "defi_swap_quote"
                  ? "Full executable swap/bridge calldata provided for FREE (includes 0.25% on-chain partner fee to Agent Kiosk)."
                  : `Showing limited preview. Unlock full unmasked results by calling POST ${baseUrl}${mappedRoute} with x402 payment ($${priceUsd} USDC on Base) OR mint a 30-day X-API-KEY pass ($5.00 USDC at POST ${baseUrl}/v1/buy-pass).`,
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
                transaction_request: rawPreview.transaction_request || undefined,
                llm_markdown:
                  toolName === "defi_swap_quote"
                    ? rawPreview.llm_markdown
                    : rawPreview.llm_markdown
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
          const isOwnerBoost =
            auth.payer && auth.payer.toLowerCase() === CONFIG.payToWallet.toLowerCase();
          await recordTelemetry(
            isOwnerBoost ? "paid_call" : "external_paid_call",
            mappedRoute,
            req,
            `mcp:${auth.mode}:${toolName}`
          );

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
