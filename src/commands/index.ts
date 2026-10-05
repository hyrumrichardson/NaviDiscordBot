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
import { canDebug, isAdmin, isMember } from "../permissions.js";
import { DROP_PREFIX, PICK_PREFIX } from "../rehearsals.js";
import { CANCEL_MODAL_ID, handleCancel, handleCancelSubmit } from "./cancel.js";
import { handleDebugClosePoll, handleDebugSendReminders, REMINDER_OPTION } from "./debug.js";
import { handleDecisionButton } from "./decision.js";
import { GUIDE_CHANNEL_OPTION, GUIDE_CHANNEL_TYPES, handleGuideChannel } from "./guide.js";
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
    s.setName("rehearsal").setDescription("Pick dates and send a rehearsal poll (members)"),
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
  )
  .addSubcommand((s) =>
    s.setName("debug-close-poll").setDescription("Close every open rehearsal poll now, as if time ran out (admin)"),
  )
  .addSubcommand((s) =>
    s
      .setName("guide-channel")
      .setDescription("Post the command guide to a channel and keep it up to date (admin)")
      .addChannelOption((o) =>
        o
          .setName(GUIDE_CHANNEL_OPTION)
          .setDescription("Where the guide should live")
          .addChannelTypes(...GUIDE_CHANNEL_TYPES)
          .setRequired(true),
      ),
  );

const memberSubcommands = new Set(["rehearsal"]);
const adminSubcommands = new Set(["cancel", "guide-channel"]);
const debugSubcommands = new Set(["debug-send-reminders", "debug-close-poll"]);

export async function handleNaviCommand(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();

  if (memberSubcommands.has(sub) && !isMember(interaction)) {
    await interaction.reply({ content: say("notMember"), flags: MessageFlags.Ephemeral });
    return;
  }
  const allowed = adminSubcommands.has(sub)
    ? isAdmin(interaction)
    : debugSubcommands.has(sub)
      ? canDebug(interaction)
      : true;
  if (!allowed) {
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
    case "debug-close-poll":
      return handleDebugClosePoll(interaction);
    case "guide-channel":
      return handleGuideChannel(interaction);
  }
}

export async function handleModalSubmit(interaction: ModalSubmitInteraction) {
  const id = interaction.customId;
  // The rehearsal panel's custom-time pop-up: anyone can run /navi rehearsal.
  if (id.startsWith(REHEARSAL_PREFIX)) return handleRehearsalModal(interaction);
  if (id !== CANCEL_MODAL_ID) return;
  // Re-check: the modal could outlive a role change.
  if (!isAdmin(interaction)) {
    await interaction.reply({ content: say("notAllowed"), flags: MessageFlags.Ephemeral });
    return;
  }
  return handleCancelSubmit(interaction);
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
