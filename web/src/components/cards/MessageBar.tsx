import { type FormEvent, useState } from "react";
import { SendButton } from "./SendButton";

// Matches the server's limit for a typed message (shared/protocol: Say).
const MAX_CHARS = 1000;

interface Props {
  /** Sends the text; false when it could not be sent (the chat isn't connected), so it stays in the box. */
  onSend: (text: string) => boolean;
}

/** The always-there message box: what the customer types when no card is open goes to the agent as a plain message. */
export function MessageBar({ onSend }: Props) {
  const [text, setText] = useState("");
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const message = text.trim();
    if (message && onSend(message)) setText("");
  };
  return (
    <form className="card composer-bar message-bar" onSubmit={onSubmit}>
      <div className="composer">
        <input
          className="pill"
          type="text"
          aria-label="Message"
          placeholder="Type a message"
          maxLength={MAX_CHARS}
          autoComplete="off"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <SendButton />
      </div>
    </form>
  );
}
