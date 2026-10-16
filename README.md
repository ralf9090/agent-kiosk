# Agent Kiosk (x402 & MCP Data Vending Machine)

Instant pay-per-call data API and MCP server built for autonomous AI agents.

## Tools & Endpoints

- **`POST /v1/social-search`** (`$0.02 USDC` on Base via `x402`): Live Reddit & HackerNews discussions in clean JSON and LLM-ready Markdown.
- **`POST /v1/maps-leads`** (`$0.03 USDC` on Base via `x402`): Local business lead extractor returning name, phone, website, address, opening hours, and GPS coordinates.
- **`POST /mcp`**: Model Context Protocol (JSON-RPC 2.0) server endpoint (`social_search`, `maps_leads`).
- **`GET /.well-known/x402.json`** & **`GET /llms.txt`**: Machine discovery manifests.

## Configuration

Set the following environment variables in production:
- `PAY_TO_WALLET`: Your Base (Ethereum L2) wallet address (`0x...`) to receive USDC payments.
- `API_SECRET_KEY`: Optional secret key for prepaid / B2B / Smithery access.
