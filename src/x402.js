/**
 * x402 v2 & v1 Payment Protocol Middleware, Stateless Prepaid Pass & Multi-Facilitator Mainnet Settlement Layer
 * Supports 16 high-demand B2A endpoints (12 core tools, 3 $0.10 deep combo reports, 1 $5.00 30-day API Pass) on Base Mainnet.
 */
import crypto from "node:crypto";

const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString("hex");

export const CONFIG = {
  // Base / Ethereum wallet address receiving USDC micropayments
  payToWallet: process.env.PAY_TO_WALLET || "0xd8429209Aee6A398B9707DFf5F28AAA93452eE95",
  // CAIP-2 chain ID for Base Mainnet (8453)
  network: process.env.X402_NETWORK || "eip155:8453",
  // Base Mainnet USDC contract address
  usdcAsset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  // Live Base Mainnet facilitators (verified 200 OK with zero API key required)
  facilitatorsV2: [
    process.env.X402_FACILITATOR_URL || "https://facilitator.payai.network",
    "https://facilitator.dexter.cash",
  ],
  facilitatorsV1: [
    process.env.X402_FACILITATOR_URL || "https://facilitator.payai.network",
    "https://facilitator.dexter.cash",
    "https://facilitator.mogami.tech",
  ],
  apiSecretKey: process.env.API_SECRET_KEY || null,
  passSigningSecret:
    process.env.PASS_SIGNING_SECRET || process.env.API_SECRET_KEY || EPHEMERAL_FALLBACK_SECRET,
};

