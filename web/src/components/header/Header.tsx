import { useEffect, useRef, useState } from "react";
import { sessionLink } from "../../lib/closeCodes";
import { CallState, isInCall, type CallStatus } from "../../state/conversation";
import { MoreIcon, PhoneIcon } from "../icons";
import { CallTimer } from "./CallTimer";
import { MicMeter } from "./MicMeter";

const HEADPHONES_HINT = "Tip: use headphones, so the assistant doesn't hear itself.";

interface Props {
  call: CallStatus;
  notice: string | null;
  onCall: () => void;
  /** The Stop button (P4-T05); absent in demo mode and when the claim isn't active. */
  onStop?: () => void;
  /** Offers the copy-link button (open this claim's chat on a phone, P4-T06). */
  shareable?: boolean;
}

export function Header({ call, notice, onCall, onStop, shareable = false }: Props) {
  const inCall = isInCall(call.state);
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // The menu closes on a click elsewhere or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const away = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const copyLink = async () => {
    const link = sessionLink(location.href);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard access (an insecure context or a denied permission): let the user copy it by hand.
      window.prompt("Copy this link to open the claim on another device:", link);
    }
  };

  return (
    <>
      <header className="topbar">
        <div className="avatar" aria-hidden="true">R</div>
        <div className="titles">
          <h1>Riya</h1>
          <span className="status" data-state={call.state}>
            <span className="status-text" role="status" title={call.text}>{call.text}</span>
            {call.connectedAt !== null && <CallTimer since={call.connectedAt} />}
          </span>
        </div>
        {(shareable || onStop) && (
          <div className="menu" ref={menuRef}>
            <button
              className="menu-btn"
              type="button"
              aria-label="More options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreIcon />
            </button>
            {menuOpen && (
              <div className="menu-list" role="menu">
                {shareable && (
                  <a role="menuitem" href={location.pathname}>
                    All claims
                  </a>
                )}
                {shareable && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={async () => {
                      await copyLink();
                      setMenuOpen(false);
                    }}
                  >
                    {copied ? "Link copied" : "Copy link to this claim"}
                  </button>
                )}
                {onStop && (
                  <>
                    <hr />
                    <button
                      role="menuitem"
                      type="button"
                      className="danger"
                      onClick={() => {
                        setMenuOpen(false);
                        onStop();
                      }}
                    >
                      Stop this claim…
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        <button
          className={`call-btn${inCall ? " hangup" : ""}`}
          type="button"
          aria-label={inCall ? "Hang up" : "Start call"}
          title={inCall ? "Hang up (the claim stays open in the chat)" : "Start a call"}
          disabled={call.disabled}
          onClick={onCall}
        >
          <PhoneIcon />
        </button>
        <MicMeter />
      </header>
      {notice && <p className="notice" role="status">{notice}</p>}
      {call.state === CallState.IDLE && !call.disabled && <p className="hint">{HEADPHONES_HINT}</p>}
    </>
  );
}
