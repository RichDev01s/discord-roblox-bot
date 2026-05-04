export interface RobloxServer {
  id: string;
  maxPlayers: number;
  playing: number;
  fps: number;
  ping: number;
}

export interface ServerResult {
  server: RobloxServer;
  exact: boolean;
  requested: number;
}

interface RobloxServerListResponse {
  data: RobloxServer[];
  nextPageCursor?: string;
}

const MAX_PAGES = 5;
const RETRY_DELAY_MS = 1500;

async function fetchPage(
  placeId: string,
  cursor?: string
): Promise<RobloxServerListResponse> {
  const url =
    `https://games.roblox.com/v1/games/${placeId}/servers/Public?sortOrder=Asc&excludeFullGames=true&limit=100` +
    (cursor ? `&cursor=${cursor}` : "");

  const attempt = async () => {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    });
    if (res.status === 429) return null;
    if (!res.ok) throw new Error(`Roblox API error: ${res.status} ${res.statusText}`);
    return (await res.json()) as RobloxServerListResponse;
  };

  let result = await attempt();
  if (!result) {
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    result = await attempt();
    if (!result) throw new Error("Roblox API rate limited (429). Intenta de nuevo.");
  }
  return result;
}

export async function findBestServer(
  placeId: string,
  maxPlayers: number = 1
): Promise<ServerResult | null> {
  let cursor: string | undefined;
  let bestSoFar: RobloxServer | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const body = await fetchPage(placeId, cursor);

    if (body.data.length === 0) break;

    // Check for exact match first
    const exact = body.data.find((s) => s.playing <= maxPlayers);
    if (exact) {
      return { server: exact, exact: true, requested: maxPlayers };
    }

    // Track the server with fewest players as fallback
    const pageBest = body.data.reduce((a, b) => (a.playing < b.playing ? a : b));
    if (!bestSoFar || pageBest.playing < bestSoFar.playing) {
      bestSoFar = pageBest;
    }

    // Since results are sorted ascending, if the first server on this page
    // has more players than bestSoFar, no later pages will be better
    if (body.data[0].playing >= (bestSoFar?.playing ?? Infinity)) {
      break;
    }

    if (!body.nextPageCursor) break;
    cursor = body.nextPageCursor;
  }

  if (bestSoFar) {
    return { server: bestSoFar, exact: false, requested: maxPlayers };
  }

  return null;
}

export async function getGameThumbnail(placeId: string): Promise<string | null> {
  try {
    const uRes = await fetch(
      `https://apis.roblox.com/universes/v1/places/${placeId}/universe`
    );
    if (!uRes.ok) return null;
    const { universeId } = (await uRes.json()) as { universeId: number };

    const tRes = await fetch(
      `https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=512x512&format=Png&isCircular=false`
    );
    if (!tRes.ok) return null;
    const tBody = (await tRes.json()) as { data: { imageUrl: string }[] };
    return tBody.data?.[0]?.imageUrl ?? null;
  } catch {
    return null;
  }
}

export function buildJoinLink(placeId: string, serverId: string): string {
  return `https://www.roblox.com/games/start?placeId=${placeId}&gameInstanceId=${serverId}`;
}

export function buildDeepLink(placeId: string, serverId: string): string {
  return `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${serverId}`;
}
