import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextChannel,
} from "discord.js";
import { createServer } from "http";
import { GAMES, ALLOWED_CHANNEL_NAMES, ALLOWED_CHANNEL_IDS, TIMEOUT_DURATION_MS } from "./config.mjs";
import { findBestServer, buildJoinLink, buildDeepLink, getGameThumbnail } from "./roblox.mjs";

// ── Bot readiness state (used by health endpoint) ────────────────────────────
// botReady is a single boolean (conservative): any shard disconnect marks the
// whole bot as unavailable. For a single-shard bot (no ShardingManager) this
// is correct. In a multi-shard setup it would report global unhealthy on a
// single-shard disruption, which is acceptable for uptime monitoring purposes.
let botReady = false;
let botTag = null;
const startedAt = new Date().toISOString();

// ── Disconnect watchdog (per-shard) ──────────────────────────────────────────
// If a shard does not reconnect within this window, exit so Railway restarts it.
// Uses a Map keyed by shardId to handle multi-shard bots correctly.
const RECONNECT_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const shardWatchdogs = new Map();

function startReconnectWatchdog(shardId) {
  clearReconnectWatchdog(shardId);
  const timer = setTimeout(async () => {
    shardWatchdogs.delete(shardId);
    console.error(`💀 Shard ${shardId} no reconectó en ${RECONNECT_TIMEOUT_MS / 1000}s — saliendo para forzar reinicio.`);
    await sendWebhookAlert(`💀 **Bot sin reconectar** — \`${botTag ?? "discord-bot"}\` (shard ${shardId}) no reconectó en ${RECONNECT_TIMEOUT_MS / 1000}s. Forzando reinicio vía Railway ON_FAILURE.`);
    process.exit(1);
  }, RECONNECT_TIMEOUT_MS);
  shardWatchdogs.set(shardId, timer);
}

function clearReconnectWatchdog(shardId) {
  const timer = shardWatchdogs.get(shardId);
  if (timer) {
    clearTimeout(timer);
    shardWatchdogs.delete(shardId);
  }
}

// ── Discord webhook alerting ──────────────────────────────────────────────────
const ALERT_WEBHOOK_URL = process.env.DISCORD_ALERT_WEBHOOK_URL;

async function sendWebhookAlert(content) {
  if (!ALERT_WEBHOOK_URL) return;
  try {
    await fetch(ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch (err) {
    console.error("⚠️ Error enviando alerta webhook:", err.message);
  }
}

// ── Health check server (required by Railway & external monitors) ─────────────
const PORT = process.env.PORT || 3000;
createServer((_, res) => {
  if (botReady) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", bot: botTag, startedAt }));
  } else {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "unavailable", startedAt }));
  }
}).listen(PORT, () => {
  console.log(`🌐 Health server en puerto ${PORT}`);
});

const TOKEN = process.env.DISCORD_TOKEN?.trim();
if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN no configurado.");
  process.exit(1);
}

const COOLDOWN_MS = 60_000;
const cooldowns = new Map();
const lastBotReply = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once("clientReady", async () => {
  botReady = true;
  botTag = client.user?.tag;
  console.log(`✅ Bot conectado como: ${botTag}`);
  const permissions = 1376537029632n;
  const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${client.user?.id}&permissions=${permissions}&scope=bot`;
  console.log(`\n🔗 Link de invitación:\n${inviteUrl}\n`);
  await sendWebhookAlert(`✅ **Bot online** — \`${botTag}\` está activo y conectado a Discord.`);
});

// discord.js v14 uses shard-level events for gateway disconnect/reconnect
client.on("shardDisconnect", async (event, shardId) => {
  botReady = false;
  console.warn(`⚠️ Shard ${shardId} desconectado (code ${event.code}).`);
  await sendWebhookAlert(`⚠️ **Bot desconectado** — \`${botTag ?? "discord-bot"}\` (shard ${shardId}, code ${event.code}). Watchdog activo: forzará reinicio en ${RECONNECT_TIMEOUT_MS / 1000}s si no reconecta.`);
  startReconnectWatchdog(shardId);
});

client.on("shardReconnecting", (shardId) => {
  botReady = false;
  console.log(`🔄 Shard ${shardId} reconectando...`);
  // Keep watchdog running — cleared on shardReady or shardResume
});

// shardReady fires on initial connect AND on fresh-session reconnects (e.g. invalid session)
client.on("shardReady", async (shardId) => {
  clearReconnectWatchdog(shardId);
  const wasOffline = !botReady;
  botReady = true;
  console.log(`✅ Shard ${shardId} listo.`);
  if (wasOffline) {
    await sendWebhookAlert(`✅ **Bot reconectado** — \`${botTag ?? "discord-bot"}\` (shard ${shardId}) está de nuevo online (nueva sesión).`);
  }
});

