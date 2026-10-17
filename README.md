# Agent Kiosk — 17-in-1 Autonomous B2A Intelligence Supermarket (x402 v2 & MCP)

[![x402 v2 Base Mainnet](https://img.shields.io/badge/x402_v2-Base_USDC-0052FF)](https://www.x402scan.com/server/a1af2789-615a-4324-b3f1-83b97834ece8)
[![Smithery MCP Server](https://img.shields.io/badge/MCP-Smithery.ai-orange)](https://smithery.ai/servers/batuhansenavci/agent-kiosk)
[![ralf9090/agent-kiosk MCP server](https://glama.ai/mcp/servers/ralf9090/agent-kiosk/badges/score.svg)](https://glama.ai/mcp/servers/ralf9090/agent-kiosk)

**Agent Kiosk** is an instant pay-per-call API and Model Context Protocol (**MCP**) server built for autonomous AI agents, trading bots, coding assistants, and research workflows. No API keys, no sign-ups, and no monthly subscriptions required.

- **Production Base URL:** `https://agent-kiosk.vercel.app`
- **MCP Endpoint:** `https://agent-kiosk.vercel.app/mcp` (`https://agent-kiosk--batuhansenavci.run.tools`)
- **x402scan Store (17/17 Verified):** [x402scan.com/server/a1af2789-615a-4324-b3f1-83b97834ece8](https://www.x402scan.com/server/a1af2789-615a-4324-b3f1-83b97834ece8)
- **Glama MCP Listing:** [glama.ai/mcp/servers/ralf9090/agent-kiosk](https://glama.ai/mcp/servers/ralf9090/agent-kiosk)
- **Smithery Store:** [smithery.ai/servers/batuhansenavci/agent-kiosk](https://smithery.ai/servers/batuhansenavci/agent-kiosk)

---

## 17 Live Tools & Endpoints (Base USDC `eip155:8453`)

| # | MCP Tool | x402 REST Endpoint | Price (USDC) | Description |
|---|----------|--------------------|--------------|-------------|
| 1 | `x402_ping` | `POST /v1/ping` | `$0.001` | Instant x402 v2 & v1 wallet verification ping, settlement check & round-trip echo. |
| 2 | `social_search` | `POST /v1/social-search` | `$0.02` | Live Reddit & HackerNews discussions in clean JSON & Markdown. |
| 3 | `maps_leads` | `POST /v1/maps-leads` | `$0.03` | City-scoped B2B business leads with phone, website, email, address & GPS. |
| 4 | `web_extract` | `POST /v1/web-extract` | `$0.01` | Clean URL-to-Markdown extractor with Prompt Injection trap detection. |
| 5 | `security_audit` | `POST /v1/security-audit` | `$0.02` | 0x Token/Contract Honeypot & tax scanner (GoPlus + DexScreener) & URL phishing audit. |
| 6 | `token_alpha` | `POST /v1/token-alpha` | `$0.02` | Real-time DEX order-flow (buy vs. sell pressure), liquidity depth & momentum signal. |
| 7 | `domain_intel` | `POST /v1/domain-intel` | `$0.02` | B2B company & domain intelligence: DNS, MX email provider, SaaS TXT stack, RDAP & subdomains. |
| 8 | `package_audit` | `POST /v1/package-audit` | `$0.01` | Open-source package & CVE vulnerability scanner (`npm`, `PyPI`, `crates.io`) via Google OSV.dev. |
| 9 | `academic_search` | `POST /v1/academic-search` | `$0.02` | Peer-reviewed scientific literature search (OpenAlex + arXiv) with abstracts & PDF links. |
| 10 | `wallet_profiler` | `POST /v1/wallet-profiler` | `$0.03` | Multi-chain whale & wallet profiler (Base, Ethereum, Arbitrum, Polygon): USDC/ETH balances & tx counts. |
| 11 | `prediction_markets` | `POST /v1/prediction-markets` | `$0.02` | Live event probabilities (%) & betting volume from Polymarket and Manifold Markets. |
| 12 | `defi_yields` | `POST /v1/defi-yields` | `$0.02` | Highest DeFi APY & yield radar powered by DeFiLlama filtered by token, chain, and TVL. |
| 13 | `github_intel` | `POST /v1/github-intel` | `$0.01` | GitHub repository & open-source competitive intelligence: stars, releases, issues & topic leaders. |
| 14 | `token_due_diligence` | `POST /v1/token-due-diligence` | `$0.10` | **3-in-1 Institutional Token Verdict:** GoPlus contract audit + DEX order-flow + social sentiment (Grade A–F). |
| 15 | `b2b_company_dossier` | `POST /v1/b2b-company-dossier` | `$0.10` | **4-in-1 B2B Executive Dossier:** DNS/SaaS tech stack + website scrape + local leads + social mentions. |
| 16 | `whale_alpha_radar` | `POST /v1/whale-alpha-radar` | `$0.10` | **3-in-1 Whale Portfolio & Yield Optimizer:** 4-chain wallet profiler + top DeFi yields + macro odds. |
| 17 | `buy_prepaid_pass` | `POST /v1/buy-pass` | `$5.00` | **30-Day Prepaid VIP API Key (`ak_live_...`):** Unlocks all 16 tools for 30 days via `X-API-KEY` header. |

---

## Quick Connect (Claude Desktop / Cursor / Windsurf / VS Code)

```json
{
  "mcpServers": {
    "agent-kiosk": {
      "url": "https://agent-kiosk.vercel.app/mcp"
    }
  }
}
```

## Discovery Manifests

- `GET https://agent-kiosk.vercel.app/.well-known/x402.json`
- `GET https://agent-kiosk.vercel.app/.well-known/mcp.json`
- `GET https://agent-kiosk.vercel.app/openapi.json`
- `GET https://agent-kiosk.vercel.app/llms.txt`
- `GET https://agent-kiosk.vercel.app/llms-full.txt`

