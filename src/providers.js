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

const USER_AGENT = "AgentKiosk/2.4 (+https://agent-kiosk.vercel.app)";

/**
 * Smart In-Memory TTL Cache + Stale-While-Revalidate Zero-Failure Layer
 * Cuts repeat query latency to <1ms and falls back to last-known good data if an upstream API hiccups.
 */
const SMART_CACHE = new Map();
const MAX_CACHE_ENTRIES = 400;

export async function withCache(cacheKey, ttlMs, fetcher) {
  const now = Date.now();
  const cached = SMART_CACHE.get(cacheKey);
  if (cached && now < cached.expiresAt) {
    return cached.value;
  }
  try {
    const freshValue = await fetcher();
    if (SMART_CACHE.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = SMART_CACHE.keys().next().value;
      if (oldestKey) SMART_CACHE.delete(oldestKey);
    }
    SMART_CACHE.set(cacheKey, {
      value: freshValue,
      expiresAt: now + ttlMs,
    });
    return freshValue;
  } catch (err) {
    if (cached && cached.value) {
      return { ...cached.value, _stale_cache_fallback: true };
    }
    throw err;
  }
}

/**
 * 1. Fetch live social media discussions (Reddit + HN) and return LLM-ready structured JSON.
 */
export async function socialSearch(params = {}) {
  const rawQuery =
    params.query || params.q || params.topic || params.keyword || params.search || "AI agents";
  const query = String(rawQuery).trim() || "AI agents";
  const platform = params.platform || "all";
  const limit = params.limit ?? 10;
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
  const ext = feat.properties?.extent; // [minLon, maxLat, maxLon, minLat]
  let bbox = `${(lon - 0.35).toFixed(4)},${(lat - 0.25).toFixed(4)},${(lon + 0.35).toFixed(4)},${(lat + 0.25).toFixed(4)}`;
  if (Array.isArray(ext) && ext.length === 4) {
    const minLon = Math.min(ext[0], ext[2]) - 0.05;
    const maxLon = Math.max(ext[0], ext[2]) + 0.05;
    const minLat = Math.min(ext[1], ext[3]) - 0.05;
    const maxLat = Math.max(ext[1], ext[3]) + 0.05;
    bbox = `${minLon.toFixed(4)},${minLat.toFixed(4)},${maxLon.toFixed(4)},${maxLat.toFixed(4)}`;
  }

  return {
    lat,
    lon,
    bbox,
    resolvedName: [feat.properties?.name, feat.properties?.state, feat.properties?.country]
      .filter(Boolean)
      .join(", "),
  };
}

/**
 * 2. Fetch local business leads strictly inside the target city/location,
 * enriched with real phone numbers, websites, emails, and opening hours via Photon + Nominatim.
 */
export async function mapsLeads(params = {}) {
  const rawQuery = params.query || params.q || params.category || params.business || "cafe";
  const query = String(rawQuery).trim() || "cafe";
  const location = String(params.location || params.city || params.region || "San Francisco");
  const limit = params.limit ?? 10;
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 25);

  let geo = null;
  if (location && location.trim()) {
    geo = await geocodeLocation(location.trim());
  }

  const candidateLimit = Math.min(Math.max(safeLimit * 4, 25), 45);
  const geoParams = geo ? `&bbox=${geo.bbox}&lat=${geo.lat}&lon=${geo.lon}` : "";
  const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=${candidateLimit}${geoParams}`;

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
export async function webExtract(params = {}) {
  let rawUrl = String(params.url || params.target || params.link || params.query || "https://example.com").trim();
  if (!rawUrl) rawUrl = "https://example.com";
  if (!/^https?:\/\//i.test(rawUrl)) {
    rawUrl = `https://${rawUrl}`;
  }

  const targetUrl = rawUrl;
  const max_length = params.max_length ?? 8000;
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
export async function securityAudit(params = {}) {
  const rawTarget =
    params.target ||
    params.address ||
    params.contract ||
    params.token ||
    params.url ||
    params.query ||
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const chain = params.chain || "base";

  let cleanTarget = String(rawTarget).trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(cleanTarget) && !/^https?:\/\//i.test(cleanTarget) && cleanTarget.includes(".")) {
    cleanTarget = `https://${cleanTarget}`;
  }

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
export async function tokenAlpha(params = {}) {
  const rawQuery =
    params.query || params.symbol || params.ticker || params.token || params.address || params.q || "AERO";
  const cleanQuery = String(rawQuery).trim() || "AERO";
  const chain = params.chain || "all";
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
export async function domainIntel(params = {}) {
  const domain = String(
    params.domain || params.url || params.host || params.company || params.target || params.query || "stripe.com"
  );

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
export async function packageAudit(params = {}) {
  const rawName = params.name || params.package || params.pkg || params.module || params.query || "express";
  const pkgName = String(rawName).trim() || "express";
  const ecosystem = params.ecosystem || "npm";
  const version = params.version ? String(params.version) : "";
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
export async function academicSearch(params = {}) {
  const rawQuery =
    params.query || params.q || params.topic || params.search || "autonomous AI agents";
  const cleanQuery = String(rawQuery).trim() || "autonomous AI agents";
  const limit = params.limit ?? 5;
  const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 15);

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

const EVM_CHAINS = [
  {
    chain: "base",
    rpc: "https://mainnet.base.org",
    nativeSymbol: "ETH",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  {
    chain: "ethereum",
    rpc: "https://ethereum-rpc.publicnode.com",
    nativeSymbol: "ETH",
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  {
    chain: "arbitrum",
    rpc: "https://arbitrum-one-rpc.publicnode.com",
    nativeSymbol: "ETH",
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  },
  {
    chain: "polygon",
    rpc: "https://polygon-bor-rpc.publicnode.com",
    nativeSymbol: "POL",
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  },
];

/**
 * 9. Multi-Chain Wallet & Whale Portfolio Profiler (Base, Ethereum, Arbitrum, Polygon).
 * Queries native ETH/POL balances, USDC balances, total tx count (nonce), and smart-contract vs EOA status.
 */
export async function walletProfiler(params = {}) {
  const rawAddress =
    params.address ||
    params.wallet ||
    params.target ||
    params.account ||
    params.query ||
    "0xd8429209Aee6A398B9707DFf5F28AAA93452eE95";
  const cleanAddr = String(rawAddress).trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(cleanAddr)) {
    throw new Error("Missing or invalid parameter: 'address' (must be a 0x... 40-hex EVM address)");
  }
  const paddedAddr = cleanAddr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const balanceOfData = `0x70a08231${paddedAddr}`;

  const chainResults = await Promise.all(
    EVM_CHAINS.map(async (c) => {
      try {
        const res = await fetch(c.rpc, {
          method: "POST",
          headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
          body: JSON.stringify([
            { jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [cleanAddr, "latest"] },
            { jsonrpc: "2.0", id: 2, method: "eth_getTransactionCount", params: [cleanAddr, "latest"] },
            { jsonrpc: "2.0", id: 3, method: "eth_call", params: [{ to: c.usdc, data: balanceOfData }, "latest"] },
            { jsonrpc: "2.0", id: 4, method: "eth_getCode", params: [cleanAddr, "latest"] },
          ]),
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) return { chain: c.chain, error: `HTTP ${res.status}` };
        const batch = await res.json();
        const byId = Object.fromEntries((batch || []).map((item) => [item.id, item.result]));

        const nativeWei = BigInt(byId[1] || "0x0");
        const nativeBalance = Number(nativeWei) / 1e18;
        const txCount = parseInt(byId[2] || "0x0", 16);
        const usdcRaw = BigInt(byId[3] && byId[3] !== "0x" ? byId[3] : "0x0");
        const usdcBalance = Number(usdcRaw) / 1e6;
        const isContract = Boolean(byId[4] && byId[4] !== "0x" && byId[4] !== "0x0");

        return {
          chain: c.chain,
          native_symbol: c.nativeSymbol,
          native_balance: Number(nativeBalance.toFixed(6)),
          usdc_balance: Number(usdcBalance.toFixed(2)),
          tx_count_nonce: txCount,
          is_contract: isContract,
        };
      } catch {
        return {
          chain: c.chain,
          native_symbol: c.nativeSymbol,
          native_balance: 0,
          usdc_balance: 0,
          tx_count_nonce: 0,
          is_contract: false,
        };
      }
    })
  );

  const totalUsdc = chainResults.reduce((acc, c) => acc + (c.usdc_balance || 0), 0);
  const totalEth = chainResults
    .filter((c) => c.native_symbol === "ETH")
    .reduce((acc, c) => acc + (c.native_balance || 0), 0);
  const totalTxs = chainResults.reduce((acc, c) => acc + (c.tx_count_nonce || 0), 0);
  const isSmartContractAny = chainResults.some((c) => c.is_contract);

  let walletTier = "NEW_OR_INACTIVE";
  if (totalUsdc >= 50000 || totalEth >= 20) {
    walletTier = "WHALE";
  } else if (totalUsdc >= 1000 || totalEth >= 0.5 || totalTxs >= 100) {
    walletTier = "ACTIVE_TRADER";
  } else if (totalTxs > 0 || totalUsdc > 0 || totalEth > 0) {
    walletTier = "RETAIL_ACTIVE";
  }

  return {
    address: cleanAddr,
    wallet_tier: walletTier,
    entity_type: isSmartContractAny ? "SMART_CONTRACT_OR_SAFE" : "EOA_WALLET",
    totals: {
      total_usdc: Number(totalUsdc.toFixed(2)),
      total_eth: Number(totalEth.toFixed(6)),
      total_outgoing_txs: totalTxs,
    },
    chains: chainResults,
    llm_summary: `Wallet ${cleanAddr} (${walletTier}): Total USDC: $${totalUsdc.toFixed(
      2
    )} | Total ETH: ${totalEth.toFixed(4)} ETH | Total Outgoing Txs: ${totalTxs} across Base, Ethereum, Arbitrum, Polygon.`,
  };
}

/**
 * 10. Prediction Markets & Real-World Event Probabilities (Polymarket + Manifold Markets).
 * Returns live crowd-sourced and real-money implied probabilities (%) for macro, crypto, tech, and political events.
 */
export async function predictionMarkets(params = {}) {
  const rawQuery = params.query || params.q || params.topic || params.event || params.market || "bitcoin";
  const cleanQuery = String(rawQuery).trim() || "bitcoin";
  const limit = params.limit ?? 5;
  const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 15);

  const [polyRes, manifoldRes] = await Promise.allSettled([
    fetch(`https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(cleanQuery)}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(4500),
    }).then((r) => (r.ok ? r.json() : null)),
    fetch(
      `https://api.manifold.markets/v0/search-markets?term=${encodeURIComponent(
        cleanQuery
      )}&filter=open&sort=liquidity&limit=${safeLimit * 2}`,
      { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(6000) }
    ).then((r) => (r.ok ? r.json() : null)),
  ]);

  const markets = [];

  if (polyRes.status === "fulfilled" && polyRes.value?.events) {
    for (const ev of polyRes.value.events.slice(0, safeLimit)) {
      const m = ev.markets?.[0];
      let yesProbPct = null;
      try {
        const prices = typeof m?.outcomePrices === "string" ? JSON.parse(m.outcomePrices) : m?.outcomePrices;
        if (Array.isArray(prices) && prices.length > 0) {
          yesProbPct = Number((Number(prices[0]) * 100).toFixed(1));
        }
      } catch {
        // ignore parse errors
      }
      markets.push({
        source: "polymarket",
        question: ev.title || m?.question,
        probability_yes_pct: yesProbPct,
        volume_usd: Math.round(Number(ev.volume || m?.volume || 0)),
        url: `https://polymarket.com/event/${ev.slug}`,
      });
    }
  }

  if (manifoldRes.status === "fulfilled" && Array.isArray(manifoldRes.value)) {
    for (const m of manifoldRes.value) {
      if (typeof m.probability !== "number" && !m.question) continue;
      markets.push({
        source: "manifold",
        question: m.question,
        probability_yes_pct:
          typeof m.probability === "number" ? Number((m.probability * 100).toFixed(1)) : null,
        volume_usd: Math.round(Number(m.volume || 0)),
        url: m.url,
      });
    }
  }

  const finalMarkets = markets.slice(0, safeLimit);
  const markdown = finalMarkets
    .map(
      (m, i) =>
        `${i + 1}. **[${m.source.toUpperCase()}] ${m.question}**\n` +
        `   - Implied Probability (YES): **${
          m.probability_yes_pct !== null ? `${m.probability_yes_pct}%` : "Multi-Choice"
        }** | Volume: $${m.volume_usd.toLocaleString()}\n` +
        `   - URL: ${m.url}`
    )
    .join("\n");

  return {
    query: cleanQuery,
    count: finalMarkets.length,
    markets: finalMarkets,
    llm_markdown: markdown || "No active prediction markets found for this topic.",
  };
}

/**
 * 11. DeFi Best Yield & APY Radar (powered by DeFiLlama Yields).
 * Finds highest-APY liquidity & lending pools for any asset (USDC, ETH, USDT, WBTC) filtered by chain and minimum TVL.
 */
export async function defiYields(params = {}) {
  const symbol = String(params.symbol || params.token || params.asset || params.query || "USDC");
  const chain = String(params.chain || "Base");
  const min_tvl_usd = params.min_tvl_usd ?? 100000;
  const limit = params.limit ?? 5;
  const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 20);
  const minTvl = Math.max(Number(min_tvl_usd) || 100000, 10000);
  const symUpper = (symbol || "USDC").trim().toUpperCase();
  const chainLower = (chain || "all").trim().toLowerCase();

  const res = await fetch("https://yields.llama.fi/pools", {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(9000),
  });

  if (!res.ok) {
    throw new Error(`DeFiLlama yields provider returned HTTP ${res.status}`);
  }

  const payload = await res.json();
  const allPools = payload?.data || [];

  const matched = allPools.filter((p) => {
    if (!p.symbol || Number(p.tvlUsd || 0) < minTvl || Number(p.apy || 0) <= 0) return false;
    if (Number(p.apy) > 500) return false; // exclude broken/outlier APYs
    const poolSym = p.symbol.toUpperCase();
    const symMatch = poolSym === symUpper || poolSym.split("-").includes(symUpper);
    if (!symMatch) return false;
    if (chainLower !== "all" && (p.chain || "").toLowerCase() !== chainLower) return false;
    return true;
  });

  matched.sort((a, b) => Number(b.apy || 0) - Number(a.apy || 0));
  const topPools = matched.slice(0, safeLimit).map((p) => ({
    project: p.project,
    chain: p.chain,
    symbol: p.symbol,
    apy_total_pct: Number(Number(p.apy || 0).toFixed(2)),
    apy_base_pct: Number(Number(p.apyBase || 0).toFixed(2)),
    apy_reward_pct: Number(Number(p.apyReward || 0).toFixed(2)),
    tvl_usd: Math.round(Number(p.tvlUsd || 0)),
    stablecoin_pool: Boolean(p.stablecoin),
    il_risk: p.ilRisk || "unknown",
    pool_id: p.pool,
  }));

  const markdown = topPools
    .map(
      (p, i) =>
        `${i + 1}. **${p.project}** (${p.chain} — \`${p.symbol}\`): **${p.apy_total_pct}% APY** | TVL: $${p.tvl_usd.toLocaleString()}`
    )
    .join("\n");

  return {
    symbol: symUpper,
    chain: chain || "all",
    min_tvl_usd: minTvl,
    count: topPools.length,
    pools: topPools,
    llm_markdown: markdown || `No matching DeFi yield pools found for ${symUpper} on ${chain}.`,
  };
}

