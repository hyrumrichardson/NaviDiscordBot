// Everything Navi says lives here. Add lines freely. Navi picks one at random for each message.
// Placeholders: {when} = formatted date/time, {role} = member role mention, {hours} = hours left.

export const copy = {
  pollPosted: [
    "**Hey! Listen!** 🧚 {role}, when can you make rehearsal? *It's dangerous to go alone!* Vote for every time that works. Poll closes in {hours} hours.",
    "**Dawn of the First Day.** ⏳ *-{hours} Hours Remain-* {role}, vote for every rehearsal time that works for you!",
    "**Hello!** 🧚 {role}, the Great Deku Tree needs to know when you can rehearse. Poll closes in {hours} hours.",
  ],
  pollClosed: [
    "**Look!** 👀 The Great Deku Tree has spoken. Rehearsal will be **{when}**.",
    "**Hey! Listen!** Rehearsal is set for **{when}**. *You got the Rehearsal Time!* 🎶",
  ],
  pollNoVotes: [
    "*You've met with a terrible fate, haven't you?* Nobody voted. Try another set of dates?",
  ],
  remindBefore: [
    "**Hey! Listen!** Rehearsal is in two days: **{when}**. *Dawn of the Second-to-Last Day, -48 Hours Remain-* Dust off your ocarina. 🎵",
    "**Look!** 🧚 Rehearsal is coming up **{when}**. Better start practicing Saria's Song.",
  ],
  remindDayOf: [
    "**Watch out!** ⚔️ *Dawn of the Final Day.* Rehearsal is **today, {when}**. *It's dangerous to go alone, take this:* 🎼",
    "**Hello!** Kaepora Gaebora here. Hoo hoo! Rehearsal is **today, {when}**. *Did you get all that? Do you want to hear what I said again?*",
  ],
  cancelled: [
    "*Well, excuse me, Princess!* Rehearsal on **{when}** is **cancelled**.",
  ],
  pollCancelled: [
    "*Well, excuse me, Princess!* This rehearsal poll is **cancelled**. No need to vote.",
    "**Hey!** The Great Deku Tree changed its mind. This rehearsal poll is **cancelled**.",
  ],
  nothingToCancel: [
    "**Look!** There's nothing to cancel. No upcoming rehearsals and no open polls.",
  ],
  alreadyGone: [
    "**Hey!** That one was already closed or cancelled. Nothing changed.",
  ],
  rsvpConfirmed: [
    "*You got the Rehearsal Reminder!* 🎶 *(da-na-na-naaa)* See you **{when}**.",
  ],
  notBuiltYet: [
    "**Hey!** This part of the forest isn't finished yet. Come back later!",
  ],
  notAllowed: [
    "**Watch out!** Only band admins can do that.",
  ],
} as const;

export type CopyKey = keyof typeof copy;

export function say(key: CopyKey, vars: Record<string, string | number> = {}): string {
  const lines = copy[key];
  const line = lines[Math.floor(Math.random() * lines.length)];
  return line.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
