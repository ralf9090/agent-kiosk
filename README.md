# Agent Kiosk — 12-in-1 Autonomous B2A Intelligence Supermarket (x402 v2 & MCP)

[![x402 v2 Base Mainnet](https://img.shields.io/badge/x402_v2-Base_USDC-0052FF)](https://www.x402scan.com/server/a1af2789-615a-4324-b3f1-83b97834ece8)
[![Smithery MCP Server](https://img.shields.io/badge/MCP-Smithery.ai-orange)](https://smithery.ai/servers/batuhansenavci/agent-kiosk)

**Agent Kiosk** is an instant pay-per-call API and Model Context Protocol (**MCP**) server built for autonomous AI agents, trading bots, coding assistants, and research workflows. No API keys, no sign-ups, and no monthly subscriptions required.

- **Production Base URL:** `https://agent-kiosk.vercel.app`
- **MCP Endpoint:** `https://agent-kiosk.vercel.app/mcp` (`https://agent-kiosk--batuhansenavci.run.tools`)
- **x402scan Store:** [x402scan.com/server/a1af2789-615a-4324-b3f1-83b97834ece8](https://www.x402scan.com/server/a1af2789-615a-4324-b3f1-83b97834ece8)
- **Smithery Store:** [smithery.ai/servers/batuhansenavci/agent-kiosk](https://smithery.ai/servers/batuhansenavci/agent-kiosk)

---

## 12 Live Tools & Endpoints (Base USDC `eip155:8453`)

| # | MCP Tool | x402 REST Endpoint | Price (USDC) | Description |
|---|----------|--------------------|--------------|-------------|
| 1 | `social_search` | `POST /v1/social-search` | `$0.02` | Live Reddit & HackerNews discussions in clean JSON & Markdown. |
| 2 | `maps_leads` | `POST /v1/maps-leads` | `$0.03` | City-scoped B2B business leads with phone, website, email, address & GPS. |
| 3 | `web_extract` | `POST /v1/web-extract` | `$0.01` | Clean URL-to-Markdown extractor with Prompt Injection trap detection. |
| 4 | `security_audit` | `POST /v1/security-audit` | `$0.02` | 0x Token/Contract Honeypot & tax scanner (GoPlus + DexScreener) & URL phishing audit. |
| 5 | `token_alpha` | `POST /v1/token-alpha` | `$0.02` | Real-time DEX order-flow (buy vs. sell pressure), liquidity depth & momentum signal. |
| 6 | `domain_intel` | `POST /v1/domain-intel` | `$0.02` | B2B company & domain intelligence: DNS, MX email provider, SaaS TXT stack, RDAP & subdomains. |
| 7 | `package_audit` | `POST /v1/package-audit` | `$0.01` | Open-source package & CVE vulnerability scanner (`npm`, `PyPI`, `crates.io`) via Google OSV.dev. |
| 8 | `academic_search` | `POST /v1/academic-search` | `$0.02` | Peer-reviewed scientific literature search (OpenAlex + arXiv) with abstracts & PDF links. |
| 9 | `wallet_profiler` | `POST /v1/wallet-profiler` | `$0.03` | Multi-chain whale & wallet profiler (Base, Ethereum, Arbitrum, Polygon): USDC/ETH balances & tx counts. |
| 10 | `prediction_markets` | `POST /v1/prediction-markets` | `$0.02` | Live event probabilities (%) & betting volume from Polymarket and Manifold Markets. |
| 11 | `defi_yields` | `POST /v1/defi-yields` | `$0.02` | Highest DeFi APY & yield radar powered by DeFiLlama filtered by token, chain, and TVL. |
| 12 | `github_intel` | `POST /v1/github-intel` | `$0.01` | GitHub repository & open-source competitive intelligence: stars, releases, issues & topic leaders. |

---

## Discovery Manifests

- `GET https://agent-kiosk.vercel.app/.well-known/x402.json`
- `GET https://agent-kiosk.vercel.app/openapi.json`
- `GET https://agent-kiosk.vercel.app/llms.txt`
