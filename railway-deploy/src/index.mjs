import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { createServer } from "http";
import { GAMES } from "./config.mjs";
import { findEmptyServers, buildJoinLink } from "./roblox.mjs";

// Health server — keeps the app alive
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
  if (remaining > 0) { await message.reply(`⏳ Espera **${Math.ceil(remaining/1000)}s** antes de volver a usar un comando.`); return; }
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
    .setFooter({ text: "Los servidores se buscan en tiempo real desde Roblox" }).setTimestamp();
  await message.reply({ embeds: [embed] });
}

async function handleGenServer(message, gameKey) {
  const game = GAMES[gameKey];
  const loading = await message.reply(`${game.emoji} Buscando servidor vacío en **${game.name}**...`);
  try {
    const servers = await findEmptyServers(game.placeId, 1);
    if (servers.length === 0) {
      await loading.edit({ content: "", embeds: [new EmbedBuilder().setTitle(`${game.emoji} ${game.name}`)
        .setDescription("❌ No se encontraron servidores con 0 o 1 jugadores.\n\nIntenta de nuevo en unos segundos.")
        .setColor(0xed4245).setTimestamp()] });
      return;
    }
    const server = servers[0];
    const embed = new EmbedBuilder().setTitle(`${game.emoji} Servidor encontrado — ${game.name}`)
      .setDescription("¡Únete ahora antes de que se llene!").setColor(0x57f287)
      .addFields(
        { name: "👥 Jugadores", value: server.playing === 0 ? "🟢 **0 jugadores**" : "🟡 **1 jugador**", inline: true },
        { name: "👤 Máx.", value: `${server.maxPlayers}`, inline: true },
        { name: "📶 Ping", value: server.ping ? `${server.ping}ms` : "N/A", inline: true }
      ).setTimestamp();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("🎮 Unirse al servidor").setStyle(ButtonStyle.Link).setURL(buildJoinLink(game.placeId, server.id))
    );
    try { await message.author.send({ embeds: [embed], components: [row] }); await loading.edit({ content: `${game.emoji} ¡Servidor encontrado! Te lo envié por DM 📬` }); }
    catch { await loading.edit({ content: `${game.emoji} No pude enviarte un DM. Activa los mensajes directos e intenta de nuevo.` }); }
  } catch (err) {
    console.error("Error:", err);
    await loading.edit({ content: "", embeds: [new EmbedBuilder().setTitle(`${game.emoji} ${game.name}`)
      .setDescription("⚠️ Error al conectarse con Roblox. Intenta de nuevo.").setColor(0xfee75c).setTimestamp()] });
  }
}

client.login(TOKEN);
