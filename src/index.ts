import { Client, Events, GatewayIntentBits, MessageFlags, Partials } from "discord.js";
import {
  handleComponent,
  handleModalSubmit,
  handleNaviCommand,
  registerCommands,
} from "./commands/index.js";
import { config } from "./config.js";
import { pool, runMigrations } from "./db/client.js";
import { syncGuides } from "./guide.js";
import { syncOpenPolls, syncStarterReaction } from "./rehearsals.js";
import { startScheduler } from "./scheduler.js";

const client = new Client({
  // Votes are counted over REST when a poll closes. The reaction events are only for
  // taking back Navi's own starter reactions (see syncStarterReaction). The partials
  // let those events fire for polls posted before a restart.
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessageReactions],
  partials: [Partials.Message, Partials.Reaction, Partials.User],
});

client.on(Events.MessageReactionAdd, syncStarterReaction);
client.on(Events.MessageReactionRemove, syncStarterReaction);

client.once(Events.ClientReady, async (c) => {
  console.log(`Hey! Listen! Logged in as ${c.user.tag}`);
  await registerCommands();
  startScheduler(c);
  // Re-sync the posted command guide with docs/member-help.txt (edits only if it changed).
  await syncGuides(c).catch((err) => console.error("[guide] Sync failed:", err));
  // Fix Navi's starter reactions on open polls (reactions may have changed while it was offline).
  await syncOpenPolls(c).catch((err) => console.error("Poll reaction sync failed:", err));
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isRepliable()) return;
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "navi") {
      await handleNaviCommand(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
    } else if (interaction.isMessageComponent()) {
      await handleComponent(interaction);
    }
  } catch (err) {
    console.error("Command failed:", err);
    const reply = {
      content: "**Watch out!** Something went wrong.",
      flags: MessageFlags.Ephemeral,
    } as const;
    if (interaction.replied || interaction.deferred) await interaction.followUp(reply);
    else await interaction.reply(reply);
  }
});

async function shutdown() {
  console.log("Navi is flying away...");
  await client.destroy();
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await runMigrations();
await client.login(config.discordToken);
