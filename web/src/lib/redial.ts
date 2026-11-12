// When the call's socket is lost (a network blip, a proxy dropping the browser's side), the page dials again by itself,
// keeping the microphone open, instead of ending the call and leaving the customer to tap Call again.

/** Waits before each new attempt, in order; the list's length is the number of attempts. */
export const REDIAL_DELAYS_MS = [1000, 2000, 3000, 4000, 5000, 6000, 8000];

/** The server sends a heartbeat every 5 s; this long without a word from it, the connection is treated as lost. */
export const HEARTBEAT_TIMEOUT_MS = 15_000;

export interface CloseFacts {
  /** The socket had opened (the upgrade completed). */
  connected: boolean;
  /** This socket is itself a redial attempt. */
  redialing: boolean;
  /** The code in the server's `closing` message, if it sent one (it does for every end it chooses). */
  noticedCode: number | null;
  /** The browser's own close code. */
  eventCode: number;
  /** Redials already made in this sequence. */
  attempts: number;
}

export function shouldRedial(facts: CloseFacts): boolean {
  if (facts.attempts >= REDIAL_DELAYS_MS.length) return false;
  // The server said why it closed, so its end is final: except "a call is already running", which is the old, dead
  // call still being replaced (the server frees the session once it has heard nothing for a few seconds).
  if (facts.noticedCode !== null) return facts.redialing && facts.noticedCode === 4409;
  // No notice: the connection was lost (1006), or, while redialing, could not be made yet.
  return facts.connected ? facts.eventCode === 1006 : facts.redialing;
}
