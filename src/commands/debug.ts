import {
  type ChatInputCommandInteraction,
  type GuildMember,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { config } from "../config.js";
import { say } from "../copy.js";
import { type ReminderKey, sendReminder, upcomingRehearsals } from "../rehearsals.js";
import { formatWindow } from "../time.js";

export const REMINDER_OPTION = "reminder";

// /navi debug-send-reminders: send a reminder now for every upcoming rehearsal, using the
// same function as the scheduler. The scheduled reminders still go out as normal.
// Allowed for Manage Server OR the ADMIN_ROLE_ID role.
export async function handleDebugSendReminders(interaction: ChatInputCommandInteraction) {
  const member = interaction.member as GuildMember | null;
  const allowed =
    !!member &&
    (member.permissions.has(PermissionFlagsBits.ManageGuild) ||
      (!!config.adminRoleId && member.roles.cache.has(config.adminRoleId)));
  if (!allowed) {
    await interaction.reply({ content: say("notAllowed"), flags: MessageFlags.Ephemeral });
    return;
  }

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
