// Poll-closing, decision and reminder logic shared by the scheduler and the commands.
import {
  ActionRowBuilder,
  type BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  type Client,
  DiscordAPIError,
  type Message,
  RESTJSONErrorCodes,
  type SendableChannels,
} from "discord.js";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { config } from "./config.js";
import { type CopyKey, say } from "./copy.js";
import { db } from "./db/client.js";
import {
  pollOptions,
  pollVotes,
  rehearsalAttendees,
  rehearsalPolls,
  rehearsals,
  scheduledJobs,
} from "./db/schema.js";
import { formatTimes, formatWindow, zonedDate, zonedToUtc } from "./time.js";

type Rehearsal = typeof rehearsals.$inferSelect;
type PollOption = typeof pollOptions.$inferSelect;
type Executor = Pick<typeof db, "insert">;

// Button custom IDs for the creator's decision DM.
export const PICK_PREFIX = "navi-pick:"; // navi-pick:<pollId>:<optionId>
export const DROP_PREFIX = "navi-drop:"; // navi-drop:<pollId>

const mention = (userId: string) => `<@${userId}>`;
const channelMention = (channelId: string) => `<#${channelId}>`;

function isUnknownResource(err: unknown): boolean {
  return (
    err instanceof DiscordAPIError &&
    (err.code === RESTJSONErrorCodes.UnknownChannel || err.code === RESTJSONErrorCodes.UnknownMessage)
  );
}

async function sendableChannel(client: Client, channelId: string): Promise<SendableChannels | null> {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  return channel?.isSendable() ? channel : null;
}

