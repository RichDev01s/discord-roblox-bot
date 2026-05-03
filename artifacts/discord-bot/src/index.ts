import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Message,
  ColorResolvable,
} from "discord.js";
import { GAMES } from "./config.js";
import { findEmptyServers, buildJoinLink, buildDeepLink } from "./roblox.js";

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN no está configurado.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`✅ Bot conectado como: ${client.user?.tag}`);
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
    await handleGenServer(message, gameKey);
  }
});

async function handleInfo(message: Message): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle("📋 Comandos del Bot de Servidores Roblox")
    .setDescription(
      "Genera links de servidores con **0 o 1 jugadores** para los siguientes juegos:"
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
    const deepLink = buildDeepLink(game.placeId, server.id);

    const playersText =
      server.playing === 0
        ? "🟢 **0 jugadores** (servidor completamente vacío)"
        : "🟡 **1 jugador**";

    const embed = new EmbedBuilder()
      .setTitle(`${game.emoji} Servidor encontrado — ${game.name}`)
      .setDescription(
        `¡Se encontró un servidor casi vacío! Únete ahora antes de que se llene.`
      )
      .setColor(0x57f287 as ColorResolvable)
      .addFields(
        {
          name: "👥 Jugadores actuales",
          value: playersText,
          inline: true,
        },
        {
          name: "👤 Máx. jugadores",
          value: `${server.maxPlayers}`,
          inline: true,
        },
        {
          name: "📶 Ping",
          value: server.ping ? `${server.ping}ms` : "N/A",
          inline: true,
        },
        {
          name: "🔗 Link para unirse (web)",
          value: `[Abrir en navegador](${joinLink})`,
          inline: false,
        },
        {
          name: "🎮 Link directo (app Roblox)",
          value: `\`${deepLink}\``,
          inline: false,
        }
      )
      .setFooter({
        text: `Game ID: ${game.placeId} • Server ID: ${server.id.slice(0, 8)}...`,
      })
      .setTimestamp();

    await loadingMsg.edit({ content: "", embeds: [embed] });
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
