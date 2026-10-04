import { type ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { say } from "../copy.js";

// TODO(phase 1): add the user to rehearsal_attendees (source "rsvp") for the next rehearsal.
export async function handleRsvp(interaction: ChatInputCommandInteraction) {
  await interaction.reply({ content: say("notBuiltYet"), flags: MessageFlags.Ephemeral });
}
