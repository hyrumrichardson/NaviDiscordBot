import type { Client } from "discord.js";
import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import { db } from "./db/client.js";
import { scheduledJobs } from "./db/schema.js";
import { closePoll, sendReminder } from "./rehearsals.js";

type Job = typeof scheduledJobs.$inferSelect;
type JobHandler = (client: Client, job: Job) => Promise<unknown>;

const MAX_ATTEMPTS = 5;
const TICK_MS = 60_000;

const handlers: Record<Job["kind"], JobHandler> = {
  close_poll: (client, job) => closePoll(client, job.refId),
  remind_before: (client, job) => sendReminder(client, job.refId, "remindBefore"),
  remind_day_of: (client, job) => sendReminder(client, job.refId, "remindDayOf"),
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
  // A slow tick (lots of DMs) must not overlap the next one, or jobs would run twice.
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await tick(client);
    } catch (err) {
      console.error("Scheduler tick failed:", err);
    } finally {
      running = false;
    }
  };
  run();
  return setInterval(run, TICK_MS);
}
