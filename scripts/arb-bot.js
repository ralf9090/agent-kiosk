#!/usr/bin/env node
/**
 * Base Mainnet Zero-Risk Atomic Arbitrage Engine v5.0
 * - Architecture: 1-Wave Single-Roundtrip Quote Engine + 4-Datacenter Parallel RPC Striping
 * - Speed:        Eliminates 3-step sequential waiting (Batch 1 -> 2 -> 3 collapsed into 1 single wave!)
 * - Token Pool:   34 High-Volume Base Tokens across 364 active pools
 * - Priority Bid: Dynamic 15% Sequencer Tip on verified Flash Loan profits
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  createPublicClient,
  createWalletClient,
  http,
  webSocket,
  fallback,
  parseAbi,
  encodeFunctionData,
} from "viem";
import { base } from "viem/chains";
import { mnemonicToAccount } from "viem/accounts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function loadMnemonic() {
  const envPath = path.join(ROOT, ".env.local");
  const content = fs.readFileSync(envPath, "utf8");
  const m = content.match(/WALLET_MNEMONIC="([^"]+)"/);
  if (!m) throw new Error("WALLET_MNEMONIC not found in .env.local");
  return m[1].trim();
}

const deployment = JSON.parse(
  fs.readFileSync(path.join(ROOT, "contracts/build/deployment.json"), "utf8")
);
const arbAbi = JSON.parse(
  fs.readFileSync(path.join(ROOT, "contracts/build/AtomicArb.abi"), "utf8")
);

const account = mnemonicToAccount(loadMnemonic());

// 5 Verified High-Speed RPC Clients for Parallel Multi-Datacenter Quote Striping
const RPC_URLS = [
  "https://base.gateway.tenderly.co",
  "https://mainnet.base.org",
  "https://base-rpc.publicnode.com",
  "https://base-mainnet.gateway.tatum.io",
  "https://base-mainnet.public.blastapi.io",
];

// Dedicated unthrottled execution client (mainnet.base.org + tenderly first) for simulate/gas/nonce/receipt
const execClient = createPublicClient({
  chain: base,
  transport: fallback([
    http("https://mainnet.base.org", { timeout: 3000 }),
    http("https://base.gateway.tenderly.co", { timeout: 3000 }),
    http("https://base-mainnet.public.blastapi.io", { timeout: 3000 }),
    http("https://base-rpc.publicnode.com", { timeout: 3000 }),
  ]),
});

const stripeClients = RPC_URLS.map((url) =>
  createPublicClient({
    chain: base,
    transport: fallback([
      http(url, { timeout: 1500 }),
      http("https://mainnet.base.org", { timeout: 2000 }),
      http("https://base.gateway.tenderly.co", { timeout: 2000 }),
    ]),
  })
);

const wsClient = createPublicClient({
  chain: base,
  pollingInterval: 400,
  transport: fallback([
    webSocket("wss://base-rpc.publicnode.com", { timeout: 2500 }),
    http("https://mainnet.base.org", { timeout: 2500 }),
    http("https://base.gateway.tenderly.co", { timeout: 2500 }),
  ]),
});

const wallet = createWalletClient({
  account,
  chain: base,
  transport: fallback([
    http("https://mainnet.base.org", { timeout: 3500 }),
    http("https://base.gateway.tenderly.co", { timeout: 3500 }),
    http("https://base-mainnet.public.blastapi.io", { timeout: 3500 }),
    http("https://base-rpc.publicnode.com", { timeout: 3500 }),
  ]),
});

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH = "0x4200000000000000000000000000000000000006";

const TOKENS = {
  WETH: "0x4200000000000000000000000000000000000006",
  AERO: "0x940181a94A35A4569E4529A3CDfB74e38FD98631",
  VIRTUAL: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b",
  cbBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  EURC: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42",
  DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
  cbXRP: "0xcb585250f852C6c6bf90434AB21A00f02833a4af",
  cbZEC: "0xB2000000000000000000008501b13360000cb2EC",
  USDbC: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",
  VVV: "0xacfE6019Ed1A7Dc6f7B508C02d1b04ec88cC21bf",
  MORPHO: "0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842",
  cbETH: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22",
  wstETH: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452",
  CLANKER: "0x1bc0c42215582d5A085795f4baDbaC3ff36d1Bcb",
  BNKR: "0x22aF33FE49fD1Fa80c7149773dDe5890D3c76F3b",
  KEYCAT: "0x9a26F5433671751C3276a065f57e5a02D2817973",
  WELL: "0xA88594D404727625A9437C3f886C7643872296AE",
  ZORA: "0x1111111111166b7FE7bd91427724B487980aFc69",
  DEGEN: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed",
  BRETT: "0x532f27101965dd16442E59d40670FaF5eBB142E4",
  TOSHI: "0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4",
  cbHYPE: "0xB200000000000000000000451d033a5000cb479e",
  tBTC: "0x236aa50979D5f3De3Bd1Eeb40E81137F22ab794b",
  ZRO: "0x6985884C4392D348587B19cb9eAAf157F13271cd",
  AAVE: "0x63706e401c06ac8513145b7687A14804d17f814b",
  B3: "0xB3B32F9f8827D4634fE7d973Fa1034Ec9fdDB3B3",
  cbADA: "0xcbADA732173e39521CDBE8bf59a6Dc85A9fc7b8c",
  PENDLE: "0xA99F6e6785Da0F5d6fB42495Fe424BCE029Eeb3E",
  CRV: "0x8Ee73c484A26e0A5df2Ee2a4960B789967dd0415",
  UNI: "0xc3De830EA07524a0761646a6a4e4be0e114a3C83",
  DRB: "0x3ec2156D4c0A9CBdAB4a016633b7BcF6a8d68Ea2",
  COOKIE: "0xC0041EF357B183448B235a8Ea73Ce4E4eC8c265F",
  VADER: "0x731814e491571A2e9eE3c5b1F7f3b962eE8f4870",
  DOGINME: "0x6921B130D297cc43754afba22e5EAc0FBf8Db75b",
};

const CORE_SYMS = ["WETH", "AERO", "VIRTUAL", "cbBTC", "EURC", "DAI", "USDbC", "cbXRP", "cbZEC"];
const ROTATING_SYMS = Object.keys(TOKENS).filter((s) => !CORE_SYMS.includes(s));
let rotIdx = 0;

const PRE_APPROVED = new Set([
  USDC.toLowerCase(),
  WETH.toLowerCase(),
  TOKENS.AERO.toLowerCase(),
  TOKENS.VIRTUAL.toLowerCase(),
  TOKENS.cbBTC.toLowerCase(),
  TOKENS.DAI.toLowerCase(),
  TOKENS.USDbC.toLowerCase(),
  TOKENS.EURC.toLowerCase(),
]);

const UNI_QUOTER = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a";
const UNI_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481";

const PCS_QUOTER = "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997";
const PCS_ROUTER = "0x678Aa4bF4E210cf2166753e054d5b7c31cc7fa86";

const AERO_CL_QUOTER = "0x254cF9E1E6e233aa1AC962CB9B05b2cfeAaE15b0";
const AERO_CL_ROUTER = "0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5";

const AERO_V2_ROUTER = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43";
const AERO_V2_FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";

const v3QuoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160, uint32, uint256)",
]);
const clQuoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, int24 tickSpacing, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160, uint32, uint256)",
]);
const aeroV2Abi = parseAbi([
  "function getAmountsOut(uint256 amountIn, (address from, address to, bool stable, address factory)[] routes) external view returns (uint256[] amounts)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, (address from, address to, bool stable, address factory)[] routes, address to, uint256 deadline) external returns (uint256[] amounts)",
]);
const v3RouterAbi = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
]);
const clRouterAbi = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, int24 tickSpacing, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
]);
const erc20Abi = parseAbi([
  "function approve(address spender, uint256 value) external returns (bool)",
]);

const ALL_VENUES = [
  ...[100, 200, 500, 3000, 10000].map((fee) => ({ type: "UNI_V3", fee, label: `UniV3_${fee}` })),
  ...[1, 10, 50, 100, 200, 2000].map((tickSpacing) => ({ type: "AERO_CL", tickSpacing, label: `AeroCL_${tickSpacing}` })),
  ...[100, 500, 2500, 10000].map((fee) => ({ type: "PCS_V3", fee, label: `PCSv3_${fee}` })),
  { type: "AERO_V2", stable: false, label: "AeroV2_vol" },
  { type: "AERO_V2", stable: true, label: "AeroV2_stb" },
];

const activePairVenues = new Map();
// Reference token outputs per `${amt}_${sym}` updated every block for 1-Wave Single-Roundtrip quoting!
const refTokenOut = new Map();

function makeQuoteCall(tokenIn, tokenOut, amountIn, venue) {
  if (venue.type === "UNI_V3") {
    return {
      venue,
      contract: {
        address: UNI_QUOTER,
        abi: v3QuoterAbi,
        functionName: "quoteExactInputSingle",
        args: [{ tokenIn, tokenOut, amountIn, fee: venue.fee, sqrtPriceLimitX96: 0n }],
      },
    };
  }
  if (venue.type === "AERO_CL") {
    return {
      venue,
      contract: {
        address: AERO_CL_QUOTER,
        abi: clQuoterAbi,
        functionName: "quoteExactInputSingle",
        args: [{ tokenIn, tokenOut, amountIn, tickSpacing: venue.tickSpacing, sqrtPriceLimitX96: 0n }],
      },
    };
  }
  if (venue.type === "PCS_V3") {
    return {
      venue,
      contract: {
        address: PCS_QUOTER,
        abi: v3QuoterAbi,
        functionName: "quoteExactInputSingle",
        args: [{ tokenIn, tokenOut, amountIn, fee: venue.fee, sqrtPriceLimitX96: 0n }],
      },
    };
  }
  if (venue.type === "AERO_V2") {
    return {
      venue,
      contract: {
        address: AERO_V2_ROUTER,
        abi: aeroV2Abi,
        functionName: "getAmountsOut",
        args: [amountIn, [{ from: tokenIn, to: tokenOut, stable: venue.stable, factory: AERO_V2_FACTORY }]],
      },
    };
  }
  throw new Error(`Unknown venue: ${venue.type}`);
}

function buildVenueCalls(tokenIn, tokenOut, amountIn) {
  const key = `${tokenIn.toLowerCase()}_${tokenOut.toLowerCase()}`;
  const venues = activePairVenues.get(key) || [];
  return venues.map((v) => makeQuoteCall(tokenIn, tokenOut, amountIn, v));
}

// Striped Multi-Datacenter Parallel Multicall with fast 900ms race guard
async function callChunkWithTimeout(client, contracts, ms = 900) {
  let timer;
  try {
    return await Promise.race([
      client.multicall({ contracts, batchSize: 4096 }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("RPC chunk timeout")), ms);
      }),
    ]);
  } catch (_) {
    return await stripeClients[0].multicall({ contracts, batchSize: 4096 });
  } finally {
    clearTimeout(timer);
  }
}

async function stripedMulticall(contracts) {
  if (contracts.length === 0) return [];
  const CHUNK = Math.max(120, Math.ceil(contracts.length / stripeClients.length));
  const chunks = [];
  for (let i = 0; i < contracts.length; i += CHUNK) {
    chunks.push(contracts.slice(i, i + CHUNK));
  }
  const results = await Promise.all(
    chunks.map((c, idx) =>
      callChunkWithTimeout(stripeClients[idx % stripeClients.length], c, 900)
    )
  );
  return results.flat();
}

const SIZES = [15000000n, 60000000n, 180000000n, 500000000n]; // $15, $60, $180, and $500 USDC Flash Loan tiers
const CORE_SET = new Set(CORE_SYMS);

async function discoverActiveVenues() {
  console.log(`🔍 Discovering active pools & pruning dust liquidity across ${Object.keys(TOKENS).length} Base tokens...`);
  const probeMeta = [];
  const probeContracts = [];
  const probeUsdc = 15000000n; // $15 USDC
  const probeWeth = 6000000000000000n; // ~0.006 WETH ($15)

  for (const [sym, tokenAddr] of Object.entries(TOKENS)) {
    for (const v of ALL_VENUES) {
      probeMeta.push({ sym, isUsdc: true, pairKey1: `${USDC.toLowerCase()}_${tokenAddr.toLowerCase()}`, pairKey2: `${tokenAddr.toLowerCase()}_${USDC.toLowerCase()}`, venue: v });
      probeContracts.push(makeQuoteCall(USDC, tokenAddr, probeUsdc, v).contract);
    }
    if (sym !== "WETH") {
      for (const v of ALL_VENUES) {
        probeMeta.push({ sym, isUsdc: false, pairKey1: `${WETH.toLowerCase()}_${tokenAddr.toLowerCase()}`, pairKey2: `${tokenAddr.toLowerCase()}_${WETH.toLowerCase()}`, venue: v });
        probeContracts.push(makeQuoteCall(WETH, tokenAddr, probeWeth, v).contract);
      }
    }
  }

  const res = await stripedMulticall(probeContracts);
  const maxPairOut = new Map();
  res.forEach((r, idx) => {
    const out = extractAmountOut(r);
    if (out > 0n) {
      const { pairKey1 } = probeMeta[idx];
      const prev = maxPairOut.get(pairKey1) || 0n;
      if (out > prev) maxPairOut.set(pairKey1, out);
    }
  });

  let activeCount = 0;
  let prunedCount = 0;
  res.forEach((r, idx) => {
    const out = extractAmountOut(r);
    if (out > 0n) {
      const { sym, isUsdc, pairKey1, pairKey2, venue } = probeMeta[idx];
      const bestForPair = maxPairOut.get(pairKey1) || out;
      // Prune dead/dust pools that return <85% of the best venue for a $15 swap
      if (out < (bestForPair * 85n) / 100n) {
        prunedCount++;
        return;
      }
      if (!activePairVenues.has(pairKey1)) activePairVenues.set(pairKey1, []);
      if (!activePairVenues.has(pairKey2)) activePairVenues.set(pairKey2, []);
      activePairVenues.get(pairKey1).push(venue);
      activePairVenues.get(pairKey2).push(venue);
      activeCount++;
      if (isUsdc || sym !== "WETH") {
        const k15 = `15000000_${sym}`;
        const k60 = `60000000_${sym}`;
        const k180 = `180000000_${sym}`;
        const k500 = `500000000_${sym}`;
        if (!refTokenOut.has(k15) || out > refTokenOut.get(k15)) {
          refTokenOut.set(k15, out);
          refTokenOut.set(k60, out * 4n);
          refTokenOut.set(k180, out * 12n);
          refTokenOut.set(k500, (out * 100n) / 3n);
        }
      }
    }
  });
  console.log(`✅ Cached ${activeCount} liquid pools (pruned ${prunedCount} illiquid dust pools) across 34 tokens!`);
}

function encodeLegSteps(tokenIn, tokenOut, amountIn, venue, recipient, deadline) {
  const needsApprove = !PRE_APPROVED.has(tokenIn.toLowerCase());
  const targets = [];
  const payloads = [];

  let routerAddr = UNI_ROUTER;
  let swapCalldata;

  if (venue.type === "UNI_V3") {
    routerAddr = UNI_ROUTER;
    swapCalldata = encodeFunctionData({
      abi: v3RouterAbi,
      functionName: "exactInputSingle",
      args: [{ tokenIn, tokenOut, fee: venue.fee, recipient, amountIn, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n }],
    });
  } else if (venue.type === "PCS_V3") {
    routerAddr = PCS_ROUTER;
    swapCalldata = encodeFunctionData({
      abi: v3RouterAbi,
      functionName: "exactInputSingle",
      args: [{ tokenIn, tokenOut, fee: venue.fee, recipient, amountIn, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n }],
    });
  } else if (venue.type === "AERO_CL") {
    routerAddr = AERO_CL_ROUTER;
    swapCalldata = encodeFunctionData({
      abi: clRouterAbi,
      functionName: "exactInputSingle",
      args: [{ tokenIn, tokenOut, tickSpacing: venue.tickSpacing, recipient, deadline, amountIn, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n }],
    });
  } else if (venue.type === "AERO_V2") {
    routerAddr = AERO_V2_ROUTER;
    swapCalldata = encodeFunctionData({
      abi: aeroV2Abi,
      functionName: "swapExactTokensForTokens",
      args: [amountIn, 0n, [{ from: tokenIn, to: tokenOut, stable: venue.stable, factory: AERO_V2_FACTORY }], recipient, deadline],
    });
  } else {
    throw new Error(`Unknown venue type: ${venue.type}`);
  }

  if (needsApprove) {
    targets.push(tokenIn);
    payloads.push(encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [routerAddr, amountIn] }));
  }
  targets.push(routerAddr);
  payloads.push(swapCalldata);

  return { targets, payloads };
}

function extractAmountOut(res) {
  if (!res || res.status !== "success" || !res.result) return 0n;
  if (Array.isArray(res.result)) {
    return res.result.length === 2 ? res.result[1] : res.result[0];
  }
  return res.result;
}

const statusFile = path.join(ROOT, "contracts/build/arb-live-status.json");
let existingStats = {};
if (fs.existsSync(statusFile)) {
  try {
    existingStats = JSON.parse(fs.readFileSync(statusFile, "utf8"));
  } catch (_) {}
}

const stats = {
  startedAt: existingStats.startedAt || new Date().toISOString(),
  upgradedAt: new Date().toISOString(),
  version: "5.0-single-wave-4datacenter",
  contractAddress: deployment.contractAddress,
  walletAddress: account.address,
  totalCycles: existingStats.totalCycles || 0,
  totalRoutesEvaluated: existingStats.totalRoutesEvaluated || 0,
  closestSpreadUsd: existingStats.closestSpreadUsd ?? -999,
  closestRoute: existingStats.closestRoute || null,
  profitableTxCount: existingStats.profitableTxCount || 0,
  totalProfitUsd: existingStats.totalProfitUsd || 0,
  recentScans: existingStats.recentScans || [],
  executedTrades: existingStats.executedTrades || [],
};

function saveStatus() {
  try {
    fs.writeFileSync(statusFile, JSON.stringify(stats, null, 2));
  } catch (_) {}
}

async function tryExecuteFlashAtomic(routeDesc, flashAmount, minProfit, steps) {
  const targets = [];
  const payloads = [];
  for (const s of steps) {
    targets.push(...s.targets);
    payloads.push(...s.payloads);
  }

  try {
    const { request, result } = await execClient.simulateContract({
      address: deployment.contractAddress,
      abi: arbAbi,
      functionName: "executeFlashArb",
      args: [USDC, flashAmount, minProfit, targets, payloads],
      account,
    });

    const [gasEst, gasPrice, nonce] = await Promise.all([
      execClient.estimateContractGas({
        address: deployment.contractAddress,
        abi: arbAbi,
        functionName: "executeFlashArb",
        args: [USDC, flashAmount, minProfit, targets, payloads],
        account,
      }),
      execClient.getGasPrice(),
      execClient.getTransactionCount({ address: account.address, blockTag: "pending" }),
    ]);

    const baseWei = gasEst * gasPrice + 2500000000n;
    const baseGasCostUsdc = (baseWei * 2450n) / 1000000000000n;

    if (result <= baseGasCostUsdc + 1000n) {
      console.log(
        `🛡️ [GAS GUARD SKIPPED] ${routeDesc} | Gross: +$${(Number(result) / 1e6).toFixed(5)} <= Gas: $${(Number(baseGasCostUsdc) / 1e6).toFixed(5)}`
      );
      return false;
    }

    const excessProfitUsdc = result - baseGasCostUsdc;
    const bribeUsdc = (excessProfitUsdc * 15n) / 100n;
    const bribeWei = (bribeUsdc * 1000000000000n) / 2450n;
    const priorityFeePerGas = bribeWei / gasEst;
    const maxFeePerGas = gasPrice * 2n + priorityFeePerGas;

    const totalGasCostUsdc = baseGasCostUsdc + bribeUsdc;
    const netAfterGas = Number(result - totalGasCostUsdc) / 1e6;

    console.log(
      `🚨 [SNIPER PROFIT VERIFIED] ${routeDesc} | Gross: +$${(Number(result) / 1e6).toFixed(4)} | Net: +$${netAfterGas.toFixed(4)} USDC! Firing...`
    );
    const txHash = await wallet.writeContract({
      ...request,
      account,
      nonce,
      gas: (gasEst * 120n) / 100n,
      maxPriorityFeePerGas: priorityFeePerGas > 1000000n ? priorityFeePerGas : 1000000n,
      maxFeePerGas,
    });
    const receipt = await execClient.waitForTransactionReceipt({ hash: txHash });
    const profitUsd = Number(result) / 1e6;
    stats.profitableTxCount += 1;
    stats.totalProfitUsd += profitUsd;
    stats.executedTrades.unshift({
      time: new Date().toISOString(),
      route: routeDesc,
      flashLoanUsd: Number(flashAmount) / 1e6,
      profitUsd,
      gasCostUsd: Number(totalGasCostUsdc) / 1e6,
      netProfitAfterGasUsd: netAfterGas,
      txHash,
      blockNumber: receipt.blockNumber.toString(),
    });
    console.log(`🎉 [SNIPER ARB EXECUTED] TX: ${txHash} | Net Profit: +$${netAfterGas.toFixed(4)} USDC`);
    saveStatus();
    return true;
  } catch (err) {
    if (err?.shortMessage && !err.shortMessage.includes("reverted")) {
      console.error("⚠️ Flash Exec error:", err.shortMessage);
    }
    return false;
  }
}

let isScanning = false;

async function runSingleWaveSniper(blockNumber) {
  if (isScanning) return;
  isScanning = true;
  const t0 = Date.now();
  try {
    stats.totalCycles += 1;
    const minProfit2Hop = 6500n;
    const minProfit3Hop = 8000n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 180);

    // Core 9 + Rotating 5 = 14 tokens evaluated in ONE SINGLE PARALLEL WAVE!
    const activeSlice = [...CORE_SYMS];
    for (let i = 0; i < 5; i++) {
      activeSlice.push(ROTATING_SYMS[(rotIdx + i) % ROTATING_SYMS.length]);
    }
    rotIdx = (rotIdx + 5) % ROTATING_SYMS.length;

    // =========================================================================
    // SINGLE WAVE: Query ALL 4 directions simultaneously in 1 roundtrip!
    //   1. USDC -> Token (for input `amt`)
    //   2. Token -> USDC (for `refAmt`)
    //   3. WETH -> Token (for `refWeth`)
    //   4. Token -> WETH (for `refAmt`)
    // =========================================================================
    const waveMeta = [];
    const waveContracts = [];

    for (const amt of SIZES) {
      const refWeth =
        refTokenOut.get(`${amt}_WETH`) ||
        (amt === 15000000n
          ? 6150000000000000n
          : amt === 60000000n
            ? 24600000000000000n
            : amt === 180000000n
              ? 73800000000000000n
              : 205000000000000000n);
      for (const sym of activeSlice) {
        if (amt === 500000000n && !CORE_SET.has(sym)) continue;
        const tokenAddr = TOKENS[sym];
        const refTok = refTokenOut.get(`${amt}_${sym}`);

        // 1. USDC -> Token
        for (const c of buildVenueCalls(USDC, tokenAddr, amt)) {
          waveMeta.push({ kind: "USDC_TO_TOK", amt, sym, tokenAddr, inAmt: amt, venue: c.venue });
          waveContracts.push(c.contract);
        }
        if (refTok && refTok > 0n) {
          // 2. Token -> USDC
          for (const c of buildVenueCalls(tokenAddr, USDC, refTok)) {
            waveMeta.push({ kind: "TOK_TO_USDC", amt, sym, tokenAddr, inAmt: refTok, venue: c.venue });
            waveContracts.push(c.contract);
          }
          // 4. Token -> WETH
          if (sym !== "WETH") {
            for (const c of buildVenueCalls(tokenAddr, WETH, refTok)) {
              waveMeta.push({ kind: "TOK_TO_WETH", amt, sym, tokenAddr, inAmt: refTok, venue: c.venue });
              waveContracts.push(c.contract);
            }
          }
        }
        // 3. WETH -> Token
        if (sym !== "WETH" && refWeth > 0n) {
          for (const c of buildVenueCalls(WETH, tokenAddr, refWeth)) {
            waveMeta.push({ kind: "WETH_TO_TOK", amt, sym, tokenAddr, inAmt: refWeth, venue: c.venue });
            waveContracts.push(c.contract);
          }
        }
      }
    }

    const waveRes = await stripedMulticall(waveContracts);
    stats.totalRoutesEvaluated += waveContracts.length;

    const bestUsdcToTok = new Map();
    const bestTokToUsdc = new Map();
    const bestWethToTok = new Map();
    const bestTokToWeth = new Map();

    waveRes.forEach((r, idx) => {
      const out = extractAmountOut(r);
      if (out <= 0n) return;
      const m = waveMeta[idx];
      const key = `${m.amt}_${m.sym}`;
      if (m.kind === "USDC_TO_TOK") {
        const prev = bestUsdcToTok.get(key);
        if (!prev || out > prev.out) {
          bestUsdcToTok.set(key, { out, inAmt: m.inAmt, venue: m.venue, m });
          refTokenOut.set(key, out); // Update reference ONLY from the BEST venue!
        }
      } else if (m.kind === "TOK_TO_USDC") {
        const prev = bestTokToUsdc.get(key);
        if (!prev || out > prev.out) bestTokToUsdc.set(key, { out, inAmt: m.inAmt, venue: m.venue, m });
      } else if (m.kind === "WETH_TO_TOK") {
        const prev = bestWethToTok.get(key);
        if (!prev || out > prev.out) {
          bestWethToTok.set(key, { out, inAmt: m.inAmt, venue: m.venue, m });
          if (!refTokenOut.has(key) || out > refTokenOut.get(key)) {
            refTokenOut.set(key, out);
          }
        }
      } else if (m.kind === "TOK_TO_WETH") {
        const prev = bestTokToWeth.get(key);
        if (!prev || out > prev.out) bestTokToWeth.set(key, { out, inAmt: m.inAmt, venue: m.venue, m });
      }
    });

    let cycleBestDiff = -999;
    let cycleBestRoute = "";

    for (const amt of SIZES) {
      const wethBuy = bestUsdcToTok.get(`${amt}_WETH`);
      const wethSell = bestTokToUsdc.get(`${amt}_WETH`);

      for (const sym of activeSlice) {
        const tokenAddr = TOKENS[sym];
        const key = `${amt}_${sym}`;
        const leg1 = bestUsdcToTok.get(key);
        const sell = bestTokToUsdc.get(key);

        // --- 1) Check 2-Hop (USDC -> Token -> USDC) ---
        if (leg1 && sell && sell.inAmt > 0n && leg1.out <= (sell.inAmt * 115n) / 100n) {
          const expectedUsdcOut = (sell.out * leg1.out) / sell.inAmt;
          const diffUsd = Number(expectedUsdcOut - amt) / 1e6;
          const routeStr = `Flash2Hop USDC->${sym}(${leg1.venue.label})->USDC(${sell.venue.label}) [Flash $${Number(amt) / 1e6}]`;
          if (diffUsd > cycleBestDiff) {
            cycleBestDiff = diffUsd;
            cycleBestRoute = routeStr;
          }
          if (diffUsd > stats.closestSpreadUsd) {
            stats.closestSpreadUsd = diffUsd;
            stats.closestRoute = routeStr;
          }
          if (expectedUsdcOut >= amt + minProfit2Hop) {
            const s1 = encodeLegSteps(USDC, tokenAddr, amt, leg1.venue, deployment.contractAddress, deadline);
            const s2 = encodeLegSteps(tokenAddr, USDC, leg1.out, sell.venue, deployment.contractAddress, deadline);
            const ok = await tryExecuteFlashAtomic(routeStr, amt, minProfit2Hop, [s1, s2]);
            if (!ok) {
              const s2Safe = encodeLegSteps(tokenAddr, USDC, (leg1.out * 9998n) / 10000n, sell.venue, deployment.contractAddress, deadline);
              await tryExecuteFlashAtomic(routeStr, amt, minProfit2Hop, [s1, s2Safe]);
            }
          }
        }

        // --- 2) Check 3-Hop A (USDC -> WETH -> Token -> USDC) ---
        const wethToTok = bestWethToTok.get(key);
        if (sym !== "WETH" && wethBuy && wethToTok && sell && wethToTok.inAmt > 0n && sell.inAmt > 0n) {
          const actualTokOut = (wethToTok.out * wethBuy.out) / wethToTok.inAmt;
          if (actualTokOut > (sell.inAmt * 115n) / 100n) {
            refTokenOut.set(key, actualTokOut);
          } else {
            const expectedUsdcOut = (sell.out * actualTokOut) / sell.inAmt;
            const diffUsd = Number(expectedUsdcOut - amt) / 1e6;
            const routeStr = `Flash3HopA USDC->WETH(${wethBuy.venue.label})->${sym}(${wethToTok.venue.label})->USDC(${sell.venue.label}) [Flash $${Number(amt) / 1e6}]`;
            if (diffUsd > cycleBestDiff) {
              cycleBestDiff = diffUsd;
              cycleBestRoute = routeStr;
            }
            if (diffUsd > stats.closestSpreadUsd) {
              stats.closestSpreadUsd = diffUsd;
              stats.closestRoute = routeStr;
            }
            if (expectedUsdcOut >= amt + minProfit3Hop) {
              const s1 = encodeLegSteps(USDC, WETH, amt, wethBuy.venue, deployment.contractAddress, deadline);
              const s2 = encodeLegSteps(WETH, tokenAddr, wethBuy.out, wethToTok.venue, deployment.contractAddress, deadline);
              const s3 = encodeLegSteps(tokenAddr, USDC, actualTokOut, sell.venue, deployment.contractAddress, deadline);
              const ok = await tryExecuteFlashAtomic(routeStr, amt, minProfit3Hop, [s1, s2, s3]);
              if (!ok) {
                const s2Safe = encodeLegSteps(WETH, tokenAddr, (wethBuy.out * 9998n) / 10000n, wethToTok.venue, deployment.contractAddress, deadline);
                const s3Safe = encodeLegSteps(tokenAddr, USDC, (actualTokOut * 9995n) / 10000n, sell.venue, deployment.contractAddress, deadline);
                await tryExecuteFlashAtomic(routeStr, amt, minProfit3Hop, [s1, s2Safe, s3Safe]);
              }
            }
          }
        }

        // --- 3) Check 3-Hop B (USDC -> Token -> WETH -> USDC) ---
        const tokToWeth = bestTokToWeth.get(key);
        if (sym !== "WETH" && leg1 && tokToWeth && wethSell && tokToWeth.inAmt > 0n && wethSell.inAmt > 0n) {
          const actualWethOut = (tokToWeth.out * leg1.out) / tokToWeth.inAmt;
          if (leg1.out <= (tokToWeth.inAmt * 115n) / 100n && actualWethOut <= (wethSell.inAmt * 115n) / 100n) {
            const expectedUsdcOut = (wethSell.out * actualWethOut) / wethSell.inAmt;
            const diffUsd = Number(expectedUsdcOut - amt) / 1e6;
            const routeStr = `Flash3HopB USDC->${sym}(${leg1.venue.label})->WETH(${tokToWeth.venue.label})->USDC(${wethSell.venue.label}) [Flash $${Number(amt) / 1e6}]`;
            if (diffUsd > cycleBestDiff) {
              cycleBestDiff = diffUsd;
              cycleBestRoute = routeStr;
            }
            if (diffUsd > stats.closestSpreadUsd) {
              stats.closestSpreadUsd = diffUsd;
              stats.closestRoute = routeStr;
            }
            if (expectedUsdcOut >= amt + minProfit3Hop) {
              const s1 = encodeLegSteps(USDC, tokenAddr, amt, leg1.venue, deployment.contractAddress, deadline);
              const s2 = encodeLegSteps(tokenAddr, WETH, leg1.out, tokToWeth.venue, deployment.contractAddress, deadline);
              const s3 = encodeLegSteps(WETH, USDC, actualWethOut, wethSell.venue, deployment.contractAddress, deadline);
              const ok = await tryExecuteFlashAtomic(routeStr, amt, minProfit3Hop, [s1, s2, s3]);
              if (!ok) {
                const s2Safe = encodeLegSteps(tokenAddr, WETH, (leg1.out * 9998n) / 10000n, tokToWeth.venue, deployment.contractAddress, deadline);
                const s3Safe = encodeLegSteps(WETH, USDC, (actualWethOut * 9995n) / 10000n, wethSell.venue, deployment.contractAddress, deadline);
                await tryExecuteFlashAtomic(routeStr, amt, minProfit3Hop, [s1, s2Safe, s3Safe]);
              }
            }
          }
        }
      }
    }

    const elapsedMs = Date.now() - t0;
    const scanEntry = {
      cycle: stats.totalCycles,
      block: blockNumber ? blockNumber.toString() : "poll",
      time: new Date().toISOString(),
      elapsedMs,
      bestRoute: cycleBestRoute,
      bestDiffUsd: Number(cycleBestDiff.toFixed(6)),
    };
    stats.recentScans.unshift(scanEntry);
    if (stats.recentScans.length > 25) stats.recentScans.pop();
    saveStatus();

    console.log(
      `[Block ${blockNumber || "#"} | Cycle #${stats.totalCycles} | ${elapsedMs}ms] Routes: ${stats.totalRoutesEvaluated} | Best: ${cycleBestRoute} (${cycleBestDiff >= 0 ? "+" : ""}$${cycleBestDiff.toFixed(5)}) | Record: +$${stats.closestSpreadUsd.toFixed(5)}`
    );
  } catch (e) {
    console.error("[Sniper Error]", e.shortMessage || e.message);
  } finally {
    isScanning = false;
  }
}

console.log("==============================================================");
console.log("⚡ BASE ATOMIC ARBITRAGE v5.0 (1-WAVE + 4-DATACENTER STRIPING)");
console.log(`🔒 Smart Contract : ${deployment.contractAddress}`);
console.log(`💳 Owner Wallet   : ${account.address}`);
console.log("==============================================================");

async function start() {
  await discoverActiveVenues();
  console.log("📡 Subscribing to live Base Mainnet blocks via WebSocket (wss://)...");
  wsClient.watchBlockNumber({
    onBlockNumber: (blockNumber) => {
      runSingleWaveSniper(blockNumber);
    },
    onError: (err) => {
      console.error("[WS Block Error]", err.message);
    },
  });
}

start();