// Post in a poll's channel as a reply to the poll message (if it still exists). Runs after
// the DB work is committed, so it logs failures instead of throwing (a retry would skip it).
async function postInPollChannel(
  client: Client,
  poll: typeof rehearsalPolls.$inferSelect,
  content: string,
) {
  const channel = await sendableChannel(client, poll.channelId);
  if (!channel) {
    console.warn(`Poll ${poll.id}: channel ${poll.channelId} is gone, couldn't post: ${content}`);
    return;
  }
  try {
    await channel.send({
      content,
      reply: poll.messageId ? { messageReference: poll.messageId, failIfNotExists: false } : undefined,
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    console.error(`Poll ${poll.id}: couldn't post in channel:`, err);
  }
}

// DM each user. Anyone whose DMs are closed gets one shared channel post that mentions them.
// Never throws for a single user, so a retried job doesn't DM everyone twice.
// Returns the IDs that couldn't be DMed.
export async function dmOrMention(
  client: Client,
  userIds: string[],
  message: BaseMessageOptions,
  channelId: string | null,
): Promise<string[]> {
  const failed: string[] = [];
  for (const userId of userIds) {
    try {
      const user = await client.users.fetch(userId);
      await user.send(message);
    } catch {
      failed.push(userId);
    }
  }
  if (failed.length === 0) return failed;

  const channel = channelId ? await sendableChannel(client, channelId) : null;
  if (!channel) {
    console.warn(`Couldn't DM ${failed.join(", ")} and had no channel to fall back to.`);
    return failed;
  }
  try {
    await channel.send({
      ...message,
      content: `${failed.map(mention).join(" ")} ${say("dmFallback")}\n${message.content ?? ""}`,
      allowedMentions: { users: failed },
    });
  } catch (err) {
    console.error("Channel fallback post failed:", err);
  }
  return failed;
}

// Queue the 48 h and day-of reminders for a rehearsal. A reminder whose time has
// already passed (e.g. the poll closed 30 h before rehearsal) is skipped rather than
// sent late. So is a day-of reminder that would land at or after the start time.
export async function queueReminders(
  rehearsalId: number,
  startsAt: Date,
  executor: Executor = db,
  now = new Date(),
) {
  const remindBefore = new Date(startsAt.getTime() - config.rehearsal.reminderHoursBefore * 3_600_000);
  const remindDayOf = zonedToUtc(zonedDate(startsAt), config.rehearsal.dayOfReminderTime);

  const jobs: (typeof scheduledJobs.$inferInsert)[] = [];
  if (remindBefore > now) jobs.push({ kind: "remind_before", refId: rehearsalId, runAt: remindBefore });
  if (remindDayOf > now && remindDayOf < startsAt) {
    jobs.push({ kind: "remind_day_of", refId: rehearsalId, runAt: remindDayOf });
  }
  if (jobs.length > 0) await executor.insert(scheduledJobs).values(jobs);
}

// The channel a rehearsal's poll ran in, if it came from a poll.
export async function rehearsalChannelId(rehearsal: Rehearsal): Promise<string | null> {
  if (!rehearsal.pollOptionId) return null;
  const [row] = await db
    .select({ channelId: rehearsalPolls.channelId })
    .from(pollOptions)
    .innerJoin(rehearsalPolls, eq(pollOptions.pollId, rehearsalPolls.id))
    .where(eq(pollOptions.id, rehearsal.pollOptionId));
  return row?.channelId ?? null;
}

// The next rehearsal that hasn't finished yet.
export async function nextRehearsal(): Promise<Rehearsal | null> {
  const [rehearsal] = await db
    .select()
    .from(rehearsals)
    .where(and(eq(rehearsals.status, "scheduled"), gt(rehearsals.endsAt, new Date())))
    .orderBy(asc(rehearsals.startsAt))
    .limit(1);
  return rehearsal ?? null;
}

// --- The poll message -----------------------------------------------------------

// Polls are a normal message with one reaction per option: 1️⃣–🔟, or 👍 when there's
// only one option.
export const POLL_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"] as const;
export const SINGLE_OPTION_EMOJI = "👍";
export const pollEmoji = (index: number, optionCount: number): string =>
  optionCount === 1 ? SINGLE_OPTION_EMOJI : POLL_EMOJIS[index];

export const POLL_CLOSED_NOTE = "🔒 *Voting is closed.*";
export const POLL_CANCELLED_NOTE = "🚫 *This poll was cancelled.*";

// Discord can return keycap emoji with or without the U+FE0F variation selector.
const sameEmoji = (a: string | null, b: string) =>
  !!a && a.replace(/️/g, "") === b.replace(/️/g, "");

// Reactions can't be locked, so add a closing line to the poll message instead (once).
export async function markPollMessage(message: Message, note: string) {
  if (message.content.includes(note)) return;
  await message
    .edit({ content: `${message.content}\n\n${note}`, allowedMentions: { parse: [] } })
    .catch((err) => console.warn(`Couldn't mark poll message ${message.id}:`, err));
}

// --- Closing a poll -------------------------------------------------------------

const optionWhen = (o: PollOption) => formatWindow(o.startsAt, o.endsAt);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// close_poll job: count the votes, then either lock in the winner or ask the creator.
export async function closePoll(client: Client, pollId: number) {
  const [poll] = await db.select().from(rehearsalPolls).where(eq(rehearsalPolls.id, pollId));
  if (!poll || poll.status !== "open") return;

  const options = await db
    .select()
    .from(pollOptions)
    .where(eq(pollOptions.pollId, pollId))
    .orderBy(asc(pollOptions.answerId));

  // Network errors throw so the job retries. A deleted channel or message means
  // there's nothing left to count.
  let message: Message;
  try {
    const channel = await client.channels.fetch(poll.channelId);
    if (!channel?.isTextBased() || !poll.messageId) throw new Error("Poll channel isn't a text channel");
    // force: skip the cache so the reactions are current.
    message = await channel.messages.fetch({ message: poll.messageId, force: true });
  } catch (err) {
    if (!isUnknownResource(err)) throw err;
    console.warn(`Poll ${pollId}: message or channel was deleted. Marking it cancelled.`);
    await db.update(rehearsalPolls).set({ status: "cancelled" }).where(eq(rehearsalPolls.id, pollId));
    return;
  }

  // A vote is a reaction with the option's emoji. Navi's own starter reactions don't count.
  const votes = new Map<number, string[]>();
  for (const option of options) {
    const voterIds: string[] = [];
    const reaction = message.reactions.cache.find((r) => sameEmoji(r.emoji.name, option.emoji));
    if (reaction) {
      let after: string | undefined;
      for (;;) {
        const page = await reaction.users.fetch({ limit: 100, after });
        for (const user of page.values()) if (!user.bot) voterIds.push(user.id);
        if (page.size < 100) break;
        after = page.lastKey();
      }
    }
    votes.set(option.id, voterIds);
  }
  await markPollMessage(message, POLL_CLOSED_NOTE);

  const snapshot = [...votes].flatMap(([pollOptionId, ids]) => ids.map((userId) => ({ pollOptionId, userId })));
  if (snapshot.length > 0) await db.insert(pollVotes).values(snapshot).onConflictDoNothing();

  const tally = options.map((option) => ({ option, count: votes.get(option.id)!.length }));
  const top = Math.max(0, ...tally.map((t) => t.count));

  if (top === 0) {
    await db.update(rehearsalPolls).set({ status: "closed" }).where(eq(rehearsalPolls.id, pollId));
    await postInPollChannel(client, poll, say("pollNoVotes"));
    return;
  }

  const leaders = tally.filter((t) => t.count === top);
  if (leaders.length === 1 && top >= config.rehearsal.minTurnout) {
    await finalizePoll(client, pollId, leaders[0].option.id);
    return;
  }

  // Tie or low turnout: the creator decides. DM first, then flip the status, so a failed
  // run retries the DM. finalizePoll accepts both "open" and "awaiting_decision".
  const isTie = leaders.length > 1;
  const lines = leaders.map((t) => `${t.option.emoji} **${optionWhen(t.option)}**: ${plural(t.count, "vote")}`);
  const intro = isTie
    ? say("decisionTie", { channel: channelMention(poll.channelId) })
    : say("decisionLowTurnout", {
        channel: channelMention(poll.channelId),
        count: top === 1 ? "1 person" : `${top} people`,
        when: optionWhen(leaders[0].option),
      });

  const pickButtons = leaders.map((t) =>
    new ButtonBuilder()
      .setCustomId(`${PICK_PREFIX}${pollId}:${t.option.id}`)
      .setLabel(isTie ? optionWhen(t.option).slice(0, 80) : "Yes, keep it")
      .setEmoji(isTie ? t.option.emoji : "✅")
      .setStyle(isTie ? ButtonStyle.Primary : ButtonStyle.Success),
  );
  const dropButton = new ButtonBuilder()
    .setCustomId(`${DROP_PREFIX}${pollId}`)
    .setLabel("No rehearsal")
    .setStyle(ButtonStyle.Danger);

  // Up to 10 tied options: 5 buttons per row, then the drop button on its own row.
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < pickButtons.length; i += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(pickButtons.slice(i, i + 5)));
  }
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(dropButton));

  await dmOrMention(
    client,
    [poll.createdBy],
    { content: isTie ? `${intro}\n${lines.join("\n")}` : intro, components: rows },
    poll.channelId,
  );
  await db
    .update(rehearsalPolls)
    .set({ status: "awaiting_decision" })
    .where(and(eq(rehearsalPolls.id, pollId), eq(rehearsalPolls.status, "open")));
}

