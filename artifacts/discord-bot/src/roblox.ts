export interface RobloxServer {
  id: string;
  maxPlayers: number;
  playing: number;
  fps: number;
  ping: number;
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

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    const retry = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
      },
    });
    if (!retry.ok) {
      throw new Error(`Roblox API error: ${retry.status} ${retry.statusText}`);
    }
    return (await retry.json()) as RobloxServerListResponse;
  }

  if (!res.ok) {
    throw new Error(`Roblox API error: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as RobloxServerListResponse;
}

export async function findEmptyServers(
  placeId: string,
  maxPlayers: number = 1
): Promise<RobloxServer[]> {
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const body = await fetchPage(placeId, cursor);
    const matches = body.data.filter((s) => s.playing <= maxPlayers);

    if (matches.length > 0) {
      return matches;
    }

    if (!body.nextPageCursor) break;
    cursor = body.nextPageCursor;
  }

  return [];
}

export function buildJoinLink(placeId: string, serverId: string): string {
  return `https://www.roblox.com/games/start?placeId=${placeId}&gameInstanceId=${serverId}`;
}

export function buildDeepLink(placeId: string, serverId: string): string {
  return `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${serverId}`;
}