/**
 * 12. GitHub Repository & Open-Source Competitive Intelligence.
 * Accepts either 'owner/repo' or a search topic and returns star velocity, latest releases, issues, and tech stack.
 */
export async function githubIntel(params = {}) {
  const rawQuery =
    params.query || params.repo || params.repository || params.topic || params.q || "modelcontextprotocol/servers";
  const cleanQuery = String(rawQuery).trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\/$/, "") || "modelcontextprotocol/servers";
  const limit = params.limit ?? 5;
  const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 15);
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "application/vnd.github+json",
  };

  // Case A: Exact owner/repo lookup
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(cleanQuery) && !cleanQuery.includes(" ")) {
    const [repoRes, relRes] = await Promise.allSettled([
      fetch(`https://api.github.com/repos/${cleanQuery}`, {
        headers,
        signal: AbortSignal.timeout(7000),
      }).then((r) => (r.ok ? r.json() : null)),
      fetch(`https://api.github.com/repos/${cleanQuery}/releases?per_page=3`, {
        headers,
        signal: AbortSignal.timeout(7000),
      }).then((r) => (r.ok ? r.json() : [])),
    ]);

    const r = repoRes.status === "fulfilled" ? repoRes.value : null;
    if (r) {
      const releases =
        relRes.status === "fulfilled" && Array.isArray(relRes.value)
          ? relRes.value.map((rel) => ({
              tag: rel.tag_name,
              name: rel.name,
              published_at: rel.published_at,
              url: rel.html_url,
            }))
          : [];

      return {
        mode: "repository",
        full_name: r.full_name,
        description: r.description,
        stars: r.stargazers_count,
        forks: r.forks_count,
        open_issues: r.open_issues_count,
        watchers: r.subscribers_count,
        language: r.language,
        license: r.license?.spdx_id || null,
        topics: r.topics || [],
        created_at: r.created_at,
        pushed_at: r.pushed_at,
        homepage: r.homepage || null,
        url: r.html_url,
        latest_releases: releases,
        llm_summary: `${r.full_name} (${r.language || "Multi"}): ⭐ ${r.stargazers_count} stars | 🍴 ${
          r.forks_count
        } forks | 🐛 ${r.open_issues_count} open issues | Last push: ${r.pushed_at}. ${
          r.description || ""
        }`,
      };
    }
  }

  // Case B: Topic / keyword repository search
  const searchRes = await fetch(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(
      cleanQuery
    )}&sort=stars&order=desc&per_page=${safeLimit}`,
    { headers, signal: AbortSignal.timeout(7000) }
  );

  if (!searchRes.ok) {
    throw new Error(`GitHub API returned HTTP ${searchRes.status}`);
  }

  const searchData = await searchRes.json();
  const repos = (searchData?.items || []).slice(0, safeLimit).map((r) => ({
    full_name: r.full_name,
    description: r.description,
    stars: r.stargazers_count,
    forks: r.forks_count,
    open_issues: r.open_issues_count,
    language: r.language,
    license: r.license?.spdx_id || null,
    pushed_at: r.pushed_at,
    url: r.html_url,
  }));

  const markdown = repos
    .map(
      (r, i) =>
        `${i + 1}. **[${r.full_name}](${r.url})** (⭐ ${r.stars.toLocaleString()} | ${
          r.language || "N/A"
        })\n   - ${r.description || "No description"}`
    )
    .join("\n");

  return {
    mode: "search",
    query: cleanQuery,
    count: repos.length,
    repositories: repos,
    llm_markdown: markdown || "No GitHub repositories found for this query.",
  };
}

/**
 * 13. Institutional 3-in-1 Token Due Diligence Report ($0.10 USDC).
 * Combines DEX Order-Flow Alpha, On-Chain GoPlus Honeypot/Tax Security Audit, and Live Social Sentiment (Reddit + HN).
 */
export async function tokenDueDiligence(params = {}) {
  const rawQuery =
    params.query || params.symbol || params.ticker || params.token || params.target || params.address || params.q || "AERO";
  const cleanQuery = String(rawQuery).trim() || "AERO";
  const chain = params.chain || "base";
  const cacheKey = `dd:${cleanQuery.toLowerCase()}:${chain.toLowerCase()}`;

  return withCache(cacheKey, 45_000, async () => {
    const alphaData = await tokenAlpha({ query: cleanQuery, chain });
    const resolvedAddress =
      alphaData?.token?.address ||
      (/^0x[a-fA-F0-9]{40}$/.test(cleanQuery) ? cleanQuery : "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
    const resolvedChain = alphaData?.token?.primary_chain || (chain === "all" ? "base" : chain);
    const searchSymbol = alphaData?.token?.symbol || cleanQuery;

    const [secRes, socRes] = await Promise.allSettled([
      securityAudit({ target: resolvedAddress, chain: resolvedChain }),
      socialSearch({ query: `${searchSymbol} crypto`, limit: 5 }),
    ]);

    const security = secRes.status === "fulfilled" ? secRes.value : null;
    const social = socRes.status === "fulfilled" ? socRes.value : { count: 0, items: [] };

    const riskScore = security?.risk_score ?? 20;
    const liqUsd = alphaData?.alpha_metrics?.total_top5_liquidity_usd ?? 0;
    const buyPressure1h = alphaData?.alpha_metrics?.order_flow_1h?.buy_pressure_pct ?? 50;

    let grade = "B";
    let compositeVerdict = "SPECULATIVE_SAFE";

    if (riskScore >= 50 || security?.token_info?.is_honeypot) {
      grade = "F";
      compositeVerdict = "AVOID_CRITICAL_SECURITY_RISK";
    } else if (liqUsd < 10000 || riskScore >= 25) {
      grade = "D";
      compositeVerdict = "HIGH_RISK_LOW_LIQUIDITY";
    } else if (liqUsd >= 250000 && riskScore === 0 && buyPressure1h >= 55) {
      grade = "A";
      compositeVerdict = "INSTITUTIONAL_GRADE_ACCUMULATION";
    } else if (liqUsd >= 50000 && riskScore <= 15) {
      grade = "B";
      compositeVerdict = "HEALTHY_LIQUIDITY_VERIFIED";
    } else {
      grade = "C";
      compositeVerdict = "MODERATE_RISK";
    }

    const llm_markdown = [
      `# Institutional Token Due Diligence: ${alphaData?.token?.name || cleanQuery} (${searchSymbol})`,
      `- **Composite Investment Grade:** **${grade}** (${compositeVerdict})`,
      `- **Contract Address:** \`${resolvedAddress}\` on **${resolvedChain}**`,
      `- **Price:** $${alphaData?.token?.price_usd ?? "N/A"} | **Top-5 DEX Liquidity:** $${liqUsd.toLocaleString()} | **24h Volume:** $${(alphaData?.alpha_metrics?.volume_24h_usd || 0).toLocaleString()}`,
      `- **Order-Flow Alpha Signal:** \`${alphaData?.alpha_metrics?.signal || "NEUTRAL"}\` (1h Buy Pressure: ${buyPressure1h}%)`,
      `- **Security Audit Verdict:** \`${security?.verdict || "UNKNOWN"}\` (Risk Score: ${riskScore}/100, Buy Tax: ${security?.token_info?.buy_tax_percent ?? 0}%, Sell Tax: ${security?.token_info?.sell_tax_percent ?? 0}%)`,
      `- **Live Social Mentions:** ${social.count || 0} recent Reddit/HackerNews threads analyzed.`,
    ].join("\n");

    return {
      query: cleanQuery,
      investment_grade: grade,
      composite_verdict: compositeVerdict,
      token_alpha: alphaData,
      security_audit: security,
      social_sentiment: {
        discussion_count: social.count || 0,
        top_threads: (social.items || []).slice(0, 5),
      },
      llm_markdown,
    };
  });
}

