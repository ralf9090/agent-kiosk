/**
 * Real data extraction & security intelligence providers for Agent Kiosk:
 * 1. socialSearch: Live Reddit + HackerNews social discussions normalized for LLMs.
 * 2. mapsLeads: Accurate city-scoped business lead finder with phone, website, address, and coordinates.
 * 3. webExtract: Clean HTML-to-Markdown web extractor with Prompt Injection trap detection.
 * 4. securityAudit: Live on-chain smart contract / token honeypot scanner (GoPlus + DexScreener) & URL phishing/injection auditor.
 */

const USER_AGENT = "AgentKiosk/2.0 (+https://agent-kiosk.vercel.app)";

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

  // Strip scripts, styles, svg, nav, footer
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // Convert headings, links, paragraphs, list items
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

  // Fetch directly first for speed and raw HTML injection inspection
  try {
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AgentKioskBot/2.0)",
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

  // Case A: EVM Smart Contract / Token Address (0x...)
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
    let riskScore = 0; // 0 (Safe) to 100 (Critical Scam)

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

  // Case B: URL Phishing & Prompt Injection Audit
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
