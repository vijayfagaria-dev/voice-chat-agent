# Product and technical decisions

Where the brief left room, these are the choices made and the reasoning behind them.

| Decision | Why |
|---|---|
| The scenario is a **device repair claim**, with the call and chat split above | Spoken fields are easy to say; identifiers and files are exactly what speech recognition gets wrong |
| **Completion needs an explicit "Submit claim?" tap in chat** | The business receives a confirmed record, and a misheard "yes" cannot submit it |
| **Identifiers must be typed.** A serial number or email heard on the call is saved as `unverified` and the agent asks for it in the chat | Speech recognition is unreliable for alphanumerics |
| **One page, one session.** The call and chat share the starter's single page; the same session link works in a second tab | Matches the brief's UI and makes reconnects trivial |
| **A header Stop button** opens a confirmation card; only Yes opts out (a typed "stop" is just a message the agent asks to confirm) | An accidental tap cannot end a claim |
| **Silence:** a re-prompt at 8 s; after two, the call ends and the chat continues. Not counted while a chat card is open (up to 2 min) | A quiet line should not hang the session, and the chat can finish the job |
| **Dead browser:** no mic audio for 10 s ends the call; a new call replaces one that has been quiet for 3 s | A proxy can drop the browser's side and keep ours open (its pings answer for the browser), so the session would stay locked |
| **Safety first:** a swollen battery, smoke, burning smell or liquid while charging makes the agent advise stopping use and flags `needsReview` | A hazard matters more than a complete form |
| **Consent line:** the call opens with a note that it is processed as text; raw audio is never stored | Privacy by default |
| **Service centres are a fictional list** ("… Demo Repair Centre") | No real business is impersonated |
| A customer **who never calls** still gets the chat: after 2 minutes without a call it starts with a message and the first card | The chat alone must be able to finish a claim |
| **Retention:** data is kept until a review period ends, then should be purged | No purge script is built yet (see [reliability](reliability.md)) |
| **Start screen lists every claim on the server** (title, status, progress); no accounts | The assignment has no login; the picker is the way back into a claim. The title is worked out from the fields at read time (device and problem, else "New claim" and the start time), so it needs no stored name and no model call |
| **A message box is always in the chat while the claim is open and no card is waiting** | One conversation, two channels. What is typed there reaches the same agent as the call: with no call, a chat turn (same prompt, tools and state, replying in text); during a call, the call agent takes it as something the customer said and answers aloud. A value typed there is saved with source `chat`, so a typed email or serial number counts. Cards stay the way to send files and anything that must be checked |