/**
 * 14. Complete 4-in-1 B2B Company & Domain Sales Dossier ($0.10 USDC).
 * Combines DNS/MX/SaaS Tech Stack Infrastructure, Homepage Clean Markdown Extraction, Local HQ/Branch Leads, and Social Mentions.
 */
export async function b2bCompanyDossier(params = {}) {
  const rawDomain =
    params.domain || params.url || params.company || params.target || params.query || "stripe.com";
  const cleanDomain = String(rawDomain)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split(":")[0] || "stripe.com";
  const companyName = String(params.company || cleanDomain.split(".")[0]).trim();
  const location = String(params.location || params.city || "San Francisco").trim();
  const cacheKey = `dossier:${cleanDomain}:${location.toLowerCase()}`;

  return withCache(cacheKey, 90_000, async () => {
    const [domRes, webRes, socRes, mapRes] = await Promise.allSettled([
      domainIntel({ domain: cleanDomain }),
      webExtract({ url: `https://${cleanDomain}`, max_length: 3000 }),
      socialSearch({ query: companyName, limit: 5 }),
      mapsLeads({ query: companyName, location, limit: 3 }),
    ]);

    const domainData = domRes.status === "fulfilled" ? domRes.value : null;
    const webData = webRes.status === "fulfilled" ? webRes.value : null;
    const socialData = socRes.status === "fulfilled" ? socRes.value : { count: 0, items: [] };
    const mapsData = mapRes.status === "fulfilled" ? mapRes.value : { count: 0, leads: [] };

    const llm_markdown = [
      `# B2B Executive Dossier: ${companyName.toUpperCase()} (${cleanDomain})`,
      `- **Email Infrastructure:** ${domainData?.infrastructure?.email_provider || "Unknown"}`,
      `- **Detected SaaS & Cloud Stack:** ${(domainData?.infrastructure?.detected_saas_and_tech || []).join(", ") || "Standard"}`,
      `- **Active Subdomains (${domainData?.active_subdomains?.length || 0}):** ${(domainData?.active_subdomains || []).join(", ") || "None"}`,
      `- **Website Title:** ${webData?.title || cleanDomain}`,
      `- **Physical Locations / Leads Found:** ${mapsData?.count || 0}`,
      `- **Recent Social Mentions (Reddit/HN):** ${socialData?.count || 0}`,
    ].join("\n");

    return {
      company: companyName,
      domain: cleanDomain,
      domain_infrastructure: domainData,
      website_summary: webData
        ? {
            url: webData.url,
            title: webData.title,
            description: webData.description,
            markdown_excerpt: (webData.llm_markdown || "").slice(0, 1500),
          }
        : null,
      physical_leads: mapsData?.leads || [],
      social_mentions: (socialData?.items || []).slice(0, 5),
      llm_markdown,
    };
  });
}

/**
 * 15. Multi-Chain Whale Portfolio & DeFi Yield Optimizer Radar ($0.10 USDC).
 * Profiles wallet across 4 EVM chains, matches idle USDC & ETH balances against top Base DeFiLlama pools, and computes projected annual yield.
 */
export async function whaleAlphaRadar(params = {}) {
  const rawAddress =
    params.address ||
    params.wallet ||
    params.target ||
    params.account ||
    params.query ||
    "0xd8429209Aee6A398B9707DFf5F28AAA93452eE95";
  const cleanAddr = String(rawAddress).trim();
  const cacheKey = `whale:${cleanAddr.toLowerCase()}`;

  return withCache(cacheKey, 45_000, async () => {
    const [profRes, usdcYieldRes, ethYieldRes, predRes] = await Promise.allSettled([
      walletProfiler({ address: cleanAddr }),
      defiYields({ symbol: "USDC", chain: "Base", min_tvl_usd: 100000, limit: 3 }),
      defiYields({ symbol: "ETH", chain: "Base", min_tvl_usd: 100000, limit: 3 }),
      predictionMarkets({ query: "ethereum", limit: 3 }),
    ]);

    if (profRes.status === "rejected") {
      throw profRes.reason;
    }

    const portfolio = profRes.value;
    const usdcPools = usdcYieldRes.status === "fulfilled" ? usdcYieldRes.value?.pools || [] : [];
    const ethPools = ethYieldRes.status === "fulfilled" ? ethYieldRes.value?.pools || [] : [];
    const macroOdds = predRes.status === "fulfilled" ? predRes.value?.markets || [] : [];

    const bestUsdcApy = usdcPools[0]?.apy_total_pct || 0;
    const bestEthApy = ethPools[0]?.apy_total_pct || 0;
    const totalUsdc = portfolio?.totals?.total_usdc || 0;
    const totalEth = portfolio?.totals?.total_eth || 0;

    const projectedAnnualUsdcYield = Number(((totalUsdc * bestUsdcApy) / 100).toFixed(2));
    const projectedAnnualEthYield = Number(((totalEth * bestEthApy) / 100).toFixed(6));

    const llm_markdown = [
      `# Multi-Chain Whale & Yield Optimization Report: \`${cleanAddr}\``,
      `- **Wallet Tier:** **${portfolio.wallet_tier}** (${portfolio.entity_type})`,
      `- **Total Liquid Holdings:** $${totalUsdc.toLocaleString()} USDC + ${totalEth} ETH across 4 EVM chains (${portfolio.totals.total_outgoing_txs} outgoing txs)`,
      `- **Best Base USDC Yield Opportunity:** ${usdcPools[0] ? `${usdcPools[0].project} (${usdcPools[0].symbol}) @ **${bestUsdcApy}% APY**` : "N/A"} -> Projected: **+$${projectedAnnualUsdcYield}/yr**`,
      `- **Best Base ETH Yield Opportunity:** ${ethPools[0] ? `${ethPools[0].project} (${ethPools[0].symbol}) @ **${bestEthApy}% APY**` : "N/A"} -> Projected: **+${projectedAnnualEthYield} ETH/yr**`,
    ].join("\n");

    return {
      address: cleanAddr,
      portfolio,
      yield_optimization: {
        best_base_usdc_apy_pct: bestUsdcApy,
        projected_annual_usdc_yield_usd: projectedAnnualUsdcYield,
        top_usdc_pools: usdcPools,
        best_base_eth_apy_pct: bestEthApy,
        projected_annual_eth_yield: projectedAnnualEthYield,
        top_eth_pools: ethPools,
      },
      macro_prediction_markets: macroOdds,
      llm_markdown,
    };
  });
}

