import { type ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { say } from "../copy.js";
import { db } from "../db/client.js";
import { rehearsalAttendees } from "../db/schema.js";
import { nextRehearsal } from "../rehearsals.js";
import { formatWindow } from "../time.js";

// Opt in to reminders for the next rehearsal (for anyone who missed the poll).
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
}
