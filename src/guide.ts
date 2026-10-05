// The command guide: docs/member-help.txt is published into a Discord channel, not copy-pasted.
// /navi guide-channel posts it and stores the message IDs. On every startup, syncGuides()
// compares the file with the live messages and edits them in place if they've drifted, so
// editing the .txt and redeploying is enough to update the server.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Client, SendableChannels } from "discord.js";
import { eq, isNotNull } from "drizzle-orm";
import { db } from "./db/client.js";
import { guildSettings } from "./db/schema.js";

// Repo root (src/ in dev, dist/ in Docker, both one level down).
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const GUIDE_FILE = "docs/member-help.txt";

// Optional section divider in the .txt. Long guides are split here first.
const DIVIDER = "\n━━━━━━━━━━━━━━━━━━━━━━━━\n";
const MAX_MESSAGE_LENGTH = 1900;

export function readGuide(): string {
  return readFileSync(join(ROOT, GUIDE_FILE), "utf-8").replace(/\r\n/g, "\n").trimEnd();
}

// Split the guide so each message stays under Discord's 2000-char limit: at section
// dividers first, then at line breaks for any section that is still too long.
export function splitGuide(text: string, maxLen = MAX_MESSAGE_LENGTH): string[] {
  if (text.length <= maxLen) return [text];

  const pack = (pieces: string[], joiner: string) => {
    const chunks: string[] = [];
    let current = "";
    for (const piece of pieces) {
      const candidate = current ? current + joiner + piece : piece;
      if (current && candidate.length > maxLen) {
        chunks.push(current);
        current = piece;
      } else {
        current = candidate;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  };

  return pack(text.split(DIVIDER), DIVIDER).flatMap((chunk) =>
    chunk.length <= maxLen ? [chunk] : pack(chunk.split("\n"), "\n"),
  );
}

// Edit the existing messages in place, send any extra ones at the end, and delete leftovers
// from a longer previous version. Returns the message IDs in order.
export async function postOrUpdateGuide(
  channel: SendableChannels,
  chunks: string[],
  existingIds: string[],
): Promise<string[]> {
  const existing = await Promise.all(
    existingIds.map((id) => channel.messages.fetch(id).catch(() => null)),
  );

  // If one of the messages we'd edit was deleted by hand, a replacement would land at the
  // bottom and scramble the order. Repost the whole guide instead.
  if (existing.slice(0, chunks.length).some((m) => !m)) {
    await deleteGuideMessages(channel, existingIds);
    existing.length = 0;
  }

  const ids: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const payload = { content: chunks[i], allowedMentions: { parse: [] } };
    const message = existing[i];
    if (message) {
      if (message.content !== chunks[i]) await message.edit(payload);
      ids.push(message.id);
    } else {
      ids.push((await channel.send(payload)).id);
    }
  }
  await deleteGuideMessages(channel, existingIds.slice(chunks.length));
  return ids;
}

export async function deleteGuideMessages(channel: SendableChannels, ids: string[]) {
  for (const id of ids) {
    const message = await channel.messages.fetch(id).catch(() => null);
    await message?.delete().catch(() => {});
  }
}

// Startup: bring every posted guide in line with the file.
export async function syncGuides(client: Client) {
  const rows = await db.select().from(guildSettings).where(isNotNull(guildSettings.guideChannelId));
  if (rows.length === 0) return;

  let chunks: string[];
  try {
    chunks = splitGuide(readGuide());
  } catch (err) {
    console.error(`[guide] Couldn't read ${GUIDE_FILE}:`, err);
    return;
  }

  for (const row of rows) {
    try {
      const channel = await client.channels.fetch(row.guideChannelId!).catch(() => null);
      if (!channel?.isSendable()) {
        console.warn(`[guide] Channel ${row.guideChannelId} is gone or not sendable. Skipping.`);
        continue;
      }

      const live = await Promise.all(
        row.guideMessageIds.map((id) => channel.messages.fetch(id).then((m) => m.content).catch(() => null)),
      );
      const upToDate = live.length === chunks.length && live.every((content, i) => content === chunks[i]);
      if (upToDate) continue;

      const ids = await postOrUpdateGuide(channel, chunks, row.guideMessageIds);
      await db.update(guildSettings).set({ guideMessageIds: ids }).where(eq(guildSettings.guildId, row.guildId));
      console.log(`[guide] Updated the command guide in #${"name" in channel ? channel.name : channel.id}.`);
    } catch (err) {
      console.error(`[guide] Update failed for guild ${row.guildId}:`, err);
    }
  }
}