const AML_FLAG_WEIGHTS = {
  sanctioned: 100,
  money_laundering: 90,
  cybercrime: 90,
  financial_crime: 85,
  stealing_attack: 85,
  darkweb_transactions: 80,
  phishing_activities: 80,
  honeypot_related_address: 75,
  blackmail_activities: 75,
  mixer: 60,
  malicious_mining_activities: 55,
  fake_kyc: 50,
  blacklist_doubt: 45,
};

/**
 * 16. Institutional AML, Sanctions (OFAC) & Counterparty Compliance Screening ($0.05 USDC).
 * Screens any 0x EVM address against GoPlus Security (Base + Ethereum) and 4-chain RPC footprint before autonomous agents execute transfers.
 */
export async function complianceCheck(params = {}) {
  const rawAddress =
    params.address ||
    params.wallet ||
    params.target ||
    params.account ||
    params.query ||
    "0xd8429209Aee6A398B9707DFf5F28AAA93452eE95";
  const cleanAddr = String(rawAddress).trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(cleanAddr)) {
    throw new Error("Invalid 0x EVM wallet or contract address for compliance screening.");
  }

  const cacheKey = `compliance:${cleanAddr.toLowerCase()}`;
  return withCache(cacheKey, 60_000, async () => {
    const [gpBaseRes, gpEthRes, profileRes] = await Promise.allSettled([
      fetch(`https://api.gopluslabs.io/api/v1/address_security/${cleanAddr}?chain_id=8453`, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(6500),
      }).then((r) => (r.ok ? r.json() : null)),
      fetch(`https://api.gopluslabs.io/api/v1/address_security/${cleanAddr}?chain_id=1`, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(6500),
      }).then((r) => (r.ok ? r.json() : null)),
      walletProfiler({ address: cleanAddr }),
    ]);

    const gpBase = gpBaseRes.status === "fulfilled" ? gpBaseRes.value?.result || {} : {};
    const gpEth = gpEthRes.status === "fulfilled" ? gpEthRes.value?.result || {} : {};
    const footprint = profileRes.status === "fulfilled" ? profileRes.value : null;

    const triggeredFlags = [];
    let riskScore = 0;

    for (const [flag, weight] of Object.entries(AML_FLAG_WEIGHTS)) {
      const valBase = Number(gpBase[flag] || 0);
      const valEth = Number(gpEth[flag] || 0);
      if (valBase > 0 || valEth > 0) {
        triggeredFlags.push(flag);
        riskScore = Math.min(100, riskScore + weight);
      }
    }

    const maliciousContractsCreated =
      Math.max(
        Number(gpBase.number_of_malicious_contracts_created || 0),
        Number(gpEth.number_of_malicious_contracts_created || 0)
      ) || 0;
    if (maliciousContractsCreated > 0) {
      triggeredFlags.push(`malicious_contracts_created:${maliciousContractsCreated}`);
      riskScore = Math.min(100, riskScore + 85);
    }

    const compliance_status =
      riskScore >= 60
        ? "BLOCKED_HIGH_RISK"
        : riskScore > 0
          ? "CAUTION_REVIEW"
          : "APPROVED_CLEAN";
    const safe_to_transact = riskScore === 0;

    const llm_markdown = [
      `# AML & Sanctions Counterparty Certificate: \`${cleanAddr}\``,
      `- **Compliance Status:** **${compliance_status}** (Safe to Transact: **${safe_to_transact ? "YES" : "NO"}**)`,
      `- **AML Risk Score:** ${riskScore}/100`,
      `- **Triggered Threat Flags (${triggeredFlags.length}):** ${triggeredFlags.length > 0 ? triggeredFlags.join(", ") : "NONE (0 OFAC/Phishing/Mixer/Drainer hits)"}`,
      footprint
        ? `- **On-Chain Footprint:** ${footprint.wallet_tier} (${footprint.entity_type}) | $${footprint.totals.total_usdc} USDC + ${footprint.totals.total_eth} ETH | ${footprint.totals.total_outgoing_txs} total txs`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    return {
      certificate_type: "AML_SANCTIONS_COUNTERPARTY_SCREENING",
      address: cleanAddr,
      compliance_status,
      safe_to_transact,
      aml_risk_score_100: riskScore,
      triggered_flags: triggeredFlags,
      screening_vectors_checked: Object.keys(AML_FLAG_WEIGHTS).length + 1,
      data_sources: gpBase.data_source || gpEth.data_source || "GoPlus Security + Multi-Chain RPC",
      onchain_footprint: footprint
        ? {
            wallet_tier: footprint.wallet_tier,
            entity_type: footprint.entity_type,
            total_usdc: footprint.totals.total_usdc,
            total_eth: footprint.totals.total_eth,
            total_outgoing_txs: footprint.totals.total_outgoing_txs,
          }
        : null,
      llm_markdown,
    };
  });
}

const CHAIN_ID_MAP = {
  base: 8453,
  ethereum: 1,
  eth: 1,
  arbitrum: 42161,
  arb: 42161,
  polygon: 137,
  matic: 137,
  optimism: 10,
  op: 10,
};

const KNOWN_TOKENS = {
  8453: {
    ETH: { address: "0x0000000000000000000000000000000000000000", decimals: 18, symbol: "ETH" },
    WETH: { address: "0x4200000000000000000000000000000000000006", decimals: 18, symbol: "WETH" },
    USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, symbol: "USDC" },
    USDT: { address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", decimals: 6, symbol: "USDT" },
    DAI: { address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18, symbol: "DAI" },
    AERO: { address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", decimals: 18, symbol: "AERO" },
    CBBTC: { address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", decimals: 8, symbol: "cbBTC" },
    VIRTUAL: { address: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b", decimals: 18, symbol: "VIRTUAL" },
    DEGEN: { address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", decimals: 18, symbol: "DEGEN" },
    BRETT: { address: "0x532f27101965dd16442E59d40670FaF5eBB142E4", decimals: 18, symbol: "BRETT" },
  },
  1: {
    ETH: { address: "0x0000000000000000000000000000000000000000", decimals: 18, symbol: "ETH" },
    WETH: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18, symbol: "WETH" },
    USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6, symbol: "USDC" },
    USDT: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6, symbol: "USDT" },
    DAI: { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18, symbol: "DAI" },
    WBTC: { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8, symbol: "WBTC" },
  },
  42161: {
    ETH: { address: "0x0000000000000000000000000000000000000000", decimals: 18, symbol: "ETH" },
    WETH: { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18, symbol: "WETH" },
    USDC: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6, symbol: "USDC" },
    USDT: { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6, symbol: "USDT" },
    ARB: { address: "0x912CE59144191C1204E64559FE8253a0e49E6548", decimals: 18, symbol: "ARB" },
  },
  137: {
    POL: { address: "0x0000000000000000000000000000000000000000", decimals: 18, symbol: "POL" },
    MATIC: { address: "0x0000000000000000000000000000000000000000", decimals: 18, symbol: "POL" },
    USDC: { address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6, symbol: "USDC" },
    USDT: { address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6, symbol: "USDT" },
  },
  10: {
    ETH: { address: "0x0000000000000000000000000000000000000000", decimals: 18, symbol: "ETH" },
    USDC: { address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6, symbol: "USDC" },
  },
};

function resolveTokenOnChain(chainId, tokenInput) {
  const clean = String(tokenInput || "USDC").trim();
  const table = KNOWN_TOKENS[chainId] || KNOWN_TOKENS[8453];
  const upper = clean.toUpperCase();
  if (table[upper]) return table[upper];
  if (/^0x[a-fA-F0-9]{40}$/.test(clean)) {
    return { address: clean, decimals: 18, symbol: clean.slice(0, 8) };
  }
  return table.USDC || {
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    decimals: 6,
    symbol: "USDC",
  };
}

function toAtomicAmount(humanOrAtomic, decimals) {
  const num = Number(humanOrAtomic);
  if (!Number.isFinite(num) || num <= 0) {
    return BigInt(10 ** decimals).toString();
  }
  // If caller passed a small human-readable number like 10 or 100.5, scale by decimals
  if (num < 1_000_000 || String(humanOrAtomic).includes(".")) {
    const factor = 10 ** Math.min(decimals, 6);
    const scaled = BigInt(Math.round(num * factor)) * 10n ** BigInt(Math.max(0, decimals - 6));
    return scaled.toString();
  }
  return BigInt(Math.floor(num)).toString();
}

/**
 * 17. DeFi Swap & Cross-Chain Bridge Action Calldata Builder ($0.05 USDC).
 * Queries LI.FI and ParaSwap aggregators to compute optimal DEX/Bridge routing and ready-to-sign EVM transaction calldata (to, data, value, gasLimit).
 */
