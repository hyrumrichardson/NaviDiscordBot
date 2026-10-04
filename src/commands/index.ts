import {
  type ChatInputCommandInteraction,
  MessageFlags,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { config } from "../config.js";
import { say } from "../copy.js";
import { isAdmin } from "../permissions.js";
import { DROP_PREFIX, PICK_PREFIX } from "../rehearsals.js";
import { CANCEL_MODAL_ID, handleCancel, handleCancelSubmit } from "./cancel.js";
import { handleDebugSendReminders, REMINDER_OPTION } from "./debug.js";
import { handleDecisionButton } from "./decision.js";
import { handleNext } from "./next.js";
import {
  handleRehearsal,
  handleRehearsalComponent,
  handleRehearsalModal,
  REHEARSAL_PREFIX,
} from "./rehearsal.js";
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
  )
  .addSubcommand((s) =>
    s
      .setName("debug-send-reminders")
      .setDescription("Send reminder DMs now for upcoming rehearsals (admin)")
      .addStringOption((o) =>
        o
          .setName(REMINDER_OPTION)
          .setDescription("Which reminder to send (default: 48-hour)")
          .addChoices(
            { name: "48-hour reminder", value: "remindBefore" },
            { name: "Day-of reminder", value: "remindDayOf" },
          ),
      ),
  );

const adminSubcommands = new Set(["rehearsal", "cancel"]);

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
    case "debug-send-reminders":
      return handleDebugSendReminders(interaction);
  }
}

export async function handleModalSubmit(interaction: ModalSubmitInteraction) {
  const id = interaction.customId;
  if (id !== CANCEL_MODAL_ID && !id.startsWith(REHEARSAL_PREFIX)) return;
  // Re-check: the modal could outlive a role change.
  if (!isAdmin(interaction)) {
    await interaction.reply({ content: say("notAllowed"), flags: MessageFlags.Ephemeral });
    return;
  }
  if (id === CANCEL_MODAL_ID) return handleCancelSubmit(interaction);
  return handleRehearsalModal(interaction);
}

// Buttons and select menus. The rehearsal panel is ephemeral, so only its admin sees it.
export async function handleComponent(interaction: MessageComponentInteraction) {
  const id = interaction.customId;
  if (id.startsWith(REHEARSAL_PREFIX)) return handleRehearsalComponent(interaction);
  if (interaction.isButton() && (id.startsWith(PICK_PREFIX) || id.startsWith(DROP_PREFIX))) {
    return handleDecisionButton(interaction);
  }
}

// Guild commands update instantly (global commands can take up to an hour).
export async function registerCommands() {
  const rest = new REST().setToken(config.discordToken);
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
    body: [naviCommand.toJSON()],
  });
}
