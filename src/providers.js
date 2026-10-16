/**
 * Real data extraction providers for Agent Kiosk:
 * 1. socialSearch: Live Reddit + HackerNews social discussions normalized for LLMs.
 * 2. mapsLeads: Accurate city-scoped business lead finder with phone, website, address, and coordinates.
 */

const USER_AGENT = "AgentKiosk/1.0 (+https://x402.org)";

/**
 * Fetch live social media discussions (Reddit + HN) and return LLM-ready structured JSON.
 */
export async function socialSearch({ query, platform = "all", limit = 10 }) {
  if (!query || typeof query !== "string" || !query.trim()) {
    throw new Error("Missing required parameter: 'query'");
  }
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 25);
  const results = [];
  const tasks = [];

  // 1. Reddit live search
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

  // 2. Hacker News live search
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
 * Geocode a city/location string into a bounding box and center coordinates.
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
  const extent = feat.properties?.extent; // [minLon, maxLat, maxLon, minLat]
  let bbox = null;
  if (Array.isArray(extent) && extent.length === 4) {
    const [minLon, maxLat, maxLon, minLat] = extent;
    bbox = {
      south: Math.min(minLat, maxLat),
      west: Math.min(minLon, maxLon),
      north: Math.max(minLat, maxLat),
      east: Math.max(minLon, maxLon),
    };
  } else {
    // 0.08 degree (~8km) box around center
    bbox = {
      south: lat - 0.08,
      west: lon - 0.08,
      north: lat + 0.08,
      east: lon + 0.08,
    };
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
 * Fetch local business leads strictly inside the target city/location,
 * enriched with real phone numbers, websites, emails, and opening hours via Overpass + OSM.
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

  // 1. Fetch candidate POIs from Photon biased to the target city coordinates
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

  // 2. Batch enrich with Nominatim /lookup to extract phone, website, email, and opening_hours in ~200ms
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

  // Sort leads so entries with phone or website appear first
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
