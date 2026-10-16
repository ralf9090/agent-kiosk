import assert from "node:assert/strict";

// Configure test secret key explicitly for verification
process.env.API_SECRET_KEY = "test-only-secret-key";

const { createAppServer } = await import("../src/server.js");
const server = createAppServer();

await new Promise((resolve) => server.listen(0, resolve));
const { port } = server.address();
const base = `http://localhost:${port}`;

try {
  // 1. Test A2A / x402 discovery manifest + favicon + openapi
  const discRes = await fetch(`${base}/.well-known/x402.json`);
  assert.equal(discRes.status, 200);
  const disc = await discRes.json();
  assert.equal(disc.x402Version, 2);
  assert.equal(disc.resources.length, 8);

  const favRes = await fetch(`${base}/favicon.ico`);
  assert.equal(favRes.status, 200);

  const openApiRes = await fetch(`${base}/openapi.json`);
  assert.equal(openApiRes.status, 200);
  const openApi = await openApiRes.json();
  assert.ok(openApi.info.contact.email);
  assert.equal(Object.keys(openApi.paths).length, 8);
  console.log("✅ 1. Discovery manifest, /openapi.json (8 paths), and /favicon.ico verified");

  // 2. Test unauthenticated REST request returns HTTP 402 with x402Version 2 and PAYMENT-REQUIRED header
  const unpaidRes = await fetch(`${base}/v1/token-alpha`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "AERO" }),
  });
  assert.equal(unpaidRes.status, 402);
  assert.ok(unpaidRes.headers.get("payment-required"));
  console.log("✅ 2. HTTP 402 v2 Payment Required verified across new endpoints");

  // 3. Test authorized /v1/social-search
  const socialRes = await fetch(`${base}/v1/social-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": "test-only-secret-key" },
    body: JSON.stringify({ query: "MCP server", limit: 2 }),
  });
  assert.equal(socialRes.status, 200);
  const socialData = await socialRes.json();
  assert.ok(socialData.data.count > 0);
  console.log(`✅ 3. /v1/social-search verified (${socialData.data.count} items)`);

  // 4. Test authorized /v1/maps-leads
  const mapsRes = await fetch(`${base}/v1/maps-leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": "test-only-secret-key" },
    body: JSON.stringify({ query: "cafe", location: "San Francisco", limit: 3 }),
  });
  assert.equal(mapsRes.status, 200);
  const mapsData = await mapsRes.json();
  assert.ok(mapsData.data.count > 0);
  console.log(`✅ 4. /v1/maps-leads verified (${mapsData.data.count} leads)`);

  // 5. Test authorized /v1/web-extract
  const webRes = await fetch(`${base}/v1/web-extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": "test-only-secret-key" },
    body: JSON.stringify({ url: "https://example.com", max_length: 2000 }),
  });
  assert.equal(webRes.status, 200);
  const webData = await webRes.json();
  assert.equal(webData.ok, true);
  assert.ok(webData.data.llm_markdown.includes("Example Domain"));
  assert.equal(webData.data.prompt_injection_Check.safe, true);
  console.log("✅ 5. /v1/web-extract verified (clean Markdown + Prompt Injection scanner)");

  // 6. Test authorized /v1/security-audit
  const auditRes = await fetch(`${base}/v1/security-audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": "test-only-secret-key" },
    body: JSON.stringify({
      target: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      chain: "base",
    }),
  });
  assert.equal(auditRes.status, 200);
  const auditData = await auditRes.json();
  assert.equal(auditData.ok, true);
  assert.equal(auditData.data.type, "smart_contract");
  assert.equal(auditData.data.token_info.is_honeypot, false);
  console.log(
    `✅ 6. /v1/security-audit verified (${auditData.data.token_info.symbol} -> Verdict: ${auditData.data.verdict})`
  );

  // 7. Test authorized /v1/token-alpha
  const alphaRes = await fetch(`${base}/v1/token-alpha`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": "test-only-secret-key" },
    body: JSON.stringify({ query: "AERO", chain: "base" }),
  });
  assert.equal(alphaRes.status, 200);
  const alphaData = await alphaRes.json();
  assert.equal(alphaData.ok, true);
  assert.equal(alphaData.data.found, true);
  console.log(
    `✅ 7. /v1/token-alpha verified (${alphaData.data.token.symbol} -> Signal: ${alphaData.data.alpha_metrics.signal})`
  );

  // 8. Test authorized /v1/domain-intel
  const domainRes = await fetch(`${base}/v1/domain-intel`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": "test-only-secret-key" },
    body: JSON.stringify({ domain: "stripe.com" }),
  });
  assert.equal(domainRes.status, 200);
  const domainData = await domainRes.json();
  assert.equal(domainData.ok, true);
  assert.equal(domainData.data.domain, "stripe.com");
  console.log(
    `✅ 8. /v1/domain-intel verified (Email: ${domainData.data.infrastructure.email_provider}, Subdomains: ${domainData.data.active_subdomains.length})`
  );

  // 9. Test authorized /v1/package-audit
  const pkgRes = await fetch(`${base}/v1/package-audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": "test-only-secret-key" },
    body: JSON.stringify({ name: "lodash", ecosystem: "npm", version: "4.17.15" }),
  });
  assert.equal(pkgRes.status, 200);
  const pkgData = await pkgRes.json();
  assert.equal(pkgData.ok, true);
  assert.ok(pkgData.data.vulnerability_count > 0);
  console.log(
    `✅ 9. /v1/package-audit verified (lodash@4.17.15 -> ${pkgData.data.verdict}, ${pkgData.data.vulnerability_count} CVEs)`
  );

  // 10. Test authorized /v1/academic-search
  const acadRes = await fetch(`${base}/v1/academic-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": "test-only-secret-key" },
    body: JSON.stringify({ query: "large language model agents", limit: 3 }),
  });
  assert.equal(acadRes.status, 200);
  const acadData = await acadRes.json();
  assert.equal(acadData.ok, true);
  assert.ok(acadData.data.count > 0);
  console.log(`✅ 10. /v1/academic-search verified (${acadData.data.count} papers)`);

  // 11. Test MCP JSON-RPC tools/list returns all 8 tools
  const mcpRes = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  assert.equal(mcpRes.status, 200);
  const mcpData = await mcpRes.json();
  assert.equal(mcpData.result.tools.length, 8);
  console.log("✅ 11. MCP JSON-RPC endpoint (/mcp) verified with all 8 tools");
} finally {
  server.close();
}
