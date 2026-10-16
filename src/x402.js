/**
 * x402 Payment Protocol Middleware & Verification + Settlement Layer
 * Implements the full HTTP 402 Payment Required specification (including x402scan outputSchema):
 * 1. Challenge generation (HTTP 402 + accepts array with input/output schema for x402scan & Bazaar)
 * 2. Cryptographic signature verification (/verify)
 * 3. On-chain settlement (/settle) so USDC is actually transferred to payToWallet
 * 4. Optional API_SECRET_KEY header for prepaid / Apify / Smithery B2B integrations
 */

export const CONFIG = {
  // Base / Ethereum wallet address receiving USDC micropayments
  payToWallet: process.env.PAY_TO_WALLET || "0xd8429209Aee6A398B9707DFf5F28AAA93452eE95",
  network: process.env.X402_NETWORK || "base",
  // Base Mainnet USDC contract address
  usdcAsset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  facilitatorUrl: process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator",
  // Never fallback to a hardcoded key in production; only active if explicitly configured
  apiSecretKey: process.env.API_SECRET_KEY || null,
};

export const PRICING = {
  "/v1/social-search": {
    priceUsd: "$0.02",
    maxAmountRequired: "20000", // 0.02 USDC (6 decimals)
    description:
      "Real-time social media search (Reddit, HackerNews) returning clean JSON & Markdown for AI agents.",
    mimeType: "application/json",
    outputSchema: {
      input: {
        type: "http",
        method: "POST",
        bodyType: "json",
        bodyFields: {
          query: {
            type: "string",
            required: true,
            description: "Search keywords or topic (e.g., 'AI agents', 'Stripe alternatives')",
          },
          platform: {
            type: "string",
            required: false,
            description: "Platform filter: 'all', 'reddit', or 'hn'",
          },
          limit: {
            type: "number",
            required: false,
            description: "Max results (1-25, default 10)",
          },
        },
      },
      output: {
        ok: { type: "boolean" },
        data: {
          type: "object",
          properties: {
            query: { type: "string" },
            count: { type: "number" },
            items: { type: "array" },
            llm_markdown: { type: "string" },
          },
        },
      },
    },
  },
  "/v1/maps-leads": {
    priceUsd: "$0.03",
    maxAmountRequired: "30000", // 0.03 USDC (6 decimals)
    description:
      "Local business lead extractor returning company name, phone, website, address, and coordinates.",
    mimeType: "application/json",
    outputSchema: {
      input: {
        type: "http",
        method: "POST",
        bodyType: "json",
        bodyFields: {
          query: {
            type: "string",
            required: true,
            description: "Business category or keyword (e.g., 'cafe', 'dentist', 'lawyer')",
          },
          location: {
            type: "string",
            required: false,
            description: "City or region (e.g., 'San Francisco', 'London', 'Istanbul')",
          },
          limit: {
            type: "number",
            required: false,
            description: "Max leads to return (1-25, default 10)",
          },
        },
      },
      output: {
        ok: { type: "boolean" },
        data: {
          type: "object",
          properties: {
            query: { type: "string" },
            location: { type: "string" },
            count: { type: "number" },
            leads: { type: "array" },
            llm_markdown: { type: "string" },
          },
        },
      },
    },
  },
};

/**
 * Build standard x402 402 Payment Required response body (compliant with x402scan strict validator)
 */
export function build402Challenge(routePath, resourceUrl) {
  const route = PRICING[routePath] || PRICING["/v1/social-search"];

  return {
    x402Version: 1,
    error: "X-PAYMENT header is required to access this agent endpoint.",
    accepts: [
      {
        scheme: "exact",
        network: CONFIG.network,
        maxAmountRequired: route.maxAmountRequired,
        resource: resourceUrl,
        description: route.description,
        mimeType: route.mimeType,
        payTo: CONFIG.payToWallet,
        maxTimeoutSeconds: 60,
        asset: CONFIG.usdcAsset,
        outputSchema: route.outputSchema,
        extra: {
          name: "USD Coin",
          version: "2",
          priceDisplay: route.priceUsd,
        },
      },
    ],
  };
}

/**
 * Verify AND settle incoming x402 payment header (or validate configured API_SECRET_KEY)
 */
export async function verifyAndSettlePayment(req, routePath, resourceUrl) {
  // 1. Check explicit API_SECRET_KEY (only if configured in environment)
  const providedKey =
    req.headers["x-api-key"] ||
    (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");

  if (CONFIG.apiSecretKey && providedKey && providedKey === CONFIG.apiSecretKey) {
    return { authorized: true, mode: "api-key", settlementHeader: null };
  }

  // 2. Require x402 X-PAYMENT header
  const paymentHeader = req.headers["x-payment"];
  const challenge = build402Challenge(routePath, resourceUrl);

  if (!paymentHeader) {
    return {
      authorized: false,
      statusCode: 402,
      challenge,
    };
  }

  const paymentRequirements = challenge.accepts[0];

  try {
    const decoded = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8"));

    // Step A: Verify signature with x402 facilitator
    const verifyRes = await fetch(`${CONFIG.facilitatorUrl}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        x402Version: 1,
        paymentHeader,
        paymentRequirements,
      }),
      signal: AbortSignal.timeout(6000),
    });

    if (!verifyRes.ok) {
      return {
        authorized: false,
        statusCode: 402,
        challenge: {
          ...challenge,
          error: `Facilitator verification failed (HTTP ${verifyRes.status}).`,
        },
      };
    }

    const verifyData = await verifyRes.json();
    if (!verifyData.isValid) {
      return {
        authorized: false,
        statusCode: 402,
        challenge: {
          ...challenge,
          error: verifyData.invalidReason || "Invalid or expired X-PAYMENT signature.",
        },
      };
    }

    // Step B: Settle transaction on-chain so USDC lands in payToWallet
    const settleRes = await fetch(`${CONFIG.facilitatorUrl}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        x402Version: 1,
        paymentHeader,
        paymentRequirements,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!settleRes.ok) {
      return {
        authorized: false,
        statusCode: 402,
        challenge: {
          ...challenge,
          error: `On-chain payment settlement failed (HTTP ${settleRes.status}).`,
        },
      };
    }

    const settleData = await settleRes.json();
    if (!settleData.success) {
      return {
        authorized: false,
        statusCode: 402,
        challenge: {
          ...challenge,
          error: settleData.error || "Payment settlement was rejected on-chain.",
        },
      };
    }

    const settlementHeader = Buffer.from(JSON.stringify(settleData)).toString("base64");

    return {
      authorized: true,
      mode: "x402",
      payer: decoded?.payload?.authorization?.from || null,
      txHash: settleData.txHash || settleData.transaction || null,
      settlementHeader,
    };
  } catch (err) {
    return {
      authorized: false,
      statusCode: 402,
      challenge: {
        ...challenge,
        error: `Malformed X-PAYMENT payload: ${err.message}`,
      },
    };
  }
}
