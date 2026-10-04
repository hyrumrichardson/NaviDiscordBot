function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name} (see .env.example)`);
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const config = {
  discordToken: required("DISCORD_TOKEN"),
  clientId: required("DISCORD_CLIENT_ID"),
  guildId: required("GUILD_ID"),
  memberRoleId: required("MEMBER_ROLE_ID"),
  adminRoleId: process.env.ADMIN_ROLE_ID || null,
  databaseUrl: required("DATABASE_URL"),
  timeZone: optional("TZ", "America/Chicago"),

  rehearsal: {
    defaultStart: optional("REHEARSAL_DEFAULT_START", "14:00"),
    defaultHours: Number(optional("REHEARSAL_DEFAULT_HOURS", "3")),
    pollDurationHours: Number(optional("POLL_DURATION_HOURS", "24")),
    reminderHoursBefore: Number(optional("REMINDER_HOURS_BEFORE", "48")),
    dayOfReminderTime: optional("DAY_OF_REMINDER_TIME", "09:00"),
    // Fewer votes than this for the winning time -> ask the poll creator to confirm.
    minTurnout: Number(optional("MIN_TURNOUT", "4")),
  },
};