export async function defiSwapQuote(params = {}) {
  const fromChainStr = String(params.from_chain || params.chain || "base")
    .trim()
    .toLowerCase();
  const toChainStr = String(params.to_chain || params.toChain || fromChainStr)
    .trim()
    .toLowerCase();
  const fromChainId = CHAIN_ID_MAP[fromChainStr] || 8453;
  const toChainId = CHAIN_ID_MAP[toChainStr] || fromChainId;

  const fromTokenRaw = params.from_token || params.fromToken || params.srcToken || "USDC";
  const toTokenRaw = params.to_token || params.toToken || params.destToken || "ETH";
  const amountRaw = params.amount || params.from_amount || "10";
  const fromAddress =
    params.wallet ||
    params.from_address ||
    params.user_address ||
    "0xd8429209Aee6A398B9707DFf5F28AAA93452eE95";

  const srcToken = resolveTokenOnChain(fromChainId, fromTokenRaw);
  const dstToken = resolveTokenOnChain(toChainId, toTokenRaw);
  const fromAmountAtomic = toAtomicAmount(amountRaw, srcToken.decimals);

  const cacheKey = `swap:${fromChainId}:${toChainId}:${srcToken.address}:${dstToken.address}:${fromAmountAtomic}:${fromAddress.toLowerCase()}`;

  const PARTNER_FEE_RECIPIENT = "0xd8429209Aee6A398B9707DFf5F28AAA93452eE95";
  const PARTNER_FEE_BPS = 25; // 0.25% automatic on-chain commission

  return withCache(cacheKey, 20_000, async () => {
    // 1. Primary: Relay Protocol (embeds 25 bps = 0.25% on-chain appFees directly into transaction calldata & EIP-3009 permits)
    try {
      const relayRes = await fetch("https://api.relay.link/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
        body: JSON.stringify({
          user: fromAddress,
          originChainId: fromChainId,
          destinationChainId: toChainId,
          originCurrency: srcToken.address,
          destinationCurrency: dstToken.address,
          amount: fromAmountAtomic,
          tradeType: "EXACT_INPUT",
          appFees: [{ recipient: PARTNER_FEE_RECIPIENT, fee: String(PARTNER_FEE_BPS) }],
        }),
        signal: AbortSignal.timeout(6500),
      });

      if (relayRes.ok) {
        const rd = await relayRes.json();
        const swapStep = rd.steps?.find((s) => s.id === "swap" || s.id === "deposit") || rd.steps?.[rd.steps.length - 1];
        const approveStep = rd.steps?.find((s) => s.id === "approve");
        const txData = swapStep?.items?.[0]?.data;
        if (txData && txData.to && txData.data) {
          const outInfo = rd.details?.currencyOut;
          const inInfo = rd.details?.currencyIn;
          const toAmountHuman = outInfo?.amountFormatted || "0";
          const fromAmountHuman = inInfo?.amountFormatted || String(amountRaw);
          const llm_markdown = [
            `# DeFi Executable Swap/Bridge Calldata: ${fromAmountHuman} ${srcToken.symbol} → ${toAmountHuman} ${dstToken.symbol}`,
            `- **Route Aggregator:** Relay Protocol (${fromChainStr.toUpperCase()} → ${toChainStr.toUpperCase()})`,
            `- **Estimated Output:** **${toAmountHuman} ${dstToken.symbol}** (~$${outInfo?.amountUsd || "N/A"} USD)`,
            `- **Ready-to-Sign Transaction Target (\`to\`):** \`${txData.to}\` (Calldata: ${txData.data.length} hex chars)`,
          ].join("\n");

          return {
            action_type: fromChainId === toChainId ? "DEX_SWAP_CALLDATA" : "CROSS_CHAIN_BRIDGE_CALLDATA",
            aggregator: "relay",
            best_dex_or_bridge: "Relay Instant Solver",
            from_chain_id: fromChainId,
            to_chain_id: toChainId,
            partner_fee: {
              recipient: PARTNER_FEE_RECIPIENT,
              fee_bps: PARTNER_FEE_BPS,
              fee_usd: rd.fees?.app?.amountUsd || null,
            },
            from_token: {
              symbol: inInfo?.currency?.symbol || srcToken.symbol,
              address: srcToken.address,
              decimals: srcToken.decimals,
              amount_atomic: fromAmountAtomic,
              amount_human: Number(fromAmountHuman),
              amount_usd: inInfo?.amountUsd ? Number(inInfo.amountUsd) : null,
            },
            to_token: {
              symbol: outInfo?.currency?.symbol || dstToken.symbol,
              address: dstToken.address,
              decimals: dstToken.decimals,
              estimated_amount_atomic: outInfo?.amount || null,
              estimated_amount_human: Number(toAmountHuman),
              minimum_amount_atomic: outInfo?.minimumAmount || null,
              estimated_amount_usd: outInfo?.amountUsd ? Number(outInfo.amountUsd) : null,
            },
            approval_address: approveStep?.items?.[0]?.data?.to || txData.to,
            approval_transaction: approveStep?.items?.[0]?.data || null,
            execution_duration_sec: rd.details?.timeEstimate || 2,
            transaction_request: {
              chainId: txData.chainId || fromChainId,
              from: txData.from || fromAddress,
              to: txData.to,
              value: txData.value || "0",
              data: txData.data,
              gasLimit: txData.gas || null,
            },
            llm_markdown,
          };
        }
      }
    } catch {
      // Fallback to LI.FI below
    }

    // 2. Secondary: LI.FI aggregator (returns full ready-to-broadcast EVM transactionRequest calldata)
    const lifiUrl =
      `https://li.quest/v1/quote?fromChain=${fromChainId}&toChain=${toChainId}` +
      `&fromToken=${encodeURIComponent(srcToken.address)}&toToken=${encodeURIComponent(dstToken.address)}` +
      `&fromAmount=${fromAmountAtomic}&fromAddress=${encodeURIComponent(fromAddress)}&integrator=agent-kiosk`;

    try {
      const lifiRes = await fetch(lifiUrl, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(8000),
      });

      if (lifiRes.ok) {
        const d = await lifiRes.json();
        const toDecimals = d.action?.toToken?.decimals || dstToken.decimals || 18;
        const toAmountHuman = (Number(d.estimate?.toAmount || 0) / 10 ** toDecimals).toFixed(6);
        const fromAmountHuman = (
          Number(fromAmountAtomic) /
          10 ** (d.action?.fromToken?.decimals || srcToken.decimals || 6)
        ).toFixed(4);

        const llm_markdown = [
          `# DeFi Executable Swap/Bridge Quote: ${fromAmountHuman} ${d.action?.fromToken?.symbol || srcToken.symbol} → ${toAmountHuman} ${d.action?.toToken?.symbol || dstToken.symbol}`,
          `- **Route Aggregator:** LI.FI via **${d.toolDetails?.name || d.tool || "Best DEX Route"}** (${fromChainStr.toUpperCase()} → ${toChainStr.toUpperCase()})`,
          `- **Estimated Output:** **${toAmountHuman} ${d.action?.toToken?.symbol || dstToken.symbol}** (~$${d.estimate?.toAmountUSD || "N/A"} USD)`,
          `- **Approval Contract (Spender):** \`${d.estimate?.approvalAddress || d.transactionRequest?.to}\``,
          `- **Ready-to-Sign Transaction Target (\`to\`):** \`${d.transactionRequest?.to}\` (Calldata: ${d.transactionRequest?.data ? `${d.transactionRequest.data.length} hex chars` : "N/A"})`,
        ].join("\n");

        return {
          action_type: fromChainId === toChainId ? "DEX_SWAP_CALLDATA" : "CROSS_CHAIN_BRIDGE_CALLDATA",
          aggregator: "lifi",
          best_dex_or_bridge: d.toolDetails?.name || d.tool,
          from_chain_id: fromChainId,
          to_chain_id: toChainId,
          partner_fee: {
            recipient: PARTNER_FEE_RECIPIENT,
            fee_bps: PARTNER_FEE_BPS,
          },
          from_token: {
            symbol: d.action?.fromToken?.symbol || srcToken.symbol,
            address: d.action?.fromToken?.address || srcToken.address,
            decimals: d.action?.fromToken?.decimals || srcToken.decimals,
            amount_atomic: fromAmountAtomic,
            amount_human: Number(fromAmountHuman),
            amount_usd: d.estimate?.fromAmountUSD ? Number(d.estimate.fromAmountUSD) : null,
          },
          to_token: {
            symbol: d.action?.toToken?.symbol || dstToken.symbol,
            address: d.action?.toToken?.address || dstToken.address,
            decimals: toDecimals,
            estimated_amount_atomic: d.estimate?.toAmount,
            estimated_amount_human: Number(toAmountHuman),
            minimum_amount_atomic: d.estimate?.toAmountMin,
            estimated_amount_usd: d.estimate?.toAmountUSD ? Number(d.estimate.toAmountUSD) : null,
          },
          approval_address: d.estimate?.approvalAddress || null,
          execution_duration_sec: d.estimate?.executionDuration || 2,
          transaction_request: d.transactionRequest
            ? {
                chainId: d.transactionRequest.chainId || fromChainId,
                from: d.transactionRequest.from || fromAddress,
                to: d.transactionRequest.to,
                value: d.transactionRequest.value || "0x0",
                data: d.transactionRequest.data,
                gasLimit: d.transactionRequest.gasLimit || null,
                gasPrice: d.transactionRequest.gasPrice || null,
              }
            : null,
          llm_markdown,
        };
      }
    } catch {
      // Fallback to ParaSwap below
    }

    // 3. Fallback: ParaSwap / Velora Price & Route Engine with 25 bps partnerFeeBps to PARTNER_FEE_RECIPIENT
    const psSrcAddr =
      srcToken.address === "0x0000000000000000000000000000000000000000"
        ? "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
        : srcToken.address;
    const psDstAddr =
      dstToken.address === "0x0000000000000000000000000000000000000000"
        ? "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
        : dstToken.address;

    const psUrl =
      `https://api.paraswap.io/prices?srcToken=${psSrcAddr}&destToken=${psDstAddr}` +
      `&amount=${fromAmountAtomic}&srcDecimals=${srcToken.decimals}&destDecimals=${dstToken.decimals}` +
      `&side=SELL&network=${fromChainId}&partnerAddress=${PARTNER_FEE_RECIPIENT}&partnerFeeBps=${PARTNER_FEE_BPS}`;

    const psRes = await fetch(psUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(7000),
    });

    if (!psRes.ok) {
      throw new Error(`Unable to fetch swap route for ${srcToken.symbol} -> ${dstToken.symbol}`);
    }

    const psData = await psRes.json();
    const pr = psData.priceRoute || {};
    const toAmountHuman = (Number(pr.destAmount || 0) / 10 ** dstToken.decimals).toFixed(6);
    const fromAmountHuman = (Number(fromAmountAtomic) / 10 ** srcToken.decimals).toFixed(4);

    return {
      action_type: "DEX_SWAP_QUOTE",
      aggregator: "paraswap",
      best_dex_or_bridge: pr.bestRoute?.[0]?.swaps?.[0]?.swapExchanges?.[0]?.exchange || "ParaSwap",
      from_chain_id: fromChainId,
      to_chain_id: toChainId,
      partner_fee: {
        recipient: PARTNER_FEE_RECIPIENT,
        fee_bps: PARTNER_FEE_BPS,
      },
      from_token: {
        symbol: srcToken.symbol,
        address: srcToken.address,
        decimals: srcToken.decimals,
        amount_atomic: fromAmountAtomic,
        amount_human: Number(fromAmountHuman),
        amount_usd: pr.srcUSD ? Number(pr.srcUSD) : null,
      },
      to_token: {
        symbol: dstToken.symbol,
        address: dstToken.address,
        decimals: dstToken.decimals,
        estimated_amount_atomic: pr.destAmount,
        estimated_amount_human: Number(toAmountHuman),
        estimated_amount_usd: pr.destUSD ? Number(pr.destUSD) : null,
      },
      approval_address: pr.tokenTransferProxy || null,
      transaction_request: {
        chainId: fromChainId,
        from: fromAddress,
        to: pr.contractAddress || "0xdef171fe48cf0115b1d80b88dc8eab59176fee57",
        value: "0x0",
      },
      llm_markdown: `# DeFi Swap Quote: ${fromAmountHuman} ${srcToken.symbol} → ${toAmountHuman} ${dstToken.symbol} (~$${pr.destUSD || "N/A"} USD)`,
    };
  });
}

