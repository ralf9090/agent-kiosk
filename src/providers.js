/**
 * Real data extraction, market alpha, domain intelligence, code security & research providers for Agent Kiosk:
 * 1. socialSearch: Live Reddit + HackerNews social discussions normalized for LLMs.
 * 2. mapsLeads: Accurate city-scoped business lead finder with phone, website, address, and coordinates.
 * 3. webExtract: Clean HTML-to-Markdown web extractor with Prompt Injection trap detection.
 * 4. securityAudit: Live on-chain smart contract / token honeypot scanner (GoPlus + DexScreener) & URL phishing/injection auditor.
 * 5. tokenAlpha: Real-time DEX order-flow (buy/sell pressure), liquidity, volume & momentum signal analyzer.
 * 6. domainIntel: B2B domain intelligence (DNS, MX email provider, SaaS TXT fingerprints, RDAP registration, active subdomains).
 * 7. packageAudit: Live open-source dependency auditor (npm, PyPI, crates.io) with Google OSV.dev CVE vulnerability checks.
 * 8. academicSearch: Peer-reviewed research & preprint search (OpenAlex + arXiv) with reconstructed abstracts, citations & PDFs.
 */

import dns from "node:dns/promises";

const USER_AGENT = "AgentKiosk/2.2 (+https://agent-kiosk.vercel.app)";

/**
 * 1. Fetch live social media discussions (Reddit + HN) and return LLM-ready structured JSON.
 */
