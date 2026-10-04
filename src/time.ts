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
