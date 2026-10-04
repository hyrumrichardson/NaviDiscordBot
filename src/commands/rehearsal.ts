import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  MessageFlags,
  type MessageActionRowComponentBuilder,
  type MessageComponentInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { config } from "../config.js";
import { say } from "../copy.js";
import { db } from "../db/client.js";
import { pollOptions, rehearsalPolls, scheduledJobs } from "../db/schema.js";
import {
  addDays,
  dayLabel,
  formatMinutes,
  formatWindow,
  parseMinutes,
  zonedDate,
  zonedToUtc,
} from "../time.js";

// Poll answers are numbered in date order. Native polls allow at most 10 answers.
export const POLL_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"] as const;

// Component custom IDs: navi-reh:<draftId>:<action>
export const REHEARSAL_PREFIX = "navi-reh:";

const PICKER_DAYS = 25; // select menus hold at most 25 options
const SHIFT_MINUTES = 60;
const LENGTH_STEP_MINUTES = 30;
const MIN_LENGTH_MINUTES = 60;
const MAX_LENGTH_MINUTES = 6 * 60;
const DRAFT_TTL_MS = 30 * 60_000;

interface DayWindow {
  start: number; // minutes after local midnight
  length: number; // minutes
}

// The admin's in-progress poll. Kept in memory: a restart just means running the command again.
interface Draft {
  channelId: string;
  guildId: string;
  createdBy: string;
  days: Map<string, DayWindow>; // "2026-10-10" -> window
  editing: string | null;
  warning: string | null;
  touchedAt: number;
}

const drafts = new Map<string, Draft>();

function pruneDrafts() {
  const cutoff = Date.now() - DRAFT_TTL_MS;
  for (const [id, draft] of drafts) if (draft.touchedAt < cutoff) drafts.delete(id);
}

const defaultWindow = (): DayWindow => ({
  start: parseMinutes(config.rehearsal.defaultStart),
  length: config.rehearsal.defaultHours * 60,
});

const sortedDays = (draft: Draft) => [...draft.days.keys()].sort();

function windowInstants(date: string, w: DayWindow) {
  const startsAt = zonedToUtc(date, formatMinutes(w.start));
  return { startsAt, endsAt: new Date(startsAt.getTime() + w.length * 60_000) };
}

function render(draftId: string, draft: Draft) {
  const id = (action: string) => `${REHEARSAL_PREFIX}${draftId}:${action}`;
  const days = sortedDays(draft);
  const hasDays = days.length > 0;

  const lines = days.map((date, i) => {
    const { startsAt, endsAt } = windowInstants(date, draft.days.get(date)!);
    const marker = date === draft.editing ? "  ◀ *editing*" : "";
    return `${POLL_EMOJIS[i]} ${formatWindow(startsAt, endsAt)}${marker}`;
  });

  const content = [
    "**🧚 New rehearsal poll**",
    `Pick up to ${POLL_EMOJIS.length} days. Pick a day under *Edit time for…* to change its time.`,
    `The poll pings <@&${config.memberRoleId}> in <#${draft.channelId}> and closes in ${config.rehearsal.pollDurationHours} hours.`,
    "",
    hasDays ? lines.join("\n") : "*No days picked yet.*",
    draft.warning ? `\n${draft.warning}` : "",
  ].join("\n");

  const today = zonedDate(new Date());
  const pickerDates = Array.from({ length: PICKER_DAYS }, (_, i) => addDays(today, i + 1));
  const daySelect = new StringSelectMenuBuilder()
    .setCustomId(id("days"))
    .setPlaceholder("Pick days")
    .setMinValues(0)
    .setMaxValues(POLL_EMOJIS.length)
    .addOptions(
      pickerDates.map((date) =>
        new StringSelectMenuOptionBuilder()
          .setValue(date)
          .setLabel(dayLabel(date))
          .setDefault(draft.days.has(date)),
      ),
    );

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(daySelect),
  ];

  if (hasDays) {
    const editSelect = new StringSelectMenuBuilder()
      .setCustomId(id("edit"))
      .setPlaceholder("Edit time for…")
      .addOptions(
        days.map((date, i) =>
          new StringSelectMenuOptionBuilder()
            .setValue(date)
            .setLabel(dayLabel(date))
            .setEmoji(POLL_EMOJIS[i])
            .setDefault(date === draft.editing),
        ),
      );
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(editSelect));

    const button = (action: string, label: string) =>
      new ButtonBuilder().setCustomId(id(action)).setLabel(label).setStyle(ButtonStyle.Secondary);
    rows.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        button("earlier", "◀ 1 hr"),
        button("later", "1 hr ▶"),
        button("shorter", "− 30 min"),
        button("longer", "+ 30 min"),
        button("all", "Use for all days"),
      ),
    );
  }

  rows.push(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(id("submit"))
        .setLabel("Send poll")
        .setEmoji("🧚")
        .setStyle(ButtonStyle.Success)
        .setDisabled(!hasDays),
      new ButtonBuilder().setCustomId(id("discard")).setLabel("Discard").setStyle(ButtonStyle.Secondary),
    ),
  );

  return { content, components: rows };
}

