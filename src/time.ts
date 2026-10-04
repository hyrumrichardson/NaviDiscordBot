import { config } from "./config.js";

// Offset (ms) of `timeZone` from UTC at the given instant, e.g. -5h for Chicago in summer.
function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - instant.getTime();
}

// "2026-10-10" + "14:00" in the band's time zone -> the matching UTC instant.
export function zonedToUtc(date: string, time: string, timeZone = config.timeZone): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  // Apply the offset twice so times right after a DST change land correctly.
  const guess = naive - offsetMs(new Date(naive), timeZone);
  return new Date(naive - offsetMs(new Date(guess), timeZone));
}

// The calendar date ("2026-10-10") of an instant in the band's time zone.
export function zonedDate(instant: Date, timeZone = config.timeZone): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, dateStyle: "short" }).format(instant);
}

// "2026-10-10" + 3 -> "2026-10-13". Pure calendar math, no time zone involved.
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// "2026-10-10" -> "Sat, Oct 10"
export function dayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

// "14:00" -> 840
export function parseMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// 840 -> "14:00"
export function formatMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

// A clock window given as minutes after midnight -> "2:00 – 5:00 PM". No date or time zone.
export function formatClockRange(start: number, length: number): string {
  const at = (minutes: number) => new Date(Date.UTC(2000, 0, 1, 0, minutes));
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" }).formatRange(
    at(start),
    at(start + length),
  );
}

// Possible minutes-after-midnight for one side of a typed range ("2", "2:30pm", "14:00").
function clockCandidates(text: string): number[] | null {
  const match = /^(\d{1,2})(?::(\d{2}))?(am|pm|a|p)?$/.exec(text);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3]?.[0];
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    return [(hour % 12) * 60 + minute + (meridiem === "p" ? 12 * 60 : 0)];
  }
  if (hour > 23) return null;
  // "14:00" or "0:30" is clearly 24-hour. "2" could be 2 AM or 2 PM.
  if (hour === 0 || hour > 12) return [hour * 60 + minute];
  return [(hour % 12) * 60 + minute, (hour % 12) * 60 + minute + 12 * 60];
}

// "2-5", "2-5pm", "1:30pm to 4:30pm", "11-2", "14:00-17:00" -> { start, length } in minutes.
// When am/pm is missing, picks the shortest window that ends after it starts, preferring
// one that starts between 8 AM and 8 PM (so "6-9" is evening, "10-1" is late morning).
export function parseTimeRange(text: string): { start: number; length: number } | null {
  const normalized = text.toLowerCase().replace(/\s*(?:to|–|—|-)\s*/g, "-").replace(/\s+|\./g, "");
  const parts = normalized.split("-");
  if (parts.length !== 2) return null;
  const starts = clockCandidates(parts[0]);
  const ends = clockCandidates(parts[1]);
  if (!starts || !ends) return null;

  const daytime = (start: number) => start >= 8 * 60 && start <= 20 * 60;
  let best: { start: number; length: number } | null = null;
  for (const start of starts) {
    for (const end of ends) {
      const length = end - start;
      if (length <= 0) continue;
      if (
        !best ||
        length < best.length ||
        (length === best.length && daytime(start) && !daytime(best.start))
      ) {
        best = { start, length };
      }
    }
  }
  return best;
}

// "2:00 – 5:00 PM"
export function formatTimes(startsAt: Date, endsAt: Date, timeZone = config.timeZone): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).formatRange(startsAt, endsAt);
}

// "Sat, Oct 10, 2:00 – 5:00 PM"
export function formatWindow(startsAt: Date, endsAt: Date, timeZone = config.timeZone): string {
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(startsAt);
  return `${day}, ${formatTimes(startsAt, endsAt, timeZone)}`;
}
