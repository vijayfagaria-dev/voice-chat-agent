import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html needs a #root element.");

// No claim in the address (and not the demo): choose one first. Everything else needs a session id from the start, so
// the app is only loaded once there is one.
const params = new URLSearchParams(location.search);
const choosing = !params.get("sessionId") && params.get("demo") !== "1";

async function start(target: HTMLElement) {
  const { Page } = choosing
    ? { Page: (await import("./components/SessionPicker")).SessionPicker }
    : { Page: (await import("./App")).App };
  createRoot(target).render(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
}

void start(root);
