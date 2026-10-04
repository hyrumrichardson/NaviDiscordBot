// Debug commands: run what the scheduler would run, right now. Permission (Manage Server OR
// the ADMIN_ROLE_ID role) is checked in commands/index.ts.
import { type ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { say } from "../copy.js";
import { db } from "../db/client.js";
import { pollOptions, rehearsalPolls, rehearsals, scheduledJobs } from "../db/schema.js";
import { closePoll, type ReminderKey, sendReminder, upcomingRehearsals } from "../rehearsals.js";
import { formatWindow } from "../time.js";

export const REMINDER_OPTION = "reminder";

// /navi debug-send-reminders: send a reminder now for every upcoming rehearsal.
// The scheduled reminders still go out as normal.
export async function handleDebugSendReminders(interaction: ChatInputCommandInteraction) {
  const key = (interaction.options.getString(REMINDER_OPTION) ?? "remindBefore") as ReminderKey;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const upcoming = await upcomingRehearsals();
  if (upcoming.length === 0) {
    await interaction.editReply(say("noRehearsal"));
    return;
  }

  const label = key === "remindBefore" ? "48-hour" : "day-of";
  const lines = [`**Debug:** sent the ${label} reminder now. Scheduled reminders are unchanged.`];
  for (const rehearsal of upcoming) {
    const when = formatWindow(rehearsal.startsAt, rehearsal.endsAt);
    const result = await sendReminder(interaction.client, rehearsal.id, key);
    if (!result) continue;
    const { recipients, failed } = result;
    let line = `• **${when}**: ${recipients.length === 0 ? "no one on the reminder list" : `DMed ${recipients.length - failed.length} of ${recipients.length}`}`;
    if (failed.length > 0) line += `. DMs closed for ${failed.map((id) => `<@${id}>`).join(" ")}, so I mentioned them in the channel instead`;
    lines.push(line);
  }

  await interaction.editReply({ content: lines.join("\n"), allowedMentions: { parse: [] } });
}

// /navi debug-close-poll: close every open poll now, as if its time had run out.
// Ends the Discord poll early, then does exactly what the close_poll job does.
export async function handleDebugClosePoll(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const open = await db.select().from(rehearsalPolls).where(eq(rehearsalPolls.status, "open"));
  if (open.length === 0) {
    await interaction.editReply("**Debug:** there are no open polls to close.");
    return;
  }

  const lines = ["**Debug:** closed these polls early."];
  for (const poll of open) {
    await closePoll(interaction.client, poll.id);
    // The scheduled close_poll job would be a no-op now (the poll isn't open). Mark it done.
    await db
      .update(scheduledJobs)
      .set({ completedAt: new Date() })
      .where(
        and(eq(scheduledJobs.kind, "close_poll"), eq(scheduledJobs.refId, poll.id), isNull(scheduledJobs.completedAt)),
      );
    lines.push(`• Poll in <#${poll.channelId}>: ${await describeOutcome(poll.id)}`);
  }

  await interaction.editReply({ content: lines.join("\n"), allowedMentions: { parse: [] } });
}

async function describeOutcome(pollId: number): Promise<string> {
  const [poll] = await db.select().from(rehearsalPolls).where(eq(rehearsalPolls.id, pollId));
  switch (poll?.status) {
    case "awaiting_decision":
      return "tie or low turnout, so I DMed the poll creator to decide.";
    case "cancelled":
      return "the poll message was deleted, so I marked it cancelled.";
    case "open":
      return "still open (something went wrong; check the logs).";
    case "closed": {
      const options = await db.select({ id: pollOptions.id }).from(pollOptions).where(eq(pollOptions.pollId, pollId));
      const [rehearsal] = options.length
        ? await db.select().from(rehearsals).where(inArray(rehearsals.pollOptionId, options.map((o) => o.id)))
        : [];
      return rehearsal
        ? `rehearsal set for **${formatWindow(rehearsal.startsAt, rehearsal.endsAt)}**, and reminders queued.`
        : "nobody voted.";
    }
    default:
      return "not found.";
  }
}