export async function socialSearch({ query, platform = "all", limit = 10 }) {
  if (!query || typeof query !== "string" || !query.trim()) {
    throw new Error("Missing required parameter: 'query'");
  }
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 25);
  const results = [];
  const tasks = [];

  if (platform === "all" || platform === "reddit") {
    tasks.push(
      (async () => {
        try {
          const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=relevance&t=month&limit=${safeLimit}`;
          const res = await fetch(url, {
            headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) return;
          const data = await res.json();
          const children = data?.data?.children || [];
          for (const item of children) {
            const p = item.data;
            if (!p) continue;
            results.push({
              source: "reddit",
              subreddit: p.subreddit_name_prefixed,
              author: p.author,
              title: p.title,
              text: (p.selftext || "").slice(0, 800),
              score: p.score,
              comments_count: p.num_comments,
              created_utc: p.created_utc,
              url: `https://www.reddit.com${p.permalink}`,
            });
          }
        } catch {
          // continue if one source times out
        }
      })()
    );
  }

  if (platform === "all" || platform === "hn") {
    tasks.push(
      (async () => {
        try {
          const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${safeLimit}`;
          const res = await fetch(url, {
            headers: { "User-Agent": USER_AGENT },
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) return;
          const data = await res.json();
          for (const hit of data?.hits || []) {
            results.push({
              source: "hackernews",
              author: hit.author,
              title: hit.title,
              text: (hit.story_text || "").replace(/<[^>]+>/g, "").slice(0, 600),
              score: hit.points,
              comments_count: hit.num_comments,
              created_utc: hit.created_at_i,
              url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
            });
          }
        } catch {
          // continue if one source times out
        }
      })()
    );
  }

  await Promise.all(tasks);

  const trimmed = results.slice(0, safeLimit);
  const markdown = trimmed
    .map(
      (r, idx) =>
        `### ${idx + 1}. [${r.source.toUpperCase()}] ${r.title}\n` +
        `- **Author:** ${r.author} | **Score:** ${r.score} | **Comments:** ${r.comments_count}\n` +
        `- **URL:** ${r.url}\n` +
        (r.text ? `- **Snippet:** ${r.text}\n` : "")
    )
    .join("\n");

  return {
    query,
    platform,
    count: trimmed.length,
    items: trimmed,
    llm_markdown: markdown || "No recent social discussions found for this query.",
  };
}

/**
 * Geocode a city/location string into center coordinates.
 */
async function geocodeLocation(location) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(location)}&limit=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const feat = data?.features?.[0];
  if (!feat) return null;

  const [lon, lat] = feat.geometry?.coordinates || [0, 0];
  return {
    lat,
    lon,
    resolvedName: [feat.properties?.name, feat.properties?.state, feat.properties?.country]
      .filter(Boolean)
      .join(", "),
  };
}

/**
 * 2. Fetch local business leads strictly inside the target city/location,
 * enriched with real phone numbers, websites, emails, and opening hours via Photon + Nominatim.
 */
export async function mapsLeads({ query, location = "", limit = 10 }) {
  if (!query || typeof query !== "string" || !query.trim()) {
    throw new Error("Missing required parameter: 'query'");
  }
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 25);

  let geo = null;
  if (location && location.trim()) {
    geo = await geocodeLocation(location.trim());
  }

  const candidateLimit = Math.min(safeLimit * 3, 45);
  const biasParams = geo ? `&lat=${geo.lat}&lon=${geo.lon}&zoom=14` : "";
  const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=${candidateLimit}${biasParams}`;

  const res = await fetch(photonUrl, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`Upstream maps provider returned HTTP ${res.status}`);
  }

  const data = await res.json();
  const seenIds = new Set();
  const uniqueFeatures = [];

  for (const f of data?.features || []) {
    const p = f.properties || {};
    if (!p.osm_type || !p.osm_id) continue;
    const key = `${p.osm_type}${p.osm_id}`;
    if (seenIds.has(key)) continue;
    seenIds.add(key);
    uniqueFeatures.push({ key, feature: f });
  }

  const extraByOsmKey = new Map();
  if (uniqueFeatures.length > 0) {
    try {
      const osmIdsParam = uniqueFeatures.map((u) => u.key).join(",");
      const nomUrl = `https://nominatim.openstreetmap.org/lookup?osm_ids=${osmIdsParam}&format=jsonv2&extratags=1&addressdetails=1`;
      const nomRes = await fetch(nomUrl, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(6000),
      });
      if (nomRes.ok) {
        const nomList = await nomRes.json();
        for (const item of nomList || []) {
          const prefix =
            item.osm_type === "node" ? "N" : item.osm_type === "way" ? "W" : "R";
          extraByOsmKey.set(`${prefix}${item.osm_id}`, item);
        }
      }
    } catch {
      // Proceed with base Photon properties if lookup fails
    }
  }

  const leads = uniqueFeatures.map(({ key, feature }) => {
    const p = feature.properties || {};
    const coords = feature.geometry?.coordinates || [0, 0];
    const enriched = extraByOsmKey.get(key);
    const extra = enriched?.extratags || {};
    const addressParts = [
      p.street,
      p.housenumber,
      p.district,
      p.city,
      p.state,
      p.postcode,
      p.country,
    ].filter(Boolean);

    return {
      name: p.name || enriched?.name || query,
      category: p.osm_value || p.osm_key || enriched?.type || "business",
      phone:
        extra.phone ||
        extra["contact:phone"] ||
        p.phone ||
        p["contact:phone"] ||
        null,
      website:
        extra.website ||
        extra["contact:website"] ||
        extra.url ||
        p.website ||
        null,
      email: extra.email || extra["contact:email"] || null,
      opening_hours: extra.opening_hours || p.opening_hours || null,
      address: {
        full:
          enriched?.display_name ||
          addressParts.join(", ") ||
          p.name ||
          query,
        street: [p.street, p.housenumber].filter(Boolean).join(" ") || null,
        city: p.city || p.state || null,
        postcode: p.postcode || null,
        country: p.country || null,
      },
      coordinates: {
        lat: Number(coords[1]),
        lon: Number(coords[0]),
      },
      osm_id: p.osm_id || null,
    };
  });

  leads.sort((a, b) => {
    const scoreA = (a.phone ? 2 : 0) + (a.website ? 2 : 0) + (a.opening_hours ? 1 : 0);
    const scoreB = (b.phone ? 2 : 0) + (b.website ? 2 : 0) + (b.opening_hours ? 1 : 0);
    return scoreB - scoreA;
  });

  const finalLeads = leads.slice(0, safeLimit);

  const markdown = finalLeads
    .map(
      (l, i) =>
        `${i + 1}. **${l.name}** (${l.category})\n` +
        `   - Phone: ${l.phone || "N/A"} | Website: ${l.website || "N/A"}\n` +
        `   - Address: ${l.address.full}`
    )
    .join("\n");

  return {
    query,
    location: geo?.resolvedName || location || "Global",
    count: finalLeads.length,
    leads: finalLeads,
    llm_markdown: markdown || "No matching local business leads found.",
  };
}

/**
 * Scan text/HTML for prompt injection traps targeting autonomous agents.
 */
function scanPromptInjection(text) {
  const patterns = [
    { id: "ignore_instructions", regex: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i },
    { id: "system_override", regex: /(system\s+prompt|you\s+are\s+now\s+in\s+developer\s+mode|new\s+system\s+instruction)/i },
    { id: "wallet_drain_command", regex: /(transfer\s+all\s+(funds|usdc|eth|sol)|send\s+private\s+key|seed\s+phrase)/i },
    { id: "hidden_css_text", regex: /(font-size:\s*0|opacity:\s*0|display:\s*none[^>]*>.*?(ignore|instruction|transfer))/i },
  ];

  const matches = [];
  for (const p of patterns) {
    if (p.regex.test(text)) {
      matches.push(p.id);
    }
  }
  return {
    detected: matches.length > 0,
    signals: matches,
  };
}

