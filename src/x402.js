/**
 * x402 v2 Payment Protocol Middleware & Verification + Settlement Layer
 * Supports 4 high-demand B2A endpoints on Base Mainnet (eip155:8453).
 */

export const CONFIG = {
  // Base / Ethereum wallet address receiving USDC micropayments
  payToWallet: process.env.PAY_TO_WALLET || "0xd8429209Aee6A398B9707DFf5F28AAA93452eE95",
  // CAIP-2 chain ID for Base Mainnet (8453)
  network: process.env.X402_NETWORK || "eip155:8453",
  // Base Mainnet USDC contract address
  usdcAsset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  facilitatorUrl: process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator",
  apiSecretKey: process.env.API_SECRET_KEY || null,
};

export const PRICING = {
  "/v1/social-search": {
    priceUsd: "0.02",
    amount: "20000", // 0.02 USDC
    description:
      "Real-time social media search (Reddit, HackerNews) returning clean JSON & Markdown for AI agents.",
    mimeType: "application/json",
  },
  "/v1/maps-leads": {
    priceUsd: "0.03",
    amount: "30000", // 0.03 USDC
    description:
      "Local business lead extractor returning company name, phone, website, address, and coordinates.",
    mimeType: "application/json",
  },
  "/v1/web-extract": {
    priceUsd: "0.01",
    amount: "10000", // 0.01 USDC
    description:
      "Clean webpage-to-Markdown extractor with automatic Prompt Injection trap scanning for AI agents.",
    mimeType: "application/json",
  },
  "/v1/security-audit": {
    priceUsd: "0.02",
    amount: "20000", // 0.02 USDC
    description:
      "Pre-flight security scanner for 0x smart contracts/tokens (honeypot, tax, liquidity via GoPlus & DexScreener) and URLs (phishing & prompt injection).",
    mimeType: "application/json",
  },
};

/**
 * Build standard x402 v2 PaymentRequired response body and PAYMENT-REQUIRED base64 header
 */
export function build402Challenge(routePath, resourceUrl) {
  const route = PRICING[routePath] || PRICING["/v1/social-search"];

  const body = {
    x402Version: 2,
    error: "PAYMENT-SIGNATURE header is required",
    resource: {
      url: resourceUrl,
      description: route.description,
      mimeType: route.mimeType,
    },
    accepts: [
      {
        scheme: "exact",
        network: CONFIG.network,
        amount: route.amount,
        asset: CONFIG.usdcAsset,
        payTo: CONFIG.payToWallet,
        maxTimeoutSeconds: 60,
        extra: {
          name: "USD Coin",
          version: "2",
        },
      },
    ],
  };

  const headerBase64 = Buffer.from(JSON.stringify(body)).toString("base64");

  return { body, headerBase64 };
}

/**
 * Verify AND settle incoming x402 v2/v1 payment header (or validate configured API_SECRET_KEY)
 */
export async function verifyAndSettlePayment(req, routePath, resourceUrl) {
  // 1. Check explicit API_SECRET_KEY (only if configured in environment)
  const providedKey =
    req.headers["x-api-key"] ||
    (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");

  if (CONFIG.apiSecretKey && providedKey && providedKey === CONFIG.apiSecretKey) {
    return { authorized: true, mode: "api-key", settlementHeader: null };
  }

  // 2. Require x402 PAYMENT-SIGNATURE (v2) or X-PAYMENT (v1) header
  const paymentHeader = req.headers["payment-signature"] || req.headers["x-payment"];
  const { body: challenge, headerBase64 } = build402Challenge(routePath, resourceUrl);

  if (!paymentHeader) {
    return {
      authorized: false,
      statusCode: 402,
      challenge,
      challengeHeader: headerBase64,
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
        x402Version: 2,
        paymentPayload: decoded,
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
        challengeHeader: headerBase64,
      };
    }

    const verifyData = await verifyRes.json();
    if (!verifyData.isValid) {
      return {
        authorized: false,
        statusCode: 402,
        challenge: {
          ...challenge,
          error: verifyData.invalidReason || "Invalid or expired PAYMENT-SIGNATURE.",
        },
        challengeHeader: headerBase64,
      };
    }

    // Step B: Settle transaction on-chain so USDC lands in payToWallet
    const settleRes = await fetch(`${CONFIG.facilitatorUrl}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        x402Version: 2,
        paymentPayload: decoded,
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
        challengeHeader: headerBase64,
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
        challengeHeader: headerBase64,
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
        error: `Malformed PAYMENT-SIGNATURE payload: ${err.message}`,
      },
      challengeHeader: headerBase64,
    };
  }
}
