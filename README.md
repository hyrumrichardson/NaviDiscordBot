# Navi 🧚

> *Hey! Listen!*

A Discord bot for **Final Bossa**. It runs rehearsal scheduling: a member posts a poll of possible days and times, the band votes with emoji reactions, Navi picks the winner and DMs everyone a reminder before rehearsal. It's named after the fairy from *The Legend of Zelda*, and it talks like her.

Set lists and sheet music are planned for later ([Future phases](#future-phases-notes-only-nothing-built)).

---

## Commands

| Command | Who can use it | What it does |
|---|---|---|
| `/navi rehearsal` | Members | Opens a private panel to pick days and times, then posts a rehearsal poll. |
| `/navi next` | Everyone | Shows the next rehearsal, whether you're on its reminder list, and any open polls. |
| `/navi rsvp` | Everyone | Adds you to the reminder list for the next rehearsal (for anyone who missed the poll). |
| `/navi cancel` | Admins | Cancels an upcoming rehearsal or an open poll, picked from a dropdown. |
| `/navi guide-channel channel:#ch` | Admins | Posts the command guide to a channel and keeps it up to date. |
| `/navi debug-close-poll` | Admins | Closes every open poll right now, as if its time had run out. |
| `/navi debug-send-reminders [reminder]` | Admins | Sends the 48-hour (default) or day-of reminder right now for every upcoming rehearsal. |

Navi's replies to commands are private (only you see them). The poll, its result and cancellation notices are posted publicly in the channel.

**Who counts as what**
- **Members**: people with the Final Bossa Member role (`MEMBER_ROLE_ID`). It's also the role polls ping, so the rest of the server isn't bothered.
- **Admins**: people with the `ADMIN_ROLE_ID` role, or with **Manage Server** if no admin role is set. The two debug commands accept either one.

---

## How a rehearsal poll works

1. **A member runs `/navi rehearsal`** and gets a panel only they can see. They become the poll's **creator**.
2. **They pick up to 10 days** from a dropdown of the next 25 days. Discord has no date-picker component, so the dropdown stands in for a calendar.
3. **They set a time for each day.** Each day starts at **2:00–5:00 PM**. To change a day, pick it under **Edit time for…**, then choose from the **Time** dropdown:
   - Presets: 3-hour windows from 10 AM–1 PM through 6–9 PM.
   - **Custom…** opens a pop-up to type any 1–8 hour window, e.g. `1:30-4:30pm`, `11-2` or `18:00-21:00`. Without am/pm, Navi assumes daytime, so `6-9` means evening and `10-1` means late morning.
   - **Use this time for all days** copies the current day's time to every day.
   - Navi won't send a poll with a day that starts before voting ends. The panel lasts 30 minutes, or until the bot restarts.
4. **They hit Send poll.** Navi posts a normal message that pings the member role and adds the reactions itself, so voting is one tap:
   ```
   Hey @Final Bossa Member! When can you make rehearsal? Vote for every time that works. Poll closes in 24 hours.

   1️⃣ Thu, Oct 8, 2:00 – 5:00 PM
   2️⃣ Sat, Oct 10, 2:00 – 5:00 PM

   React with the number of every time that works for you.
   ```
   With only one day, the option is 👍 and the message asks *"Can you make it to rehearsal at this time?"*
5. **After 24 hours, Navi counts the reactions** (ignoring its own) and adds *🔒 Voting is closed.* to the poll. Discord can't lock reactions, so later ones are ignored. Then:
   - **A clear winner with at least 4 votes**: Navi posts *"Rehearsal will be **Sat, Oct 10, 2:00 – 5:00 PM**"* as a reply to the poll.
   - **A tie**: Navi DMs the creator one button per tied time.
   - **Fewer than 4 votes** (`MIN_TURNOUT`): Navi DMs the creator to **keep** the time or choose **No rehearsal**.
   - **No votes**: Navi says so in the channel.
6. **Reminders** go to everyone who voted for the winning time, plus anyone who used `/navi rsvp`:
   - **48 hours before** rehearsal.
   - **9:00 AM on rehearsal day.**
   - A reminder whose time has already passed when the rehearsal is set is skipped, not sent late. For example, if the poll closes 30 hours before rehearsal, only the 9 AM one goes out.
   - If someone's DMs are closed, Navi mentions them in the poll's channel instead.

If the creator's DMs are closed, the tie or turnout buttons are posted in the channel instead. Only the creator or an admin can use them.

`/navi cancel` covers both scheduled rehearsals and polls that are still open or waiting on a decision. Cancelling deletes pending reminders, marks the poll *🚫 This poll was cancelled.* and tells the channel. Cancelling a rehearsal also mentions everyone who was expecting reminders.

---

## Command guide in Discord

[`docs/member-help.txt`](docs/member-help.txt) is **live content**: it's published into Discord rather than copy-pasted.
- `/navi guide-channel` posts it and stores the message IDs. Running it again with the same channel edits the messages in place. Picking a different channel moves the guide and deletes the old copy.
- **On every startup**, Navi compares the file with the live messages and edits only what changed. So to update the guide, edit the `.txt` and push. Auto-update restarts the bot, and the guide updates itself.
- Long guides are split to stay under Discord's 2000-character limit. Navi splits first at a `━━━━━━━━━━━━━━━━━━━━━━━━` line if there is one, otherwise at line breaks. If someone deletes a guide message by hand, Navi reposts the whole guide so it stays in order.

---

## Configuration

Everything is set in `.env` (copy [`.env.example`](.env.example)). `.env` is never committed.

| Variable | Default | Meaning |
|---|---|---|
| `DISCORD_TOKEN` | | Bot token from the Developer Portal. |
| `DISCORD_CLIENT_ID` | | The application's ID. |
| `GUILD_ID` | | The server Navi runs in. Navi serves one server at a time. |
| `MEMBER_ROLE_ID` | | The member role: can start polls, and gets pinged by them. |
| `ADMIN_ROLE_ID` | blank | The admin role. If blank, admins are people with Manage Server. |
| `TZ` | `America/Chicago` | The band's time zone. All times are shown in it. |
| `REHEARSAL_DEFAULT_START` | `14:00` | The time each day starts at in the panel. |
| `REHEARSAL_DEFAULT_HOURS` | `3` | Rehearsal length, used for the default and the presets. |
| `POLL_DURATION_HOURS` | `24` | How long a poll stays open. |
| `REMINDER_HOURS_BEFORE` | `48` | When the first reminder goes out. |
| `DAY_OF_REMINDER_TIME` | `09:00` | When the day-of reminder goes out. |
| `MIN_TURNOUT` | `4` | Below this many votes for the winning time, Navi asks the creator to confirm. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `navi` / — / `navi` | Database login. Set a real password before the first start. |
| `POSTGRES_PORT` | `5433` | Port the database is exposed on, for pgAdmin, DBeaver or `npm run dev`. |
| `DATABASE_URL` | | Used by `npm run dev` on your PC. Docker Compose sets its own. |
| `DATA_DIR` | `./data/postgres` | Where Postgres keeps its data on the host. |

If you change the poll or reminder timings, also update the matching wording in `src/copy.ts` and `docs/member-help.txt` ("24 hours", "two days", "9 AM").

---

## Voice & copy

Everything Navi says lives in [`src/copy.ts`](src/copy.ts), so anyone in the band can edit it. Each message type is a list of lines, and Navi picks one at random. Add more lines to a type to vary it. Placeholders like `{when}`, `{time}`, `{role}`, `{hours}`, `{channel}` and `{count}` are filled in automatically. The comment at the top of the file explains each one.

Navi's lines lean on Zelda: *"Hey! Listen!"*, *"Watch out!"*, *"Well, excuse me, Princess!"*, *"You've met with a terrible fate, haven't you?"*

---

## Repo layout

```
.
├── src/
│   ├── index.ts            # Entry point: migrate DB → log in → register commands → scheduler → guide sync
│   ├── config.ts           # Reads env vars (see .env.example)
│   ├── copy.ts             # Everything Navi says
│   ├── rehearsals.ts       # Closing polls, ties/turnout decisions, reminders, DM fallback
│   ├── scheduler.ts        # Runs due jobs from scheduled_jobs every minute
│   ├── guide.ts            # Posts and re-syncs the command guide
│   ├── permissions.ts      # Member / admin checks
│   ├── time.ts             # Time zone math and parsing typed times
│   ├── commands/
│   │   ├── index.ts        # /navi definition, permissions, routing
│   │   ├── rehearsal.ts    # /navi rehearsal panel and posting the poll
│   │   ├── decision.ts     # Tie / low-turnout buttons
│   │   ├── next.ts         # /navi next
│   │   ├── rsvp.ts         # /navi rsvp
│   │   ├── cancel.ts       # /navi cancel
│   │   ├── guide.ts        # /navi guide-channel
│   │   └── debug.ts        # /navi debug-close-poll, debug-send-reminders
│   └── db/
│       ├── schema.ts       # Drizzle table definitions
│       └── client.ts       # Postgres pool + migration runner
├── docs/member-help.txt    # The command guide posted in Discord (live content)
├── drizzle/                # Generated SQL migrations (committed; applied on startup)
├── scripts/
│   ├── update.sh           # Unraid: git pull + rebuild + restart
│   └── auto-update.sh      # Unraid: runs update.sh only when GitHub has new commits
├── Dockerfile
├── docker-compose.yml      # navi + postgres
└── .env.example
```

## Stack

| Piece | Choice | Why |
|---|---|---|
| Language | TypeScript (Node 22) | Best-supported Discord library |
| Discord lib | [discord.js](https://discord.js.org) v14 | Modals, select menus, buttons and reactions |
| Database | PostgreSQL 16 | Polls, votes, rehearsals, reminders and settings |
| DB access | Drizzle ORM + migrations | Lightweight and typed |
| Scheduling | Jobs stored in a Postgres table, checked every minute | Reminders still go out after a restart |
| Hosting | Docker Compose on Unraid | Bot + database in two containers |

## Data model

```
rehearsal_polls     id, guild_id, channel_id, message_id, created_by, closes_at, status (open|awaiting_decision|closed|cancelled)
poll_options        id, poll_id, answer_id, emoji, starts_at, ends_at
poll_votes          poll_option_id, user_id                -- snapshot of reactions taken when the poll closes
rehearsals          id, poll_option_id, starts_at, ends_at, status (scheduled|cancelled|done)
rehearsal_attendees rehearsal_id, user_id, source (poll|rsvp)
scheduled_jobs      id, kind (close_poll|remind_before|remind_day_of), ref_id, run_at, completed_at, attempts, last_error
guild_settings      guild_id, guide_channel_id, guide_message_ids
```

All times are stored in UTC. `awaiting_decision` is a poll waiting on its creator to break a tie or confirm low turnout. A failing job is retried every minute, up to 5 times.

---

## Discord setup (one time)

1. Create an application at the [Discord Developer Portal](https://discord.com/developers/applications). Copy the **Application ID**. On the **Bot** page, copy the **token** and set the bot's **Username**. That's the name the server sees; the application name isn't shown there.
2. Invite it from **OAuth2 → URL Generator** with the `bot` and `applications.commands` scopes and these permissions: View Channels, Send Messages, **Add Reactions**, Read Message History, and **Mention @everyone, @here, and All Roles**. Navi needs the last one to ping the member role, unless the role is set to "Allow anyone to @mention this role".
3. Turn on Developer Mode (User Settings → Advanced). Copy the **server ID**, create the **Final Bossa Member** role, give it to the band and copy its **role ID**. Optionally create an admin role and copy its ID too.
4. Once the bot is running, run `/navi guide-channel` to post the command guide.

## Local development

Postgres runs in Docker and the bot runs on your PC with hot reload. Point your local `.env` at a **test server** so polls and DMs don't reach the band.

```bash
cp .env.example .env            # fill in the test server's values
npm install
docker compose up -d postgres   # Postgres on localhost:5433
npm run dev                     # migrates the DB, starts the bot, and reloads on save
```

Use `/navi debug-close-poll` and `/navi debug-send-reminders` instead of waiting for the timers.

When you change `src/db/schema.ts`:

```bash
npm run db:generate -- --name describe_change   # writes a new SQL file to drizzle/. Commit it.
```

Migrations are applied automatically when the bot starts. `npm run db:studio` opens a browser view of the database. `npm run typecheck` checks the code without building it.

> If `npm run dev` fails because npm blocked esbuild's install script, run `npm approve-scripts esbuild` and then `npm rebuild esbuild`.

## Deploying on Unraid

The bot and Postgres run as two containers from `docker-compose.yml`. They're managed by the **Compose Manager** plugin, or by plain `docker compose` over SSH. You'll need `git` on the server (check with `git --version`) and `docker compose` (installed by Compose Manager).

### First install

The repo is private, so the server reads it with a **deploy key**: an SSH key with read-only access to this one repo. It's kept in appdata rather than `/root`, because Unraid wipes `/root` on every reboot.

```bash
mkdir -p /mnt/user/appdata/navi/.ssh && chmod 700 /mnt/user/appdata/navi/.ssh
ssh-keygen -t ed25519 -N "" -C "unraid-navi" -f /mnt/user/appdata/navi/.ssh/deploy_key
cat /mnt/user/appdata/navi/.ssh/deploy_key.pub
```

Add that public key on GitHub under **Settings → Deploy keys**, with write access off. Then clone, configure and start:

```bash
cd /mnt/user/appdata/navi
SSH_CMD="ssh -i /mnt/user/appdata/navi/.ssh/deploy_key -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/mnt/user/appdata/navi/.ssh/known_hosts"
GIT_SSH_COMMAND="$SSH_CMD" git clone git@github.com:hyrumrichardson/NaviDiscordBot.git repo
git -C repo config core.sshCommand "$SSH_CMD"     # later pulls use the key automatically

cd repo
cp .env.example .env
nano .env
#   Discord values, a real POSTGRES_PASSWORD, and DATA_DIR=/mnt/user/appdata/navi/postgres
docker compose up -d --build
docker compose logs -f navi     # look for "Hey! Listen! Logged in as …"
```

**Compose Manager:** to see the stack in the Docker tab, add a stack named `navi`. Set **Compose Source** to **External folder** → `/mnt/user/appdata/navi/repo`, and **External ENV File Path** to `/mnt/user/appdata/navi/repo/.env`. The compose file sets `name: navi`, so the command line and Compose Manager manage the same stack.

### Updating

Run this after pushing changes:

```bash
bash /mnt/user/appdata/navi/repo/scripts/update.sh
```

It pulls, rebuilds, restarts, and applies any new migrations on startup.

**Auto-update on push.** `scripts/auto-update.sh` checks GitHub and runs `update.sh` only when `main` has new commits. To schedule it, go to **Settings → User Scripts → Add New Script** (the User Scripts plugin is in Apps). Name it `navi-auto-update` and give it this script:

```bash
#!/bin/bash
bash /mnt/user/appdata/navi/repo/scripts/auto-update.sh
```

Set its schedule to **Custom** with `*/5 * * * *`. Each push then goes live within about 5 minutes. When nothing has changed, the script does nothing. If a build fails, the old container keeps running.

**Changing `.env`** needs a recreate, because a plain restart doesn't reload it: `docker compose up -d --force-recreate navi`.

### Moving Navi to a different server

1. Cancel any open polls in the old server.
2. Invite the bot to the new server (same token, see [Discord setup](#discord-setup-one-time)).
3. Update `GUILD_ID`, `MEMBER_ROLE_ID` and `ADMIN_ROLE_ID` in `.env`, then recreate the container.
4. Run `/navi guide-channel` in the new server, and kick Navi from the old one.

### Notes
- Postgres data lives in `DATA_DIR` under appdata, so Unraid's appdata backups include it, along with `.env` and the deploy key.
- `POSTGRES_PORT` exposes the database on your LAN. Remove the `ports:` block in `docker-compose.yml` if you don't want that.
- Both containers use `restart: unless-stopped`, so they come back after a reboot.
- **Later option:** build the image with GitHub Actions and publish it to GitHub Container Registry. Unraid would then just pull it, with no git or build step on the server. This isn't set up.

---

## Decisions

1. **Ties:** Navi DMs the poll's creator to pick one of the tied times.
2. **Minimum turnout:** if the winning time has fewer than 4 votes, Navi DMs the creator to confirm it.
3. **Time windows:** each day in a poll has its own time.
4. **Who gets DMs:** the creator gets the tie and turnout DMs. Reminders go to the people who voted for the winning time, plus anyone who used `/navi rsvp`.
5. **Polls:** emoji reactions on a normal message instead of Discord's built-in polls, with 👍 for single-day polls.
6. **Who can start polls:** members only (`MEMBER_ROLE_ID`).
7. **Time zone:** `America/Chicago`.

---

## Future phases (notes only, nothing built)

> **Not started.** These are notes so the ideas aren't lost. No code, tables or commands exist for them yet. Each phase gets designed properly before any of it is written.

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