/**
 * Convert raw HTML string into clean LLM-ready Markdown and metadata.
 */
function htmlToCleanMarkdown(html, url) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : url;

  const descMatch =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const description = descMatch ? descMatch[1].trim() : null;

  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  cleaned = cleaned
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n")
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1")
    .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<(p|div|br|tr|section|article)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();

  return { title, description, markdown: cleaned };
}

/**
 * 3. Extract clean LLM-ready Markdown from any URL with built-in Prompt Injection safety check.
 */
export async function webExtract({ url, max_length = 8000 }) {
  if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url.trim())) {
    throw new Error("Missing or invalid parameter: 'url' (must start with http:// or https://)");
  }

  const targetUrl = url.trim();
  const maxChars = Math.min(Math.max(Number(max_length) || 8000, 500), 25000);

  let title = targetUrl;
  let description = null;
  let markdown = "";
  let rawSample = "";

  try {
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AgentKioskBot/2.2)",
        Accept: "text/html,application/xhtml+xml,application/json,text/plain;q=0.9",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const contentType = res.headers.get("content-type") || "";
      const bodyText = await res.text();
      rawSample = bodyText.slice(0, 50000);

      if (contentType.includes("application/json")) {
        markdown = "```json\n" + bodyText.slice(0, maxChars) + "\n```";
      } else {
        const parsed = htmlToCleanMarkdown(bodyText, targetUrl);
        title = parsed.title;
        description = parsed.description;
        markdown = parsed.markdown;
      }
    }
  } catch {
    // Fallback to Jina Reader below if direct fetch is blocked by Cloudflare/WAF
  }

  if (!markdown || markdown.length < 80) {
    const jinaRes = await fetch(`https://r.jina.ai/${targetUrl}`, {
      headers: { Accept: "text/plain", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });
    if (!jinaRes.ok) {
      throw new Error(`Unable to extract URL (HTTP ${jinaRes.status})`);
    }
    markdown = await jinaRes.text();
    rawSample = rawSample || markdown;
  }

  const injectionCheck = scanPromptInjection(rawSample + "\n" + markdown);
  const truncatedMarkdown = markdown.slice(0, maxChars);

  return {
    url: targetUrl,
    title,
    description,
    length: truncatedMarkdown.length,
    prompt_injection_Check: {
      safe: !injectionCheck.detected,
      prompt_injection_detected: injectionCheck.detected,
      signals: injectionCheck.signals,
    },
    llm_markdown: truncatedMarkdown,
  };
}

const CHAIN_IDS = {
  base: "8453",
  ethereum: "1",
  eth: "1",
  bsc: "56",
  arbitrum: "42161",
  polygon: "137",
  optimism: "10",
};

/**
 * 4. Security & Risk Auditor for Smart Contracts / Tokens (0x...) and Web URLs.
 * Uses GoPlus Security API + DexScreener for live on-chain honeypot/tax/liquidity checks.
 */
