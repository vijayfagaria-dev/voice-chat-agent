import { useEffect, useState } from "react";
import { randomId } from "../lib/ids";
import { type Claim, claimName, claimStatus, isOpen } from "../lib/claims";

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

  return (
    <main className="picker">
      <h1>Device repair claims</h1>
      <button className="picker-new" type="button" onClick={() => openClaim(randomId())}>
        Start a new claim
      </button>
      <h2>Your claims</h2>
      {failed && <p className="picker-note">Could not load the list. You can still start a new claim.</p>}
      {!failed && claims === null && <p className="picker-note">Loading\u2026</p>}
      {claims?.length === 0 && <p className="picker-note">Nothing here yet.</p>}
      <ul>
        {claims?.map((claim) => (
          <li key={claim.sessionId}>
            <div>
              <strong>{claimName(claim)}</strong>
              <span>{claimStatus(claim)}</span>
            </div>
            <button type="button" onClick={() => openClaim(claim.sessionId)}>
              {isOpen(claim) ? "Resume" : "View"}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
