# Agent Kiosk — 23-in-1 Autonomous B2A Intelligence, Action & Compliance Supermarket (x402 v2 & MCP)

[![x402 v2 Base Mainnet](https://img.shields.io/badge/x402_v2-Base_USDC-0052FF)](https://www.x402scan.com/server/a1af2789-615a-4324-b3f1-83b97834ece8)
[![Smithery MCP Server](https://img.shields.io/badge/MCP-Smithery.ai-orange)](https://smithery.ai/servers/batuhansenavci/agent-kiosk)
[![ralf9090/agent-kiosk MCP server](https://glama.ai/mcp/servers/ralf9090/agent-kiosk/badges/score.svg)](https://glama.ai/mcp/servers/ralf9090/agent-kiosk)

**Agent Kiosk** is an instant pay-per-call API and Model Context Protocol (**MCP**) server built for autonomous AI agents, trading bots, coding assistants, and research workflows. Every paid and prepaid response includes a cryptographic **SHA-256 + HMAC-SHA256 `attestation` envelope** (`attested` tag).

- **Production Base URL:** `https://agent-kiosk.vercel.app`
- **Live Telemetry & Wallet Dashboard:** `https://agent-kiosk.vercel.app/stats` (`GET /v1/stats` JSON)
- **MCP Endpoint:** `https://agent-kiosk.vercel.app/mcp` (`https://agent-kiosk--batuhansenavci.run.tools`)
- **x402scan Store (23/23 Verified):** [x402scan.com/server/a1af2789-615a-4324-b3f1-83b97834ece8](https://www.x402scan.com/server/a1af2789-615a-4324-b3f1-83b97834ece8)
- **Glama MCP Listing:** [glama.ai/mcp/servers/ralf9090/agent-kiosk](https://glama.ai/mcp/servers/ralf9090/agent-kiosk)
- **Smithery Store:** [smithery.ai/servers/batuhansenavci/agent-kiosk](https://smithery.ai/servers/batuhansenavci/agent-kiosk)

---

## 23 Live Tools & Endpoints (Base USDC `eip155:8453`)

| # | MCP Tool | x402 REST Endpoint | Price (USDC) | Description |
|---|----------|--------------------|--------------|-------------|
| 1 | `x402_ping` | `POST /v1/ping` | `$0.001` | Instant x402 v2 & v1 wallet verification ping, settlement check & round-trip echo. |
| 2 | `evm_tx_simulator` | `POST /v1/tx-simulate` | `$0.005` | Pre-flight EVM transaction simulator (`eth_call` + `eth_estimateGas`), revert decoder, ERC-20 `allowance` & EIP-1967 proxy detector. |
| 3 | `perp_funding_arbitrage` | `POST /v1/funding-rates` | `$0.008` | Cross-exchange perpetual funding rate arbitrage, basis APR spread & open interest radar (Hyperliquid + dYdX v4). |
| 4 | `tradfi_macro_radar` | `POST /v1/macro-radar` | `$0.008` | Live S&P 500, Nasdaq, VIX, DXY, US 10Y Treasury Yield, Gold, Oil, Crypto Fear & Greed, BTC Dominance & DeFi TVL. |
| 5 | `kalshi_polymarket_arb` | `POST /v1/prediction-arb` | `$0.015` | Unified Kalshi, Polymarket & Manifold prediction market aggregator and cross-venue probability spread scanner. |
| 6 | `social_search` | `POST /v1/social-search` | `$0.02` | Live Reddit & HackerNews discussions in clean JSON & Markdown. |
| 7 | `maps_leads` | `POST /v1/maps-leads` | `$0.03` | City-scoped B2B business leads with phone, website, email, address & GPS. |
| 8 | `web_extract` | `POST /v1/web-extract` | `$0.01` | Clean URL-to-Markdown extractor with Prompt Injection trap detection. |
| 9 | `security_audit` | `POST /v1/security-audit` | `$0.02` | 0x Token/Contract Honeypot & tax scanner (GoPlus + DexScreener) & URL phishing audit. |
| 10 | `token_alpha` | `POST /v1/token-alpha` | `$0.02` | Real-time DEX order-flow (buy vs. sell pressure), liquidity depth & momentum signal. |
| 11 | `domain_intel` | `POST /v1/domain-intel` | `$0.02` | B2B company & domain intelligence: DNS, MX email provider, SaaS TXT stack, RDAP & subdomains. |
| 12 | `package_audit` | `POST /v1/package-audit` | `$0.01` | Open-source package & CVE vulnerability scanner (`npm`, `PyPI`, `crates.io`) via Google OSV.dev. |
| 13 | `academic_search` | `POST /v1/academic-search` | `$0.02` | Peer-reviewed scientific literature search (OpenAlex + arXiv) with abstracts & PDF links. |
| 14 | `wallet_profiler` | `POST /v1/wallet-profiler` | `$0.03` | Multi-chain whale & wallet profiler (Base, Ethereum, Arbitrum, Polygon): USDC/ETH balances & tx counts. |
| 15 | `prediction_markets` | `POST /v1/prediction-markets` | `$0.02` | Live event probabilities (%) & betting volume from Polymarket and Manifold Markets. |
| 16 | `defi_yields` | `POST /v1/defi-yields` | `$0.02` | Highest DeFi APY & yield radar powered by DeFiLlama filtered by token, chain, and TVL. |
| 17 | `github_intel` | `POST /v1/github-intel` | `$0.01` | GitHub repository & open-source competitive intelligence: stars, releases, issues & topic leaders. |
| 18 | `compliance_check` | `POST /v1/compliance-check` | `$0.05` | **AML, Sanctions (OFAC) & Counterparty Screening:** 14 risk vectors (Phishing, Tornado Cash mixer, Honeypot creator, Darkweb, Cybercrime) across Base & Ethereum. |
| 19 | `defi_swap_quote` | `POST /v1/defi-swap-quote` | `$0.05` | **Executable DeFi Swap & Cross-Chain Bridge Calldata Builder:** Best DEX route (`LI.FI` + `ParaSwap`) + ready-to-sign EVM `transactionRequest` (`to`, `data`, `value`, `gasLimit`). |
| 20 | `token_due_diligence` | `POST /v1/token-due-diligence` | `$0.10` | **3-in-1 Institutional Token Verdict:** GoPlus contract audit + DEX order-flow + social sentiment (Grade A–F). |
| 21 | `b2b_company_dossier` | `POST /v1/b2b-company-dossier` | `$0.10` | **4-in-1 B2B Executive Dossier:** DNS/SaaS tech stack + website scrape + local leads + social mentions. |
| 22 | `whale_alpha_radar` | `POST /v1/whale-alpha-radar` | `$0.10` | **3-in-1 Whale Portfolio & Yield Optimizer:** 4-chain wallet profiler + top DeFi yields + macro odds. |
| 23 | `buy_prepaid_pass` | `POST /v1/buy-pass` | `$5.00` | **30-Day Prepaid VIP API Key (`ak_live_...`):** Unlocks all 22 tools for 30 days via `X-API-KEY` header. |

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

## Discovery Manifests & Live Telemetry

- `GET https://agent-kiosk.vercel.app/stats` (Live HTML Dashboard)
- `GET https://agent-kiosk.vercel.app/v1/stats` (Live JSON Telemetry + Base USDC Balance)
- `GET https://agent-kiosk.vercel.app/.well-known/x402.json`
- `GET https://agent-kiosk.vercel.app/.well-known/mcp.json`
- `GET https://agent-kiosk.vercel.app/openapi.json`
- `GET https://agent-kiosk.vercel.app/llms.txt`
- `GET https://agent-kiosk.vercel.app/llms-full.txt`