export const PRICING = {
  "/v1/ping": {
    priceUsd: "0.001",
    amount: "1000", // 0.001 USDC
    description:
      "Ultra-low-cost ($0.001 USDC) x402 v2 & v1 payment verification, wallet readiness ping, latency check, and echo test on Base Mainnet.",
    mimeType: "application/json",
    tags: ["ping", "health", "test", "verify", "status", "echo", "x402", "agents"],
    exampleInput: { message: "hello-x402" },
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Optional echo string to verify round-trip payload" },
      },
    },
    exampleOutput: {
      status: "pong",
      verified: true,
      service: "Agent Kiosk",
      network: "eip155:8453",
      asset: "USDC",
      echo: "hello-x402",
    },
  },
  "/v1/social-search": {
    priceUsd: "0.02",
    amount: "20000", // 0.02 USDC
    description:
      "Real-time social media search (Reddit, HackerNews) returning clean JSON & Markdown for AI agents.",
    mimeType: "application/json",
    tags: ["social", "search", "reddit", "hackernews", "sentiment", "trends", "scraping"],
    exampleInput: { query: "autonomous AI agents", platform: "all", limit: 5 },
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search keywords or topic" },
        platform: { type: "string", enum: ["all", "reddit", "hn"] },
        limit: { type: "number" },
      },
      required: ["query"],
    },
    exampleOutput: {
      query: "autonomous AI agents",
      platform: "all",
      count: 5,
      items: [{ source: "hackernews", title: "Show HN: Autonomous x402 Agents", score: 245 }],
    },
  },
  "/v1/maps-leads": {
    priceUsd: "0.03",
    amount: "30000", // 0.03 USDC
    description:
      "Local business lead extractor returning company name, phone, website, address, and coordinates.",
    mimeType: "application/json",
    tags: ["leads", "b2b", "maps", "local-business", "contacts", "phone", "enrichment"],
    exampleInput: { query: "dentist", location: "San Francisco", limit: 5 },
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Business category or name" },
        location: { type: "string", description: "City or region" },
        limit: { type: "number" },
      },
      required: ["query"],
    },
    exampleOutput: {
      query: "dentist",
      location: "San Francisco",
      count: 5,
      leads: [{ name: "SF Dental Studio", phone: "+1-415-555-0199", website: "https://sfdental.example.com" }],
    },
  },
  "/v1/web-extract": {
    priceUsd: "0.01",
    amount: "10000", // 0.01 USDC
    description:
      "Clean webpage-to-Markdown extractor with automatic Prompt Injection trap scanning for AI agents.",
    mimeType: "application/json",
    tags: ["web", "scraper", "markdown", "extract", "crawler", "prompt-injection", "security"],
    exampleInput: { url: "https://example.com", max_length: 8000 },
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Target webpage URL (https://...)" },
        max_length: { type: "number" },
      },
      required: ["url"],
    },
    exampleOutput: {
      url: "https://example.com",
      title: "Example Domain",
      prompt_injection_scan: { safe: true, risk_level: "LOW" },
      llm_markdown: "# Example Domain\nThis domain is for use in illustrative examples...",
    },
  },
  "/v1/security-audit": {
    priceUsd: "0.02",
    amount: "20000", // 0.02 USDC
    description:
      "Pre-flight security scanner for 0x smart contracts/tokens (honeypot, tax, liquidity via GoPlus & DexScreener) and URLs (phishing & prompt injection).",
    mimeType: "application/json",
    tags: ["security", "audit", "honeypot", "smart-contract", "token", "goplus", "phishing"],
    exampleInput: { target: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", chain: "base" },
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "string", description: "0x contract address or https:// URL" },
        chain: { type: "string", enum: ["base", "ethereum", "bsc", "arbitrum", "polygon", "optimism"] },
      },
      required: ["target"],
    },
    exampleOutput: {
      target_type: "smart_contract",
      chain: "base",
      verdict: "SAFE",
      risk_score: 0,
      honeypot_check: { is_honeypot: false, buy_tax_pct: 0, sell_tax_pct: 0 },
    },
  },
  "/v1/token-alpha": {
    priceUsd: "0.02",
    amount: "20000", // 0.02 USDC
    description:
      "Real-time DEX order-flow & token alpha signal analyzer: buy vs. sell pressure, liquidity depth, volume velocity, and top pools.",
    mimeType: "application/json",
    tags: ["crypto", "defi", "token", "alpha", "dex", "order-flow", "signals", "base"],
    exampleInput: { query: "AERO", chain: "base" },
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Token symbol or 0x contract address" },
        chain: { type: "string" },
      },
      required: ["query"],
    },
    exampleOutput: {
      query: "AERO",
      signal: "BULLISH_ACCUMULATION",
      buy_pressure_24h_pct: 58.4,
      total_liquidity_usd: 42500000,
    },
  },
  "/v1/domain-intel": {
    priceUsd: "0.02",
    amount: "20000", // 0.02 USDC
    description:
      "B2B company & domain intelligence: DNS records, MX email provider, SaaS tech stack fingerprints from TXT/NS, RDAP registration, and active subdomains.",
    mimeType: "application/json",
    tags: ["domain", "dns", "b2b", "enrichment", "tech-stack", "whois", "osint"],
    exampleInput: { domain: "stripe.com" },
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Target company domain (e.g. stripe.com)" },
      },
      required: ["domain"],
    },
    exampleOutput: {
      domain: "stripe.com",
      email_provider: "Google Workspace",
      detected_tech_stack: ["Google Cloud", "SPF Configured", "DMARC Enforced"],
    },
  },
  "/v1/package-audit": {
    priceUsd: "0.01",
    amount: "10000", // 0.01 USDC
    description:
      "Open-source package & CVE vulnerability scanner for coding agents (npm, PyPI, crates.io) powered by Google OSV.dev.",
    mimeType: "application/json",
    tags: ["security", "cve", "npm", "pypi", "rust", "package", "vulnerability", "coding"],
    exampleInput: { name: "express", ecosystem: "npm" },
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Package name" },
        ecosystem: { type: "string", enum: ["npm", "pypi", "crates.io"] },
        version: { type: "string" },
      },
      required: ["name"],
    },
    exampleOutput: {
      package: "express",
      ecosystem: "npm",
      latest_version: "5.1.0",
      verdict: "CLEAN",
      vulnerability_count: 0,
    },
  },
  "/v1/academic-search": {
    priceUsd: "0.02",
    amount: "20000", // 0.02 USDC
    description:
      "Peer-reviewed scientific paper & preprint search (OpenAlex + arXiv) returning citations, reconstructed abstracts, and direct Open-Access PDF links.",
    mimeType: "application/json",
    tags: ["research", "academic", "arxiv", "papers", "science", "citations", "pdf"],
    exampleInput: { query: "autonomous AI agents", limit: 5 },
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Scientific topic or paper query" },
        limit: { type: "number" },
      },
      required: ["query"],
    },
    exampleOutput: {
      query: "autonomous AI agents",
      count: 5,
      papers: [{ title: "Autonomous LLM Agents in Decentralized Markets", citations: 142 }],
    },
  },
  "/v1/wallet-profiler": {
    priceUsd: "0.03",
    amount: "30000", // 0.03 USDC
    description:
      "Multi-chain whale & wallet portfolio profiler across Base, Ethereum, Arbitrum, and Polygon: live USDC & ETH balances, transaction counts, and smart contract detection.",
    mimeType: "application/json",
    tags: ["wallet", "whale", "portfolio", "onchain", "base", "ethereum", "usdc", "profiler"],
    exampleInput: { address: "0xd8429209Aee6A398B9707DFf5F28AAA93452eE95" },
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "0x EVM wallet address" },
      },
      required: ["address"],
    },
    exampleOutput: {
      address: "0xd8429209Aee6A398B9707DFf5F28AAA93452eE95",
      wallet_tier: "ACTIVE_TRADER",
      summary: { total_usdc_balance: 1250.5, total_native_eth_equivalent: 0.42 },
    },
  },
  "/v1/prediction-markets": {
    priceUsd: "0.02",
    amount: "20000", // 0.02 USDC
    description:
      "Live prediction market odds & implied event probabilities (%) from Polymarket and Manifold Markets for macro, crypto, tech, and politics.",
    mimeType: "application/json",
    tags: ["polymarket", "prediction-markets", "odds", "forecasting", "macro", "crypto"],
    exampleInput: { query: "bitcoin", limit: 5 },
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Event topic or keyword" },
        limit: { type: "number" },
      },
      required: ["query"],
    },
    exampleOutput: {
      query: "bitcoin",
      count: 5,
      markets: [{ question: "Will Bitcoin reach $150k?", implied_probability_pct: 64.2 }],
    },
  },
  "/v1/defi-yields": {
    priceUsd: "0.02",
    amount: "20000", // 0.02 USDC
    description:
      "DeFi highest APY & yield radar powered by DeFiLlama: ranks top liquidity and lending pools by APY and TVL for any token and chain.",
    mimeType: "application/json",
    tags: ["defi", "yield", "apy", "lending", "usdc", "base", "defillama", "liquidity"],
    exampleInput: { symbol: "USDC", chain: "Base", min_tvl_usd: 100000 },
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Token symbol (e.g. USDC, ETH)" },
        chain: { type: "string", description: "Chain name (e.g. Base, Ethereum)" },
        min_tvl_usd: { type: "number" },
      },
    },
    exampleOutput: {
      symbol_filter: "USDC",
      chain_filter: "Base",
      pools: [{ project: "moonwell-lending", symbol: "USDC", apy_total_pct: 8.45, tvl_usd: 48000000 }],
    },
  },
  "/v1/github-intel": {
    priceUsd: "0.01",
    amount: "10000", // 0.01 USDC
    description:
      "GitHub repository & open-source competitive intelligence: stars, forks, open issues, latest releases, and top repositories by topic.",
    mimeType: "application/json",
    tags: ["github", "opensource", "developer", "repos", "analytics", "releases"],
    exampleInput: { query: "modelcontextprotocol/servers" },
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "'owner/repo' or search topic" },
        limit: { type: "number" },
      },
      required: ["query"],
    },
    exampleOutput: {
      mode: "repository_detail",
      full_name: "modelcontextprotocol/servers",
      stars: 42000,
    },
  },
  "/v1/token-due-diligence": {
    priceUsd: "0.10",
    amount: "100000", // 0.10 USDC
    description:
      "Institutional 3-in-1 Token Due Diligence Report: combines GoPlus on-chain honeypot/tax security audit, DexScreener order-flow alpha & liquidity depth, and live Reddit/HN social sentiment into a composite investment grade (A-F).",
    mimeType: "application/json",
    tags: ["token", "verdict", "due-diligence", "security", "alpha", "honeypot", "base", "agents"],
    exampleInput: { query: "AERO", chain: "base" },
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Token symbol or 0x contract address on Base/EVM" },
        chain: { type: "string", enum: ["base", "ethereum", "solana", "arbitrum", "bsc", "all"] },
      },
      required: ["query"],
    },
    exampleOutput: {
      report_type: "TOKEN_360_DUE_DILIGENCE",
      composite_score_100: 92,
      investment_grade: "A",
      verdict: "STRONG_FUNDAMENTALS_AND_SAFE_CONTRACT",
      actionable_recommendation: "ACCUMULATE_OR_HOLD",
    },
  },
  "/v1/b2b-company-dossier": {
    priceUsd: "0.10",
    amount: "100000", // 0.10 USDC
    description:
      "Complete 4-in-1 B2B Sales & Competitive Intelligence Dossier: combines DNS/MX/SaaS tech stack infrastructure, clean website extraction, local business contact/phone leads, and social mentions.",
    mimeType: "application/json",
    tags: ["b2b", "enrichment", "company-dossier", "leads", "sales", "domain", "research"],
    exampleInput: { domain: "stripe.com", company: "Stripe", location: "San Francisco" },
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Company domain (e.g. stripe.com)" },
        company: { type: "string", description: "Company name" },
        location: { type: "string", description: "HQ city" },
      },
      required: ["domain"],
    },
    exampleOutput: {
      report_type: "B2B_COMPANY_360_DOSSIER",
      domain: "stripe.com",
      executive_summary: { email_infrastructure: "Google Workspace", social_mentions_found: 5 },
    },
  },
  "/v1/whale-alpha-radar": {
    priceUsd: "0.10",
    amount: "100000", // 0.10 USDC
    description:
      "Complete Multi-Chain Whale Portfolio & DeFi Yield Optimizer Report: profiles wallet across 4 EVM chains (Base, ETH, Arbitrum, Polygon), matches idle USDC/ETH against top DeFiLlama yield pools, and calculates projected annual yield.",
    mimeType: "application/json",
    tags: ["whale", "portfolio", "defi", "yield", "wallet", "base", "usdc", "analytics"],
    exampleInput: { address: "0xd8429209Aee6A398B9707DFf5F28AAA93452eE95" },
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "0x EVM wallet address" },
      },
      required: ["address"],
    },
    exampleOutput: {
      report_type: "WHALE_PORTFOLIO_AND_YIELD_OPTIMIZER",
      wallet_tier: "ACTIVE_TRADER",
      yield_optimization_plan: { best_base_usdc_apy_pct: 8.45 },
    },
  },
  "/v1/compliance-check": {
    priceUsd: "0.05",
    amount: "50000", // 0.05 USDC
    description:
      "Institutional AML, Sanctions (OFAC), Phishing, Mixer & Malicious Counterparty Compliance Screening for any 0x EVM wallet or contract before executing agent transfers.",
    mimeType: "application/json",
    tags: ["compliance", "aml", "sanctions", "ofac", "kyc", "security", "wallet", "attested"],
    exampleInput: { address: "0xd8429209Aee6A398B9707DFf5F28AAA93452eE95" },
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "0x EVM wallet or contract address to screen" },
      },
      required: ["address"],
    },
    exampleOutput: {
      certificate_type: "AML_SANCTIONS_COUNTERPARTY_SCREENING",
      compliance_status: "APPROVED_CLEAN",
      safe_to_transact: true,
      aml_risk_score_100: 0,
      triggered_flags: [],
    },
  },
  "/v1/defi-swap-quote": {
    priceUsd: "0.05",
    amount: "50000", // 0.05 USDC
    description:
      "Executable DeFi Swap & Cross-Chain Bridge Action Calldata Builder (LI.FI + ParaSwap): computes best DEX/Bridge route and returns ready-to-sign EVM transaction calldata (to, data, value, gasLimit) on Base, Ethereum, Arbitrum, Polygon, and Optimism.",
    mimeType: "application/json",
    tags: ["swap", "bridge", "defi", "calldata", "execution", "dex", "base", "usdc", "attested"],
    exampleInput: { from_token: "USDC", to_token: "ETH", amount: "10", from_chain: "base" },
    inputSchema: {
      type: "object",
      properties: {
        from_token: { type: "string", description: "Source token symbol (USDC, ETH, AERO) or 0x address" },
        to_token: { type: "string", description: "Destination token symbol (ETH, USDC, AERO, cbBTC) or 0x address" },
        amount: { type: "string", description: "Amount to swap (human-readable e.g. '10' or atomic units)" },
        from_chain: { type: "string", enum: ["base", "ethereum", "arbitrum", "polygon", "optimism"] },
        to_chain: { type: "string", enum: ["base", "ethereum", "arbitrum", "polygon", "optimism"] },
        wallet: { type: "string", description: "Optional 0x sender wallet address" },
      },
      required: ["from_token", "to_token"],
    },
    exampleOutput: {
      action_type: "DEX_SWAP_CALLDATA",
      aggregator: "lifi",
      from_chain_id: 8453,
      to_chain_id: 8453,
      transaction_request: {
        to: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE",
        value: "0x0",
        data: "0x...",
      },
    },
  },
  "/v1/tx-simulate": {
    priceUsd: "0.005",
    amount: "5000", // 0.005 USDC
    description:
      "Pre-flight EVM Transaction Simulator, Gas Estimator, Revert Reason Decoder, ERC-20 Allowance Checker & EIP-1967 Proxy Detector across Base, Ethereum, Arbitrum, Optimism, and Polygon.",
    mimeType: "application/json",
    tags: [
      "evm",
      "simulate",
      "estimate-gas",
      "call",
      "allowance",
      "proxy",
      "tx-receipt",
      "base",
      "ethereum",
      "pre-flight",
    ],
    exampleInput: {
      chain: "base",
      from: "0xd8429209Aee6A398B9707DFf5F28AAA93452eE95",
      to: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      data: "0x18160ddd",
    },
    inputSchema: {
      type: "object",
      properties: {
        chain: {
          type: "string",
          enum: ["base", "ethereum", "arbitrum", "optimism", "polygon"],
          description: "Target EVM network (default: base)",
        },
        from: { type: "string", description: "0x sender address" },
        to: { type: "string", description: "0x target contract or recipient address" },
        data: { type: "string", description: "0x hex calldata to simulate via eth_call & eth_estimateGas" },
        value: { type: "string", description: "Optional native ETH value in wei or 0x hex" },
        token: { type: "string", description: "Optional 0x ERC-20 token address to check allowance" },
        spender: { type: "string", description: "Optional 0x spender address to check ERC-20 allowance" },
        tx_hash: { type: "string", description: "Optional 0x transaction hash to fetch receipt" },
      },
    },
    exampleOutput: {
      chain: "base",
      chain_id: 8453,
      verdict: "SAFE_TO_BROADCAST",
      simulation: {
        will_revert: false,
        estimated_gas: 26410,
        gas_price_gwei: 0.0061,
        estimated_fee_usd: 0.0004,
      },
      target_contract: {
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        is_contract: true,
        is_eip1967_proxy: true,
      },
    },
  },
  "/v1/funding-rates": {
    priceUsd: "0.008",
    amount: "8000", // 0.008 USDC
    description:
      "Real-time Cross-Exchange Perpetual Funding Rate Arbitrage, Annualized Basis Spread (APR), Open Interest & Crowded Positioning Radar across Hyperliquid and dYdX v4.",
    mimeType: "application/json",
    tags: [
      "funding-rates",
      "perpetuals",
      "arbitrage",
      "hyperliquid",
      "dydx",
      "open-interest",
      "crypto",
      "basis-trade",
    ],
    exampleInput: { symbol: "BTC", limit: 10 },
    inputSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Optional coin ticker filter (e.g. BTC, ETH, SOL, AERO) or omit for top spreads",
        },
        limit: { type: "number", description: "Max perpetual markets to return (1-40)" },
      },
    },
    exampleOutput: {
      symbol_filter: "BTC",
      markets_scanned: 234,
      items: [
        {
          symbol: "BTC",
          net_arb_spread_apr_pct: 11.45,
          strategy: "SHORT Hyperliquid / LONG dYdX",
          positioning_regime: "BALANCED",
        },
      ],
    },
  },
  "/v1/macro-radar": {
    priceUsd: "0.008",
    amount: "8000", // 0.008 USDC
    description:
      "Global TradFi, Macro & DeFi Capital Flow Intelligence Radar: live S&P 500, Nasdaq, VIX Volatility, US Dollar Index (DXY), US 10Y Treasury Yield, Gold, Crude Oil, Crypto Fear & Greed, BTC Dominance & DeFi Chain TVL.",
    mimeType: "application/json",
    tags: [
      "tradfi",
      "macro",
      "vix",
      "dxy",
      "sp500",
      "treasury-yields",
      "fear-and-greed",
      "defi-analytics",
      "tvl",
    ],
    exampleInput: { focus: "all" },
    inputSchema: {
      type: "object",
      properties: {
        focus: {
          type: "string",
          enum: ["all", "tradfi", "crypto", "defi"],
          description: "Macro focus area (default: all)",
        },
      },
    },
    exampleOutput: {
      macro_regime: "MACRO_ROTATION_NEUTRAL",
      fear_and_greed: { value: 64, classification: "Greed" },
      tradfi_benchmarks: [
        { ticker: "^GSPC", name: "S&P 500", price: 5842.5, change_pct: 0.42 },
        { ticker: "^VIX", name: "CBOE Volatility Index (VIX)", price: 18.4, change_pct: -2.1 },
      ],
    },
  },
  "/v1/prediction-arb": {
    priceUsd: "0.015",
    amount: "15000", // 0.015 USDC
    description:
      "Unified Kalshi, Polymarket & Manifold Prediction Market Aggregator and Cross-Venue Probability Spread / Arbitrage Scanner.",
    mimeType: "application/json",
    tags: [
      "kalshi",
      "polymarket",
      "prediction-markets",
      "arbitrage",
      "odds",
      "probabilities",
      "forecasting",
    ],
    exampleInput: { query: "bitcoin", limit: 10 },
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Topic or event keyword to scan across Kalshi, Polymarket & Manifold (e.g. bitcoin, fed, election)",
        },
        limit: { type: "number", description: "Max markets to return (1-25)" },
      },
      required: ["query"],
    },
    exampleOutput: {
      query: "bitcoin",
      total_scanned: 65,
      markets: [
        {
          venue: "polymarket",
          title: "Will Bitcoin reach $100k?",
          yes_probability_pct: 62.5,
          volume_usd: 14500000,
        },
      ],
    },
  },
  "/v1/buy-pass": {
    priceUsd: "5.00",
    amount: "5000000", // 5.00 USDC
    description:
      "Instant 30-Day Prepaid API Key Pass (ak_live_...) for AI agents, LangChain, n8n, Make.com, and developers. Unlocks all 22 Agent Kiosk REST & MCP intelligence tools for 30 days via X-API-KEY header without per-call x402 signing.",
    mimeType: "application/json",
    tags: ["prepaid", "api-key", "pass", "subscription", "access", "agents", "mcp", "attested"],
    exampleInput: { agent_name: "my-autonomous-agent" },
    inputSchema: {
      type: "object",
      properties: {
        agent_name: { type: "string", description: "Optional agent or application identifier" },
      },
    },
    exampleOutput: {
      api_key: "ak_live_eyJ2IjoxLCJ0aWVyIjoiUFJPXzMwRF9QQVNTIn0.signature",
      tier: "PRO_30D_PASS",
      valid_days: 30,
    },
  },
};