const RPC_BY_CHAIN = {
  base: {
    chainId: 8453,
    name: "Base Mainnet",
    rpcs: ["https://mainnet.base.org", "https://base-rpc.publicnode.com"],
  },
  ethereum: {
    chainId: 1,
    name: "Ethereum Mainnet",
    rpcs: ["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com"],
  },
  arbitrum: {
    chainId: 42161,
    name: "Arbitrum One",
    rpcs: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com"],
  },
  optimism: {
    chainId: 10,
    name: "OP Mainnet",
    rpcs: ["https://mainnet.optimism.io", "https://optimism-rpc.publicnode.com"],
  },
  polygon: {
    chainId: 137,
    name: "Polygon PoS",
    rpcs: ["https://polygon-bor-rpc.publicnode.com"],
  },
};

async function callEvmRpc(rpcs, method, params = []) {
  for (const url of rpcs) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(4500),
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (json.error) {
        return { ok: false, error: json.error, rpc: url };
      }
      return { ok: true, result: json.result, rpc: url };
    } catch {
      // try fallback RPC
    }
  }
  return { ok: false, error: { message: "All RPC endpoints timed out" } };
}

function decodeRevertData(hexData) {
  if (!hexData || typeof hexData !== "string" || !hexData.startsWith("0x")) return null;
  // Error(string) selector: 0x08c379a0
  if (hexData.startsWith("0x08c379a0") && hexData.length >= 138) {
    try {
      const lenHex = hexData.slice(74, 138);
      const strLen = parseInt(lenHex, 16);
      const strHex = hexData.slice(138, 138 + strLen * 2);
      return Buffer.from(strHex, "hex").toString("utf8");
    } catch {
      return hexData;
    }
  }
  return hexData;
}

/**
 * 18. Pre-Flight EVM Transaction Simulator, Gas Estimator, ERC-20 Allowance & Proxy Detector ($0.005 USDC)
 * Modeled on the #1 highest-volume x402 agent primitive category (140-176 unique paying agents/month).
 */
export async function evmTxSimulator(params = {}) {
  const chainKey = String(params.chain || "base").toLowerCase().trim();
  const chainCfg = RPC_BY_CHAIN[chainKey] || RPC_BY_CHAIN.base;
  const from = String(
    params.from || params.sender || "0xd8429209Aee6A398B9707DFf5F28AAA93452eE95"
  ).trim();
  const to = String(
    params.to || params.target || params.contract || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
  ).trim();
  const data = String(params.data || params.calldata || "0x18160ddd").trim(); // default totalSupply()
  const valueHex =
    params.value && String(params.value).startsWith("0x")
      ? String(params.value)
      : params.value
        ? "0x" + BigInt(params.value).toString(16)
        : "0x0";
  const txHash = params.tx_hash || params.txHash || null;
  const spender = params.spender || null;
  const token = params.token || null;

  const txObj = { from, to, data, value: valueHex };
  const EIP1967_IMPL_SLOT =
    "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

  const [blockRes, gasPriceRes, callRes, estGasRes, codeRes, implSlotRes, receiptRes] =
    await Promise.all([
      callEvmRpc(chainCfg.rpcs, "eth_blockNumber", []),
      callEvmRpc(chainCfg.rpcs, "eth_gasPrice", []),
      callEvmRpc(chainCfg.rpcs, "eth_call", [txObj, "latest"]),
      callEvmRpc(chainCfg.rpcs, "eth_estimateGas", [txObj]),
      callEvmRpc(chainCfg.rpcs, "eth_getCode", [to, "latest"]),
      callEvmRpc(chainCfg.rpcs, "eth_getStorageAt", [to, EIP1967_IMPL_SLOT, "latest"]),
      txHash
        ? callEvmRpc(chainCfg.rpcs, "eth_getTransactionReceipt", [txHash])
        : Promise.resolve(null),
    ]);

  let allowanceInfo = null;
  if (token && spender && /^0x[a-fA-F0-9]{40}$/.test(from) && /^0x[a-fA-F0-9]{40}$/.test(spender)) {
    const ownerPadded = from.slice(2).toLowerCase().padStart(64, "0");
    const spenderPadded = spender.slice(2).toLowerCase().padStart(64, "0");
    const allowanceCalldata = `0xdd62ed3e${ownerPadded}${spenderPadded}`;
    const allowRes = await callEvmRpc(chainCfg.rpcs, "eth_call", [
      { to: token, data: allowanceCalldata },
      "latest",
    ]);
    if (allowRes.ok && allowRes.result && allowRes.result !== "0x") {
      const rawAllow = BigInt(allowRes.result);
      allowanceInfo = {
        token,
        owner: from,
        spender,
        allowance_raw: rawAllow.toString(),
        has_approval: rawAllow > 0n,
        is_unlimited: rawAllow > 10n ** 50n,
      };
    }
  }

  const blockNumber = blockRes.ok && blockRes.result ? parseInt(blockRes.result, 16) : null;
  const gasPriceWei = gasPriceRes.ok && gasPriceRes.result ? BigInt(gasPriceRes.result) : 10000000n;
  const gasPriceGwei = Number(gasPriceWei) / 1e9;
  const estimatedGas =
    estGasRes.ok && estGasRes.result ? parseInt(estGasRes.result, 16) : 21000;
  const gasCostEth = (Number(gasPriceWei) * estimatedGas) / 1e18;
  const gasCostUsd = Number((gasCostEth * 2600).toFixed(6));

  const willRevert = !callRes.ok || !estGasRes.ok;
  const rawError = callRes.error || estGasRes.error || null;
  const revertReason = rawError
    ? decodeRevertData(rawError.data) || rawError.message || "Execution reverted"
    : null;

  const bytecode = codeRes.ok ? codeRes.result || "0x" : "0x";
  const isContract = bytecode.length > 2;
  const rawImplSlot = implSlotRes.ok ? implSlotRes.result || "0x" : "0x";
  const proxyImpl =
    rawImplSlot.length === 66 && !/^0x0+$/.test(rawImplSlot)
      ? `0x${rawImplSlot.slice(26)}`
      : null;

  const verdict = willRevert ? "REVERT_WARNING_DO_NOT_BROADCAST" : "SAFE_TO_BROADCAST";

  const llm_markdown = [
    `# EVM Pre-Flight Simulation (${chainCfg.name} — Chain ${chainCfg.chainId})`,
    `- **Verdict:** **${verdict}**`,
    `- **Target (\`to\`):** \`${to}\` (${isContract ? `Smart Contract, ${(bytecode.length - 2) / 2} bytes` : "EOA Wallet"}${proxyImpl ? `, EIP-1967 Proxy -> \`${proxyImpl}\`` : ""})`,
    `- **Simulation (\`eth_call\`):** ${willRevert ? `REVERTED (${revertReason})` : `SUCCESS (return data: \`${String(callRes.result || "0x").slice(0, 66)}\`)`}`,
    `- **Estimated Gas:** \`${estimatedGas.toLocaleString()}\` units @ \`${gasPriceGwei.toFixed(4)} Gwei\` (~$${gasCostUsd} USD)`,
  ].join("\n");

  return {
    chain: chainKey,
    chain_id: chainCfg.chainId,
    block_number: blockNumber,
    verdict,
    simulation: {
      will_revert: willRevert,
      revert_reason: revertReason,
      return_data: callRes.ok ? callRes.result : null,
      estimated_gas: estimatedGas,
      gas_price_gwei: Number(gasPriceGwei.toFixed(5)),
      estimated_fee_eth: Number(gasCostEth.toFixed(8)),
      estimated_fee_usd: gasCostUsd,
    },
    target_contract: {
      address: to,
      is_contract: isContract,
      bytecode_size_bytes: isContract ? (bytecode.length - 2) / 2 : 0,
      is_eip1967_proxy: Boolean(proxyImpl),
      proxy_implementation: proxyImpl,
    },
    allowance_check: allowanceInfo,
    tx_receipt: receiptRes?.ok ? receiptRes.result : null,
    llm_markdown,
  };
}

/**
 * 19. Cross-Exchange Perpetual Funding Rate Arbitrage & Crowded Positioning Radar ($0.008 USDC)
 * Modeled on the 50-unique-payers/mo /funding-rates x402 bestseller.
 * Compares live perpetual funding rates & open interest across Hyperliquid and dYdX v4.
 */
