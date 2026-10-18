#!/usr/bin/env node
/**
 * Standard MCP stdio server for local/registry integration (Glama, Smithery, Cursor, Claude Desktop)
 */
import readline from "node:readline";
import {
  MCP_TOOLS,
  MCP_PROMPTS,
  MCP_RESOURCES,
  MCP_RESOURCE_TEMPLATES,
  renderMcpPrompt,
  readMcpResource,
} from "./server.js";
import { CONFIG, PRICING, build402Challenge, verifyAndSettlePayment } from "./x402.js";
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
  evmTxSimulator,
  perpFundingArbitrage,
  tradfiMacroRadar,
  kalshiPolymarketArb,
} from "./providers.js";

const HANDLERS = {
  social_search: socialSearch,
  maps_leads: mapsLeads,
  web_extract: webExtract,
  security_audit: securityAudit,
  token_alpha: tokenAlpha,
  domain_intel: domainIntel,
  package_audit: packageAudit,
  academic_search: academicSearch,
  wallet_profiler: walletProfiler,
  prediction_markets: predictionMarkets,
  defi_yields: defiYields,
  github_intel: githubIntel,
  compliance_check: complianceCheck,
  defi_swap_quote: defiSwapQuote,
  evm_tx_simulator: evmTxSimulator,
  perp_funding_arbitrage: perpFundingArbitrage,
  tradfi_macro_radar: tradfiMacroRadar,
  kalshi_polymarket_arb: kalshiPolymarketArb,
  token_due_diligence: tokenDueDiligence,
  b2b_company_dossier: b2bCompanyDossier,
  whale_alpha_radar: whaleAlphaRadar,
  buy_prepaid_pass: async () => ({
    status: "PAYMENT_REQUIRED_FOR_LIVE_KEY",
    tier: "PRO_30D_PASS",
    price_usdc: "5.00",
    valid_days: 30,
    api_key:
      "[LOCKED — Send POST https://agent-kiosk.vercel.app/v1/buy-pass with $5.00 USDC x402 payment on Base to mint your live 30-day ak_live_... API key]",
  }),
  x402_ping: async (params = {}) => ({
    status: "pong",
    verified: false,
    payment_mode: "stdio-preview",
    service: "Agent Kiosk",
    version: "2.6.0",
    protocol: "x402 v2 & v1 + MCP",
    network: CONFIG.network,
    asset: "USDC",
    echo: String(params.message || "hello-x402"),
  }),
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
  compliance_check: "/v1/compliance-check",
  defi_swap_quote: "/v1/defi-swap-quote",
  evm_tx_simulator: "/v1/tx-simulate",
  perp_funding_arbitrage: "/v1/funding-rates",
  tradfi_macro_radar: "/v1/macro-radar",
  kalshi_polymarket_arb: "/v1/prediction-arb",
  token_due_diligence: "/v1/token-due-diligence",
  b2b_company_dossier: "/v1/b2b-company-dossier",
  whale_alpha_radar: "/v1/whale-alpha-radar",
  buy_prepaid_pass: "/v1/buy-pass",
};

const BASE_URL = process.env.PUBLIC_BASE_URL || "https://agent-kiosk.vercel.app";

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
      const requestedVersion = params?.protocolVersion;
      const supportedVersions = ["2024-11-05", "2025-03-26", "2025-06-18"];
      const negotiatedVersion = supportedVersions.includes(requestedVersion)
        ? requestedVersion
        : "2024-11-05";

      return sendRpc({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: negotiatedVersion,
          capabilities: { tools: {}, resources: {}, prompts: {} },
          serverInfo: { name: "agent-kiosk", version: "2.6.0" },
        },
      });
    }

    if (method === "ping" || method === "logging/setLevel") {
      return sendRpc({
        jsonrpc: "2.0",
        id,
        result: {},
      });
    }

    if (method && method.startsWith("notifications/")) {
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
        result: { resources: MCP_RESOURCES },
      });
    }

    if (method === "resources/templates/list") {
      return sendRpc({
        jsonrpc: "2.0",
        id,
        result: { resourceTemplates: MCP_RESOURCE_TEMPLATES },
      });
    }

    if (method === "resources/read") {
      const found = readMcpResource(params?.uri, BASE_URL);
      if (!found) {
        return sendRpc({
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: `Unknown resource URI: ${params?.uri}` },
        });
      }
      return sendRpc({
        jsonrpc: "2.0",
        id,
        result: found,
      });
    }

    if (method === "prompts/list") {
      return sendRpc({
        jsonrpc: "2.0",
        id,
        result: { prompts: MCP_PROMPTS },
      });
    }

    if (method === "prompts/get") {
      const rendered = renderMcpPrompt(params?.name, params?.arguments || {});
      if (!rendered) {
        return sendRpc({
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: `Unknown prompt: ${params?.name}` },
        });
      }
      return sendRpc({
        jsonrpc: "2.0",
        id,
        result: rendered,
      });
    }

    if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments || {};
      const fn = HANDLERS[toolName];
      const mappedRoute = TOOL_TO_ROUTE[toolName];

      if (!fn || !mappedRoute) {
        return sendRpc({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Unknown tool: ${toolName}` },
        });
      }

      const endpointUrl = `${BASE_URL}${mappedRoute}`;
      const priceUsd = PRICING[mappedRoute]?.priceUsd || "0.02";

      if (args.payment_signature || args.x_payment || args.x_api_key || args.api_key) {
        const fakeReq = { headers: {} };
        const auth = await verifyAndSettlePayment(fakeReq, mappedRoute, endpointUrl, args);
        if (auth.authorized) {
          const fullData = await fn(args);
          return sendRpc({
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: JSON.stringify(fullData, null, 2) }],
            },
          });
        }
      }

      if (toolName === "defi_swap_quote" || toolName === "x402_ping") {
        const freePreview = await fn(args);
        return sendRpc({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(freePreview, null, 2) }],
          },
        });
      }

      const teaserArgs = { ...args, limit: 1, max_length: 160 };
      const rawPreview = await fn(teaserArgs);
      const lockNote = `[LOCKED — Pay $${priceUsd} USDC on Base via x402 POST ${endpointUrl} or pass 'payment_signature' in MCP tool arguments to unlock full dataset]`;
      const { body: challenge } = build402Challenge(mappedRoute, endpointUrl);
      const firstHeading = rawPreview?.llm_markdown
        ? rawPreview.llm_markdown.split("\n")[0].slice(0, 120)
        : `${toolName} live dataset ready`;

      const teaserPayload = {
        tier: "LOCKED_X402_PAYWALL_PREVIEW",
        notice: `Live dataset is ready but locked behind x402 micropayment ($${priceUsd} USDC on Base). Call POST ${endpointUrl} with x402 payment OR pass 'payment_signature' / 'x_api_key' in tool arguments to unlock.`,
        preview_data: {
          status: "PAYMENT_REQUIRED_TO_UNLOCK",
          tool: toolName,
          live_data_verified: true,
          teaser_heading: firstHeading,
          locked_fields: Object.keys(rawPreview || {}),
          unlocked_data: lockNote,
        },
        x402_unlock_full_data: {
          endpoint: endpointUrl,
          methods: ["POST", "GET"],
          price_usdc: priceUsd,
          network: CONFIG.network,
          usdc_contract: CONFIG.usdcAsset,
          pay_to_wallet: CONFIG.payToWallet,
          payment_required_challenge: challenge,
        },
      };

      return sendRpc({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(teaserPayload, null, 2) }],
        },
      });
    }

    if (id !== undefined) {
      return sendRpc({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Unsupported method: ${method}` },
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
