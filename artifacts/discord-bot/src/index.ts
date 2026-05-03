import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Message,
  ColorResolvable,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { GAMES } from "./config.js";
import { findEmptyServers, buildJoinLink } from "./roblox.js";

const rawToken = process.env.DISCORD_TOKEN ?? "";
const TOKEN = rawToken.trim();
console.log(`[DEBUG] Raw length: ${rawToken.length}, Trimmed length: ${TOKEN.length}`);
console.log(`[DEBUG] First 15 chars: "${TOKEN.slice(0, 15)}"`);
if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN no está configurado.");
  process.exit(1);
}

const COOLDOWN_MS = 60_000;
const cooldowns = new Map<string, number>();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("clientReady", () => {
  console.log(`✅ Bot conectado como: ${client.user?.tag}`);
  const permissions = 277025393664n;
  const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${client.user?.id}&permissions=${permissions}&scope=bot`;
  console.log(`\n🔗 Link de invitación:\n${inviteUrl}\n`);
});

client.on("messageCreate", async (message: Message) => {
  if (message.author.bot) return;

  const content = message.content.trim().toLowerCase();

  if (content === "gen info") {
    await handleInfo(message);
    return;
  }

  const gameKey = Object.keys(GAMES).find(
    (key) => content === GAMES[key].command
  );

  if (gameKey) {
    const now = Date.now();
    const lastUsed = cooldowns.get(message.author.id) ?? 0;
    const remaining = COOLDOWN_MS - (now - lastUsed);

    if (remaining > 0) {
      const seconds = Math.ceil(remaining / 1000);
      await message.reply(
        `⏳ Espera **${seconds}s** antes de volver a usar un comando.`
      );
      return;
    }

    cooldowns.set(message.author.id, now);
    await handleGenServer(message, gameKey);
  }
});

async function handleInfo(message: Message): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle("📋 Comandos del Bot de Servidores Roblox")
    .setDescription(
      "Genera links de servidores con **0 o 1 jugadores**.\nLa info se envía directo a tus **DMs** 📬"
    )
    .setColor(0x5865f2 as ColorResolvable)
    .addFields(
      Object.values(GAMES).map((game) => ({
        name: `${game.emoji} \`${game.command}\``,
        value: game.name,
        inline: true,
      }))
    )
    .addFields({
      name: "ℹ️ `gen info`",
      value: "Muestra este mensaje de ayuda",
      inline: true,
    })
    .setFooter({ text: "Los servidores se buscan en tiempo real desde Roblox" })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

async function handleGenServer(
  message: Message,
  gameKey: string
): Promise<void> {
  const game = GAMES[gameKey];

  const loadingMsg = await message.reply(
    `${game.emoji} Buscando servidor vacío en **${game.name}**...`
  );

  try {
    const servers = await findEmptyServers(game.placeId, 1);

    if (servers.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle(`${game.emoji} ${game.name}`)
        .setDescription(
          "❌ No se encontraron servidores con 0 o 1 jugadores en este momento.\n\nIntenta de nuevo en unos segundos."
        )
        .setColor(0xed4245 as ColorResolvable)
        .setTimestamp();

      await loadingMsg.edit({ content: "", embeds: [embed] });
      return;
    }

    const server = servers[0];
    const joinLink = buildJoinLink(game.placeId, server.id);

    const playersText =
      server.playing === 0
        ? "🟢 **0 jugadores** (completamente vacío)"
        : "🟡 **1 jugador**";

    const embed = new EmbedBuilder()
      .setTitle(`${game.emoji} Servidor encontrado — ${game.name}`)
      .setDescription("¡Únete ahora antes de que se llene!")
      .setColor(0x57f287 as ColorResolvable)
      .addFields(
        {
          name: "👥 Jugadores",
          value: playersText,
          inline: true,
        },
        {
          name: "👤 Máx.",
          value: `${server.maxPlayers}`,
          inline: true,
        },
        {
          name: "📶 Ping",
          value: server.ping ? `${server.ping}ms` : "N/A",
          inline: true,
        }
      )
      .setFooter({
        text: `Haz clic en el botón para unirte directamente`,
      })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("🎮 Unirse al servidor")
        .setStyle(ButtonStyle.Link)
        .setURL(joinLink)
    );

    try {
      await message.author.send({ embeds: [embed], components: [row] });
      await loadingMsg.edit({
        content: `${game.emoji} ¡Servidor encontrado! Te lo envié por DM 📬`,
      });
    } catch {
      await loadingMsg.edit({
        content: `${game.emoji} No pude enviarte un DM. Activa los mensajes directos del servidor e intenta de nuevo.`,
      });
    }
  } catch (error) {
    console.error(`Error buscando servidor para ${game.name}:`, error);

    const embed = new EmbedBuilder()
      .setTitle(`${game.emoji} ${game.name}`)
      .setDescription(
        "⚠️ Hubo un error al conectarse con la API de Roblox. Intenta de nuevo en unos momentos."
      )
      .setColor(0xfee75c as ColorResolvable)
      .setTimestamp();

    await loadingMsg.edit({ content: "", embeds: [embed] });
  }
}

client.login(TOKEN);