export async function handleRehearsal(interaction: ChatInputCommandInteraction) {
  if (!interaction.inGuild() || !interaction.channel?.isSendable()) {
    await interaction.reply({
      content: "**Watch out!** I can't post a poll in this channel.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  pruneDrafts();
  const draftId = interaction.id;
  const draft: Draft = {
    channelId: interaction.channelId,
    guildId: interaction.guildId,
    createdBy: interaction.user.id,
    days: new Map(),
    editing: null,
    warning: null,
    touchedAt: Date.now(),
  };
  drafts.set(draftId, draft);
  await interaction.reply({ ...render(draftId, draft), flags: MessageFlags.Ephemeral });
}

export async function handleRehearsalComponent(interaction: MessageComponentInteraction) {
  const [, draftId, action] = interaction.customId.split(":");
  const draft = drafts.get(draftId);
  if (!draft || Date.now() - draft.touchedAt > DRAFT_TTL_MS) {
    drafts.delete(draftId);
    await interaction.update({ content: say("panelExpired"), components: [] });
    return;
  }
  draft.touchedAt = Date.now();
  draft.warning = null;

  const editing = draft.editing ? draft.days.get(draft.editing) : undefined;

  switch (action) {
    case "days": {
      if (!interaction.isStringSelectMenu()) return;
      const next = new Map<string, DayWindow>();
      for (const date of interaction.values) next.set(date, draft.days.get(date) ?? defaultWindow());
      draft.days = next;
      if (!draft.editing || !next.has(draft.editing)) draft.editing = sortedDays(draft)[0] ?? null;
      break;
    }
    case "edit":
      if (!interaction.isStringSelectMenu()) return;
      draft.editing = interaction.values[0] ?? draft.editing;
      break;
    case "earlier":
      if (editing && editing.start - SHIFT_MINUTES >= 0) editing.start -= SHIFT_MINUTES;
      break;
    case "later":
      if (editing && editing.start + SHIFT_MINUTES + editing.length <= 24 * 60) editing.start += SHIFT_MINUTES;
      break;
    case "shorter":
      if (editing && editing.length - LENGTH_STEP_MINUTES >= MIN_LENGTH_MINUTES) {
        editing.length -= LENGTH_STEP_MINUTES;
      }
      break;
    case "longer":
      if (
        editing &&
        editing.length + LENGTH_STEP_MINUTES <= MAX_LENGTH_MINUTES &&
        editing.start + editing.length + LENGTH_STEP_MINUTES <= 24 * 60
      ) {
        editing.length += LENGTH_STEP_MINUTES;
      }
      break;
    case "all":
      if (editing) for (const date of draft.days.keys()) draft.days.set(date, { ...editing });
      break;
    case "discard":
      drafts.delete(draftId);
      await interaction.update({ content: "Poll discarded. 🧚", components: [] });
      return;
    case "submit":
      return submit(interaction, draftId, draft);
  }

  await interaction.update(render(draftId, draft));
}

async function submit(interaction: MessageComponentInteraction, draftId: string, draft: Draft) {
  const hours = config.rehearsal.pollDurationHours;
  const windows = sortedDays(draft).map((date) => windowInstants(date, draft.days.get(date)!));
  if (windows.length === 0) return;

  // Every option has to start after voting ends, or the result would be useless.
  const estimatedClose = new Date(Date.now() + hours * 3_600_000);
  const tooSoon = windows.filter((w) => w.startsAt <= estimatedClose);
  if (tooSoon.length > 0) {
    draft.warning = `**Watch out!** These start before the poll closes in ${hours} hours: ${tooSoon
      .map((w) => formatWindow(w.startsAt, w.endsAt))
      .join(", ")}. Pick later days or move the times.`;
    await interaction.update(render(draftId, draft));
    return;
  }

  await interaction.deferUpdate();

  const channel = await interaction.client.channels.fetch(draft.channelId).catch(() => null);
  if (!channel?.isSendable()) {
    await interaction.editReply({ content: "**Watch out!** I can't post in that channel anymore.", components: [] });
    return;
  }

  const message = await channel.send({
    content: say("pollPosted", { role: `<@&${config.memberRoleId}>`, hours }),
    allowedMentions: { roles: [config.memberRoleId] },
    poll: {
      question: { text: "When can you make rehearsal? 🎵" },
      answers: windows.map((w, i) => ({ text: formatWindow(w.startsAt, w.endsAt), emoji: POLL_EMOJIS[i] })),
      duration: hours,
      allowMultiselect: true,
    },
  });

  // Discord numbers answers in the order sent; read them back rather than assume.
  const answerIds = message.poll ? [...message.poll.answers.keys()] : [];
  const closesAt = message.poll?.expiresAt ?? estimatedClose;

  try {
    await db.transaction(async (tx) => {
      const [poll] = await tx
        .insert(rehearsalPolls)
        .values({
          guildId: draft.guildId,
          channelId: draft.channelId,
          messageId: message.id,
          createdBy: draft.createdBy,
          closesAt,
        })
        .returning();
      await tx.insert(pollOptions).values(
        windows.map((w, i) => ({
          pollId: poll.id,
          answerId: answerIds[i] ?? i + 1,
          emoji: POLL_EMOJIS[i],
          startsAt: w.startsAt,
          endsAt: w.endsAt,
        })),
      );
      await tx.insert(scheduledJobs).values({ kind: "close_poll", refId: poll.id, runAt: closesAt });
    });
  } catch (err) {
    // Don't leave a poll up that Navi will never close.
    await message.delete().catch(() => {});
    throw err;
  }

  drafts.delete(draftId);
  await interaction.editReply({
    content: say("pollSent", { channel: `<#${draft.channelId}>`, hours }),
    components: [],
  });
}