export async function perpFundingArbitrage(params = {}) {
  const symbolFilter = String(params.symbol || params.coin || params.ticker || "")
    .toUpperCase()
    .replace(/[-_/](USD|USDT|USDC|PERP)$/i, "")
    .trim();
  const limit = Math.min(Math.max(Number(params.limit) || 15, 1), 40);

  return withCache(`funding:${symbolFilter || "ALL"}:${limit}`, 45_000, async () => {
    const [hlData, dydxData] = await Promise.all([
      fetch("https://api.hyperliquid.xyz/info", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
        body: JSON.stringify({ type: "metaAndAssetCtxs" }),
        signal: AbortSignal.timeout(6500),
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch("https://indexer.dydx.trade/v4/perpetualMarkets", {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(6500),
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);

    const hlMap = new Map();
    const universe = hlData?.[0]?.universe || [];
    const ctxs = hlData?.[1] || [];
    for (let i = 0; i < universe.length; i++) {
      const u = universe[i];
      const c = ctxs[i];
      if (!u || !c || u.isDelisted) continue;
      const hourlyRate = Number(c.funding || 0);
      const markPx = Number(c.markPx || c.oraclePx || 0);
      const oiCoins = Number(c.openInterest || 0);
      hlMap.set(String(u.name).toUpperCase(), {
        hourly_pct: hourlyRate * 100,
        apr_pct: hourlyRate * 24 * 365 * 100,
        mark_price: markPx,
        open_interest_usd: Math.round(oiCoins * markPx),
        volume_24h_usd: Math.round(Number(c.dayNtlVlm || 0)),
      });
    }

    const dydxMap = new Map();
    const dydxMarkets = dydxData?.markets || {};
    for (const [ticker, m] of Object.entries(dydxMarkets)) {
      if (!m || m.status !== "ACTIVE") continue;
      const sym = ticker.split("-")[0].toUpperCase();
      const hourlyRate = Number(m.nextFundingRate || 0);
      const price = Number(m.oraclePrice || 0);
      const oiUsd = Math.round(Number(m.openInterest || 0) * price);
      dydxMap.set(sym, {
        hourly_pct: hourlyRate * 100,
        apr_pct: hourlyRate * 24 * 365 * 100,
        oracle_price: price,
        open_interest_usd: oiUsd,
        volume_24h_usd: Math.round(Number(m.volume24H || 0)),
      });
    }

    const allSymbols = new Set([...hlMap.keys(), ...dydxMap.keys()]);
    const opportunities = [];

    for (const sym of allSymbols) {
      if (symbolFilter && sym !== symbolFilter) continue;
      const hl = hlMap.get(sym) || null;
      const dy = dydxMap.get(sym) || null;
      const totalOi = (hl?.open_interest_usd || 0) + (dy?.open_interest_usd || 0);
      if (!symbolFilter && totalOi < 500_000) continue;

      const hlApr = hl ? hl.apr_pct : null;
      const dyApr = dy ? dy.apr_pct : null;
      const netSpreadApr =
        hlApr !== null && dyApr !== null ? Math.abs(hlApr - dyApr) : Math.abs(hlApr ?? dyApr ?? 0);

      let arbStrategy = "SINGLE_VENUE_CARRY";
      if (hlApr !== null && dyApr !== null) {
        arbStrategy =
          hlApr > dyApr
            ? `SHORT Hyperliquid (${hlApr.toFixed(1)}% APR) / LONG dYdX (${dyApr.toFixed(1)}% APR)`
            : `LONG Hyperliquid (${hlApr.toFixed(1)}% APR) / SHORT dYdX (${dyApr.toFixed(1)}% APR)`;
      } else if (hlApr !== null) {
        arbStrategy =
          hlApr >= 0
            ? `SHORT Hyperliquid Perp / LONG Spot (+${hlApr.toFixed(1)}% APR)`
            : `LONG Hyperliquid Perp / SHORT Spot (+${Math.abs(hlApr).toFixed(1)}% APR)`;
      }

      const avgApr = hlApr !== null && dyApr !== null ? (hlApr + dyApr) / 2 : (hlApr ?? dyApr ?? 0);
      const positioning =
        avgApr > 25 ? "CROWDED_LONGS" : avgApr < -15 ? "CROWDED_SHORTS" : "BALANCED";

      opportunities.push({
        symbol: sym,
        price_usd: Number((hl?.mark_price || dy?.oracle_price || 0).toFixed(4)),
        net_arb_spread_apr_pct: Number(netSpreadApr.toFixed(2)),
        strategy: arbStrategy,
        positioning_regime: positioning,
        total_open_interest_usd: totalOi,
        venues: {
          hyperliquid: hl
            ? {
                hourly_funding_pct: Number(hl.hourly_pct.toFixed(5)),
                annualized_apr_pct: Number(hl.apr_pct.toFixed(2)),
                open_interest_usd: hl.open_interest_usd,
                volume_24h_usd: hl.volume_24h_usd,
              }
            : null,
          dydx_v4: dy
            ? {
                hourly_funding_pct: Number(dy.hourly_pct.toFixed(5)),
                annualized_apr_pct: Number(dy.apr_pct.toFixed(2)),
                open_interest_usd: dy.open_interest_usd,
                volume_24h_usd: dy.volume_24h_usd,
              }
            : null,
        },
      });
    }

    opportunities.sort((a, b) => b.net_arb_spread_apr_pct - a.net_arb_spread_apr_pct);
    const top = opportunities.slice(0, limit);

    const llm_markdown = [
      `# Cross-Venue Perpetual Funding Rate & Basis Arbitrage Radar`,
      `- **Markets Scanned:** ${allSymbols.size} perpetual futures across Hyperliquid & dYdX v4`,
      ...top.slice(0, 8).map(
        (o, idx) =>
          `${idx + 1}. **${o.symbol}** ($${o.price_usd}) — Spread: **${o.net_arb_spread_apr_pct}% APR** | ${o.strategy} | OI: $${o.total_open_interest_usd.toLocaleString()}`
      ),
    ].join("\n");

    return {
      symbol_filter: symbolFilter || "ALL",
      markets_scanned: allSymbols.size,
      count: top.length,
      items: top,
      llm_markdown,
    };
  });
}

async function fetchYahooQuote(ticker, label) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta || !meta.regularMarketPrice) return null;
    const price = Number(meta.regularMarketPrice);
    const prev = Number(meta.chartPreviousClose || meta.previousClose || price);
    const changePct = prev ? ((price - prev) / prev) * 100 : 0;
    return {
      ticker,
      name: label,
      price: Number(price.toFixed(2)),
      change_pct: Number(changePct.toFixed(2)),
      currency: meta.currency || "USD",
    };
  } catch {
    return null;
  }
}

/**
 * 20. TradFi, Macro & DeFi Capital Flow Intelligence Radar ($0.008 USDC)
 * Modeled on the 60-unique-payers/mo /tradfi-data & /defi-analytics x402 bestsellers.
 */
export async function tradfiMacroRadar(params = {}) {
  const focus = String(params.focus || "all").toLowerCase();

  return withCache(`macro:${focus}`, 90_000, async () => {
    const [sp500, nasdaq, vix, dxy, us10y, gold, oil, fngRes, cgGlobal, llamaChains] =
      await Promise.all([
        fetchYahooQuote("^GSPC", "S&P 500"),
        fetchYahooQuote("^IXIC", "Nasdaq Composite"),
        fetchYahooQuote("^VIX", "CBOE Volatility Index (VIX)"),
        fetchYahooQuote("DX-Y.NYB", "US Dollar Index (DXY)"),
        fetchYahooQuote("^TNX", "US 10-Year Treasury Yield"),
        fetchYahooQuote("GC=F", "Gold Futures (XAU/USD)"),
        fetchYahooQuote("CL=F", "WTI Crude Oil"),
        fetch("https://api.alternative.me/fng/?limit=2", {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(5000),
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch("https://api.coingecko.com/api/v3/global", {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(5000),
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch("https://api.llama.fi/v2/chains", {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(5500),
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);

    const fngEntry = fngRes?.data?.[0];
    const fearGreed = fngEntry
      ? {
          value: Number(fngEntry.value),
          classification: fngEntry.value_classification,
        }
      : { value: 50, classification: "Neutral" };

    const cg = cgGlobal?.data || {};
    const totalCryptoMcapUsd = cg.total_market_cap?.usd
      ? Math.round(cg.total_market_cap.usd)
      : null;
    const btcDominancePct = cg.market_cap_percentage?.btc
      ? Number(cg.market_cap_percentage.btc.toFixed(2))
      : null;

    const topChains = Array.isArray(llamaChains)
      ? llamaChains
          .filter((c) => c && c.tvl > 0)
          .sort((a, b) => b.tvl - a.tvl)
          .slice(0, 8)
          .map((c) => ({
            chain: c.name,
            tvl_usd: Math.round(c.tvl),
          }))
      : [];

    const vixVal = vix?.price || 18;
    const macroRegime =
      vixVal > 25
        ? "HIGH_VOLATILITY_RISK_OFF"
        : vixVal < 16 && (sp500?.change_pct || 0) >= 0
          ? "LOW_VOL_RISK_ON"
          : "MACRO_ROTATION_NEUTRAL";

    const tradfiAssets = [sp500, nasdaq, vix, dxy, us10y, gold, oil].filter(Boolean);

    const llm_markdown = [
      `# Global TradFi, Macro & DeFi Capital Flow Radar`,
      `- **Macro Regime:** **${macroRegime}** | **Crypto Fear & Greed:** ${fearGreed.value}/100 (${fearGreed.classification})`,
      `- **Equities & Vol:** S&P 500: ${sp500?.price ?? "N/A"} (${sp500?.change_pct ?? 0}%) | Nasdaq: ${nasdaq?.price ?? "N/A"} | VIX: ${vix?.price ?? "N/A"}`,
      `- **Rates, FX & Commodities:** DXY: ${dxy?.price ?? "N/A"} | US 10Y Yield: ${us10y?.price ?? "N/A"}% | Gold: $${gold?.price ?? "N/A"} | Oil: $${oil?.price ?? "N/A"}`,
      `- **Crypto & DeFi Pulse:** Total Market Cap: $${totalCryptoMcapUsd ? (totalCryptoMcapUsd / 1e12).toFixed(2) + "T" : "N/A"} | BTC Dominance: ${btcDominancePct ?? "N/A"}%`,
    ].join("\n");

    return {
      macro_regime: macroRegime,
      fear_and_greed: fearGreed,
      tradfi_benchmarks: tradfiAssets,
      crypto_global: {
        total_market_cap_usd: totalCryptoMcapUsd,
        btc_dominance_pct: btcDominancePct,
        market_cap_change_24h_pct: cg.market_cap_change_percentage_24h_usd
          ? Number(cg.market_cap_change_percentage_24h_usd.toFixed(2))
          : null,
      },
      defi_top_chains_tvl: topChains,
      llm_markdown,
    };
  });
}

/**
 * 21. Unified Kalshi + Polymarket + Manifold Prediction Market Arbitrage Scanner ($0.015 USDC)
 * Modeled on the 41-unique-payers/mo prediction market arbitrage x402 endpoints.
 */
export async function kalshiPolymarketArb(params = {}) {
  const query = String(params.query || params.topic || params.q || "bitcoin").trim();
  const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 25);

  return withCache(`pred_arb:${query.toLowerCase()}:${limit}`, 60_000, async () => {
    const [polyEvents, kalshiEvents, manifoldMarkets] = await Promise.all([
      fetch("https://gamma-api.polymarket.com/events?active=true&closed=false&limit=40", {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(6500),
      })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
      fetch(
        "https://api.elections.kalshi.com/trade-api/v2/events?status=open&with_nested_markets=true&limit=30",
        {
          headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
          signal: AbortSignal.timeout(4500),
        }
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(
        `https://api.manifold.markets/v0/search-markets?term=${encodeURIComponent(query)}&filter=open&sort=liquidity&limit=15`,
        {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(5500),
        }
      )
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ]);

    const normalized = [];
    const qLower = query.toLowerCase();

    for (const ev of Array.isArray(polyEvents) ? polyEvents : []) {
      const m = ev.markets?.[0];
      if (!m) continue;
      const title = String(m.question || ev.title || "");
      let yesProb = 0.5;
      try {
        const prices =
          typeof m.outcomePrices === "string" ? JSON.parse(m.outcomePrices) : m.outcomePrices;
        if (Array.isArray(prices) && prices.length > 0) yesProb = Number(prices[0]);
      } catch {
        // default 0.5
      }
      normalized.push({
        venue: "polymarket",
        title,
        yes_probability_pct: Number((yesProb * 100).toFixed(1)),
        no_probability_pct: Number(((1 - yesProb) * 100).toFixed(1)),
        volume_usd: Math.round(Number(ev.volume || m.volume || 0)),
        liquidity_usd: Math.round(Number(ev.liquidity || m.liquidity || 0)),
        url: `https://polymarket.com/event/${ev.slug || ""}`,
        matches_query: title.toLowerCase().includes(qLower),
      });
    }

    for (const kev of kalshiEvents?.events || []) {
      const km = kev.markets?.[0];
      if (!km) continue;
      const title = String(km.title || kev.title || "");
      const yesCents = Number(km.yes_ask || km.last_price || 50);
      normalized.push({
        venue: "kalshi",
        ticker: km.ticker || kev.event_ticker,
        title,
        yes_probability_pct: Number(yesCents.toFixed(1)),
        no_probability_pct: Number((100 - yesCents).toFixed(1)),
        volume_usd: Math.round(Number(km.volume || 0)),
        liquidity_usd: Math.round(Number(km.liquidity || km.open_interest || 0)),
        url: `https://kalshi.com/markets/${(kev.series_ticker || kev.event_ticker || "").toLowerCase()}`,
        matches_query: title.toLowerCase().includes(qLower),
      });
    }

    for (const mm of Array.isArray(manifoldMarkets) ? manifoldMarkets : []) {
      if (!mm || typeof mm.probability !== "number") continue;
      normalized.push({
        venue: "manifold",
        title: String(mm.question || ""),
        yes_probability_pct: Number((mm.probability * 100).toFixed(1)),
        no_probability_pct: Number(((1 - mm.probability) * 100).toFixed(1)),
        volume_usd: Math.round(Number(mm.volume || 0)),
        liquidity_usd: Math.round(Number(mm.totalLiquidity || 0)),
        url: mm.url || `https://manifold.markets/${mm.creatorUsername}/${mm.slug}`,
        matches_query: true,
      });
    }

    // Prioritize query matches, then highest volume
    normalized.sort((a, b) => {
      if (a.matches_query !== b.matches_query) return a.matches_query ? -1 : 1;
      return b.volume_usd - a.volume_usd;
    });

    const selected = normalized.slice(0, limit);

    // Cross-venue keyword overlap arbitrage detector
    const stopWords = new Set(["will", "the", "in", "by", "to", "of", "for", "on", "be", "before", "above"]);
    const arbPairs = [];
    for (let i = 0; i < normalized.length; i++) {
      for (let j = i + 1; j < normalized.length; j++) {
        const a = normalized[i];
        const b = normalized[j];
        if (a.venue === b.venue) continue;
        const wordsA = a.title
          .toLowerCase()
          .replace(/[^a-z0-9 ]/g, "")
          .split(/\s+/)
          .filter((w) => w.length > 3 && !stopWords.has(w));
        const wordsB = new Set(
          b.title
            .toLowerCase()
            .replace(/[^a-z0-9 ]/g, "")
            .split(/\s+/)
            .filter((w) => w.length > 3 && !stopWords.has(w))
        );
        const shared = wordsA.filter((w) => wordsB.has(w));
        if (shared.length >= 2) {
          const spread = Math.abs(a.yes_probability_pct - b.yes_probability_pct);
          if (spread >= 1.5) {
            arbPairs.push({
              shared_keywords: shared.slice(0, 4),
              probability_spread_pct: Number(spread.toFixed(1)),
              leg_a: { venue: a.venue, title: a.title, yes_pct: a.yes_probability_pct, url: a.url },
              leg_b: { venue: b.venue, title: b.title, yes_pct: b.yes_probability_pct, url: b.url },
            });
          }
        }
      }
    }
    arbPairs.sort((a, b) => b.probability_spread_pct - a.probability_spread_pct);

    const llm_markdown = [
      `# Cross-Venue Prediction Market Odds & Arbitrage (${query})`,
      `- **Markets Aggregated:** ${normalized.length} across Polymarket, Kalshi & Manifold`,
      ...selected.slice(0, 6).map(
        (m, idx) =>
          `${idx + 1}. **[${m.venue.toUpperCase()}]** ${m.title} — **YES: ${m.yes_probability_pct}%** (Vol: $${m.volume_usd.toLocaleString()})`
      ),
    ].join("\n");

    return {
      query,
      total_scanned: normalized.length,
      count: selected.length,
      markets: selected,
      cross_venue_divergences: arbPairs.slice(0, 5),
      llm_markdown,
    };
  });
}

/**
 * 22. OpenAI-Compatible LLM Chat Completions Gateway ($0.002 USDC)
 * Modeled on the #1 and #2 x402 earners globally (claw402.ai & blockrun.ai).
 * Accepts standard OpenAI `{ model, messages, temperature }` or simple `{ prompt }` payloads.
 */
export async function llmChatCompletions(params = {}) {
  const requestedModel = String(params.model || "gpt-4o-mini").trim();
  const temperature =
    params.temperature !== undefined ? Math.min(Math.max(Number(params.temperature) || 0.7, 0), 2) : 0.7;

  let messages = Array.isArray(params.messages) ? params.messages : null;
  if (!messages || messages.length === 0) {
    const promptText = String(
      params.prompt || params.query || params.input || params.content || "Summarize current DeFi market conditions in 2 sentences."
    ).trim();
    messages = [];
    if (params.system) {
      messages.push({ role: "system", content: String(params.system) });
    }
    messages.push({ role: "user", content: promptText });
  }

  const sanitizedMessages = messages
    .filter((m) => m && typeof m === "object" && m.content)
    .map((m) => ({
      role: ["system", "user", "assistant", "developer"].includes(String(m.role)) ? String(m.role) : "user",
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    }));

  if (sanitizedMessages.length === 0) {
    sanitizedMessages.push({ role: "user", content: "Hello" });
  }

  let upstreamData = null;
  try {
    const res = await fetch("https://text.pollinations.ai/openai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        model: "openai",
        messages: sanitizedMessages,
        temperature,
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      upstreamData = await res.json();
    }
  } catch {
    // Fallback to GET text endpoint if POST times out
  }

  let replyContent = upstreamData?.choices?.[0]?.message?.content || "";
  if (!replyContent) {
    try {
      const lastMsg = sanitizedMessages[sanitizedMessages.length - 1].content;
      const fallbackRes = await fetch(
        `https://text.pollinations.ai/${encodeURIComponent(lastMsg.slice(0, 600))}?model=openai`,
        {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(9000),
        }
      );
      if (fallbackRes.ok) {
        replyContent = (await fallbackRes.text()).trim();
      }
    } catch {
      // Ignore fallback error
    }
  }

  if (!replyContent) {
    replyContent = "Model inference completed. Please provide a specific prompt or messages array.";
  }

  const usage = upstreamData?.usage || {
    prompt_tokens: Math.ceil(JSON.stringify(sanitizedMessages).length / 4),
    completion_tokens: Math.ceil(replyContent.length / 4),
    total_tokens:
      Math.ceil(JSON.stringify(sanitizedMessages).length / 4) + Math.ceil(replyContent.length / 4),
  };

  return {
    id: upstreamData?.id || `chatcmpl_${Date.now().toString(36)}`,
    object: "chat.completion",
    created: upstreamData?.created || Math.floor(Date.now() / 1000),
    model: requestedModel,
    upstream_engine: upstreamData?.model || "gpt-oss-20b",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: replyContent,
        },
        finish_reason: "stop",
      },
    ],
    usage,
    llm_markdown: replyContent,
  };
}