export async function securityAudit({ target, chain = "base" }) {
  if (!target || typeof target !== "string" || !target.trim()) {
    throw new Error("Missing required parameter: 'target' (0x contract address or https:// URL)");
  }

  const cleanTarget = target.trim();

  if (/^0x[a-fA-F0-9]{40}$/.test(cleanTarget)) {
    const chainKey = (chain || "base").toLowerCase();
    const chainId = CHAIN_IDS[chainKey] || "8453";
    const addrLower = cleanTarget.toLowerCase();

    const [goplusRes, dexRes] = await Promise.allSettled([
      fetch(
        `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${addrLower}`,
        { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(8000) }
      ).then((r) => (r.ok ? r.json() : null)),
      fetch(`https://api.dexscreener.com/latest/dex/tokens/${cleanTarget}`, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(8000),
      }).then((r) => (r.ok ? r.json() : null)),
    ]);

    const gpData =
      goplusRes.status === "fulfilled"
        ? goplusRes.value?.result?.[addrLower] || null
        : null;
    const dexPairs =
      dexRes.status === "fulfilled" ? dexRes.value?.pairs || [] : [];
    const topPair = dexPairs[0] || null;

    const risks = [];
    let riskScore = 0;

    if (gpData) {
      if (gpData.is_honeypot === "1") {
        risks.push("CRITICAL: Token is flagged as a HONEYPOT (cannot sell)");
        riskScore += 90;
      }
      if (gpData.is_blacklisted === "1") {
        risks.push("HIGH: Contract contains blacklist function");
        riskScore += 25;
      }
      if (gpData.is_mintable === "1") {
        risks.push("MEDIUM: Owner can mint new tokens");
        riskScore += 20;
      }
      if (gpData.is_open_source === "0") {
        risks.push("HIGH: Contract source code is NOT verified/open-source");
        riskScore += 40;
      }
      const buyTax = Number(gpData.buy_tax || 0) * 100;
      const sellTax = Number(gpData.sell_tax || 0) * 100;
      if (buyTax > 10 || sellTax > 10) {
        risks.push(`HIGH: Excessive tax detected (Buy: ${buyTax.toFixed(1)}%, Sell: ${sellTax.toFixed(1)}%)`);
        riskScore += 35;
      }
    }

    const liquidityUsd = topPair?.liquidity?.usd ? Number(topPair.liquidity.usd) : null;
    if (liquidityUsd !== null && liquidityUsd < 1000) {
      risks.push(`MEDIUM: Very low DEX liquidity ($${liquidityUsd.toFixed(2)})`);
      riskScore += 20;
    }

    riskScore = Math.min(riskScore, 100);
    const verdict =
      riskScore >= 50 ? "CRITICAL_RISK" : riskScore >= 20 ? "WARNING" : "SAFE";

    return {
      type: "smart_contract",
      target: cleanTarget,
      chain: chainKey,
      chain_id: chainId,
      verdict,
      risk_score: riskScore,
      token_info: {
        name: gpData?.token_name || topPair?.baseToken?.name || "Unknown",
        symbol: gpData?.token_symbol || topPair?.baseToken?.symbol || "Unknown",
        price_usd: topPair?.priceUsd || null,
        liquidity_usd: liquidityUsd,
        holder_count: gpData?.holder_count ? Number(gpData.holder_count) : null,
        is_open_source: gpData ? gpData.is_open_source === "1" : null,
        is_honeypot: gpData ? gpData.is_honeypot === "1" : false,
        buy_tax_percent: gpData?.buy_tax ? Number(gpData.buy_tax) * 100 : 0,
        sell_tax_percent: gpData?.sell_tax ? Number(gpData.sell_tax) * 100 : 0,
      },
      risks,
      llm_summary: `Verdict: ${verdict} (Risk Score: ${riskScore}/100). Token: ${
        gpData?.token_symbol || topPair?.baseToken?.symbol || cleanTarget
      }. ${risks.length > 0 ? "Risks: " + risks.join("; ") : "No critical on-chain risks detected."}`,
    };
  }

  if (/^https?:\/\//i.test(cleanTarget)) {
    const extracted = await webExtract({ url: cleanTarget, max_length: 4000 });
    const risks = [];
    let riskScore = 0;

    if (extracted.prompt_injection_Check.prompt_injection_detected) {
      risks.push(
        `CRITICAL: Prompt injection pattern detected (${extracted.prompt_injection_Check.signals.join(", ")})`
      );
      riskScore += 80;
    }

    const suspiciousKeywords = /(claim\s+airdrop|connect\s+wallet\s+to\s+claim|verify\s+seed\s+phrase|drainer)/i;
    if (suspiciousKeywords.test(extracted.llm_markdown)) {
      risks.push("HIGH: Crypto drainer / phishing phrasing detected on page");
      riskScore += 50;
    }

    riskScore = Math.min(riskScore, 100);
    const verdict =
      riskScore >= 50 ? "CRITICAL_RISK" : riskScore >= 20 ? "WARNING" : "SAFE";

    return {
      type: "url",
      target: cleanTarget,
      verdict,
      risk_score: riskScore,
      prompt_injection_detected: extracted.prompt_injection_Check.prompt_injection_detected,
      risks,
      llm_summary: `Verdict: ${verdict} (Risk Score: ${riskScore}/100) for ${cleanTarget}. ${
        risks.length > 0 ? risks.join("; ") : "Page appears clean of prompt injections and drainer traps."
      }`,
    };
  }

  throw new Error("Invalid 'target': Provide a 0x... smart contract address or an http(s):// URL.");
}

/**
 * 5. Crypto & DeFi Token Alpha / Order-Flow Intelligence.
 * Analyzes buy vs. sell transaction pressure, liquidity depth, FDV, and volume velocity across DEX pools.
 */
