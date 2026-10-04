import type { Client } from "discord.js";
import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import { config } from "./config.js";
import { db } from "./db/client.js";
import { scheduledJobs } from "./db/schema.js";
import { zonedDate, zonedToUtc } from "./time.js";

type Job = typeof scheduledJobs.$inferSelect;
type JobHandler = (client: Client, job: Job) => Promise<void>;

const MAX_ATTEMPTS = 5;
const TICK_MS = 60_000;

// Queue the 48 h and day-of reminders for a rehearsal. A reminder whose time has
// already passed (e.g. the poll closed 30 h before rehearsal) is skipped rather than
// sent late. So is a day-of reminder that would land at or after the start time.
export async function queueReminders(rehearsalId: number, startsAt: Date, now = new Date()) {
  const remindBefore = new Date(startsAt.getTime() - config.rehearsal.reminderHoursBefore * 3_600_000);
  const remindDayOf = zonedToUtc(zonedDate(startsAt), config.rehearsal.dayOfReminderTime);

  const jobs: (typeof scheduledJobs.$inferInsert)[] = [];
  if (remindBefore > now) jobs.push({ kind: "remind_before", refId: rehearsalId, runAt: remindBefore });
  if (remindDayOf > now && remindDayOf < startsAt) {
    jobs.push({ kind: "remind_day_of", refId: rehearsalId, runAt: remindDayOf });
  }
  if (jobs.length > 0) await db.insert(scheduledJobs).values(jobs);
}

// TODO(phase 1): implement each handler.
const handlers: Record<Job["kind"], JobHandler> = {
  // Skip if the poll is no longer open (e.g. cancelled). Otherwise read the votes,
  // snapshot them into poll_votes and pick the option with the most votes, then:
  // - Tie for most votes: DM the poll creator and ask them to pick one of the tied times.
  // - Fewer than config.rehearsal.minTurnout votes: DM the poll creator to confirm or drop it.
  // - Otherwise: create the rehearsal, post say("pollClosed") in the channel and call
  //   queueReminders(). The two DM paths do the same once the creator answers.
  close_poll: async () => {},
  // DM attendees say("remindBefore").
  remind_before: async () => {},
  // DM attendees say("remindDayOf").
  remind_day_of: async () => {},
};

async function tick(client: Client) {
  const due = await db
    .select()
    .from(scheduledJobs)
    .where(
      and(
        isNull(scheduledJobs.completedAt),
        lte(scheduledJobs.runAt, new Date()),
        sql`${scheduledJobs.attempts} < ${MAX_ATTEMPTS}`,
      ),
    )
    .orderBy(asc(scheduledJobs.runAt));

  for (const job of due) {
    try {
      await handlers[job.kind](client, job);
      await db
        .update(scheduledJobs)
        .set({ completedAt: new Date(), attempts: job.attempts + 1, lastError: null })
        .where(eq(scheduledJobs.id, job.id));
    } catch (err) {
      console.error(`Job ${job.id} (${job.kind}) failed:`, err);
      await db
        .update(scheduledJobs)
        .set({ attempts: job.attempts + 1, lastError: String(err) })
        .where(eq(scheduledJobs.id, job.id));
    }
  }
}

export function startScheduler(client: Client) {
  const run = () => tick(client).catch((err) => console.error("Scheduler tick failed:", err));
  run();
  return setInterval(run, TICK_MS);
}
