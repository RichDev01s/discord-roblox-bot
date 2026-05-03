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

export async function findEmptyServers(
  placeId: string,
  maxPlayers: number = 1
): Promise<RobloxServer[]> {
  const url = `https://games.roblox.com/v1/games/${placeId}/servers/Public?sortOrder=Asc&excludeFullGames=true&limit=100`;

  const res = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!res.ok) {
    throw new Error(`Roblox API error: ${res.status} ${res.statusText}`);
  }

  const body = (await res.json()) as RobloxServerListResponse;

  return body.data.filter((s) => s.playing <= maxPlayers);
}

export function buildJoinLink(placeId: string, serverId: string): string {
  return `https://www.roblox.com/games/start?placeId=${placeId}&gameInstanceId=${serverId}`;
}

export function buildDeepLink(placeId: string, serverId: string): string {
  return `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${serverId}`;
}
