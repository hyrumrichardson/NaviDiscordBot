import { type ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { eq, inArray } from "drizzle-orm";
import { say } from "../copy.js";
import { db } from "../db/client.js";
import { rehearsalAttendees, rehearsalPolls } from "../db/schema.js";
import { nextRehearsal } from "../rehearsals.js";
import { formatWindow } from "../time.js";

export async function handleNext(interaction: ChatInputCommandInteraction) {
  const lines: string[] = [];

  const rehearsal = await nextRehearsal();
  if (rehearsal) {
    const attendees = await db
      .select({ userId: rehearsalAttendees.userId })
      .from(rehearsalAttendees)
      .where(eq(rehearsalAttendees.rehearsalId, rehearsal.id));
    const going = attendees.some((a) => a.userId === interaction.user.id);
    lines.push(
      say("nextRehearsal", { when: formatWindow(rehearsal.startsAt, rehearsal.endsAt) }),
      `${attendees.length} on the reminder list.`,
      going ? "You're on it. 🧚" : "Not on it? Use `/navi rsvp` to get reminders.",
    );
  } else {
    lines.push(say("noRehearsal"));
  }

  const openPolls = await db
    .select({ channelId: rehearsalPolls.channelId, closesAt: rehearsalPolls.closesAt })
    .from(rehearsalPolls)
    .where(inArray(rehearsalPolls.status, ["open", "awaiting_decision"]));
  for (const poll of openPolls) {
    const closes = Math.floor(poll.closesAt.getTime() / 1000);
    lines.push(`📊 A rehearsal poll is open in <#${poll.channelId}>. It closes <t:${closes}:R>.`);
  }

  await interaction.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
}
