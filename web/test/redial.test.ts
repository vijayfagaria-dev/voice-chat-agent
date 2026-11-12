import { describe, expect, it } from "vitest";
import { REDIAL_DELAYS_MS, shouldRedial } from "../src/lib/redial";

const lost = { connected: true, redialing: false, noticedCode: null, eventCode: 1006, attempts: 0 };

describe("shouldRedial", () => {
  it("dials again when a connected call's socket is lost without a word from the server", () => {
    expect(shouldRedial(lost)).toBe(true);
  });
  it("does not when the customer hung up, or the server ended the call and said so", () => {
    expect(shouldRedial({ ...lost, eventCode: 1000 })).toBe(false);
    expect(shouldRedial({ ...lost, eventCode: 1005 })).toBe(false);
    expect(shouldRedial({ ...lost, noticedCode: 1000 })).toBe(false);
    expect(shouldRedial({ ...lost, noticedCode: 4429 })).toBe(false);
  });
  it("dials again when the server says it is restarting (a deploy), unlike its other endings", () => {
    expect(shouldRedial({ ...lost, noticedCode: 1012 })).toBe(true);
    expect(shouldRedial({ ...lost, noticedCode: 1012, attempts: REDIAL_DELAYS_MS.length })).toBe(false);
  });
  it("does not when the very first connection never opened", () => {
    expect(shouldRedial({ ...lost, connected: false })).toBe(false);
  });
  it("keeps trying while redialing, also when the network is still down", () => {
    expect(shouldRedial({ ...lost, connected: false, redialing: true, attempts: 2 })).toBe(true);
  });
  it("treats 'a call is already running' as the old call still being replaced, only while redialing", () => {
    expect(shouldRedial({ ...lost, redialing: true, noticedCode: 4409 })).toBe(true);
    expect(shouldRedial({ ...lost, redialing: false, noticedCode: 4409 })).toBe(false);
  });
  it("gives up after the last attempt", () => {
    expect(shouldRedial({ ...lost, attempts: REDIAL_DELAYS_MS.length })).toBe(false);
  });
});

import { HEARTBEAT_TIMEOUT_MS } from "../src/lib/redial";

describe("heartbeat", () => {
  it("the page waits for several of the server's 5 s heartbeats before calling the connection lost", () => {
    expect(HEARTBEAT_TIMEOUT_MS).toBeGreaterThanOrEqual(3 * 5000);
  });
});
