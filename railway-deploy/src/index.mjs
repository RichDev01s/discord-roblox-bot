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
import { GAMES, ALLOWED_CHANNEL_NAMES, TIMEOUT_DURATION_MS } from "./config.mjs";
import { findBestServer, buildJoinLink, buildDeepLink, getGameThumbnail } from "./roblox.mjs";

// ── Health check server (required by Railway) ────────────────────────────────
const PORT = process.env.PORT || 3000;
createServer((_, res) => {
  res.writeHead(200);
  res.end("OK — Bot activo ✅");
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

client.once("clientReady", () => {
  console.log(`✅ Bot conectado como: ${client.user?.tag}`);
  const permissions = 1376537029632n;
  const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${client.user?.id}&permissions=${permissions}&scope=bot`;
  console.log(`\n🔗 Link de invitación:\n${inviteUrl}\n`);
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
    const channelName = message.channel.name;
    if (!ALLOWED_CHANNEL_NAMES.includes(channelName)) {
      const allowedMentions = ALLOWED_CHANNEL_NAMES.map((n) => `**#${n}**`).join(" o ");
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
      .setFooter({ text: `By: Rich Scripts💸 | https://discord.gg/vpD8cBjHFP` })
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
