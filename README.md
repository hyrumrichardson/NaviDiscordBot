# Navi 🧚

> *Hey! Listen!*

A Discord bot for **Final Bossa**. It schedules rehearsals and sends reminders, and later it will manage set lists and sheet music. It's named after the fairy from *The Legend of Zelda*, and it talks like her.

---

## Status

The project skeleton is in place. The bot boots, runs database migrations, registers `/navi` and runs the scheduler.

**Phase 1 is built:** `/navi rehearsal`, `/navi next`, `/navi cancel`, `/navi rsvp`, closing the poll (including the tie and low-turnout DMs to the poll creator), and both reminder DMs. Most of the logic lives in `src/rehearsals.ts`. The rehearsal panel is in `src/commands/rehearsal.ts`.

To test locally without pinging the band, point `.env` at the test server and set `POLL_DURATION_HOURS=1`, the shortest poll Discord allows.

## Repo layout

```
.
├── src/
│   ├── index.ts            # Entry point: migrate DB → log in → register commands → start scheduler
│   ├── config.ts           # Reads env vars (see .env.example)
│   ├── copy.ts             # Everything Navi says (Zelda lines live here)
│   ├── scheduler.ts        # Checks scheduled_jobs every minute (poll close + reminders)
│   ├── commands/
│   │   ├── index.ts        # /navi definition, admin check, subcommand router
│   │   ├── rehearsal.ts    # /navi rehearsal
│   │   ├── next.ts         # /navi next
│   │   ├── cancel.ts       # /navi cancel
│   │   └── rsvp.ts         # /navi rsvp
│   └── db/
│       ├── schema.ts       # Drizzle table definitions
│       └── client.ts       # Postgres pool + migration runner
├── drizzle/                # Generated SQL migrations (committed; applied on startup)
├── scripts/update.sh       # Unraid: git pull + rebuild + restart
├── Dockerfile
├── docker-compose.yml      # navi + postgres
├── drizzle.config.ts
└── .env.example
```

## Stack

