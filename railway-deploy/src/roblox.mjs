export async function findEmptyServers(placeId, maxPlayers = 1) {
  const url = `https://games.roblox.com/v1/games/${placeId}/servers/Public?sortOrder=Asc&excludeFullGames=true&limit=100`;
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Roblox API error: ${res.status}`);
  const body = await res.json();
  return body.data.filter(s => s.playing <= maxPlayers);
}

export function buildJoinLink(placeId, serverId) {
  return `https://www.roblox.com/games/start?placeId=${placeId}&gameInstanceId=${serverId}`;
}
