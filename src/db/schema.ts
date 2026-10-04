import {
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// All timestamps are stored in UTC and displayed in config.timeZone.

export const pollStatus = pgEnum("poll_status", ["open", "closed", "cancelled"]);
export const rehearsalStatus = pgEnum("rehearsal_status", ["scheduled", "cancelled", "done"]);
export const attendeeSource = pgEnum("attendee_source", ["poll", "rsvp"]);
export const jobKind = pgEnum("job_kind", ["close_poll", "remind_before", "remind_day_of"]);

export const rehearsalPolls = pgTable("rehearsal_polls", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  channelId: text("channel_id").notNull(),
  messageId: text("message_id"),
  createdBy: text("created_by").notNull(),
  closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
  status: pollStatus("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pollOptions = pgTable("poll_options", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id")
    .notNull()
    .references(() => rehearsalPolls.id, { onDelete: "cascade" }),
  // Discord's native poll answer_id (1-10)
  answerId: integer("answer_id").notNull(),
  emoji: text("emoji").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
});

// Snapshot of votes taken when the poll closes.
export const pollVotes = pgTable(
  "poll_votes",
  {
    pollOptionId: integer("poll_option_id")
      .notNull()
      .references(() => pollOptions.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.pollOptionId, t.userId] })],
);

export const rehearsals = pgTable("rehearsals", {
  id: serial("id").primaryKey(),
  pollOptionId: integer("poll_option_id").references(() => pollOptions.id),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  status: rehearsalStatus("status").notNull().default("scheduled"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rehearsalAttendees = pgTable(
  "rehearsal_attendees",
  {
    rehearsalId: integer("rehearsal_id")
      .notNull()
      .references(() => rehearsals.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    source: attendeeSource("source").notNull(),
  },
  (t) => [primaryKey({ columns: [t.rehearsalId, t.userId] })],
);

// Durable job queue so reminders survive restarts. The scheduler checks it every minute.
export const scheduledJobs = pgTable("scheduled_jobs", {
  id: serial("id").primaryKey(),
  kind: jobKind("kind").notNull(),
  // rehearsal_polls.id for close_poll, rehearsals.id for reminders
  refId: integer("ref_id").notNull(),
  runAt: timestamp("run_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
});
