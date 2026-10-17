#!/usr/bin/env node
/**
 * Agent Kiosk — Terminal Wallet Controller (No Browser / No MetaMask Popups Needed)
 * Reads WALLET_PRIVATE_KEY from .env.local or environment variables.
 *
 * Commands:
 *   node scripts/wallet-cli.js status    -> Check Base & Ethereum USDC balances
 *   node scripts/wallet-cli.js bridge    -> Gaslessly bridge Ethereum USDC -> Base USDC (0 ETH)
 *   node scripts/wallet-cli.js siftah    -> Sign & settle $0.001 USDC across all 19 endpoints
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { privateKeyToAccount, mnemonicToAccount } from "viem/accounts";
import { CONFIG, PRICING } from "../src/x402.js";

// Load .env.local if present
const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  const lines = fs.readFileSync(envLocalPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  }
}

function getAccount() {
  let raw = (process.env.WALLET_PRIVATE_KEY || process.env.WALLET_MNEMONIC || "").trim();
  if (!raw) {
    console.error("❌ WALLET_PRIVATE_KEY veya WALLET_MNEMONIC bulunamadı (.env.local dosyasına ekleyin).");
    process.exit(1);
  }
  if (raw.includes(" ")) {
    return mnemonicToAccount(raw);
  }
  if (!raw.startsWith("0x")) raw = "0x" + raw;
  return privateKeyToAccount(raw);
}

async function getUsdcBalance(rpcUrl, usdcAddress, walletAddress) {
  const padded = walletAddress.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: usdcAddress, data: "0x70a08231" + padded }, "latest"],
    }),
  }).then((r) => r.json());
  return BigInt(res?.result || "0x0");
}

async function cmdStatus() {
  const account = getAccount();
  const baseRaw = await getUsdcBalance(
    "https://mainnet.base.org",
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    account.address
  );
  const ethRaw = await getUsdcBalance(
    "https://ethereum-rpc.publicnode.com",
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    account.address
  );
  console.log("💳 Cüzdan:", account.address);
  console.log("🔵 Base USDC:", (Number(baseRaw) / 1e6).toFixed(4), "USDC");
  console.log("⚪ Ethereum USDC:", (Number(ethRaw) / 1e6).toFixed(4), "USDC");
}

async function cmdBridge() {
  const account = getAccount();
  const ethRaw = await getUsdcBalance(
    "https://ethereum-rpc.publicnode.com",
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    account.address
  );
  if (ethRaw <= 100000n) {
    console.log("ℹ️ Ethereum ağında köprülenecek USDC yok.");
    return;
  }
  console.log(`🌉 Ethereum'daki ${(Number(ethRaw) / 1e6).toFixed(2)} USDC -> Base ağına (0 ETH Gas) geçiriliyor...`);
  const quote = await fetch("https://api.relay.link/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user: account.address,
      originChainId: 1,
      destinationChainId: 8453,
      originCurrency: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      destinationCurrency: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      amount: ethRaw.toString(),
      usePermit: true,
      tradeType: "EXACT_INPUT",
    }),
  }).then((r) => r.json());

  const item = quote?.steps?.[0]?.items?.[0];
  if (!item?.data?.sign) {
    throw new Error("Relay quote alınamadı: " + JSON.stringify(quote));
  }

  const { sign: signData, post: postData } = item.data;
  const sig = await account.signTypedData({
    domain: signData.domain,
    types: signData.types,
    primaryType: signData.primaryType,
    message: {
      ...signData.value,
      value: BigInt(signData.value.value),
      validAfter: BigInt(signData.value.validAfter),
      validBefore: BigInt(signData.value.validBefore),
    },
  });

  const baseEndpoint = postData.endpoint.startsWith("http")
    ? postData.endpoint
    : "https://api.relay.link" + postData.endpoint;
  const execRes = await fetch(`${baseEndpoint}?signature=${encodeURIComponent(sig)}`, {
    method: postData.method || "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(postData.body),
  }).then((r) => r.json());

  console.log("✅ Köprü tamamlandı:", execRes);
}

async function cmdSiftah(targetRoutes) {
  const account = getAccount();
  const routes = targetRoutes?.length ? targetRoutes : Object.keys(PRICING);
  console.log(`🚀 Terminalden ${routes.length} servis için otomatik x402 imzası gönderiliyor...`);

  for (const routePath of routes) {
    const nowSec = Math.floor(Date.now() / 1000);
    const validAfter = "0";
    const validBefore = String(nowSec + 3600);
    const nonce = "0x" + crypto.randomBytes(32).toString("hex");
    const value = PRICING[routePath]?.amount || "10000";

    const signature = await account.signTypedData({
      domain: {
        name: "USD Coin",
        version: "2",
        chainId: 8453,
        verifyingContract: CONFIG.usdcAsset,
      },
      types: {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "TransferWithAuthorization",
      message: {
        from: account.address,
        to: CONFIG.payToWallet,
        value: BigInt(value),
        validAfter: BigInt(validAfter),
        validBefore: BigInt(validBefore),
        nonce,
      },
    });

    const paymentPayload = {
      x402Version: 2,
      scheme: "exact",
      network: "eip155:8453",
      payload: {
        signature,
        authorization: {
          from: account.address,
          to: CONFIG.payToWallet,
          value,
          validAfter,
          validBefore,
          nonce,
        },
      },
    };

    const b64Header = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");
    const res = await fetch(`https://agent-kiosk.vercel.app${routePath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "PAYMENT-SIGNATURE": b64Header,
      },
      body: JSON.stringify({
        message: "siftah-x402",
        query: "AERO",
        target: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        address: CONFIG.payToWallet,
        domain: "stripe.com",
        url: "https://example.com",
        name: "lodash",
        repo: "modelcontextprotocol/servers",
        token_in: "USDC",
        token_out: "WETH",
        amount: "10",
      }),
    });
    const data = await res.json();
    console.log(res.ok ? `✅ ${routePath} ($${PRICING[routePath]?.priceUsd}) OK` : `⚠️ ${routePath} (${res.status}): ${data.error || ""}`);
  }
}

const cmd = process.argv[2] || "status";
if (cmd === "status") cmdStatus();
else if (cmd === "bridge") cmdBridge();
else if (cmd === "siftah") cmdSiftah(process.argv.slice(3));
else console.log("Kullanım: node scripts/wallet-cli.js [status|bridge|siftah]");