| Piece        | Choice                                    | Why |
|--------------|-------------------------------------------|-----|
| Language     | TypeScript (Node 22)                      | Best-supported Discord library |
| Discord lib  | [discord.js](https://discord.js.org) v14  | Supports modals, select menus, buttons and native polls |
| Database     | PostgreSQL 16                             | Stores rehearsals, votes and reminders, and later songs and set lists |
| DB access    | Drizzle ORM + migrations                  | Lightweight and typed |
| Scheduling   | Jobs stored in a Postgres table, checked every minute | Reminders still go out after a restart |
| Run locally  | `docker compose` (bot + postgres)         | One command to start testing |

---

## Phase 1: Rehearsal scheduling

### Roles

- **Admin**: anyone with `Manage Server`, or a dedicated `Navi Admin` role. Only admins can run `/navi rehearsal`.
- **Final Bossa Member**: a new role. Polls ping this role instead of `@everyone`, so the rest of the server isn't bothered. The role to ping can be changed in config.

### `/navi rehearsal` flow

1. **Admin runs `/navi rehearsal`.** Navi replies with a panel that only the admin can see.
   - Discord modals can only hold text inputs and select menus. There is **no calendar or date-picker component**. So the "calendar" is a multi-select listing the next 25 days (e.g. `Sat Oct 10`, `Sun Oct 11`, …). If we need more than 25 days, we can add a "next month" button.
2. **Admin picks days.** The selected days appear as a list under the picker, each with the default time **2:00–5:00 PM**.
3. **Admin adjusts times, one day at a time.** Each day has its own time window. The admin picks a day from a second dropdown ("Edit time for…"), then picks a time from the **Time** dropdown. It lists 3-hour windows from 10 AM–1 PM through 6–9 PM. **Custom…** opens a pop-up where they can type any time between 1 and 8 hours long, e.g. `1:30-4:30pm`, `11-2` or `18:00-21:00`. Without am/pm, Navi assumes daytime: `6-9` means evening and `10-1` means late morning. The other days keep their own times. **Use this time for all days** copies the current day's time to every day.
   - The panel is held in memory for 30 minutes. If the bot restarts, run the command again.
   - Submit refuses any day that would start before the poll closes.
4. **Admin hits Submit.** Navi posts a **native Discord poll** in the channel:
   - Message: `@Final Bossa Member` plus a Zelda-flavoured intro (see [Voice](#voice--copy))
   - One answer per date/time, numbered in date order: 1️⃣ 2️⃣ 3️⃣ … 🔟
   - "Poll closes in 24 hours"
   - Multiple answers allowed (people can say yes to every day that works)
   - Native polls allow at most **10 answers**. That's plenty for one rehearsal.
5. **Poll closes after 24 hours.** Navi reads the votes and posts the result in **the same channel**:
   *"Rehearsal will be **Sat Oct 10, 2–5 PM**."*
   - The winner is the answer with the most votes.
   - **Tie:** Navi sends the person who set up the poll a DM with one button per tied time, and waits for them to pick one.
   - **Low turnout:** if the winning time has fewer than **4** votes (`MIN_TURNOUT`), Navi DMs the poll creator to **confirm** the time or **drop** it.
   - Navi only posts the result and queues reminders once the creator has answered either DM.
6. **48 hours before rehearsal**, Navi sends a DM to everyone who voted for the winning time.
7. **9:00 AM on rehearsal day**, Navi sends a second DM to the same people.
   - Any reminder whose time has **already passed** when the rehearsal is set is skipped, not sent late. For example, if the poll closes 30 hours before rehearsal, only the 9 AM reminder goes out. A 9 AM reminder for a rehearsal that starts before 9 AM is skipped too.
   - If someone has DMs turned off, Navi falls back to a single channel post that mentions them.

### Other commands (small, but useful)

- `/navi next`: shows the next scheduled rehearsal.
- `/navi cancel` *(built)*: admin only. Opens a modal with a dropdown of everything that can be cancelled: every upcoming scheduled rehearsal **and** every poll still taking votes (up to 25).
  - **Rehearsal:** marks it cancelled, deletes its pending reminders, and posts in the poll's channel, mentioning everyone who was expecting reminders.
  - **Open poll:** marks it cancelled, deletes its `close_poll` job, ends the Discord poll so nobody keeps voting, and posts a notice in the channel.
  - If nothing can be cancelled, Navi says so instead of opening the modal.
- `/navi rsvp`: lets someone who missed the poll opt in to reminders for the upcoming rehearsal.
- `/navi debug-send-reminders [reminder]`: Anyone with **Manage Server** or the `ADMIN_ROLE_ID` role can use it. Sends the 48-hour (default) or day-of reminder **right now** for every upcoming rehearsal, using the same function as the scheduler, then tells you privately how many people were DMed. The scheduled reminders still go out as normal.
- `/navi debug-close-poll`: same permissions. Closes **every open poll right now** by calling `closePoll()`, the function the scheduled job runs when a poll's time is up. It ends the Discord poll early, counts the votes, then posts the result or DMs the creator about a tie or low turnout. It then tells you privately what happened to each poll. The poll's scheduled close job is marked done, so it won't run again.

### Data model (phase 1)

```
rehearsal_polls     id, guild_id, channel_id, message_id, created_by, closes_at, status (open|awaiting_decision|closed|cancelled)
poll_options        id, poll_id, answer_id, emoji, starts_at, ends_at
poll_votes          poll_option_id, user_id                -- snapshot taken when the poll closes
rehearsals          id, poll_option_id, starts_at, ends_at, status (scheduled|cancelled|done)
rehearsal_attendees rehearsal_id, user_id, source (poll|rsvp)
scheduled_jobs      id, kind (close_poll|remind_before|remind_day_of), ref_id, run_at, completed_at, attempts, last_error
```

All times are stored in UTC and shown in the band's time zone (`TZ` in config, default `America/Chicago`).

A poll waiting on its creator to break a tie or confirm low turnout has status `awaiting_decision`. The creator's DM has buttons. If their DMs are closed, the buttons are posted in the channel instead, and only the creator or an admin can use them.

---

## Voice & copy

Every message Navi sends should sound like a Zelda character. Navi's own lines (*"Hey!"*, *"Listen!"*, *"Look!"*, *"Watch out!"*, *"Hello!"*) come first, then lines from the rest of the series. Navi picks at random from a small pool for each message type so reminders don't get stale.

| Moment | Example copy |
|---|---|
| Poll posted | **Hey! Listen!** 🧚 @Final Bossa Member, when can you make rehearsal? *It's dangerous to go alone!* Vote below. Poll closes in 24 hours. |
| Poll posted (alt) | **Dawn of the First Day.** ⏳ *-24 Hours Remain-*. Vote for every time that works for you! |
| Poll closed | **Look!** 👀 The Great Deku Tree has spoken. Rehearsal will be **Sat Oct 10, 2–5 PM**. |
| No votes | *You've met with a terrible fate, haven't you?* Nobody voted. Try another set of dates? |
| 48 h DM | **Hey! Listen!** Rehearsal is in two days: **Sat Oct 10, 2–5 PM**. *Dawn of the Second-to-Last Day, 48 Hours Remain.* Dust off your ocarina. 🎵 |
| Day-of DM (9 AM) | **Watch out!** ⚔️ *Dawn of the Final Day.* Rehearsal is **today, 2–5 PM**. *It's dangerous to go alone, take this:* 🎼 |
| Day-of DM (alt) | **Hello!** Kaepora Gaebora here. Hoo hoo! Rehearsal is today at 2 PM. *Did you get all that? Do you want to hear what I said again?* `[Yes] [No]` |
| Cancelled | *Well, excuse me, Princess!* Rehearsal on Sat Oct 10 is **cancelled**. |
| RSVP confirmed | *You got the Rehearsal Reminder!* 🎶 *(da-na-na-naaa)* |

The copy lives in one file (`src/copy.ts`) so anyone in the band can add lines.

---

## Future phases (notes only, nothing built)

> **Not started.** These are notes so the ideas aren't lost. No code, tables or commands exist for them yet. Phase 1 ships first, and each later phase gets designed properly before any of it is written.

### Phase 2: Song library
**Goal:** one place that knows every song we play and every arrangement (chart) for each part.

- Store songs and their charts in Postgres, alongside the rehearsal data.
- **Where the charts come from** (one or both):
  - **Google Drive**: a service account with read-only access to the band's arrangements folder.
  - **Discord**: go through the attachments already posted in the arrangements channel.
- **Sort each file by part using its filename**, with a mapping table we can edit:
  - `alto`, `alto sax`, `Eb`, `E♭` → **Alto Sax**
  - `tenor`, `Bb tenor` → **Tenor Sax**
  - `trumpet`, `Bb tpt` → **Trumpet**
  - `bass`, `bass clef` → … etc.
  - Files Navi can't place go into an "unsorted" list for a person to tag.
- Things to decide later:
  - Should Drive be the source of truth, or the database?
  - Do we store the files themselves, or only links to them?
  - How do we handle a file that covers more than one part, like `Eb` for both alto and bari?

### Phase 3: Set lists, gigs & sub packets
**Goal:** a sub can join the server, say what they're playing, and get every chart they need for a gig in one download.

- `/navi setlist upload`: create a gig (date, venue) and attach an ordered set list of songs from the library.
- `/navi part <instrument> gig:<gig>`: tell Navi what you're playing at that gig. Navi keeps track of who's covering each part at each gig.
- `/navi music gig:<gig>`: Navi builds a **zip of every chart for your part**, in set-list order.
  - Discord's upload limit on a server without boosts is about 10 MB. Bigger zips should go out as a Drive link instead.
- Things to decide later:
  - What happens when a song on the set list has no chart for your part?
  - Does Navi send the packet automatically when a sub signs up?
  - Should gigs get the same reminder DMs as rehearsals?

---

## Decisions (resolved questions)

1. **Ties:** Navi DMs the person who set up the poll and asks them to pick one of the tied times.
2. **Minimum turnout:** if the winning time has fewer than 4 votes, Navi DMs the poll creator to confirm it. The threshold is `MIN_TURNOUT`.
3. **Time windows:** each day in a poll gets its own time window.
4. **Who gets DMs:** the poll creator gets the tie and turnout DMs. Reminder DMs go to the people who voted for the winning time, plus anyone who used `/navi rsvp`.
5. **Time zone:** `America/Chicago` by default (`TZ`).

---

## Discord setup (one time)

1. Create an application at the [Discord Developer Portal](https://discord.com/developers/applications) and add a bot. Copy the **token** and **application ID**.
2. Invite it with the `bot` + `applications.commands` scopes and these permissions: View Channels, Send Messages, Send Polls, Read Message History, and **Mention @everyone, @here, and All Roles**. Navi needs that last one to ping the member role, unless the role itself is set to "Allow anyone to @mention this role".
3. Create the **Final Bossa Member** role in the server and copy its ID (Developer Mode → right-click → Copy Role ID).

## Local development

Postgres runs in Docker and the bot runs on your PC with hot reload.

```bash
cp .env.example .env            # fill in the Discord values
npm install
docker compose up -d postgres   # Postgres on localhost:5433
npm run dev                     # migrates the DB, starts the bot, and reloads on save
```

When you change `src/db/schema.ts`:

```bash
npm run db:generate -- --name describe_change   # writes a new SQL file to drizzle/. Commit it.
```

Migrations are applied automatically when the bot starts. `npm run db:studio` opens a browser view of the database.

> On this PC, npm blocked esbuild's install script (needed by `tsx` for `npm run dev`). If `npm run dev` errors, run `npm approve-scripts esbuild` and then `npm rebuild esbuild`.

## Deploying on Unraid

The bot and Postgres run as two containers from `docker-compose.yml`, managed by the **Compose Manager** plugin (Apps → search "Docker Compose Manager") or plain `docker compose` over SSH.

**Git:** the install and update steps run `git` on the server. Our Unraid box already has it (`git --version` → 2.55.0, checked 2026-10-03), so there's nothing to install. If it's ever missing, for example after an OS change, `scripts/update.sh` stops with a clear message.

**First install** (SSH into Unraid):

```bash
mkdir -p /mnt/user/appdata/navi
cd /mnt/user/appdata/navi
git clone <repo-url> repo
cd repo
cp .env.example .env
nano .env
#   Fill in the Discord values and a real POSTGRES_PASSWORD
#   DATA_DIR=/mnt/user/appdata/navi/postgres
#   TZ=America/Chicago (the default)
docker compose up -d --build
docker compose logs -f navi     # look for "Hey! Listen! Logged in as Navi#1234"
```

If you use Compose Manager, add a stack named `navi` so it shows up in the Docker tab. Set **Compose Source** to **External folder** → `/mnt/user/appdata/navi/repo`, and **External ENV File Path** to `/mnt/user/appdata/navi/repo/.env`. The compose file sets `name: navi`, so the stack started from the command line and the one in Compose Manager are the same.

**Updating** after pushing changes:

```bash
bash /mnt/user/appdata/navi/repo/scripts/update.sh
```

**Auto-update on push.** `scripts/auto-update.sh` checks GitHub and runs `update.sh` only when `main` has new commits. To schedule it, open **Settings → User Scripts → Add New Script** (install the User Scripts plugin from Apps if it's missing). Name the script `navi-auto-update` and set its contents to:

```bash
#!/bin/bash
bash /mnt/user/appdata/navi/repo/scripts/auto-update.sh
```

Set the schedule to **Custom** with `*/5 * * * *` (every 5 minutes). Each push goes live within about 5 minutes. When nothing has changed, the script does nothing and prints nothing.

**Notes**
- Postgres data lives in `DATA_DIR` (under appdata), so it's included in Unraid's appdata backups. `.env` stays on the server and is never committed.
- `POSTGRES_PORT` (default 5433) exposes the database on your LAN so you can query it from your PC with pgAdmin or DBeaver. Remove the `ports:` block in `docker-compose.yml` if you don't want that.
- Both containers use `restart: unless-stopped`, so they come back after an Unraid reboot or array restart.

**Later option: build in CI, pull on Unraid.** Instead of building on the server, a GitHub Actions workflow could build the image on every push to `main` and publish it to GitHub Container Registry (`ghcr.io/<user>/navi`). The compose file would then use `image:` instead of `build:`, and updating would just be `docker compose pull && docker compose up -d`. The server would then need neither git nor build tools, and a broken build never reaches it. It isn't set up yet.