/**
 * Generate a cryptographic attestation envelope so downstream agents and contracts can verify payload integrity
 */
export function attestResponse(routePath, dataPayload) {
  const timestamp = new Date().toISOString();
  const serialized = JSON.stringify(dataPayload || {});
  const payloadHash = crypto.createHash("sha256").update(serialized).digest("hex");
  const sigInput = `v1:${routePath}:${timestamp}:${payloadHash}`;
  const signature = crypto
    .createHmac("sha256", CONFIG.passSigningSecret)
    .update(sigInput)
    .digest("base64url");

  return {
    attested: true,
    issuer: "io.github.ralf9090/agent-kiosk",
    signer_wallet: CONFIG.payToWallet,
    algorithm: "HMAC-SHA256",
    route: routePath,
    payload_sha256: payloadHash,
    timestamp_utc: timestamp,
    signature,
  };
}

/**
 * Issue a stateless HMAC-SHA256 signed 30-day API key (ak_live_<payloadB64>.<sigB64>)
 */
export function issuePrepaidPass({ payer = null, txHash = null, days = 30 } = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + days * 86400;
  const payload = {
    v: 1,
    tier: "PRO_30D_PASS",
    iat: nowSec,
    exp: expSec,
    payer: payer || "x402-buyer",
    tx: txHash || null,
    jti: crypto.randomBytes(8).toString("hex"),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sigB64 = crypto
    .createHmac("sha256", CONFIG.passSigningSecret)
    .update(payloadB64)
    .digest("base64url");
  return {
    api_key: `ak_live_${payloadB64}.${sigB64}`,
    tier: payload.tier,
    issued_at: new Date(nowSec * 1000).toISOString(),
    expires_at: new Date(expSec * 1000).toISOString(),
    valid_days: days,
    payer: payload.payer,
    tx_hash: payload.tx,
  };
}

/**
 * Verify a stateless HMAC-SHA256 signed API key (ak_live_<payloadB64>.<sigB64>)
 */
export function verifyPrepaidPass(token) {
  if (!token || typeof token !== "string" || !token.startsWith("ak_live_")) {
    return null;
  }
  const raw = token.slice("ak_live_".length);
  const dotIdx = raw.indexOf(".");
  if (dotIdx <= 0) return null;
  const payloadB64 = raw.slice(0, dotIdx);
  const sigB64 = raw.slice(dotIdx + 1);

  const expectedSig = crypto
    .createHmac("sha256", CONFIG.passSigningSecret)
    .update(payloadB64)
    .digest("base64url");

  const sigBuf = Buffer.from(sigB64);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload.exp || nowSec >= payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Decode payment header supporting standard Base64, Base64URL, or raw JSON string
 */
function decodePaymentHeader(rawHeader) {
  const trimmed = String(rawHeader || "").trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }
  const normalizedB64 = trimmed.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(normalizedB64, "base64").toString("utf8"));
}

