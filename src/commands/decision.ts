import { type ButtonInteraction, MessageFlags } from "discord.js";
import { eq } from "drizzle-orm";
import { say } from "../copy.js";
import { db } from "../db/client.js";
import { rehearsalPolls } from "../db/schema.js";
import { isAdmin } from "../permissions.js";
import { DROP_PREFIX, dropPoll, finalizePoll, PICK_PREFIX } from "../rehearsals.js";

// Buttons on the tie / low-turnout DM. They usually arrive from a DM, but if the creator's
// DMs were closed they're on a channel post, so anyone could click: check who it is.
export async function handleDecisionButton(interaction: ButtonInteraction) {
  const isPick = interaction.customId.startsWith(PICK_PREFIX);
  const [pollId, optionId] = interaction.customId
    .slice((isPick ? PICK_PREFIX : DROP_PREFIX).length)
    .split(":")
    .map(Number);

  const [poll] = await db.select().from(rehearsalPolls).where(eq(rehearsalPolls.id, pollId));
  if (!poll) {
    await interaction.update({ content: say("alreadyDecided"), components: [] });
    return;
  }
  if (interaction.user.id !== poll.createdBy && !isAdmin(interaction)) {
    await interaction.reply({ content: say("notYourPoll"), flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferUpdate();
  let content: string;
  if (isPick) {
    const when = await finalizePoll(interaction.client, pollId, optionId);
    content = when ? say("decisionLocked", { when }) : say("alreadyDecided");
  } else {
    content = (await dropPoll(interaction.client, pollId)) ? say("decisionDropped") : say("alreadyDecided");
  }
  await interaction.editReply({ content, components: [] });
}