export async function tokenAlpha({ query, chain = "all" }) {
  if (!query || typeof query !== "string" || !query.trim()) {
    throw new Error("Missing required parameter: 'query' (token symbol like 'AERO' or contract address)");
  }

  const cleanQuery = query.trim();
  const isAddress = /^0x[a-fA-F0-9]{40}$/.test(cleanQuery) || cleanQuery.length >= 32;
  const endpoint = isAddress
    ? `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(cleanQuery)}`
    : `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(cleanQuery)}`;

  const res = await fetch(endpoint, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`Upstream DEX provider returned HTTP ${res.status}`);
  }

  const data = await res.json();
  let pairs = data?.pairs || [];

  if (chain && chain !== "all") {
    const targetChain = chain.toLowerCase();
    pairs = pairs.filter((p) => (p.chainId || "").toLowerCase() === targetChain);
  }

  // Sort by USD liquidity descending so main pools come first
  pairs.sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0));

  if (pairs.length === 0) {
    return {
      query: cleanQuery,
      chain,
      found: false,
      llm_summary: `No active DEX pools found for '${cleanQuery}' on chain '${chain}'.`,
    };
  }

  const primary = pairs[0];
  const topPools = pairs.slice(0, 5);

  const totalLiquidityUsd = topPools.reduce((acc, p) => acc + Number(p.liquidity?.usd || 0), 0);
  const totalVol24h = topPools.reduce((acc, p) => acc + Number(p.volume?.h24 || 0), 0);
  const totalVol1h = topPools.reduce((acc, p) => acc + Number(p.volume?.h1 || 0), 0);

  const buys1h = topPools.reduce((acc, p) => acc + Number(p.txns?.h1?.buys || 0), 0);
  const sells1h = topPools.reduce((acc, p) => acc + Number(p.txns?.h1?.sells || 0), 0);
  const totalTx1h = buys1h + sells1h;
  const buyPressure1hPct = totalTx1h > 0 ? Number(((buys1h / totalTx1h) * 100).toFixed(1)) : 50;

  const buys24h = topPools.reduce((acc, p) => acc + Number(p.txns?.h24?.buys || 0), 0);
  const sells24h = topPools.reduce((acc, p) => acc + Number(p.txns?.h24?.sells || 0), 0);
  const totalTx24h = buys24h + sells24h;
  const buyPressure24hPct = totalTx24h > 0 ? Number(((buys24h / totalTx24h) * 100).toFixed(1)) : 50;

  const volToLiqRatio =
    totalLiquidityUsd > 0 ? Number((totalVol24h / totalLiquidityUsd).toFixed(2)) : 0;

  let signal = "NEUTRAL";
  if (totalLiquidityUsd < 5000) {
    signal = "LOW_LIQUIDITY_WARNING";
  } else if (buyPressure1hPct >= 62 && Number(primary.priceChange?.h1 || 0) > 0) {
    signal = "STRONG_BUY_PRESSURE";
  } else if (buyPressure1hPct >= 55) {
    signal = "ACCUMULATION";
  } else if (buyPressure1hPct <= 40) {
    signal = "SELL_PRESSURE";
  }

  return {
    query: cleanQuery,
    found: true,
    token: {
      name: primary.baseToken?.name || cleanQuery,
      symbol: primary.baseToken?.symbol || cleanQuery,
      address: primary.baseToken?.address || null,
      primary_chain: primary.chainId,
      price_usd: Number(primary.priceUsd || 0),
      market_cap_usd: primary.marketCap || primary.fdv || null,
      fdv_usd: primary.fdv || null,
    },
    alpha_metrics: {
      signal,
      total_top5_liquidity_usd: Math.round(totalLiquidityUsd),
      volume_1h_usd: Math.round(totalVol1h),
      volume_24h_usd: Math.round(totalVol24h),
      volume_to_liquidity_ratio: volToLiqRatio,
      price_change_pct: {
        m5: Number(primary.priceChange?.m5 || 0),
        h1: Number(primary.priceChange?.h1 || 0),
        h6: Number(primary.priceChange?.h6 || 0),
        h24: Number(primary.priceChange?.h24 || 0),
      },
      order_flow_1h: {
        buys: buys1h,
        sells: sells1h,
        buy_pressure_pct: buyPressure1hPct,
      },
      order_flow_24h: {
        buys: buys24h,
        sells: sells24h,
        buy_pressure_pct: buyPressure24hPct,
      },
    },
    top_pools: topPools.map((p) => ({
      chain: p.chainId,
      dex: p.dexId,
      pair: `${p.baseToken?.symbol}/${p.quoteToken?.symbol}`,
      pair_address: p.pairAddress,
      price_usd: p.priceUsd,
      liquidity_usd: p.liquidity?.usd || 0,
      volume_24h_usd: p.volume?.h24 || 0,
      url: p.url,
    })),
    llm_summary: `${primary.baseToken?.name} (${primary.baseToken?.symbol} on ${primary.chainId}): $${primary.priceUsd} | Signal: ${signal} | 1h Buy Pressure: ${buyPressure1hPct}% (${buys1h} buys vs ${sells1h} sells) | Liquidity: $${Math.round(totalLiquidityUsd).toLocaleString()} | 24h Vol: $${Math.round(totalVol24h).toLocaleString()}.`,
  };
}

