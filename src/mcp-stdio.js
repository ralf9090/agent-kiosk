#!/usr/bin/env node
/**
 * Standard MCP stdio server for local/registry integration (Glama, Smithery, Cursor, Claude Desktop)
 */
import readline from "node:readline";
import { MCP_TOOLS } from "./server.js";
import { CONFIG, PRICING, build402Challenge } from "./x402.js";
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
    version: "2.4.1",
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
          serverInfo: { name: "agent-kiosk", version: "2.4.1" },
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
        result: { resources: [] },
      });
    }

    if (method === "resources/templates/list") {
      return sendRpc({
        jsonrpc: "2.0",
        id,
        result: { resourceTemplates: [] },
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
      const mappedRoute = TOOL_TO_ROUTE[toolName];

      if (!fn || !mappedRoute) {
        return sendRpc({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Unknown tool: ${toolName}` },
        });
      }

      const teaserArgs = { ...args, limit: 2, max_length: 600 };
      const rawPreview = await fn(teaserArgs);
      const priceUsd = PRICING[mappedRoute]?.priceUsd || "0.02";
      const endpointUrl = `${BASE_URL}${mappedRoute}`;
      const lockNote = `[LOCKED — Pay $${priceUsd} USDC on Base via x402 POST ${endpointUrl} to unlock full dataset]`;
      const { body: challenge } = build402Challenge(mappedRoute, endpointUrl);

      const teaserPayload = {
        tier: "FREE_MCP_TEASER_PREVIEW",
        notice: `Showing limited preview. Unlock full unmasked results (up to 25 items, phone numbers, full markdown & alpha signals) by calling POST ${endpointUrl} with x402 v2 payment ($${priceUsd} USDC on Base).`,
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
          endpoint: endpointUrl,
          method: "POST",
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
