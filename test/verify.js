import assert from "node:assert/strict";

// Configure test secret key explicitly for verification
process.env.API_SECRET_KEY = "test-only-secret-key";

const { createAppServer } = await import("../src/server.js");
const server = createAppServer();

await new Promise((resolve) => server.listen(0, resolve));
const { port } = server.address();
const base = `http://localhost:${port}`;

try {
  // 1. Test A2A / x402 discovery manifest
  const discRes = await fetch(`${base}/.well-known/x402.json`);
  assert.equal(discRes.status, 200);
  const disc = await discRes.json();
  assert.equal(disc.name, "Agent Kiosk");
  console.log("✅ 1. Discovery manifest (/.well-known/x402.json) verified");

  // 2. Test unauthenticated REST request returns HTTP 402 Payment Required
  const unpaidRes = await fetch(`${base}/v1/social-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "AI agents" }),
  });
  assert.equal(unpaidRes.status, 402);
  const challenge = await unpaidRes.json();
  assert.equal(challenge.x402Version, 1);
  assert.equal(challenge.accepts[0].maxAmountRequired, "20000");
  console.log("✅ 2. HTTP 402 Payment Required challenge verified ($0.02 USDC on Base)");

  // 3. Test unauthenticated MCP tools/call ALSO returns HTTP 402 (no free backdoor!)
  const unpaidMcpRes = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 99,
      method: "tools/call",
      params: { name: "social_search", arguments: { query: "MCP" } },
    }),
  });
  assert.equal(unpaidMcpRes.status, 402);
  console.log("✅ 3. MCP tools/call payment gate verified (blocks unpaid calls with 402)");

  // 4. Test authorized request to /v1/social-search
  const socialRes = await fetch(`${base}/v1/social-search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": "test-only-secret-key",
    },
    body: JSON.stringify({ query: "MCP server", limit: 3 }),
  });
  assert.equal(socialRes.status, 200);
  const socialData = await socialRes.json();
  assert.equal(socialData.ok, true);
  assert.ok(socialData.data.count > 0, "Expected social search results");
  console.log(`✅ 4. /v1/social-search returned ${socialData.data.count} live social discussions`);

  // 5. Test authorized request to /v1/maps-leads (verifying city accuracy + phone/website extraction)
  const mapsRes = await fetch(`${base}/v1/maps-leads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": "test-only-secret-key",
    },
    body: JSON.stringify({ query: "cafe", location: "San Francisco", limit: 5 }),
  });
  assert.equal(mapsRes.status, 200);
  const mapsData = await mapsRes.json();
  assert.equal(mapsData.ok, true);
  assert.ok(mapsData.data.count > 0, "Expected maps lead results");
  const firstLead = mapsData.data.leads[0];
  assert.ok(
    firstLead.coordinates.lat > 37 && firstLead.coordinates.lat < 38,
    `Expected San Francisco coordinates (~37.7), got ${firstLead.coordinates.lat}`
  );
  assert.ok(
    firstLead.phone || firstLead.website,
    "Expected enriched business lead with phone or website"
  );
  console.log(
    `✅ 5. /v1/maps-leads returned ${mapsData.data.count} verified SF leads (Sample: ${firstLead.name} | Phone: ${firstLead.phone} | Web: ${firstLead.website})`
  );

  // 6. Test MCP JSON-RPC tools/list
  const mcpRes = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  assert.equal(mcpRes.status, 200);
  const mcpData = await mcpRes.json();
  assert.equal(mcpData.result.tools.length, 2);
  console.log("✅ 6. MCP JSON-RPC endpoint (/mcp) verified with 2 tools");
} finally {
  server.close();
}