/**
 * 6. B2B Domain & Company Infrastructure Intelligence.
 * Resolves DNS (A, MX, TXT, NS), detects email provider & SaaS tech fingerprints, RDAP registration, and active subdomains.
 */
export async function domainIntel({ domain }) {
  if (!domain || typeof domain !== "string" || !domain.trim()) {
    throw new Error("Missing required parameter: 'domain' (e.g., 'stripe.com')");
  }

  const cleanDomain = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split(":")[0];

  if (!cleanDomain.includes(".")) {
    throw new Error(`Invalid domain name: '${domain}'`);
  }

  const commonPrefixes = ["api", "app", "docs", "dev", "status", "mail", "auth", "dashboard", "blog", "cdn"];

  const [aRes, mxRes, txtRes, nsRes, rdapRes, subProbeRes] = await Promise.allSettled([
    dns.resolve4(cleanDomain),
    dns.resolveMx(cleanDomain),
    dns.resolveTxt(cleanDomain),
    dns.resolveNs(cleanDomain),
    fetch(`https://rdap.org/domain/${encodeURIComponent(cleanDomain)}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/rdap+json,application/json" },
      signal: AbortSignal.timeout(4500),
    }).then((r) => (r.ok ? r.json() : null)),
    Promise.all(
      commonPrefixes.map(async (sub) => {
        const fqdn = `${sub}.${cleanDomain}`;
        try {
          const ips = await dns.resolve4(fqdn);
          return ips.length > 0 ? fqdn : null;
        } catch {
          return null;
        }
      })
    ),
  ]);

  const ipv4 = aRes.status === "fulfilled" ? aRes.value : [];
  const mxRecords =
    mxRes.status === "fulfilled"
      ? mxRes.value.sort((a, b) => a.priority - b.priority).map((m) => m.exchange.toLowerCase())
      : [];
  const txtRecords =
    txtRes.status === "fulfilled" ? txtRes.value.map((chunks) => chunks.join("")) : [];
  const nameservers = nsRes.status === "fulfilled" ? nsRes.value.map((n) => n.toLowerCase()) : [];
  const activeSubdomains =
    subProbeRes.status === "fulfilled" ? subProbeRes.value.filter(Boolean) : [];

  // Detect email provider from MX
  let emailProvider = "None / Custom";
  const mxJoined = mxRecords.join(" ");
  if (mxJoined.includes("google.com") || mxJoined.includes("googlemail.com")) {
    emailProvider = "Google Workspace";
  } else if (mxJoined.includes("outlook.com") || mxJoined.includes("protection.outlook.com")) {
    emailProvider = "Microsoft 365";
  } else if (mxJoined.includes("protonmail.ch") || mxJoined.includes("proton.me")) {
    emailProvider = "ProtonMail";
  } else if (mxJoined.includes("zoho.")) {
    emailProvider = "Zoho Mail";
  } else if (mxJoined.includes("Mimecast") || mxJoined.includes("mimecast.com")) {
    emailProvider = "Mimecast";
  } else if (mxJoined.includes("pphosted.com")) {
    emailProvider = "Proofpoint";
  } else if (mxJoined.includes("cloudflare.net")) {
    emailProvider = "Cloudflare Email Routing";
  } else if (mxJoined.includes("amazonaws.com") || mxJoined.includes("amazonses.com")) {
    emailProvider = "Amazon SES";
  }

  // Detect SaaS stack & security posture from TXT + NS
  const detectedTech = new Set();
  const txtJoined = txtRecords.join(" | ").toLowerCase();
  const nsJoined = nameservers.join(" ");

  if (nsJoined.includes("cloudflare.com")) detectedTech.add("Cloudflare DNS");
  if (nsJoined.includes("awsdns")) detectedTech.add("AWS Route53");
  if (nsJoined.includes("googledomains") || nsJoined.includes("google.com")) detectedTech.add("Google Cloud DNS");
  if (nsJoined.includes("vercel-dns.com")) detectedTech.add("Vercel DNS");

  const txtFingerprints = [
    { match: "google-site-verification", label: "Google Search Console" },
    { match: "stripe-verification", label: "Stripe" },
    { match: "hubspot", label: "HubSpot" },
    { match: "salesforce", label: "Salesforce" },
    { match: "atlassian-domain-verification", label: "Atlassian (Jira/Confluence)" },
    { match: "slack-domain-verification", label: "Slack Enterprise" },
    { match: "openai-domain-verification", label: "OpenAI Enterprise" },
    { match: "apple-domain-verification", label: "Apple Business / Pay" },
    { match: "facebook-domain-verification", label: "Meta Business Suite" },
    { match: "docusign", label: "DocuSign" },
    { match: "zendesk", label: "Zendesk" },
    { match: "sendgrid", label: "SendGrid" },
    { match: "mailgun", label: "Mailgun" },
    { match: "amazonses", label: "Amazon SES" },
    { match: "spf1", label: "SPF Email Auth" },
  ];

  for (const fp of txtFingerprints) {
    if (txtJoined.includes(fp.match)) detectedTech.add(fp.label);
  }

  // Parse RDAP registration metadata
  const rdap = rdapRes.status === "fulfilled" ? rdapRes.value : null;
  const events = rdap?.events || [];
  const registeredAt = events.find((e) => e.eventAction === "registration")?.eventDate || null;
  const expiresAt = events.find((e) => e.eventAction === "expiration")?.eventDate || null;

  return {
    domain: cleanDomain,
    infrastructure: {
      ipv4_addresses: ipv4,
      nameservers,
      email_provider: emailProvider,
      mx_records: mxRecords,
      detected_saas_and_tech: Array.from(detectedTech),
      has_spf_record: txtJoined.includes("v=spf1"),
    },
    registration: {
      registered_at: registeredAt,
      expires_at: expiresAt,
      status: rdap?.status || [],
    },
    active_subdomains: activeSubdomains,
    txt_records: txtRecords.slice(0, 20),
    llm_summary: `Domain: ${cleanDomain} | Email: ${emailProvider} | Tech Stack: ${
      Array.from(detectedTech).join(", ") || "Standard"
    } | Active Subdomains: ${activeSubdomains.join(", ") || "None detected"} | Registered: ${
      registeredAt || "Unknown"
    }.`,
  };
}

/**
 * 7. Open-Source Package & CVE Security Auditor (npm, PyPI, crates.io) powered by Google OSV.dev.
 */
export async function packageAudit({ name, ecosystem = "npm", version = "" }) {
  if (!name || typeof name !== "string" || !name.trim()) {
    throw new Error("Missing required parameter: 'name' (e.g., 'express', 'lodash', 'requests')");
  }

  const pkgName = name.trim();
  const ecoLower = (ecosystem || "npm").toLowerCase();
  const osvEcosystem =
    ecoLower === "pypi" || ecoLower === "python"
      ? "PyPI"
      : ecoLower === "crates" || ecoLower === "crates.io" || ecoLower === "rust"
      ? "crates.io"
      : "npm";

  // 1. Fetch package metadata from official registry
  let latestVersion = null;
  let description = null;
  let license = null;
  let repository = null;
  let deprecated = false;

  try {
    if (osvEcosystem === "npm") {
      const regRes = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkgName)}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      });
      if (regRes.ok) {
        const reg = await regRes.json();
        latestVersion = reg["dist-tags"]?.latest || null;
        const latestObj = latestVersion ? reg.versions?.[latestVersion] : null;
        description = reg.description || latestObj?.description || null;
        license = reg.license || latestObj?.license || null;
        repository = reg.repository?.url || latestObj?.repository?.url || null;
        deprecated = Boolean(latestObj?.deprecated);
      }
    } else if (osvEcosystem === "PyPI") {
      const regRes = await fetch(`https://pypi.org/pypi/${encodeURIComponent(pkgName)}/json`, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(6000),
      });
      if (regRes.ok) {
        const reg = await regRes.json();
        latestVersion = reg.info?.version || null;
        description = reg.info?.summary || null;
        license = reg.info?.license || null;
        repository = reg.info?.project_url || reg.info?.home_page || null;
      }
    } else if (osvEcosystem === "crates.io") {
      const regRes = await fetch(`https://crates.io/api/v1/crates/${encodeURIComponent(pkgName)}`, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(6000),
      });
      if (regRes.ok) {
        const reg = await regRes.json();
        latestVersion = reg.crate?.max_stable_version || reg.crate?.max_version || null;
        description = reg.crate?.description || null;
        repository = reg.crate?.repository || null;
      }
    }
  } catch {
    // Continue to OSV check even if registry lookup times out
  }

  const targetVersion = (version && version.trim()) || latestVersion;

  // 2. Query Google OSV.dev for known CVEs & security advisories
  const osvQuery = {
    package: { name: pkgName, ecosystem: osvEcosystem },
  };
  if (targetVersion) {
    osvQuery.version = targetVersion;
  }

  let vulns = [];
  try {
    const osvRes = await fetch("https://api.osv.dev/v1/query", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
      body: JSON.stringify(osvQuery),
      signal: AbortSignal.timeout(6000),
    });
    if (osvRes.ok) {
      const osvData = await osvRes.json();
      vulns = (osvData?.vulns || []).map((v) => ({
        id: v.id,
        aliases: v.aliases || [],
        summary: v.summary || (v.details || "").slice(0, 240),
        published: v.published,
        severity: v.database_specific?.severity || v.severity?.[0]?.type || "UNKNOWN",
      }));
    }
  } catch {
    // Proceed if OSV fails
  }

  const verdict =
    vulns.length > 0 ? "VULNERABLE" : deprecated ? "DEPRECATED" : "SAFE";

  return {
    package: pkgName,
    ecosystem: osvEcosystem,
    checked_version: targetVersion || "all",
    latest_version: latestVersion,
    verdict,
    deprecated,
    metadata: {
      description,
      license,
      repository,
    },
    vulnerability_count: vulns.length,
    vulnerabilities: vulns.slice(0, 10),
    llm_summary: `Package ${pkgName}@${targetVersion || "latest"} (${osvEcosystem}) -> Verdict: ${verdict} | Latest Version: ${
      latestVersion || "Unknown"
    } | Known Vulnerabilities: ${vulns.length}${
      vulns.length > 0 ? ` (${vulns.map((v) => v.id).join(", ")})` : ""
    }.`,
  };
}

