import { type GuildMember, type Interaction, PermissionFlagsBits } from "discord.js";
import { config } from "./config.js";

// Admin = has ADMIN_ROLE_ID if set, otherwise Manage Server. Always false in DMs.
export function isAdmin(interaction: Interaction): boolean {
  const member = interaction.member as GuildMember | null;
  if (!member) return false;
  if (config.adminRoleId) return member.roles.cache.has(config.adminRoleId);
  return member.permissions.has(PermissionFlagsBits.ManageGuild);
}
