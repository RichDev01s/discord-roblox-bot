export async function findBestServer(placeId, targetPlayers = 0) {
  const headers = {
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  };

  let cursor;
  let bestServer = null;
  let pages = 0;

  while (pages < 5) {
    const url =
      `https://games.roblox.com/v1/games/${placeId}/servers/Public?sortOrder=Asc&limit=100` +
      (cursor ? `&cursor=${cursor}` : "");

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Roblox API error: ${res.status} ${res.statusText}`);

    const body = await res.json();
    if (!body.data || body.data.length === 0) break;

    for (const s of body.data) {
      if (s.playing === targetPlayers) {
        return { server: s, requestedPlayers: targetPlayers, foundPlayers: s.playing, exactMatch: true };
      }
      if (s.playing <= targetPlayers + 1 && (bestServer === null || s.playing < bestServer.playing)) {
        bestServer = s;
      }
    }

    if (!body.nextPageCursor) break;
    cursor = body.nextPageCursor;
    pages++;
  }

  if (bestServer) {
    return {
      server: bestServer,
      requestedPlayers: targetPlayers,
      foundPlayers: bestServer.playing,
      exactMatch: bestServer.playing === targetPlayers,
    };
  }

  return null;
}

export function buildWebLink(placeId, serverId) {
  return `https://www.roblox.com/games/${placeId}?gameInstanceId=${serverId}`;
}

export function buildDeepLink(placeId, serverId) {
  return `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${serverId}`;
}

export async function fetchGameThumbnail(placeId) {
  try {
    const univRes = await fetch(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`, {
      headers: { "Accept": "application/json" },
    });
    if (!univRes.ok) return { icon: null, image: null };

    const { universeId } = await univRes.json();

    const [iconRes, imgRes] = await Promise.all([
      fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&returnPolicy=PlaceHolder&size=512x512&format=Png&isCircular=false`),
      fetch(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${universeId}&thumbnailType=GameThumbnail&size=768x432&format=Png&countPerUniverse=1`),
    ]);

    const iconData = iconRes.ok ? await iconRes.json() : null;
    const imgData = imgRes.ok ? await imgRes.json() : null;

    return {
      icon: iconData?.data?.[0]?.imageUrl ?? null,
      image: imgData?.data?.[0]?.thumbnails?.[0]?.imageUrl ?? null,
    };
  } catch {
    return { icon: null, image: null };
  }
}
