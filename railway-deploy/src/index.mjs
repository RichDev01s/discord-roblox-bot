import {
  Client, GatewayIntentBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from "discord.js";
import { createServer } from "http";
import { GAMES } from "./config.mjs";
import { findBestServer, buildWebLink, buildDeepLink, fetchGameThumbnail } from "./roblox.mjs";

const PORT = process.env.PORT || 3000;
createServer((_, res) => { res.writeHead(200); res.end("OK — Bot activo ✅"); }).listen(PORT, () => {
  console.log(`🌐 Health server en puerto ${PORT}`);
});

const TOKEN = process.env.DISCORD_TOKEN?.trim();
if (!TOKEN) { console.error("❌ DISCORD_TOKEN no configurado."); process.exit(1); }

const COOLDOWN_MS = 60_000;
const cooldowns = new Map();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once("clientReady", () => {
  console.log(`✅ Bot conectado como: ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim().toLowerCase();

  if (content === "gen info") { await handleInfo(message); return; }

  const gameKey = Object.keys(GAMES).find(k => content === GAMES[k].command);
  if (!gameKey) return;

  const now = Date.now();
  const remaining = COOLDOWN_MS - (now - (cooldowns.get(message.author.id) ?? 0));
  if (remaining > 0) {
    await message.reply(`⏳ Espera **${Math.ceil(remaining / 1000)}s** antes de volver a usar un comando.`);
    return;
  }
  cooldowns.set(message.author.id, now);
  await handleGenServer(message, gameKey);
});

async function handleInfo(message) {
  const embed = new EmbedBuilder()
    .setTitle("📋 Comandos del Bot de Servidores Roblox")
    .setDescription("Genera links de servidores con **0 o 1 jugadores**.\nLa info se envía directo a tus **DMs** 📬")
    .setColor(0x5865f2)
    .addFields(Object.values(GAMES).map(g => ({ name: `${g.emoji} \`${g.command}\``, value: g.name, inline: true })))
    .addFields({ name: "ℹ️ `gen info`", value: "Muestra este mensaje de ayuda", inline: true })
    .setFooter({ text: "Los servidores se buscan en tiempo real desde Roblox" })
    .setTimestamp();
  await message.reply({ embeds: [embed] });
}

async function handleGenServer(message, gameKey) {
  const game = GAMES[gameKey];
  const loadingMsg = await message.reply(`${game.emoji} Buscando servidor vacío en **${game.name}**...`);

  try {
    const [result, thumb] = await Promise.all([
      findBestServer(game.placeId, 0),
      fetchGameThumbnail(game.placeId),
    ]);

    if (!result) {
      await loadingMsg.edit({ content: "", embeds: [
        new EmbedBuilder()
          .setTitle(`${game.emoji} ${game.name}`)
          .setDescription("❌ No se encontraron servidores disponibles.\n\nIntenta de nuevo en unos segundos.")
          .setColor(0xed4245).setTimestamp(),
      ]});
      return;
    }

    const { server, requestedPlayers, foundPlayers, exactMatch } = result;
    const webLink = buildWebLink(game.placeId, server.id);
    const deepLink = buildDeepLink(game.placeId, server.id);
    const slotsLibres = server.maxPlayers - server.playing;

    const description = exactMatch
      ? `Toca el link web para entrar, o copia el deeplink si tienes Roblox instalado.`
      : `⚠️ No se encontró exacto. Pediste **${requestedPlayers}**, el más cercano tiene **${foundPlayers}** jugador(es).\nToca el link web para entrar, o copia el deeplink si tienes Roblox instalado.`;

    const embed = new EmbedBuilder()
      .setTitle(`${game.emoji} Tu servidor — ${game.name}`)
      .setDescription(description)
      .setColor(exactMatch ? 0x57f287 : 0xfee75c)
      .addFields(
        { name: "🔗 Link web (clickeable)", value: `[${webLink}](${webLink})`, inline: false },
        { name: "📲 Deeplink Roblox (toca para copiar)", value: `\`${deepLink}\``, inline: false },
        { name: "🆔 Job ID", value: `\`${server.id}\``, inline: false },
        { name: "👥 Pedido / Encontrado", value: `${requestedPlayers} pedido → ${foundPlayers} encontrado`, inline: true },
        { name: "🎰 Slots libres", value: `${slotsLibres} de ${server.maxPlayers}`, inline: true },
        { name: "🎮 Juego", value: game.name, inline: true },
      )
      .setFooter({ text: "By: Richest Gen | hoy a las" })
      .setTimestamp();

    if (thumb.icon) embed.setThumbnail(thumb.icon);
    if (thumb.image) embed.setImage(thumb.image);

    try {
      await message.author.send({ embeds: [embed] });
      await loadingMsg.edit({ content: `${game.emoji} ¡Servidor encontrado! Te lo envié por DM 📬` });
    } catch {
      await loadingMsg.edit({ content: `${game.emoji} No pude enviarte un DM. Activa los mensajes directos e intenta de nuevo.` });
    }
  } catch (err) {
    console.error("Error:", err);
    await loadingMsg.edit({ content: "", embeds: [
      new EmbedBuilder()
        .setTitle(`${game.emoji} ${game.name}`)
        .setDescription("⚠️ Error al conectarse con Roblox. Intenta de nuevo.")
        .setColor(0xfee75c).setTimestamp(),
    ]});
  }
}

client.login(TOKEN);