/**
 * Build standard x402 v2 PaymentRequired response body and PAYMENT-REQUIRED base64 header
 * Includes full Coinbase CDP Bazaar & x402scan discovery metadata (serviceName, iconUrl, tags, extensions.bazaar)
 */
export function build402Challenge(routePath, resourceUrl) {
  const route = PRICING[routePath] || PRICING["/v1/social-search"];
  const rawTags = route.tags || ["agents", "x402", "mcp", "base", "usdc"];
  const tagsWithAttested = rawTags.includes("attested") ? rawTags : [...rawTags, "attested"];

  const body = {
    x402Version: 2,
    error: "PAYMENT-SIGNATURE header is required",
    resource: {
      url: resourceUrl,
      description: route.description,
      mimeType: route.mimeType,
      serviceName: "Agent Kiosk",
      iconUrl: "https://agent-kiosk.vercel.app/favicon.ico",
      tags: tagsWithAttested,
    },
    accepts: [
      {
        scheme: "exact",
        network: CONFIG.network,
        amount: route.amount,
        asset: CONFIG.usdcAsset,
        payTo: CONFIG.payToWallet,
        maxTimeoutSeconds: 60,
        resource: resourceUrl,
        extra: {
          name: "USD Coin",
          version: "2",
        },
      },
    ],
    extensions: {
      bazaar: {
        info: {
          input: {
            type: "http",
            method: "POST",
            bodyType: "json",
            discoverable: true,
            body: route.exampleInput || {},
          },
          output: {
            type: "json",
            example: route.exampleOutput || { ok: true },
          },
        },
        schema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          properties: {
            input: {
              type: "object",
              properties: {
                type: { type: "string", const: "http" },
                method: { type: "string", enum: ["POST", "GET"] },
                bodyType: { type: "string", const: "json" },
                discoverable: { type: "boolean", const: true },
                body: route.inputSchema || { type: "object" },
              },
              required: ["type", "method"],
            },
            output: {
              type: "object",
              properties: {
                type: { type: "string", const: "json" },
                example: { type: "object" },
              },
              required: ["type"],
            },
          },
          required: ["input", "output"],
        },
      },
    },
  };

  const headerBase64 = Buffer.from(JSON.stringify(body)).toString("base64");

  return { body, headerBase64 };
}

