/**
 * x402 v2 & v1 Payment Protocol Middleware & Multi-Facilitator Mainnet Settlement Layer
 * Supports 12 high-demand B2A endpoints on Base Mainnet (eip155:8453 / base).
 */

export const CONFIG = {
  // Base / Ethereum wallet address receiving USDC micropayments
  payToWallet: process.env.PAY_TO_WALLET || "0xd8429209Aee6A398B9707DFf5F28AAA93452eE95",
  // CAIP-2 chain ID for Base Mainnet (8453)
  network: process.env.X402_NETWORK || "eip155:8453",
  // Base Mainnet USDC contract address
  usdcAsset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  // Live Base Mainnet facilitators (verified 200 OK with zero API key required)
  facilitatorsV2: [
    process.env.X402_FACILITATOR_URL || "https://facilitator.payai.network",
    "https://facilitator.dexter.cash",
  ],
  facilitatorsV1: [
    process.env.X402_FACILITATOR_URL || "https://facilitator.payai.network",
    "https://facilitator.dexter.cash",
    "https://facilitator.mogami.tech",
  ],
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
  "/v1/token-alpha": {
    priceUsd: "0.02",
    amount: "20000", // 0.02 USDC
    description:
      "Real-time DEX order-flow & token alpha signal analyzer: buy vs. sell pressure, liquidity depth, volume velocity, and top pools.",
    mimeType: "application/json",
  },
  "/v1/domain-intel": {
    priceUsd: "0.02",
    amount: "20000", // 0.02 USDC
    description:
      "B2B company & domain intelligence: DNS records, MX email provider, SaaS tech stack fingerprints from TXT/NS, RDAP registration, and active subdomains.",
    mimeType: "application/json",
  },
  "/v1/package-audit": {
    priceUsd: "0.01",
    amount: "10000", // 0.01 USDC
    description:
      "Open-source package & CVE vulnerability scanner for coding agents (npm, PyPI, crates.io) powered by Google OSV.dev.",
    mimeType: "application/json",
  },
  "/v1/academic-search": {
    priceUsd: "0.02",
    amount: "20000", // 0.02 USDC
    description:
      "Peer-reviewed scientific paper & preprint search (OpenAlex + arXiv) returning citations, reconstructed abstracts, and direct Open-Access PDF links.",
    mimeType: "application/json",
  },
  "/v1/wallet-profiler": {
    priceUsd: "0.03",
    amount: "30000", // 0.03 USDC
    description:
      "Multi-chain whale & wallet portfolio profiler across Base, Ethereum, Arbitrum, and Polygon: live USDC & ETH balances, transaction counts, and smart contract detection.",
    mimeType: "application/json",
  },
  "/v1/prediction-markets": {
    priceUsd: "0.02",
    amount: "20000", // 0.02 USDC
    description:
      "Live prediction market odds & implied event probabilities (%) from Polymarket and Manifold Markets for macro, crypto, tech, and politics.",
    mimeType: "application/json",
  },
  "/v1/defi-yields": {
    priceUsd: "0.02",
    amount: "20000", // 0.02 USDC
    description:
      "DeFi highest APY & yield radar powered by DeFiLlama: ranks top liquidity and lending pools by APY and TVL for any token and chain.",
    mimeType: "application/json",
  },
  "/v1/github-intel": {
    priceUsd: "0.01",
    amount: "10000", // 0.01 USDC
    description:
      "GitHub repository & open-source competitive intelligence: stars, forks, open issues, latest releases, and top repositories by topic.",
    mimeType: "application/json",
  },
};

/**
 * Decode payment header supporting standard Base64, Base64URL, or raw JSON string
 */
