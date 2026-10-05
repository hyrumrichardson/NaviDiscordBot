import { type ChatInputCommandInteraction, ChannelType, MessageFlags } from "discord.js";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { guildSettings } from "../db/schema.js";
import { deleteGuideMessages, GUIDE_FILE, postOrUpdateGuide, readGuide, splitGuide } from "../guide.js";

export const GUIDE_CHANNEL_OPTION = "channel";
export const GUIDE_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const;

// /navi guide-channel: post the command guide to a channel (or refresh it there). Running it
// again with the same channel edits the messages in place; a new channel moves the guide.
export async function handleGuideChannel(interaction: ChatInputCommandInteraction) {
  if (!interaction.inGuild()) return;
  const picked = interaction.options.getChannel(GUIDE_CHANNEL_OPTION, true, [...GUIDE_CHANNEL_TYPES]);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let chunks: string[];
  try {
    chunks = splitGuide(readGuide());
  } catch (err) {
    await interaction.editReply(`**Watch out!** I couldn't read \`${GUIDE_FILE}\`: ${(err as Error).message}`);
    return;
  }

  const channel = await interaction.client.channels.fetch(picked.id).catch(() => null);
  if (!channel?.isSendable()) {
    await interaction.editReply(`**Watch out!** I can't post in <#${picked.id}>. Check my permissions there.`);
    return;
  }

  const [row] = await db.select().from(guildSettings).where(eq(guildSettings.guildId, interaction.guildId));
  const sameChannel = row?.guideChannelId === channel.id;

  let ids: string[];
  try {
    ids = await postOrUpdateGuide(channel, chunks, sameChannel ? row.guideMessageIds : []);
  } catch (err) {
    await interaction.editReply(`**Watch out!** Posting to <#${channel.id}> failed: ${(err as Error).message}`);
    return;
  }

  // Moving to a new channel: clean up the old copy.
  if (row?.guideChannelId && !sameChannel) {
    const old = await interaction.client.channels.fetch(row.guideChannelId).catch(() => null);
    if (old?.isSendable()) await deleteGuideMessages(old, row.guideMessageIds);
  }

  await db
    .insert(guildSettings)
    .values({ guildId: interaction.guildId, guideChannelId: channel.id, guideMessageIds: ids })
    .onConflictDoUpdate({
      target: guildSettings.guildId,
      set: { guideChannelId: channel.id, guideMessageIds: ids },
    });

  await interaction.editReply(
    `**Hey! Listen!** The command guide is in <#${channel.id}> (${ids.length} message${ids.length === 1 ? "" : "s"}). ` +
      `It updates itself when \`${GUIDE_FILE}\` changes and Navi restarts.`,
  );
}