/**
 * Verify AND settle incoming x402 v2/v1 payment header across Base Mainnet facilitators
 */
export async function verifyAndSettlePayment(req, routePath, resourceUrl) {
  // 1. Check explicit API_SECRET_KEY or signed 30-day Prepaid Pass (ak_live_...)
  const providedKey = (
    req.headers["x-api-key"] ||
    (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "")
  ).trim();

  if (CONFIG.apiSecretKey && providedKey && providedKey === CONFIG.apiSecretKey) {
    return { authorized: true, mode: "api-key", settlementHeader: null };
  }

  if (routePath !== "/v1/buy-pass" && providedKey && providedKey.startsWith("ak_live_")) {
    const passPayload = verifyPrepaidPass(providedKey);
    if (passPayload) {
      return {
        authorized: true,
        mode: "prepaid-pass",
        payer: passPayload.payer,
        settlementHeader: null,
      };
    }
  }

  // 2. Require x402 PAYMENT-SIGNATURE (v2) or X-PAYMENT (v1) header
  const paymentHeader =
    req.headers["payment-signature"] ||
    req.headers["x-payment"] ||
    req.headers["x-payment-signature"];
  const { body: challenge, headerBase64 } = build402Challenge(routePath, resourceUrl);

  if (!paymentHeader) {
    return {
      authorized: false,
      statusCode: 402,
      challenge,
      challengeHeader: headerBase64,
    };
  }

  const route = PRICING[routePath] || PRICING["/v1/social-search"];

  try {
    const decoded = decodePaymentHeader(paymentHeader);

    // Auto-detect x402 v1 vs v2 from x402Version, network name ('base' vs 'eip155:8453'), or header type
    const isV1 =
      Number(decoded.x402Version) === 1 ||
      decoded.network === "base" ||
      (!decoded.x402Version && !decoded.accepted && Boolean(req.headers["x-payment"]));
    const clientVersion = isV1 ? 1 : 2;

    // Coerce EIP-3009 numeric fields (value, validAfter, validBefore) to strings so strict facilitators never reject
    const rawPayload = decoded.payload ? { ...decoded.payload } : {};
    if (rawPayload.authorization && typeof rawPayload.authorization === "object") {
      const authObj = { ...rawPayload.authorization };
      if (authObj.value !== undefined) authObj.value = String(authObj.value);
      if (authObj.validAfter !== undefined) authObj.validAfter = String(authObj.validAfter);
      if (authObj.validBefore !== undefined) authObj.validBefore = String(authObj.validBefore);
      rawPayload.authorization = authObj;
    }

    const isOwnerSiftah =
      req.headers["x-siftah-mode"] === "1" &&
      String(rawPayload?.authorization?.from || "").toLowerCase() ===
        CONFIG.payToWallet.toLowerCase();
    const signedValStr = String(rawPayload?.authorization?.value || "");
    const signedValNum = /^\d+$/.test(signedValStr) ? Number(signedValStr) : 0;
    const effectiveAmount = isOwnerSiftah
      ? "1000"
      : routePath !== "/v1/buy-pass" && signedValNum >= 1000
      ? signedValStr
      : route.amount;

    const cleanV2Requirements = {
      scheme: "exact",
      network: CONFIG.network,
      amount: effectiveAmount,
      asset: CONFIG.usdcAsset,
      payTo: CONFIG.payToWallet,
      maxTimeoutSeconds: 60,
      extra: { name: "USD Coin", version: "2" },
    };

    const cleanV1Requirements = {
      scheme: "exact",
      network: "base",
      maxAmountRequired: effectiveAmount,
      resource:
        (typeof decoded.resource === "string" ? decoded.resource : decoded.resource?.url) ||
        resourceUrl,
      description: route.description,
      mimeType: route.mimeType,
      payTo: CONFIG.payToWallet,
      maxTimeoutSeconds: 60,
      asset: CONFIG.usdcAsset,
      extra: { name: "USD Coin", version: "2" },
    };

    const paymentRequirements = clientVersion === 1 ? cleanV1Requirements : cleanV2Requirements;

    // Normalize paymentPayload so lightweight v2 signers that omit 'accepted' or 'resource' pass PayAI & Dexter validation
    const normalizedPayload =
      clientVersion === 2
        ? {
            ...decoded,
            x402Version: 2,
            resource:
              decoded.resource && typeof decoded.resource === "object"
                ? decoded.resource
                : challenge.resource,
            accepted: cleanV2Requirements,
            extensions: decoded.extensions || challenge.extensions,
            payload: rawPayload,
          }
        : {
            ...decoded,
            x402Version: 1,
            scheme: decoded.scheme || "exact",
            network: "base",
            payload: rawPayload,
          };

    const normalizedHeaderBase64 = Buffer.from(JSON.stringify(normalizedPayload)).toString(
      "base64"
    );

    const facilitators =
      clientVersion === 1 ? CONFIG.facilitatorsV1 : CONFIG.facilitatorsV2;

    let lastError = "Facilitator verification failed.";

    for (const facilitatorUrl of facilitators) {
      try {
        const reqBody = JSON.stringify({
          x402Version: clientVersion,
          paymentPayload: normalizedPayload,
          paymentHeader: normalizedHeaderBase64,
          paymentRequirements,
        });

        const verifyRes = await fetch(`${facilitatorUrl}/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: reqBody,
          signal: AbortSignal.timeout(6500),
        });

        const verifyText = await verifyRes.text();
        let verifyData = null;
        try {
          verifyData = JSON.parse(verifyText);
        } catch {
          verifyData = null;
        }

        if (!verifyRes.ok) {
          lastError =
            verifyData?.invalidMessage ||
            verifyData?.invalidReason ||
            verifyData?.error ||
            `Facilitator ${facilitatorUrl} verify returned HTTP ${verifyRes.status}`;
          continue;
        }

        if (!verifyData?.isValid) {
          lastError =
            verifyData?.invalidMessage ||
            verifyData?.invalidReason ||
            "Invalid or expired PAYMENT-SIGNATURE.";
          if (verifyData?.invalidReason === "invalid_exact_evm_signature") {
            return {
              authorized: false,
              statusCode: 402,
              challenge: {
                ...challenge,
                error: lastError,
              },
              challengeHeader: headerBase64,
            };
          }
          continue;
        }

        // Settle transaction on Base Mainnet so USDC lands in payToWallet
        const settleRes = await fetch(`${facilitatorUrl}/settle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: reqBody,
          signal: AbortSignal.timeout(10000),
        });

        const settleText = await settleRes.text();
        let settleData = null;
        try {
          settleData = JSON.parse(settleText);
        } catch {
          settleData = null;
        }

        if (!settleRes.ok || !settleData?.success) {
          lastError =
            settleData?.error ||
            settleData?.errorReason ||
            `Facilitator ${facilitatorUrl} settle returned HTTP ${settleRes.status}`;
          continue;
        }

        const settlementHeader = Buffer.from(JSON.stringify(settleData)).toString("base64");

        return {
          authorized: true,
          mode: "x402",
          payer: rawPayload?.authorization?.from || verifyData?.payer || null,
          txHash: settleData.txHash || settleData.transaction || null,
          settlementHeader,
        };
      } catch (innerErr) {
        lastError = innerErr.message;
      }
    }

    return {
      authorized: false,
      statusCode: 402,
      challenge: {
        ...challenge,
        error: lastError,
      },
      challengeHeader: headerBase64,
    };
  } catch (err) {
    return {
      authorized: false,
      statusCode: 402,
      challenge: {
        ...challenge,
        error: `Malformed PAYMENT-SIGNATURE payload: ${err.message}`,
      },
      challengeHeader: headerBase64,
    };
  }
}
