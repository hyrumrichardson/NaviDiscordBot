import { type GuildMember, type Interaction, PermissionFlagsBits } from "discord.js";
import { config } from "./config.js";

// Admin = has ADMIN_ROLE_ID if set, otherwise Manage Server. Always false in DMs.
export function isAdmin(interaction: Interaction): boolean {
  const member = interaction.member as GuildMember | null;
  if (!member) return false;
  if (config.adminRoleId) return member.roles.cache.has(config.adminRoleId);
  return member.permissions.has(PermissionFlagsBits.ManageGuild);
}

// Has the band member role (MEMBER_ROLE_ID, the role polls ping).
export function isMember(interaction: Interaction): boolean {
  const member = interaction.member as GuildMember | null;
  return !!member && member.roles.cache.has(config.memberRoleId);
}

// Debug commands: Manage Server OR the ADMIN_ROLE_ID role.
export function canDebug(interaction: Interaction): boolean {
  const member = interaction.member as GuildMember | null;
  if (!member) return false;
  return (
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    (!!config.adminRoleId && member.roles.cache.has(config.adminRoleId))
  );
}
