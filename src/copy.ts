// Everything Navi says lives here. Add lines freely. Navi picks one at random for each message.
// Placeholders: {when} = date + time ("Sat, Oct 10, 2:00 – 5:00 PM"), {time} = time only,
// {role} = member role mention, {hours} = hours left, {channel} = channel mention,
// {count} = number of people.

export const copy = {
  pollPosted: [
    "**Hey** {role}! When can you make rehearsal? Vote for every time that works. Poll closes in {hours} hours.",
  ],
  pollClosed: [
    "**Look!** Rehearsal will be **{when}**.",
  ],
  pollNoVotes: [
    "Nobody voted. Try another set of dates?",
  ],
  pollSent: [
    "**Hey! Listen!** The poll is up in {channel}. I'll post the result in {hours} hours.",
  ],
  // DMs to the poll creator when Navi needs a decision.
  decisionTie: [
    "Your rehearsal poll in {channel} ended in a **tie**. Which time should it be?",
  ],
  decisionLowTurnout: [
    "**Watch out!** Only **{count}** can make the top time from your poll in {channel}: **{when}**. Still want to rehearse?",
  ],
  decisionLocked: [
    "Rehearsal time is **{when}**. I've told the channel.",
  ],
  decisionDropped: [
    "Got it. I've told the channel there's no rehearsal from this poll.",
  ],
  alreadyDecided: [
    "**Hey!** That poll was already decided or cancelled. Nothing changed.",
  ],
  notYourPoll: [
    "**Watch out!** Only the person who started this poll (or a band admin) can decide.",
  ],
  pollDropped: [
    "*You've met with a terrible fate, haven't you?* Not enough heroes for this one, so there's **no rehearsal** from this poll.",
  ],
  // Posted in the channel when someone's DMs are closed. Navi puts the mentions in front of
  // this line and the actual message on the line below it.
  dmFallback: [
    "**Hey! Listen!** I couldn't DM you, so here it is:",
  ],
  panelExpired: [
    "**Hey!** This panel fell asleep. Run `/navi rehearsal` again.",
  ],
  nextRehearsal: [
    "**Hey! Listen!** Next rehearsal: **{when}**.",
  ],
  noRehearsal: [
    "**Hmm...** There's no rehearsal scheduled yet.",
  ],
  rsvpAlready: [
    "**Hey!** You're already on the list for **{when}**. I'll remind you!",
  ],
  remindBefore: [
    "**Hey! Listen!** Rehearsal is in two days: **{when}**.",
  ],
  remindDayOf: [
    "**Watch out!** Rehearsal is **today, {time}**.",
  ],
  cancelled: [
    "*Well, excuse me, Princess!* Rehearsal on **{when}** is **cancelled**.",
  ],
  pollCancelled: [
    "*Well, excuse me, Princess!* This rehearsal poll is **cancelled**. No need to vote.",
  ],
  nothingToCancel: [
    "**Look!** There's nothing to cancel. No upcoming rehearsals and no open polls.",
  ],
  alreadyGone: [
    "**Hey!** That one was already closed or cancelled. Nothing changed.",
  ],
  rsvpConfirmed: [
    "*You got the Rehearsal Reminder!* See you **{when}**.",
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
