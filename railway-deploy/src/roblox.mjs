const MAX_PAGES = 5;
const RETRY_DELAY_MS = 1500;

async function fetchPage(placeId, cursor) {
  const url =
    `https://games.roblox.com/v1/games/${placeId}/servers/Public?sortOrder=Asc&excludeFullGames=true&limit=100` +
    (cursor ? `&cursor=${cursor}` : "");

  const attempt = async () => {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    });
    if (res.status === 429) return null;
    if (!res.ok) throw new Error(`Roblox API error: ${res.status} ${res.statusText}`);
    return res.json();
  };

  let result = await attempt();
  if (!result) {
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    result = await attempt();
    if (!result) throw new Error("Roblox API rate limited (429). Intenta de nuevo.");
  }
  return result;
}

export async function findBestServer(placeId, maxPlayers = 1) {
  let cursor;
  let bestSoFar = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const body = await fetchPage(placeId, cursor);

    if (!body.data || body.data.length === 0) break;

    const exact = body.data.find((s) => s.playing <= maxPlayers);
    if (exact) return { server: exact, exact: true, requested: maxPlayers };

    const pageBest = body.data.reduce((a, b) => (a.playing < b.playing ? a : b));
    if (!bestSoFar || pageBest.playing < bestSoFar.playing) {
      bestSoFar = pageBest;
    }

    if (body.data[0].playing >= (bestSoFar?.playing ?? Infinity)) break;
    if (!body.nextPageCursor) break;
    cursor = body.nextPageCursor;
  }

  if (bestSoFar) return { server: bestSoFar, exact: false, requested: maxPlayers };
  return null;
}

export async function getGameThumbnail(placeId) {
  try {
    const uRes = await fetch(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`);
    if (!uRes.ok) return null;
    const { universeId } = await uRes.json();

    const tRes = await fetch(
      `https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=512x512&format=Png&isCircular=false`
    );
    if (!tRes.ok) return null;
    const tBody = await tRes.json();
    return tBody.data?.[0]?.imageUrl ?? null;
  } catch {
    return null;
  }
}

export function buildJoinLink(placeId, serverId) {
  return `https://www.roblox.com/games/start?placeId=${placeId}&gameInstanceId=${serverId}`;
}

export function buildDeepLink(placeId, serverId) {
  return `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${serverId}`;
}
