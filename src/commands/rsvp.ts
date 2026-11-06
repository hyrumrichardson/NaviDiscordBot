import { type ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { eq } from "drizzle-orm";
import { say } from "../copy.js";
import { db } from "../db/client.js";
import { rehearsalAttendees, type rehearsals } from "../db/schema.js";
import { nextRehearsal, rehearsalChannelId } from "../rehearsals.js";
import { formatWindow } from "../time.js";

// Opt in to reminders for the next rehearsal (for anyone who missed the poll), and tell the
// channel. Someone already on the list gets the private reply only, so repeats don't spam it.
export async function handleRsvp(interaction: ChatInputCommandInteraction) {
  const rehearsal = await nextRehearsal();
  if (!rehearsal) {
    await interaction.reply({ content: say("noRehearsal"), flags: MessageFlags.Ephemeral });
    return;
  }

  const added = await db
    .insert(rehearsalAttendees)
    .values({ rehearsalId: rehearsal.id, userId: interaction.user.id, source: "rsvp" })
    .onConflictDoNothing()
    .returning();

  const when = formatWindow(rehearsal.startsAt, rehearsal.endsAt);
  await interaction.reply({
    content: say(added.length > 0 ? "rsvpConfirmed" : "rsvpAlready", { when }),
    flags: MessageFlags.Ephemeral,
  });

  if (added.length > 0) await announceRsvp(interaction, rehearsal, when);
}

// Post in the channel the poll ran in, or where the command was run. The RSVP is already saved
// and confirmed by now, so this logs failures instead of throwing. The mention shows the
// person's name without pinging anyone.
async function announceRsvp(
  interaction: ChatInputCommandInteraction,
  rehearsal: typeof rehearsals.$inferSelect,
  when: string,
) {
  try {
    const channelId = (await rehearsalChannelId(rehearsal)) ?? interaction.channelId;
    const channel = await interaction.client.channels.fetch(channelId);
    if (!channel?.isSendable()) {
      console.warn(`Rehearsal ${rehearsal.id}: can't post the RSVP in channel ${channelId}.`);
      return;
    }
    const count = await db.$count(rehearsalAttendees, eq(rehearsalAttendees.rehearsalId, rehearsal.id));
    await channel.send({
      content: say("rsvpAnnounced", { user: `<@${interaction.user.id}>`, when, count }),
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    console.error(`Rehearsal ${rehearsal.id}: couldn't announce the RSVP:`, err);
  }
}
