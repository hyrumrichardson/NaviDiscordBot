import {
  type ChatInputCommandInteraction,
  type Client,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  type ModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";
import { say } from "../copy.js";
import { db } from "../db/client.js";
import {
  pollOptions,
  rehearsalAttendees,
  rehearsalPolls,
  rehearsals,
  scheduledJobs,
} from "../db/schema.js";
import { rehearsalChannelId } from "../rehearsals.js";
import { formatWindow } from "../time.js";

export const CANCEL_MODAL_ID = "navi-cancel";
const TARGET_FIELD_ID = "target";
// Select menus hold at most 25 options.
const MAX_OPTIONS = 25;

const truncate = (s: string, max = 100) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

// Everything that can still be cancelled: open polls and upcoming scheduled rehearsals.
async function cancellableItems() {
  const now = new Date();

  const upcoming = await db
    .select()
    .from(rehearsals)
    .where(and(eq(rehearsals.status, "scheduled"), gt(rehearsals.startsAt, now)))
    .orderBy(asc(rehearsals.startsAt));

  const openPolls = await db
    .select()
    .from(rehearsalPolls)
    .where(inArray(rehearsalPolls.status, ["open", "awaiting_decision"]))
    .orderBy(asc(rehearsalPolls.closesAt));

  const options =
    openPolls.length === 0
      ? []
      : await db
          .select()
          .from(pollOptions)
          .where(inArray(pollOptions.pollId, openPolls.map((p) => p.id)))
          .orderBy(asc(pollOptions.startsAt));

  const items = [
    ...upcoming.map((r) => ({
      value: `rehearsal:${r.id}`,
      label: `Rehearsal: ${formatWindow(r.startsAt, r.endsAt)}`,
      description: "Scheduled",
    })),
    ...openPolls.map((p) => {
      const dates = options.filter((o) => o.pollId === p.id).map((o) => formatWindow(o.startsAt, o.endsAt));
      return {
        value: `poll:${p.id}`,
        label: `Poll (${p.status === "open" ? "still voting" : "waiting on a decision"}): ${dates.length} option${dates.length === 1 ? "" : "s"}`,
        description: dates.join(" · ") || "No options",
      };
    }),
  ];
  return items.slice(0, MAX_OPTIONS);
}

export async function handleCancel(interaction: ChatInputCommandInteraction) {
  const items = await cancellableItems();
  if (items.length === 0) {
    await interaction.reply({ content: say("nothingToCancel"), flags: MessageFlags.Ephemeral });
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(TARGET_FIELD_ID)
    .setPlaceholder("Pick a rehearsal or poll")
    .addOptions(
      items.map((item) =>
        new StringSelectMenuOptionBuilder()
          .setValue(item.value)
          .setLabel(truncate(item.label))
          .setDescription(truncate(item.description)),
      ),
    );

  const modal = new ModalBuilder()
    .setCustomId(CANCEL_MODAL_ID)
    .setTitle("Cancel a rehearsal")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Which one should Navi cancel?")
        .setDescription("The channel will be told, and any pending reminders are dropped.")
        .setStringSelectMenuComponent(select),
    );

  await interaction.showModal(modal);
}

export async function handleCancelSubmit(interaction: ModalSubmitInteraction) {
  const [value] = interaction.fields.getStringSelectValues(TARGET_FIELD_ID);
  const [kind, rawId] = value.split(":");
  const id = Number(rawId);

  const done =
    kind === "poll"
      ? await cancelPoll(interaction.client, id)
      : await cancelRehearsal(interaction.client, id, interaction.channelId);

  await interaction.reply({
    content: done ? `Done. ${done}` : say("alreadyGone"),
    flags: MessageFlags.Ephemeral,
  });
}

// Returns a short description of what was cancelled, or null if it was no longer open.
async function cancelPoll(client: Client, pollId: number): Promise<string | null> {
  const [poll] = await db
    .update(rehearsalPolls)
    .set({ status: "cancelled" })
    .where(and(eq(rehearsalPolls.id, pollId), inArray(rehearsalPolls.status, ["open", "awaiting_decision"])))
    .returning();
  if (!poll) return null;

  await db
    .delete(scheduledJobs)
    .where(
      and(
        eq(scheduledJobs.kind, "close_poll"),
        eq(scheduledJobs.refId, pollId),
        isNull(scheduledJobs.completedAt),
      ),
    );

  const channel = await client.channels.fetch(poll.channelId).catch(() => null);
  if (channel?.isSendable()) {
    // End the native poll so people stop voting. The message may have been deleted.
    if (poll.messageId) {
      const message = await channel.messages.fetch(poll.messageId).catch(() => null);
      if (message?.poll && !message.poll.resultsFinalized) await message.poll.end().catch(() => {});
    }
    await channel.send(say("pollCancelled"));
  }
  return "The poll is cancelled.";
}

async function cancelRehearsal(
  client: Client,
  rehearsalId: number,
  fallbackChannelId: string | null,
): Promise<string | null> {
  const [rehearsal] = await db
    .update(rehearsals)
    .set({ status: "cancelled" })
    .where(and(eq(rehearsals.id, rehearsalId), eq(rehearsals.status, "scheduled")))
    .returning();
  if (!rehearsal) return null;

  await db
    .delete(scheduledJobs)
    .where(
      and(
        inArray(scheduledJobs.kind, ["remind_before", "remind_day_of"]),
        eq(scheduledJobs.refId, rehearsalId),
        isNull(scheduledJobs.completedAt),
      ),
    );

  // Post in the channel the poll ran in, or where the command was run.
  const channelId = (await rehearsalChannelId(rehearsal)) ?? fallbackChannelId;

  // Mention attendees so the people expecting reminders see it.
  const attendees = await db
    .select({ userId: rehearsalAttendees.userId })
    .from(rehearsalAttendees)
    .where(eq(rehearsalAttendees.rehearsalId, rehearsalId));
  const mentions = attendees.map((a) => `<@${a.userId}>`).join(" ");

  const when = formatWindow(rehearsal.startsAt, rehearsal.endsAt);
  const channel = channelId ? await client.channels.fetch(channelId).catch(() => null) : null;
  if (channel?.isSendable()) {
    await channel.send({
      content: [say("cancelled", { when }), mentions].filter(Boolean).join("\n"),
      allowedMentions: { users: attendees.map((a) => a.userId) },
    });
  }
  return `Rehearsal on ${when} is cancelled.`;
}
