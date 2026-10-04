import {
  type ChatInputCommandInteraction,
  type GuildMember,
  type Interaction,
  MessageFlags,
  type ModalSubmitInteraction,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { config } from "../config.js";
import { say } from "../copy.js";
import { CANCEL_MODAL_ID, handleCancel, handleCancelSubmit } from "./cancel.js";
import { handleNext } from "./next.js";
import { handleRehearsal } from "./rehearsal.js";
import { handleRsvp } from "./rsvp.js";

export const naviCommand = new SlashCommandBuilder()
  .setName("navi")
  .setDescription("Hey! Listen!")
  .addSubcommand((s) =>
    s.setName("rehearsal").setDescription("Pick dates and send a rehearsal poll (admin)"),
  )
  .addSubcommand((s) => s.setName("next").setDescription("Show the next scheduled rehearsal"))
  .addSubcommand((s) =>
    s.setName("cancel").setDescription("Cancel an upcoming rehearsal or open poll (admin)"),
  )
  .addSubcommand((s) =>
    s.setName("rsvp").setDescription("Get reminders for the next rehearsal"),
  );

const adminSubcommands = new Set(["rehearsal", "cancel"]);

export function isAdmin(interaction: Interaction): boolean {
  const member = interaction.member as GuildMember | null;
  if (!member) return false;
  if (config.adminRoleId) return member.roles.cache.has(config.adminRoleId);
  return member.permissions.has(PermissionFlagsBits.ManageGuild);
}

export async function handleNaviCommand(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();

  if (adminSubcommands.has(sub) && !isAdmin(interaction)) {
    await interaction.reply({ content: say("notAllowed"), flags: MessageFlags.Ephemeral });
    return;
  }

  switch (sub) {
    case "rehearsal":
      return handleRehearsal(interaction);
    case "next":
      return handleNext(interaction);
    case "cancel":
      return handleCancel(interaction);
    case "rsvp":
      return handleRsvp(interaction);
  }
}

export async function handleModalSubmit(interaction: ModalSubmitInteraction) {
  if (interaction.customId !== CANCEL_MODAL_ID) return;
  // Re-check: the modal could outlive a role change.
  if (!isAdmin(interaction)) {
    await interaction.reply({ content: say("notAllowed"), flags: MessageFlags.Ephemeral });
    return;
  }
  return handleCancelSubmit(interaction);
}

// Guild commands update instantly (global commands can take up to an hour).
export async function registerCommands() {
  const rest = new REST().setToken(config.discordToken);
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
    body: [naviCommand.toJSON()],
  });
}
