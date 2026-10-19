# Agent Kiosk — 24-in-1 Autonomous B2A Intelligence, Action & Compliance Supermarket (x402 v2 & MCP)

[![x402 v2 Base Mainnet](https://img.shields.io/badge/x402_v2-Base_USDC-0052FF)](https://www.x402scan.com/server/a1af2789-615a-4324-b3f1-83b97834ece8)
[![Smithery MCP Server](https://img.shields.io/badge/MCP-Smithery.ai-orange)](https://smithery.ai/servers/batuhansenavci/agent-kiosk)
[![ralf9090/agent-kiosk MCP server](https://glama.ai/mcp/servers/ralf9090/agent-kiosk/badges/score.svg)](https://glama.ai/mcp/servers/ralf9090/agent-kiosk)

**Agent Kiosk** is an instant pay-per-call API and Model Context Protocol (**MCP**) server built for autonomous AI agents, trading bots, coding assistants, and research workflows on **Base Mainnet (`eip155:8453`)**. Every paid and prepaid response includes a cryptographic **SHA-256 + HMAC-SHA256 `attestation` envelope** (`attested` tag).

- **Production Base URL:** `https://agent-kiosk.vercel.app`
- **Merchant Payment Recipient (`payTo`):** `0xd8429209Aee6A398B9707DFf5F28AAA93452eE95` (Base USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, 6 decimals)
- **Catalogue Scope:** **24 x402-protected endpoints** (**23 paid per-call endpoints** + **1 prepaid 30-day API pass**) plus **free discovery, telemetry, MCP teaser & partner-fee swap routes**
- **Live Telemetry & Wallet Dashboard:** `https://agent-kiosk.vercel.app/stats` (`GET /v1/stats` JSON)
- **MCP Endpoint:** `https://agent-kiosk.vercel.app/mcp` (`https://agent-kiosk--batuhansenavci.run.tools`)
- **x402scan Store (24/24 Verified):** [x402scan.com/server/a1af2789-615a-4324-b3f1-83b97834ece8](https://www.x402scan.com/server/a1af2789-615a-4324-b3f1-83b97834ece8)
- **Glama MCP Listing:** [glama.ai/mcp/servers/ralf9090/agent-kiosk](https://glama.ai/mcp/servers/ralf9090/agent-kiosk)
- **Smithery Store:** [smithery.ai/servers/batuhansenavci/agent-kiosk](https://smithery.ai/servers/batuhansenavci/agent-kiosk)

---

## 1. Unified Route, Method & Price Catalogue

### A. 23 Paid Per-Call x402 Endpoints (Base USDC `eip155:8453`)

All `/v1/*` routes accept `POST` (primary JSON body) and `GET` (query parameters). Unauthenticated requests return `HTTP 402 Payment Required` with the `PAYMENT-REQUIRED` header.

| # | MCP Tool | x402 REST Route | Method | Price (USDC) | Atomic Units (6 dec) | Description |
|---|----------|-----------------|--------|--------------|----------------------|-------------|
| 1 | `x402_ping` | `/v1/ping` | `POST` / `GET` | `$0.001` | `1000` | Instant x402 v2 & v1 wallet verification ping, settlement check & round-trip echo. |
| 2 | `llm_chat_completions` | `/v1/chat/completions` | `POST` / `GET` | `$0.002` | `2000` | OpenAI-compatible LLM Chat Completions Gateway (`gpt-4o-mini`, `openai`, `deepseek-chat`). |
| 3 | `evm_tx_simulator` | `/v1/tx-simulate` | `POST` / `GET` | `$0.005` | `5000` | Pre-flight EVM transaction simulator (`eth_call` + `eth_estimateGas`), revert decoder, ERC-20 `allowance` & EIP-1967 proxy detector. |
| 4 | `perp_funding_arbitrage` | `/v1/funding-rates` | `POST` / `GET` | `$0.008` | `8000` | Cross-exchange perpetual funding rate arbitrage, basis APR spread & open interest radar (Hyperliquid + dYdX v4). |
| 5 | `tradfi_macro_radar` | `/v1/macro-radar` | `POST` / `GET` | `$0.008` | `8000` | Live S&P 500, Nasdaq, VIX, DXY, US 10Y Treasury Yield, Gold, Oil, Crypto Fear & Greed, BTC Dominance & DeFi TVL. |
| 6 | `web_extract` | `/v1/web-extract` | `POST` / `GET` | `$0.01` | `10000` | Clean URL-to-Markdown extractor with Prompt Injection trap detection. |
| 7 | `package_audit` | `/v1/package-audit` | `POST` / `GET` | `$0.01` | `10000` | Open-source package & CVE vulnerability scanner (`npm`, `PyPI`, `crates.io`) via Google OSV.dev. |
| 8 | `github_intel` | `/v1/github-intel` | `POST` / `GET` | `$0.01` | `10000` | GitHub repository & open-source competitive intelligence: stars, releases, issues & topic leaders. |
| 9 | `kalshi_polymarket_arb` | `/v1/prediction-arb` | `POST` / `GET` | `$0.015` | `15000` | Unified Kalshi, Polymarket & Manifold prediction market aggregator and cross-venue probability spread scanner. |
| 10 | `social_search` | `/v1/social-search` | `POST` / `GET` | `$0.02` | `20000` | Live Reddit & HackerNews discussions in clean JSON & Markdown. |
| 11 | `security_audit` | `/v1/security-audit` | `POST` / `GET` | `$0.02` | `20000` | 0x Token/Contract Honeypot & tax scanner (GoPlus + DexScreener) & URL phishing audit. |
| 12 | `token_alpha` | `/v1/token-alpha` | `POST` / `GET` | `$0.02` | `20000` | Real-time DEX order-flow (buy vs. sell pressure), liquidity depth & momentum signal. |
| 13 | `domain_intel` | `/v1/domain-intel` | `POST` / `GET` | `$0.02` | `20000` | B2B company & domain intelligence: DNS, MX email provider, SaaS TXT stack, RDAP & subdomains. |
| 14 | `academic_search` | `/v1/academic-search` | `POST` / `GET` | `$0.02` | `20000` | Peer-reviewed scientific literature search (OpenAlex + arXiv) with abstracts & PDF links. |
| 15 | `prediction_markets` | `/v1/prediction-markets` | `POST` / `GET` | `$0.02` | `20000` | Live event probabilities (%) & betting volume from Polymarket and Manifold Markets. |
| 16 | `defi_yields` | `/v1/defi-yields` | `POST` / `GET` | `$0.02` | `20000` | Highest DeFi APY & yield radar powered by DeFiLlama filtered by token, chain, and TVL. |
| 17 | `maps_leads` | `/v1/maps-leads` | `POST` / `GET` | `$0.03` | `30000` | City-scoped B2B business leads with phone, website, email, address & GPS. |
| 18 | `wallet_profiler` | `/v1/wallet-profiler` | `POST` / `GET` | `$0.03` | `30000` | Multi-chain whale & wallet profiler (Base, Ethereum, Arbitrum, Polygon): USDC/ETH balances & tx counts. |
| 19 | `compliance_check` | `/v1/compliance-check` | `POST` / `GET` | `$0.05` | `50000` | **AML, Sanctions (OFAC) & Counterparty Screening:** 14 risk vectors (Phishing, Tornado Cash mixer, Honeypot creator, Darkweb, Cybercrime) across Base & Ethereum. |
| 20 | `defi_swap_quote` | `/v1/defi-swap-quote` | `POST` / `GET` | `$0.05` | `50000` | **Executable DeFi Swap & Cross-Chain Bridge Calldata Builder:** Best DEX route (`LI.FI` + `ParaSwap`) + ready-to-sign EVM `transactionRequest` (`to`, `data`, `value`, `gasLimit`). |
| 21 | `token_due_diligence` | `/v1/token-due-diligence` | `POST` / `GET` | `$0.10` | `100000` | **3-in-1 Institutional Token Verdict:** GoPlus contract audit + DEX order-flow + social sentiment (Grade A–F). |
| 22 | `b2b_company_dossier` | `/v1/b2b-company-dossier` | `POST` / `GET` | `$0.10` | `100000` | **4-in-1 B2B Executive Dossier:** DNS/SaaS tech stack + website scrape + local leads + social mentions. |
| 23 | `whale_alpha_radar` | `/v1/whale-alpha-radar` | `POST` / `GET` | `$0.10` | `100000` | **3-in-1 Whale Portfolio & Yield Optimizer:** 4-chain wallet profiler + top DeFi yields + macro odds. |

### B. 1 Prepaid 30-Day API Pass Endpoint (Base USDC `eip155:8453`)

| # | MCP Tool | x402 REST Route | Method | Price (USDC) | Atomic Units (6 dec) | Description |
|---|----------|-----------------|--------|--------------|----------------------|-------------|
| 24 | `buy_prepaid_pass` | `/v1/buy-pass` | `POST` / `GET` | `$5.00` | `5000000` | **30-Day Prepaid VIP API Key (`ak_live_...`):** Mints a stateless HMAC-SHA256 signed API key that unlocks all 23 paid per-call endpoints for 30 days via `X-API-KEY` or `Authorization: Bearer` without per-call x402 signing. |

### C. Free / Unpaid Routes (`$0.00 USDC` — HTTP 200 without x402 payment)

| Route | Method | Price | Purpose |
|-------|--------|-------|---------|
| `/v1/free-swap` | `POST` / `GET` | `$0.00` | Zero-paywall executable DEX swap & cross-chain bridge calldata builder (monetized via 0.25% on-chain partner fee to `payToWallet`). |
| `/v1/models` | `GET` | `$0.00` | OpenAI-compatible model list discovery (`gpt-4o-mini`, `openai`, `deepseek-chat`). |
| `/mcp` | `POST` / `GET` | `$0.00` (Teaser) / Paid (Full) | Streamable-HTTP MCP JSON-RPC 2.0 server (lists all 24 tools; unauthenticated `tools/call` returns an HTTP 200 1-item teaser preview + `x402_unlock_full_data` challenge, while `x402_ping` and `defi_swap_quote` return full preview data; passing `payment_signature` or `x_api_key` in tool arguments returns full unmasked data). |
| `/v1/stats`, `/stats` | `GET` | `$0.00` | Live JSON & HTML server funnel telemetry + on-chain Base USDC wallet balance dashboard. |
| `/.well-known/x402.json` | `GET` | `$0.00` | Machine-readable x402 v2 catalogue, facilitator configuration & route breakdown (`/.well-known/x402` and `/.well-known/agent.json` aliased). |
| `/.well-known/agent-card.json` | `GET` | `$0.00` | Google A2A v0.3.0 Agent Card with `a2a-x402` extension. |
| `/.well-known/mcp.json` | `GET` | `$0.00` | MCP server manifest (24 tools, 4 prompts, 3 resources). |
| `/openapi.json` | `GET` | `$0.00` | OpenAPI 3.1.0 specification covering all 24 x402 endpoints. |
| `/llms.txt`, `/llms-full.txt` | `GET` | `$0.00` | LLM-readable discovery catalogue, buyer integration guide & complete input schemas. |

---

## 2. Production x402 Buyer Guide & Facilitator Integration

### A. Base Mainnet Settlement Facilitators (We Are the Seller, Not a Facilitator)

Agent Kiosk verifies and settles incoming EIP-3009 (`TransferWithAuthorization`) USDC signatures on **Base Mainnet (`eip155:8453` / `base`)** using a multi-facilitator failover pipeline configured in [`src/x402.js`](./src/x402.js):

| Role | Facilitator Name | API Base URL | Supported Endpoint | Verify Endpoint | Settle Endpoint | Supported Versions & Schemes | Facilitator Signer / Relayer Addresses (Not Merchant Addresses) |
|------|------------------|--------------|--------------------|-----------------|-----------------|------------------------------|-----------------------------------------------------------------|
| **Primary** | **PayAI Network** | `https://facilitator.payai.network` | `GET https://facilitator.payai.network/supported` | `POST https://facilitator.payai.network/verify` | `POST https://facilitator.payai.network/settle` | x402 v2 (`eip155:8453`, `exact`) & x402 v1 (`base`, `exact`), zero API key required | `0xB2Bd29925CBbCEA7628279c91945Ca5B98bf371B`, `0xc6699d2aadA6c36Dfea5C248DD70f9CB0235cB63` (and pool signers listed in `signers["eip155:*"]` at `/supported`) |
| **Secondary Fallback** | **Dexter** | `https://facilitator.dexter.cash` | `GET https://facilitator.dexter.cash/supported` | `POST https://facilitator.dexter.cash/verify` | `POST https://facilitator.dexter.cash/settle` | x402 v2 (`eip155:8453`, `exact`) & x402 v1 (`base`, `exact`) | `0x402Feee072D655B85e08f1751AF9ddbCd249521f` |
| **Tertiary Fallback (v1)** | **Mogami** | `https://facilitator.mogami.tech` | `GET https://facilitator.mogami.tech/supported` | `POST https://facilitator.mogami.tech/verify` | `POST https://facilitator.mogami.tech/settle` | x402 v1 (`base`, `exact`) | Public v1 relayer pool |

- **Merchant Receiving Address (`payTo`):** `0xd8429209Aee6A398B9707DFf5F28AAA93452eE95` (Base Mainnet USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, 6 decimals).

### B. Accepted Payment, Challenge & Receipt Headers

| Direction | Header / Parameter | Protocol | Format & Description |
|-----------|--------------------|----------|----------------------|
| **HTTP 402 Response** | `PAYMENT-REQUIRED` | x402 v2 | Base64-encoded JSON `PaymentRequired` challenge (`x402Version: 2`, `accepts[0]` with `scheme: "exact"`, `network: "eip155:8453"`, `amount`, `maxAmountRequired`, `asset`, `payTo`, `maxTimeoutSeconds: 60`, `extra: { name: "USD Coin", version: "2" }`). The identical JSON object is also returned as the HTTP 402 response body. |
| **HTTP Request (Pay-Per-Call)** | `PAYMENT-SIGNATURE` | x402 v2 | Base64, Base64URL, or raw JSON string containing `{ x402Version: 2, scheme: "exact", network: "eip155:8453", payload: { signature, authorization: { from, to, value, validAfter, validBefore, nonce } } }`. |
| **HTTP Request (Legacy / Alias)** | `X-PAYMENT` or `X-PAYMENT-SIGNATURE` | x402 v1 / v2 | Accepted for x402 v1 (`network: "base"`) and v2 clients that send payment headers under `X-PAYMENT` or `X-PAYMENT-SIGNATURE`. |
| **HTTP Request (Prepaid Pass)** | `X-API-KEY` or `Authorization: Bearer <key>` | Prepaid Pass | Pass `ak_live_<payloadB64>.<sigB64>` minted via `POST /v1/buy-pass` (`$5.00 USDC`) to access any of the 23 paid endpoints for 30 days without per-call signing. |
| **MCP `tools/call` Arguments** | `payment_signature`, `x_payment`, or `x_api_key` | MCP over HTTP / stdio | Pass the x402 payment payload or `ak_live_...` key directly inside `params.arguments` on `POST /mcp` to unlock full unmasked data inside MCP clients. |
| **HTTP 200 Response (Receipt)** | `PAYMENT-RESPONSE` and `X-PAYMENT-RESPONSE` | x402 v2 & v1 | Base64-encoded JSON settlement receipt returned by the facilitator: `{"success":true,"transaction":"0x...","network":"eip155:8453","payer":"0x..."}`. The on-chain transaction hash is also echoed in the HTTP 200 JSON body as `tx_hash`. |

### C. Timeouts, Uncertain Settlement & Recovery Instructions

1. **Server & Challenge Timeouts:**
   - Every `402 Payment Required` challenge specifies `maxTimeoutSeconds: 60`. Buyers should sign EIP-3009 `TransferWithAuthorization` messages with `validAfter = 0` and `validBefore >= now + 300` seconds.
   - Server-side facilitator calls enforce a **6.5-second timeout** per facilitator on `POST /verify` and a **10.0-second timeout** per facilitator on `POST /settle`.
   - If the primary facilitator (`facilitator.payai.network`) returns an HTTP/network error on `/verify` or `/settle`, the middleware automatically fails over to the next configured facilitator (`facilitator.dexter.cash`). If a signature is cryptographically invalid (`invalid_exact_evm_signature`), the server immediately returns `HTTP 402` with the exact error reason without retrying.
2. **Handling Uncertain Settlement (Client Timeout / Network Drop):**
   - Each EIP-3009 `TransferWithAuthorization` uses a unique 32-byte `nonce`. Once consumed on Base Mainnet, the USDC contract (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`) permanently marks that `(authorizer, nonce)` pair as used (`AuthorizationUsed` event), making replay or double-charging of the same signature impossible on-chain.
   - **Rule for Buyers on Timeout:** If your HTTP request times out or disconnects after sending `PAYMENT-SIGNATURE`, **do NOT immediately sign a new `nonce`**:
     1. Query Base USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`) via `authorizationState(address authorizer, bytes32 nonce)` (`0xe94a0102`) or check `https://basescan.org/address/0xd8429209Aee6A398B9707DFf5F28AAA93452eE95#tokentxns`.
     2. **If `authorizationState` is `false` (not settled on-chain):** You can safely retry the request using the **exact same `PAYMENT-SIGNATURE` header** (same `nonce`) until `validBefore` expires, or wait for `validBefore` to pass before signing a new `nonce`.
     3. **If `authorizationState` is `true` (settled on-chain, but HTTP response was lost in transit):** Open an issue at [github.com/ralf9090/agent-kiosk/issues](https://github.com/ralf9090/agent-kiosk/issues) with the Base `txHash`, endpoint path, and timestamp for immediate response replay or a complimentary Prepaid API Pass credit.

---

## 3. Verified Base Mainnet Settlement Evidence (Operator Tests)

> **Disclosure:** The transactions below are **operator test payments** executed against the live production deployment (`https://agent-kiosk.vercel.app`) and settled on **Base Mainnet (`eip155:8453`)** via the **PayAI Network** facilitator (`https://facilitator.payai.network/settle`), not third-party customer volume.

### Example 1 — `POST https://agent-kiosk.vercel.app/v1/token-alpha` (`0.02 USDC` / `20000` atomic units)

- **Endpoint & Method:** `POST https://agent-kiosk.vercel.app/v1/token-alpha`
- **Amount Settled:** `0.02 USDC` (`20000` atomic units, Base USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`)
- **Base Mainnet Transaction Link:** [https://basescan.org/tx/0x5aa1b42ef7dae5323ba561b9374e9e5db0d42b0eae23d7e4fc5c2f0929df61be](https://basescan.org/tx/0x5aa1b42ef7dae5323ba561b9374e9e5db0d42b0eae23d7e4fc5c2f0929df61be) (Block `52809684`, Status: `Success`)
- **Facilitator Relayer (`from` on-chain):** `0xc6699d2aadA6c36Dfea5C248DD70f9CB0235cB63` (PayAI Network relayer)
- **Seller Recipient (`payTo`):** `0xd8429209Aee6A398B9707DFf5F28AAA93452eE95`

**Decoded `PAYMENT-RESPONSE` / `X-PAYMENT-RESPONSE` Header:**
```json
{
  "success": true,
  "transaction": "0x5aa1b42ef7dae5323ba561b9374e9e5db0d42b0eae23d7e4fc5c2f0929df61be",
  "network": "eip155:8453",
  "payer": "0xd8429209aee6a398b9707dff5f28aaa93452ee95"
}
```

**Redacted HTTP 200 Resource Response (`POST /v1/token-alpha` with `{"query":"AERO","chain":"base"}`):**
```json
{
  "ok": true,
  "payment_mode": "x402",
  "tx_hash": "0x5aa1b42ef7dae5323ba561b9374e9e5db0d42b0eae23d7e4fc5c2f0929df61be",
  "attestation": {
    "attested": true,
    "issuer": "io.github.ralf9090/agent-kiosk",
    "signer_wallet": "0xd8429209Aee6A398B9707DFf5F28AAA93452eE95",
    "algorithm": "HMAC-SHA256",
    "route": "/v1/token-alpha",
    "payload_sha256": "c1bcebf107e25a742a7afc58ca39692bc33f4e6da49a2ca1afc8b892fae63a1f",
    "timestamp_utc": "2026-10-19T11:18:33.296Z",
    "signature": "<REDACTED_ATTESTATION_HMAC>"
  },
  "data": {
    "query": "AERO",
    "found": true,
    "token": {
      "name": "Aerodrome",
      "symbol": "AERO",
      "address": "0x940181a94A35A4569E4529A3CDfB74e38FD98631",
      "primary_chain": "base",
      "price_usd": 0.7866,
      "market_cap_usd": 789632423,
      "fdv_usd": 1575158274
    },
    "alpha_metrics": {
      "signal": "SELL_PRESSURE",
      "total_top5_liquidity_usd": 47963273,
      "volume_1h_usd": 403817,
      "volume_24h_usd": 12606349,
      "order_flow_1h": { "buys": 88, "sells": 495, "buy_pressure_pct": 15.1 },
      "order_flow_24h": { "buys": 3508, "sells": 13997, "buy_pressure_pct": 20 }
    },
    "llm_summary": "Aerodrome (AERO on base): $0.7866 | Signal: SELL_PRESSURE | 1h Buy Pressure: 15.1% (88 buys vs 495 sells) | Liquidity: $47,963,273 | 24h Vol: $12,606,349."
  }
}
```

### Example 2 — `POST https://agent-kiosk.vercel.app/v1/ping` (`0.001 USDC` / `1000` atomic units)

- **Endpoint & Method:** `POST https://agent-kiosk.vercel.app/v1/ping`
- **Amount Settled:** `0.001 USDC` (`1000` atomic units)
- **Base Mainnet Transaction Link:** [https://basescan.org/tx/0xd4869a2190887c15b9fb53c109045fe60bb6bef6a3cf8b66e6f7e0a9904fda7e](https://basescan.org/tx/0xd4869a2190887c15b9fb53c109045fe60bb6bef6a3cf8b66e6f7e0a9904fda7e) (Block `52809683`, Status: `Success`)
- **Facilitator Relayer (`from` on-chain):** `0xB2Bd29925CBbCEA7628279c91945Ca5B98bf371B` (PayAI Network relayer)

**Decoded `PAYMENT-RESPONSE` / `X-PAYMENT-RESPONSE` Header:**
```json
{
  "success": true,
  "transaction": "0xd4869a2190887c15b9fb53c109045fe60bb6bef6a3cf8b66e6f7e0a9904fda7e",
  "network": "eip155:8453",
  "payer": "0xd8429209aee6a398b9707dff5f28aaa93452ee95"
}
```

**Redacted HTTP 200 Resource Response (`POST /v1/ping` with `{"message":"x402-registry-verification"}`):**
```json
{
  "ok": true,
  "payment_mode": "x402",
  "tx_hash": "0xd4869a2190887c15b9fb53c109045fe60bb6bef6a3cf8b66e6f7e0a9904fda7e",
  "attestation": {
    "attested": true,
    "issuer": "io.github.ralf9090/agent-kiosk",
    "signer_wallet": "0xd8429209Aee6A398B9707DFf5F28AAA93452eE95",
    "algorithm": "HMAC-SHA256",
    "route": "/v1/ping",
    "payload_sha256": "6fc2d484b7899b71b18d80b87c18230e8904e7f296ca3c471763cc618a932041",
    "timestamp_utc": "2026-10-19T11:18:31.280Z",
    "signature": "<REDACTED_ATTESTATION_HMAC>"
  },
  "data": {
    "status": "pong",
    "verified": true,
    "payment_mode": "x402",
    "service": "Agent Kiosk",
    "version": "2.6.0",
    "protocol": "x402 v2 & v1 + MCP (Attested)",
    "network": "eip155:8453",
    "asset": "USDC",
    "echo": "x402-registry-verification",
    "payer": "0xd8429209Aee6A398B9707DFf5F28AAA93452eE95",
    "tx_hash": "0xd4869a2190887c15b9fb53c109045fe60bb6bef6a3cf8b66e6f7e0a9904fda7e"
  }
}
```

---

## 4. Quick Connect (Claude Desktop / Cursor / Windsurf / VS Code)

```json
{
  "mcpServers": {
    "agent-kiosk": {
      "url": "https://agent-kiosk.vercel.app/mcp"
    }
  }
}
```
