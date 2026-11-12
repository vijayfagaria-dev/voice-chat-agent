import { describe, expect, it } from "vitest";
import { ChatClientMessageSchema } from "../protocol/schemas.js";

describe("a typed message", () => {
  it("is accepted with text up to 1000 characters and nothing else", () => {
    expect(ChatClientMessageSchema.safeParse({ type: "say", text: "hello" }).success).toBe(true);
    for (const bad of [{ type: "say" }, { type: "say", text: "" }, { type: "say", text: "x".repeat(1001) }, { type: "say", text: 5 }])
      expect(ChatClientMessageSchema.safeParse(bad).success).toBe(false);
  });
});