// shardResume fires when an existing gateway session is successfully resumed
client.on("shardResume", async (shardId, replayedEvents) => {
  clearReconnectWatchdog(shardId);
  botReady = true;
  console.log(`✅ Shard ${shardId} resumido (${replayedEvents} eventos reproducidos).`);
  await sendWebhookAlert(`✅ **Bot reconectado** — \`${botTag ?? "discord-bot"}\` (shard ${shardId}) resumió sesión existente.`);
});

client.on("shardError", async (error, shardId) => {
  console.error(`❌ Shard ${shardId} error:`, error.message);
  await sendWebhookAlert(`❌ **Shard error** — \`${botTag ?? "discord-bot"}\` (shard ${shardId}): ${error.message}`);
});

// ── Graceful shutdown with alert ──────────────────────────────────────────────
async function shutdown(signal) {
  console.log(`🛑 ${signal} recibido, apagando...`);
  botReady = false;
  await sendWebhookAlert(`🛑 **Bot apagándose** — \`${botTag ?? "discord-bot"}\` recibió señal \`${signal}\`. Railway reiniciará si es un fallo.`);
  client.destroy();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

process.on("uncaughtException", async (err) => {
  console.error("💥 uncaughtException:", err);
  await sendWebhookAlert(`💥 **Error crítico** — \`${botTag ?? "discord-bot"}\` crasheó con: \`${err.message}\`. Railway reiniciará automáticamente.`);
  process.exit(1);
});

process.on("unhandledRejection", async (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error("💥 unhandledRejection:", msg);
  await sendWebhookAlert(`💥 **Promesa rechazada fatal** — \`${botTag ?? "discord-bot"}\`: \`${msg}\`. Railway reiniciará automáticamente.`);
  process.exit(1);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim().toLowerCase();

  const isGenCommand =
    content === ".gen info" ||
    Object.values(GAMES).some((g) => g.command === content);

  if (!isGenCommand) return;

  // ── Channel restriction ──────────────────────────────────────────────────
  if (message.channel instanceof TextChannel || message.channel.name) {
    const channelId   = message.channel.id;
    const channelName = message.channel.name;

    // ID-based check takes precedence when ALLOWED_CHANNEL_IDS is configured.
    const isAllowed = ALLOWED_CHANNEL_IDS.length > 0
      ? ALLOWED_CHANNEL_IDS.includes(channelId)
      : ALLOWED_CHANNEL_NAMES.includes(channelName);

    if (!isAllowed) {
      const allowedMentions = ALLOWED_CHANNEL_IDS.length > 0
        ? ALLOWED_CHANNEL_IDS.map((id) => `<#${id}>`).join(" o ")
        : ALLOWED_CHANNEL_NAMES.map((n) => `**#${n}**`).join(" o ");
      try {
        await message.member?.timeout(
          TIMEOUT_DURATION_MS,
          "Uso de comandos de gen fuera del canal permitido"
        );
        await message.reply(
          `🚫 Los comandos \`.gen\` solo se pueden usar en ${allowedMentions}.\n⏳ Has recibido un timeout de **5 minutos**.`
        );
      } catch {
        await message.reply(
          `🚫 Los comandos \`.gen\` solo se pueden usar en ${allowedMentions}.`
        );
      }
      return;
    }
  }

  // ── Cross-instance deduplication ─────────────────────────────────────────
  // Only one bot instance can delete this message — the first one wins.
  // The other instance (Replit or Railway) will fail here and skip.
  try {
    await message.delete();
  } catch {
    // Another bot instance already deleted this message — skip processing.
    return;
  }

  if (content === ".gen info") {
    await handleInfo(message);
    return;
  }

  const gameKey = Object.keys(GAMES).find((key) => content === GAMES[key].command);
  if (!gameKey) return;

  // ── Cooldown check ───────────────────────────────────────────────────────
  const now = Date.now();
  const lastUsed = cooldowns.get(message.author.id) ?? 0;
  const remaining = COOLDOWN_MS - (now - lastUsed);

  if (remaining > 0) {
    const seconds = Math.ceil(remaining / 1000);
    const cooldownMsg = await message.channel.send(
      `<@${message.author.id}> ⏳ Espera **${seconds}s** antes de volver a usar un comando.`
    );
    setTimeout(() => cooldownMsg.delete().catch(() => {}), 5000);
    return;
  }

  cooldowns.set(message.author.id, now);
  await handleGenServer(message, gameKey);
});

async function handleInfo(message) {
  const embed = new EmbedBuilder()
    .setTitle("📋 Comandos del Bot de Servidores Roblox")
    .setDescription(
      "Genera links de servidores con **0 o 1 jugadores**.\nLa info se envía directo a tus **DMs** 📬"
    )
    .setColor(0x5865f2)
    .addFields(
      Object.values(GAMES).map((game) => ({
        name: `${game.emoji} \`${game.command}\``,
        value: game.name,
        inline: true,
      }))
    )
    .addFields({ name: "ℹ️ `.gen info`", value: "Muestra este mensaje de ayuda", inline: true })
    .setFooter({ text: "Los servidores se buscan en tiempo real desde Roblox" })
    .setTimestamp();

  await message.channel.send({ embeds: [embed] });
}

async function handleGenServer(message, gameKey) {
  const game = GAMES[gameKey];
  const userId = message.author.id;

  const previousReply = lastBotReply.get(userId);
  if (previousReply) {
    try { await previousReply.delete(); } catch {}
    lastBotReply.delete(userId);
  }

  const loadingMsg = await message.channel.send(
    `<@${userId}> ${game.emoji} Buscando servidor vacío en **${game.name}**...`
  );
  lastBotReply.set(userId, loadingMsg);

  try {
    const [result, thumbnail] = await Promise.all([
      findBestServer(game.placeId, 1),
      getGameThumbnail(game.placeId),
    ]);

    if (!result) {
      const embed = new EmbedBuilder()
        .setTitle(`${game.emoji} ${game.name}`)
        .setDescription(
          "❌ No se encontraron servidores disponibles en este momento.\n\nIntenta de nuevo en unos segundos."
        )
        .setColor(0xed4245)
        .setTimestamp();
      await loadingMsg.edit({ content: "", embeds: [embed] });
      return;
    }

    const { server, exact } = result;
    const joinLink = buildJoinLink(game.placeId, server.id);
    const deepLink = buildDeepLink(game.placeId, server.id);
    const slotsLibres = server.maxPlayers - server.playing;

    let playersText;
    if (server.playing === 0) {
      playersText = "🟢 **0 jugadores** (completamente vacío)";
    } else if (server.playing === 1) {
      playersText = "🟡 **1 jugador**";
    } else {
      playersText = `🟠 **${server.playing} jugadores**`;
    }

    const color = exact ? 0x57f287 : 0xfee75c;
    const description = exact
      ? "¡Únete ahora antes de que se llene!"
      : `⚠️ No se encontró exacto. Pediste **0**, el más cercano tiene **${server.playing} jugador(es)**.\nToca el link web para entrar, o copia el deeplink si tienes Roblox instalado.`;

    const embed = new EmbedBuilder()
      .setTitle(`${game.emoji} Tu servidor — ${game.name}`)
      .setDescription(description)
      .setColor(color)
      .addFields(
        { name: "🔗 Link web (clickeable)", value: joinLink, inline: false },
        { name: "📱 Deeplink Roblox (toca para copiar)", value: `\`${deepLink}\``, inline: false },
        { name: "🆔 Job ID", value: `\`${server.id}\``, inline: false },
        { name: "👥 Jugadores", value: playersText, inline: true },
        { name: "🏪 Slots libres", value: `${slotsLibres} de ${server.maxPlayers}`, inline: true },
        { name: "📶 Ping", value: server.ping ? `${server.ping}ms` : "N/A", inline: true },
        { name: "🎮 Juego", value: game.name, inline: false }
      )
      .setFooter({ text: `By: Rich Scripts💸 | https://discord.gg/t2qmuRXEUn` })
      .setTimestamp();

    if (thumbnail) embed.setImage(thumbnail);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("🎮 Unirse al servidor")
        .setStyle(ButtonStyle.Link)
        .setURL(joinLink)
    );

    try {
      await message.author.send({ embeds: [embed], components: [row] });
      await loadingMsg.edit({
        content: `<@${userId}> ${game.emoji} ¡Servidor encontrado! Te lo envié por DM 📬`,
        embeds: [],
      });
    } catch {
      await loadingMsg.edit({
        content: `<@${userId}> ${game.emoji} No pude enviarte un DM. Activa los mensajes directos del servidor e intenta de nuevo.`,
      });
    }
  } catch (error) {
    console.error(`Error buscando servidor para ${game.name}:`, error);
    const embed = new EmbedBuilder()
      .setTitle(`${game.emoji} ${game.name}`)
      .setDescription(
        "⚠️ Hubo un error al conectarse con la API de Roblox. Intenta de nuevo en unos momentos."
      )
      .setColor(0xfee75c)
      .setTimestamp();
    await loadingMsg.edit({ content: "", embeds: [embed] });
  }
}

client.login(TOKEN);
