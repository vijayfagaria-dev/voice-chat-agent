// The always-there message box: sends what was typed, and keeps it when it could not be sent.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageBar } from "../src/components/cards/MessageBar";
import { Thread } from "../src/components/thread/Thread";

describe("message box", () => {
  it("is in the thread when nothing is open and somebody can answer", () => {
    const html = renderToStaticMarkup(
      <Thread serverLabel="s" sessionId="x" items={[]} card={null} onAnswer={() => {}} onSay={() => true} />,
    );
    expect(html).toContain('aria-label="Message"');
  });
  it("is not there when nobody can answer (the demo, a finished claim)", () => {
    const html = renderToStaticMarkup(<Thread serverLabel="s" sessionId="x" items={[]} card={null} onAnswer={() => {}} />);
    expect(html).not.toContain('aria-label="Message"');
  });
  it("renders on its own", () => {
    expect(renderToStaticMarkup(<MessageBar onSend={() => true} />)).toContain("Type a message");
  });
});
