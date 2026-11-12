import { useEffect, useState } from "react";
import { randomId } from "../lib/ids";
import { type Claim, claimName, claimStatus, claimTone, dateAndTime, isOpen, titleParts } from "../lib/claims";

const base = (import.meta.env.VITE_SERVER_URL?.trim() || "").replace(/\/+$/, "");

/** Opens a claim: the page is the same, the session id in the address says which one. */
export const openClaim = (id: string): void => location.assign(`${location.pathname}?sessionId=${id}`);

export function SessionPicker() {
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`${base}/api/sessions`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: { sessions: Claim[] }) => live && setClaims(body.sessions))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const remove = async (claim: Claim) => {
    if (!window.confirm(`Delete "${claimName(claim)}"? It disappears from this list.`)) return;
    try {
      const res = await fetch(`${base}/api/sessions/${claim.sessionId}`, { method: "DELETE" });
      if (res.status === 409) return window.alert("Hang up the call first, then delete this claim.");
      if (!res.ok) throw new Error(String(res.status));
      setClaims((current) => current?.filter((item) => item.sessionId !== claim.sessionId) ?? null);
    } catch {
      window.alert("Could not delete the claim. Please try again.");
    }
  };

  return (
    <main className="picker">
      <header className="picker-head">
        <h1>Device repair claims</h1>
        <p>Pick up where you left off, or start a new claim.</p>
      </header>
      <button className="picker-new" type="button" onClick={() => openClaim(randomId())}>
        <span aria-hidden="true">+</span> Start a new claim
      </button>
      <h2>Your claims</h2>
      {failed && <p className="picker-note">Could not load the list. You can still start a new claim.</p>}
      {!failed && claims === null && <p className="picker-note">Loading\u2026</p>}
      {claims?.length === 0 && <p className="picker-note">No claims yet. Start one above.</p>}
      <ul className="claims">
        {claims?.map((claim) => {
          const { device, problem } = titleParts(claim);
          return (
            <li key={claim.sessionId} className="claim">
              <div className="claim-body">
                <strong className="claim-device" title={device}>
                  {device}
                </strong>
                {problem && (
                  <span className="claim-problem" title={problem}>
                    {problem}
                  </span>
                )}
                <span className="claim-meta">
                  <span className={`claim-status tone-${claimTone(claim)}`}>{claimStatus(claim)}</span>
                  <time dateTime={claim.createdAt}>{dateAndTime(claim.createdAt)}</time>
                </span>
              </div>
              <div className="claim-actions">
                <button type="button" className="claim-open" onClick={() => openClaim(claim.sessionId)}>
                  {isOpen(claim) ? "Resume" : "View"}
                </button>
                <button type="button" className="claim-delete" onClick={() => remove(claim)}>
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
