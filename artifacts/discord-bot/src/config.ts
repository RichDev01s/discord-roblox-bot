export interface GameConfig {
  name: string;
  placeId: string;
  command: string;
  emoji: string;
}

export const GAMES: Record<string, GameConfig> = {
  sab: {
    name: "Steal a Brainrot",
    placeId: "109983668079237",
    command: ".gen sab",
    emoji: "🧠",
  },
  blox: {
    name: "Blox Fruits",
    placeId: "2753915549",
    command: ".gen blox",
    emoji: "🍎",
  },
  sailor: {
    name: "Sailor Piece",
    placeId: "77747658251236",
    command: ".gen sailor",
    emoji: "⚓",
  },
  tsunami: {
    name: "Escape Tsunami For Brainrots!",
    placeId: "131623223084840",
    command: ".gen tsunami",
    emoji: "🌊",
  },
  kick: {
    name: "Kick a Lucky Block",
    placeId: "89469502395769",
    command: ".gen kick",
    emoji: "🎲",
  },
};

export const ALLOWED_CHANNEL_NAMES = ["ɢᴇɴ-ꜱᴇʀᴠᴇʀ", "ᴄᴏᴍᴍᴀɴᴅꜱ"];
export const TIMEOUT_DURATION_MS = 5 * 60 * 1000;
