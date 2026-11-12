import { Outcome } from "@voice-chat-agent/shared/protocol";

/** One claim in the start screen's list, as the server's GET /api/sessions returns it. */
export interface Claim {
  sessionId: string;
  title: string | null;
  status: string;
  outcome: string | null;
  callActive: boolean;
  progress: { done: number; total: number };
  createdAt: string;
  lastActivityAt: string;
}

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });

/** "12 Nov" */
export const shortDate = (iso: string): string => DAY.format(new Date(iso));

/** "12 Nov, 4:27 pm" */
export const dateAndTime = (iso: string): string => `${shortDate(iso)}, ${TIME.format(new Date(iso)).toLowerCase()}`;

/**
 * What a claim is called. The server names it after the device and problem once they are known; before that it is
 * "New claim" with the time it was started, which also tells two unnamed claims apart.
 */
export function claimName(claim: Claim): string {
  return claim.title ? `${claim.title} \u00b7 ${shortDate(claim.createdAt)}` : `New claim \u00b7 ${dateAndTime(claim.createdAt)}`;
}

/** The server's title is "device \u2013 problem" (either may be missing): split for the card's two lines. */
export function titleParts(claim: Claim): { device: string; problem: string } {
  if (!claim.title) return { device: "New claim", problem: "" };
  const at = claim.title.indexOf(" \u2013 ");
  if (at === -1) return { device: claim.title, problem: "" };
  const problem = claim.title.slice(at + 3);
  return { device: claim.title.slice(0, at), problem: problem.charAt(0).toUpperCase() + problem.slice(1) };
}

/** How the status badge is coloured. */
export type Tone = "active" | "done" | "stopped" | "review";

export function claimTone(claim: Claim): Tone {
  if (claim.status === "active") return "active";
  if (claim.outcome === Outcome.COMPLETED) return "done";
  if (claim.outcome === Outcome.NEEDS_REVIEW || claim.outcome === Outcome.PARTIAL) return "review";
  return "stopped";
}

export function claimStatus(claim: Claim): string {
  if (claim.status === "active") {
    if (claim.callActive) return "On a call";
    const { done, total } = claim.progress;
    return done === 0 ? "Just started" : `In progress \u00b7 ${done} of ${total} details`;
  }
  switch (claim.outcome) {
    case Outcome.COMPLETED:
      return "Submitted";
    case Outcome.OPTED_OUT:
      return "Stopped at the customer's request";
    case Outcome.PARTIAL:
      return "Saved, with some details missing";
    case Outcome.NEEDS_REVIEW:
      return "With our team for a check";
    default:
      return "Closed";
  }
}

/** Only a claim still being filled in can be carried on; a finished one is opened to look at. */
export const isOpen = (claim: Claim): boolean => claim.status === "active";
