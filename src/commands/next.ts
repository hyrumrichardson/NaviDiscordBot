import { type ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { say } from "../copy.js";

// TODO(phase 1): look up the next scheduled rehearsal and reply with its date/time.
export async function handleNext(interaction: ChatInputCommandInteraction) {
  await interaction.reply({ content: say("notBuiltYet"), flags: MessageFlags.Ephemeral });
}
