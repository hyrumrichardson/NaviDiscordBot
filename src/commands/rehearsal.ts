import { type ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { say } from "../copy.js";

// Poll answers are numbered in date order. Native polls allow at most 10 answers.
export const POLL_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"] as const;

// TODO(phase 1):
// 1. Reply ephemerally with a multi-select of the next 25 days.
// 2. Show selected days below, each with its own time window (default from config).
// 3. An "Edit time for…" select picks a day; "◀ 1 hr" / "1 hr ▶" shift that day's window.
//    Submit sends the poll.
// 4. Post a native poll mentioning config.memberRoleId, save rehearsal_polls + poll_options,
//    and queue a close_poll job at closesAt.
export async function handleRehearsal(interaction: ChatInputCommandInteraction) {
  await interaction.reply({ content: say("notBuiltYet"), flags: MessageFlags.Ephemeral });
}
