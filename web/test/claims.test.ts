import { describe, expect, it } from "vitest";
import { type Claim, claimName, claimStatus, isOpen } from "../src/lib/claims";

const claim = (over: Partial<Claim> = {}): Claim => ({
  sessionId: "s",
  title: null,
  status: "active",
  outcome: null,
  callActive: false,
  progress: { done: 0, total: 7 },
  createdAt: "2026-11-12T10:57:28.000Z",
  lastActivityAt: "2026-11-12T10:59:43.000Z",
  ...over,
});

describe("claims list", () => {
  it("names a claim after its device and problem with the day it was started", () => {
    expect(claimName(claim({ title: "Apple iPhone 14 – screen is cracked" }))).toMatch(/^Apple iPhone 14 – screen is cracked · 12 Nov$/);
  });
  it("calls one with no device or problem yet a new claim, with the time", () => {
    expect(claimName(claim())).toMatch(/^New claim · 12 Nov, \d{1,2}:\d{2} [ap]m$/);
  });
  it.each([
    [{}, "Just started"],
    [{ progress: { done: 3, total: 7 } }, "In progress · 3 of 7 details"],
    [{ callActive: true }, "On a call"],
    [{ status: "finalized", outcome: "completed" }, "Submitted"],
    [{ status: "finalized", outcome: "optedOut" }, "Stopped at the customer's request"],
    [{ status: "closed" }, "Closed"],
  ] as [Partial<Claim>, string][])("%j reads %s", (over, text) => expect(claimStatus(claim(over))).toBe(text));
  it("lets only an unfinished claim be resumed", () => {
    expect(isOpen(claim())).toBe(true);
    expect(isOpen(claim({ status: "finalized" }))).toBe(false);
  });
});

import { claimTone, titleParts } from "../src/lib/claims";

describe("claim card parts", () => {
  const base: Claim = {
    sessionId: "s", title: null, status: "active", outcome: null, callActive: false,
    progress: { done: 0, total: 7 }, createdAt: "2026-11-12T10:57:28.000Z", lastActivityAt: "2026-11-12T10:59:43.000Z",
  };
  it("splits the title into the device and a capitalised problem", () => {
    expect(titleParts({ ...base, title: "Apple iPhone 14 – screen is cracked" })).toEqual({ device: "Apple iPhone 14", problem: "Screen is cracked" });
    expect(titleParts({ ...base, title: "Apple iPhone 14" })).toEqual({ device: "Apple iPhone 14", problem: "" });
    expect(titleParts(base)).toEqual({ device: "New claim", problem: "" });
  });
  it("colours the status by how the claim ended", () => {
    expect(claimTone(base)).toBe("active");
    expect(claimTone({ ...base, status: "finalized", outcome: "completed" })).toBe("done");
    expect(claimTone({ ...base, status: "finalized", outcome: "partial" })).toBe("review");
    expect(claimTone({ ...base, status: "finalized", outcome: "optedOut" })).toBe("stopped");
  });
});
