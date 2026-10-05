import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import {
  handleComponent,
  handleModalSubmit,
  handleNaviCommand,
  registerCommands,
} from "./commands/index.js";
import { config } from "./config.js";
import { pool, runMigrations } from "./db/client.js";
import { startScheduler } from "./scheduler.js";

const client = new Client({
  // Reactions are read over REST when a poll closes, so no reaction intent is needed.
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`Hey! Listen! Logged in as ${c.user.tag}`);
  await registerCommands();
  startScheduler(c);
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