// Lock in a poll option as the rehearsal. Returns the formatted time, or null if the
// poll was already decided or cancelled.
export async function finalizePoll(client: Client, pollId: number, optionId: number): Promise<string | null> {
  const result = await db.transaction(async (tx) => {
    const [poll] = await tx
      .update(rehearsalPolls)
      .set({ status: "closed" })
      .where(and(eq(rehearsalPolls.id, pollId), inArray(rehearsalPolls.status, ["open", "awaiting_decision"])))
      .returning();
    if (!poll) return null;

    const [option] = await tx
      .select()
      .from(pollOptions)
      .where(and(eq(pollOptions.id, optionId), eq(pollOptions.pollId, pollId)));
    if (!option) throw new Error(`Option ${optionId} doesn't belong to poll ${pollId}`);

    const [rehearsal] = await tx
      .insert(rehearsals)
      .values({ pollOptionId: option.id, startsAt: option.startsAt, endsAt: option.endsAt })
      .returning();

    const voters = await tx
      .select({ userId: pollVotes.userId })
      .from(pollVotes)
      .where(eq(pollVotes.pollOptionId, option.id));
    if (voters.length > 0) {
      await tx
        .insert(rehearsalAttendees)
        .values(voters.map((v) => ({ rehearsalId: rehearsal.id, userId: v.userId, source: "poll" as const })));
    }

    await queueReminders(rehearsal.id, option.startsAt, tx);
    return { poll, option };
  });
  if (!result) return null;

  const when = optionWhen(result.option);
  await postInPollChannel(client, result.poll, say("pollClosed", { when }));
  return when;
}

// The creator chose "No rehearsal". Returns false if the poll was already decided.
export async function dropPoll(client: Client, pollId: number): Promise<boolean> {
  const [poll] = await db
    .update(rehearsalPolls)
    .set({ status: "cancelled" })
    .where(and(eq(rehearsalPolls.id, pollId), inArray(rehearsalPolls.status, ["open", "awaiting_decision"])))
    .returning();
  if (!poll) return false;
  await postInPollChannel(client, poll, say("pollDropped"));
  return true;
}

// --- Reminders ------------------------------------------------------------------

export type ReminderKey = Extract<CopyKey, "remindBefore" | "remindDayOf">;

// Returns who it went to and who couldn't be DMed, or null if the rehearsal isn't scheduled.
export async function sendReminder(
  client: Client,
  rehearsalId: number,
  key: ReminderKey,
): Promise<{ recipients: string[]; failed: string[] } | null> {
  const [rehearsal] = await db.select().from(rehearsals).where(eq(rehearsals.id, rehearsalId));
  if (!rehearsal || rehearsal.status !== "scheduled") return null;

  const attendees = await db
    .select({ userId: rehearsalAttendees.userId })
    .from(rehearsalAttendees)
    .where(eq(rehearsalAttendees.rehearsalId, rehearsalId));
  const recipients = attendees.map((a) => a.userId);
  if (recipients.length === 0) return { recipients, failed: [] };

  const content = say(key, {
    when: formatWindow(rehearsal.startsAt, rehearsal.endsAt),
    time: formatTimes(rehearsal.startsAt, rehearsal.endsAt),
  });
  const failed = await dmOrMention(client, recipients, { content }, await rehearsalChannelId(rehearsal));
  return { recipients, failed };
}

// Every scheduled rehearsal that hasn't started yet, soonest first.
export async function upcomingRehearsals(): Promise<Rehearsal[]> {
  return db
    .select()
    .from(rehearsals)
    .where(and(eq(rehearsals.status, "scheduled"), gt(rehearsals.startsAt, new Date())))
    .orderBy(asc(rehearsals.startsAt));
}
