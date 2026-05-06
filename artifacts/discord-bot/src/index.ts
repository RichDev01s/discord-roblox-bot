import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Message,
  ColorResolvable,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextChannel,
} from "discord.js";
import { GAMES, ALLOWED_CHANNEL_NAMES, TIMEOUT_DURATION_MS } from "./config.js";
import {
  findBestServer,
  buildJoinLink,
  buildDeepLink,
  getGameThumbnail,
} from "./roblox.js";

const TOKEN = process.env.DISCORD_TOKEN?.trim();
if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN no está configurado.");
  process.exit(1);
}

const COOLDOWN_MS = 60_000;
const cooldowns = new Map<string, number>();

// Tracks the last bot reply per user so we can delete it before the next result
const lastBotReply = new Map<string, Message>();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const WELCOME_CHANNEL_NAME = "ᴀɪʀᴘᴏʀᴛ-✈️";
const WELCOME_IMAGE_URL =
  "https://raw.githubusercontent.com/RichDev01s/discord-roblox-bot/main/railway-deploy/assets/welcome-bg.jpg";

client.once("clientReady", () => {
  console.log(`✅ Bot conectado como: ${client.user?.tag}`);
  // Permissions include MANAGE_MESSAGES (8192) for message deletion dedup
  const permissions = 1376537029632n;
  const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${client.user?.id}&permissions=${permissions}&scope=bot`;
  console.log(`\n🔗 Link de invitación:\n${inviteUrl}\n`);
});

client.on("guildMemberAdd", async (member) => {
  const channel = member.guild.channels.cache.find(
    (ch) => ch.name === WELCOME_CHANNEL_NAME && ch instanceof TextChannel
  ) as TextChannel | undefined;

  if (!channel) return;

  const memberCount = member.guild.memberCount;
  const reglasChannel = member.guild.channels.cache.find((ch) =>
    ch.name === "ʀᴜʟᴇꜱ-🪧"
  );
  const reglasText = reglasChannel ? `<#${reglasChannel.id}>` : "**#ʀᴜʟᴇꜱ-🪧**";

  const embed = new EmbedBuilder()
    .setDescription(
      `¡Qué bueno que llegaste! 🎉\n\n🔗 Ya somos **${memberCount}**, y ahora eres parte.\n📖 Recuerda leer ${reglasText}.\n🚀 Ponte cómodo, explora y hazte notar.\n¡Esto se pone mejor contigo aquí!`
    )
    .setColor(0x2ecc71 as ColorResolvable)
    .setImage(WELCOME_IMAGE_URL);

  await channel.send({
    content: `¡<@${member.id}> se ha unido a ✨ Rich Scripts💸!`,
    embeds: [embed],
  });
});

client.on("messageCreate", async (message: Message) => {
  if (message.author.bot) return;

  const content = message.content.trim().toLowerCase();

  const isGenCommand =
    content === ".gen info" ||
    Object.values(GAMES).some((g) => g.command === content);

  if (!isGenCommand) return;

  // ── Channel restriction ──────────────────────────────────────────────────
  if (message.channel instanceof TextChannel) {
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
  // Any other running instance (e.g. Railway) will fail here and skip.
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

  const gameKey = Object.keys(GAMES).find(
    (key) => content === GAMES[key].command
  );

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
      name: "ℹ️ `.gen info`",
      value: "Muestra este mensaje de ayuda",
      inline: true,
    })
    .setFooter({ text: "Los servidores se buscan en tiempo real desde Roblox" })
    .setTimestamp();

  await message.channel.send({ embeds: [embed] });
}

async function handleGenServer(
  message: Message,
  gameKey: string
): Promise<void> {
  const game = GAMES[gameKey];
  const userId = message.author.id;

  // Delete the previous bot reply for this user (if any) to keep chat clean
  const previousReply = lastBotReply.get(userId);
  if (previousReply) {
    try {
      await previousReply.delete();
    } catch {
      // Already deleted or no permission — ignore
    }
    lastBotReply.delete(userId);
  }

  const loadingMsg = await message.channel.send(
    `<@${message.author.id}> ${game.emoji} Buscando servidor vacío en **${game.name}**...`
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
        .setColor(0xed4245 as ColorResolvable)
        .setTimestamp();

      await loadingMsg.edit({ content: "", embeds: [embed] });
      return;
    }

    const { server, exact } = result;
    const joinLink = buildJoinLink(game.placeId, server.id);
    const deepLink = buildDeepLink(game.placeId, server.id);
    const slotsLibres = server.maxPlayers - server.playing;

    let playersText: string;
    if (server.playing === 0) {
      playersText = "🟢 **0 jugadores** (completamente vacío)";
    } else if (server.playing === 1) {
      playersText = "🟡 **1 jugador**";
    } else {
      playersText = `🟠 **${server.playing} jugadores**`;
    }

    const color = exact
      ? (0x57f287 as ColorResolvable)
      : (0xfee75c as ColorResolvable);

    const description = exact
      ? "¡Únete ahora antes de que se llene!"
      : `⚠️ No se encontró exacto. Pediste **0**, el más cercano tiene **${server.playing} jugador(es)**.\nToca el link web para entrar, o copia el deeplink si tienes Roblox instalado.`;

    const embed = new EmbedBuilder()
      .setTitle(`${game.emoji} Tu servidor — ${game.name}`)
      .setDescription(description)
      .setColor(color)
      .addFields(
        { name: "🔗 Link web (clickeable)", value: joinLink, inline: false },
        {
          name: "📱 Deeplink Roblox (toca para copiar)",
          value: `\`${deepLink}\``,
          inline: false,
        },
        { name: "🆔 Job ID", value: `\`${server.id}\``, inline: false },
        { name: "👥 Jugadores", value: playersText, inline: true },
        {
          name: "🏪 Slots libres",
          value: `${slotsLibres} de ${server.maxPlayers}`,
          inline: true,
        },
        {
          name: "📶 Ping",
          value: server.ping ? `${server.ping}ms` : "N/A",
          inline: true,
        },
        { name: "🎮 Juego", value: game.name, inline: false }
      )
      .setFooter({
        text: `By: Rich Scripts💸 | https://discord.gg/t2qmuRXEUn`,
      })
      .setTimestamp();

    if (thumbnail) {
      embed.setImage(thumbnail);
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("🎮 Unirse al servidor")
        .setStyle(ButtonStyle.Link)
        .setURL(joinLink)
    );

    try {
      await message.author.send({ embeds: [embed], components: [row] });
      await loadingMsg.edit({
        content: `<@${message.author.id}> ${game.emoji} ¡Servidor encontrado! Te lo envié por DM 📬`,
        embeds: [],
      });
    } catch {
      await loadingMsg.edit({
        content: `<@${message.author.id}> ${game.emoji} No pude enviarte un DM. Activa los mensajes directos del servidor e intenta de nuevo.`,
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