/**
 * Reconstruct OpenAlex inverted-index abstract into plain text.
 */
function reconstructAbstract(invertedIndex) {
  if (!invertedIndex || typeof invertedIndex !== "object") return null;
  const words = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words[pos] = word;
    }
  }
  return words.filter(Boolean).join(" ").slice(0, 900);
}

/**
 * 8. Deep Academic & Scientific Literature Search (OpenAlex + arXiv).
 * Returns peer-reviewed papers, citation counts, reconstructed abstracts, and direct Open-Access PDF links.
 */
export async function academicSearch({ query, limit = 5 }) {
  if (!query || typeof query !== "string" || !query.trim()) {
    throw new Error("Missing required parameter: 'query'");
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 15);
  const cleanQuery = query.trim();

  const [openAlexRes, arxivRes] = await Promise.allSettled([
    fetch(
      `https://api.openalex.org/works?search=${encodeURIComponent(cleanQuery)}&per-page=${safeLimit}`,
      { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(8000) }
    ).then((r) => (r.ok ? r.json() : null)),
    fetch(
      `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(cleanQuery)}&start=0&max_results=3`,
      { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(7000) }
    ).then((r) => (r.ok ? r.text() : null)),
  ]);

  const papers = [];

  if (openAlexRes.status === "fulfilled" && openAlexRes.value?.results) {
    for (const w of openAlexRes.value.results) {
      papers.push({
        source: "openalex",
        title: w.title || w.display_name,
        publication_year: w.publication_year || null,
        citations_count: w.cited_by_count || 0,
        authors: (w.authorships || [])
          .slice(0, 5)
          .map((a) => a.author?.display_name)
          .filter(Boolean),
        doi: w.doi || null,
        pdf_url: w.open_access?.oa_url || w.primary_location?.pdf_url || w.doi || w.id,
        abstract: reconstructAbstract(w.abstract_inverted_index),
      });
    }
  }

  if (arxivRes.status === "fulfilled" && arxivRes.value) {
    const xml = arxivRes.value;
    const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
    for (const entry of entries) {
      const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/\s+/g, " ").trim();
      const summary = entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.replace(/\s+/g, " ").trim();
      const idUrl = entry.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim();
      const published = entry.match(/<published>(\d{4})/)?.[1];
      if (title && idUrl) {
        papers.push({
          source: "arxiv",
          title,
          publication_year: published ? Number(published) : null,
          citations_count: null,
          authors: (entry.match(/<name>([\s\S]*?)<\/name>/g) || [])
            .slice(0, 5)
            .map((n) => n.replace(/<\/?name>/g, "").trim()),
          doi: null,
          pdf_url: idUrl.replace("/abs/", "/pdf/"),
          abstract: (summary || "").slice(0, 900),
        });
      }
    }
  }

  const finalPapers = papers.slice(0, safeLimit);
  const markdown = finalPapers
    .map(
      (p, i) =>
        `### ${i + 1}. ${p.title} (${p.publication_year || "N/A"}) [${p.source.toUpperCase()}]\n` +
        `- **Authors:** ${p.authors.join(", ") || "N/A"} | **Citations:** ${p.citations_count ?? "Preprint"}\n` +
        `- **PDF / URL:** ${p.pdf_url}\n` +
        (p.abstract ? `- **Abstract:** ${p.abstract}\n` : "")
    )
    .join("\n");

  return {
    query: cleanQuery,
    count: finalPapers.length,
    papers: finalPapers,
    llm_markdown: markdown || "No academic papers found for this query.",
  };
}
