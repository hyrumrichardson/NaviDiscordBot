import {
  ActionRowBuilder,
  type ChatInputCommandInteraction,
  MessageFlags,
  StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { and, eq, gt } from "drizzle-orm";
import { say } from "../copy.js";
import { db } from "../db/client.js";
import { rehearsalAttendees, rehearsals } from "../db/schema.js";
import { rehearsalChannelId, upcomingRehearsals } from "../rehearsals.js";
import { formatWindow } from "../time.js";

export const RSVP_SELECT_ID = "navi-rsvp";
// Select menus hold at most 25 options.
const MAX_OPTIONS = 25;

// Show a private dropdown of every rehearsal that hasn't started yet.
export async function handleRsvp(interaction: ChatInputCommandInteraction) {
  const upcoming = await upcomingRehearsals();
  if (upcoming.length === 0) {
    await interaction.reply({ content: say("noRehearsal"), flags: MessageFlags.Ephemeral });
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(RSVP_SELECT_ID)
    .setPlaceholder("Pick a rehearsal")
    .addOptions(
      upcoming
        .slice(0, MAX_OPTIONS)
        .map((r) =>
          new StringSelectMenuOptionBuilder()
            .setValue(String(r.id))
            .setLabel(formatWindow(r.startsAt, r.endsAt)),
        ),
    );

  await interaction.reply({
    content: say("rsvpPick"),
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    flags: MessageFlags.Ephemeral,
  });
}

// Opt in to reminders for the picked rehearsal (for anyone who missed the poll), and tell the
// channel. Someone already on the list gets the private reply only, so repeats don't spam it.
export async function handleRsvpSelect(interaction: StringSelectMenuInteraction) {
  // Re-check: the dropdown could outlive the rehearsal being cancelled or starting.
  const [rehearsal] = await db
    .select()
    .from(rehearsals)
    .where(
      and(
        eq(rehearsals.id, Number(interaction.values[0])),
        eq(rehearsals.status, "scheduled"),
        gt(rehearsals.startsAt, new Date()),
      ),
    );
  if (!rehearsal) {
    await interaction.update({ content: say("alreadyGone"), components: [] });
    return;
  }

  const added = await db
    .insert(rehearsalAttendees)
    .values({ rehearsalId: rehearsal.id, userId: interaction.user.id, source: "rsvp" })
    .onConflictDoNothing()
    .returning();

  const when = formatWindow(rehearsal.startsAt, rehearsal.endsAt);
  await interaction.update({
    content: say(added.length > 0 ? "rsvpConfirmed" : "rsvpAlready", { when }),
    components: [],
  });

  if (added.length > 0) await announceRsvp(interaction, rehearsal, when);
}

// Post in the channel the poll ran in, or where the command was run. The RSVP is already saved
// and confirmed by now, so this logs failures instead of throwing. The mention shows the
// person's name without pinging anyone.
async function announceRsvp(
  interaction: StringSelectMenuInteraction,
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