function decodePaymentHeader(rawHeader) {
  const trimmed = String(rawHeader || "").trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }
  const normalizedB64 = trimmed.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(normalizedB64, "base64").toString("utf8"));
}

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
 * Verify AND settle incoming x402 v2/v1 payment header across Base Mainnet facilitators
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
  const paymentHeader =
    req.headers["payment-signature"] ||
    req.headers["x-payment"] ||
    req.headers["x-payment-signature"];
  const { body: challenge, headerBase64 } = build402Challenge(routePath, resourceUrl);

  if (!paymentHeader) {
    return {
      authorized: false,
      statusCode: 402,
      challenge,
      challengeHeader: headerBase64,
    };
  }

  const route = PRICING[routePath] || PRICING["/v1/social-search"];

  try {
    const decoded = decodePaymentHeader(paymentHeader);

    // Auto-detect x402 v1 vs v2 from x402Version, network name ('base' vs 'eip155:8453'), or header type
    const isV1 =
      Number(decoded.x402Version) === 1 ||
      decoded.network === "base" ||
      (!decoded.x402Version && !decoded.accepted && Boolean(req.headers["x-payment"]));
    const clientVersion = isV1 ? 1 : 2;

    // Coerce EIP-3009 numeric fields (value, validAfter, validBefore) to strings so strict facilitators never reject
    const rawPayload = decoded.payload ? { ...decoded.payload } : {};
    if (rawPayload.authorization && typeof rawPayload.authorization === "object") {
      const authObj = { ...rawPayload.authorization };
      if (authObj.value !== undefined) authObj.value = String(authObj.value);
      if (authObj.validAfter !== undefined) authObj.validAfter = String(authObj.validAfter);
      if (authObj.validBefore !== undefined) authObj.validBefore = String(authObj.validBefore);
      rawPayload.authorization = authObj;
    }

    const cleanV2Requirements = {
      scheme: "exact",
      network: CONFIG.network,
      amount: route.amount,
      asset: CONFIG.usdcAsset,
      payTo: CONFIG.payToWallet,
      maxTimeoutSeconds: 60,
      extra: { name: "USD Coin", version: "2" },
    };

    const cleanV1Requirements = {
      scheme: "exact",
      network: "base",
      maxAmountRequired: route.amount,
      resource:
        (typeof decoded.resource === "string" ? decoded.resource : decoded.resource?.url) ||
        resourceUrl,
      description: route.description,
      mimeType: route.mimeType,
      payTo: CONFIG.payToWallet,
      maxTimeoutSeconds: 60,
      asset: CONFIG.usdcAsset,
      extra: { name: "USD Coin", version: "2" },
    };

    const paymentRequirements = clientVersion === 1 ? cleanV1Requirements : cleanV2Requirements;

    // Normalize paymentPayload so lightweight v2 signers that omit 'accepted' or 'resource' pass PayAI & Dexter validation
    const normalizedPayload =
      clientVersion === 2
        ? {
            ...decoded,
            x402Version: 2,
            resource:
              decoded.resource && typeof decoded.resource === "object"
                ? decoded.resource
                : challenge.resource,
            accepted: cleanV2Requirements,
            payload: rawPayload,
          }
        : {
            ...decoded,
            x402Version: 1,
            scheme: decoded.scheme || "exact",
            network: "base",
            payload: rawPayload,
          };

    const normalizedHeaderBase64 = Buffer.from(JSON.stringify(normalizedPayload)).toString(
      "base64"
    );

    const facilitators =
      clientVersion === 1 ? CONFIG.facilitatorsV1 : CONFIG.facilitatorsV2;

    let lastError = "Facilitator verification failed.";

    for (const facilitatorUrl of facilitators) {
      try {
        const reqBody = JSON.stringify({
          x402Version: clientVersion,
          paymentPayload: normalizedPayload,
          paymentHeader: normalizedHeaderBase64,
          paymentRequirements,
        });

        const verifyRes = await fetch(`${facilitatorUrl}/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: reqBody,
          signal: AbortSignal.timeout(6500),
        });

        const verifyText = await verifyRes.text();
        let verifyData = null;
        try {
          verifyData = JSON.parse(verifyText);
        } catch {
          verifyData = null;
        }

        if (!verifyRes.ok) {
          lastError =
            verifyData?.invalidMessage ||
            verifyData?.invalidReason ||
            verifyData?.error ||
            `Facilitator ${facilitatorUrl} verify returned HTTP ${verifyRes.status}`;
          continue;
        }

        if (!verifyData?.isValid) {
          lastError =
            verifyData?.invalidMessage ||
            verifyData?.invalidReason ||
            "Invalid or expired PAYMENT-SIGNATURE.";
          if (verifyData?.invalidReason === "invalid_exact_evm_signature") {
            return {
              authorized: false,
              statusCode: 402,
              challenge: {
                ...challenge,
                error: lastError,
              },
              challengeHeader: headerBase64,
            };
          }
          continue;
        }

        // Settle transaction on Base Mainnet so USDC lands in payToWallet
        const settleRes = await fetch(`${facilitatorUrl}/settle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: reqBody,
          signal: AbortSignal.timeout(10000),
        });

        const settleText = await settleRes.text();
        let settleData = null;
        try {
          settleData = JSON.parse(settleText);
        } catch {
          settleData = null;
        }

        if (!settleRes.ok || !settleData?.success) {
          lastError =
            settleData?.error ||
            settleData?.errorReason ||
            `Facilitator ${facilitatorUrl} settle returned HTTP ${settleRes.status}`;
          continue;
        }

        const settlementHeader = Buffer.from(JSON.stringify(settleData)).toString("base64");

        return {
          authorized: true,
          mode: "x402",
          payer: rawPayload?.authorization?.from || verifyData?.payer || null,
          txHash: settleData.txHash || settleData.transaction || null,
          settlementHeader,
        };
      } catch (innerErr) {
        lastError = innerErr.message;
      }
    }

    return {
      authorized: false,
      statusCode: 402,
      challenge: {
        ...challenge,
        error: lastError,
      },
      challengeHeader: headerBase64,
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
