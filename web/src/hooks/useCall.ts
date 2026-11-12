import { useCallback, useEffect, useMemo, useRef } from "react";
import { currentAudioContext } from "../audio/context";
import { latencyProbe, sendDiagnostic } from "../audio/latencyProbe";
import * as mic from "../audio/mic";
import type { Server } from "../config";
import { callCloseMessage } from "../lib/closeCodes";
import { errorMessage } from "../lib/errors";
import { ChatClientMessageType, MIC_FRAME_BYTES, MIC_FRAME_MS } from "@voice-chat-agent/shared/protocol";
import { CallState } from "../state/conversation";
import type { CallControls, Ui } from "../state/ui";
import { handleCallMessage } from "../transport/callMessages";
import { HEARTBEAT_TIMEOUT_MS, REDIAL_DELAYS_MS, shouldRedial } from "../lib/redial";
import { closeQuietly, parseClosing, socketUrl } from "../transport/socket";

// Mic audio allowed to wait in the socket's send buffer before new frames are dropped.
const MAX_SEND_BACKLOG_MS = 500;
const MAX_BUFFERED_BYTES =
  (MAX_SEND_BACKLOG_MS / MIC_FRAME_MS) * MIC_FRAME_BYTES;

export function useCall(ui: Ui, server: Server | null): CallControls {
  const wsRef = useRef<WebSocket | null>(null);
  const attempt = useRef(0);

  const release = useCallback(() => {
    attempt.current++;
    if (wsRef.current) closeQuietly(wsRef.current);
    wsRef.current = null;
    mic.stopMic();
    latencyProbe.reset();
  }, []);

  useEffect(() => release, [release]);

  const sendFrame = useCallback(
    (pcm: ArrayBuffer, level: number) => {
      ui.setLevel(level);
      latencyProbe.onMicLevel(level, performance.now());
      const ws = wsRef.current;
      if (
        ws?.readyState === WebSocket.OPEN &&
        ws.bufferedAmount < MAX_BUFFERED_BYTES
      )
        ws.send(pcm);
    },
    [ui],
  );

  const start = useCallback(async () => {
    if (!server) return;
    const current = ++attempt.current;
    ui.setCall(CallState.CONNECTING, "waiting for microphone…");
    try {
      await mic.startMic(sendFrame);
    } catch (err) {
      if (current === attempt.current)
        ui.setCall(
          CallState.ERROR,
          errorMessage(err, "Could not start the microphone."),
        );
      return;
    }
    if (current !== attempt.current) return;

    let redials = 0;
    const dial = (redialing: boolean) => {
      ui.setCall(CallState.CONNECTING, redialing ? "reconnecting…" : "connecting…");
      let ws: WebSocket;
      try {
        ws = new WebSocket(socketUrl(server, "/call"));
      } catch (err) {
        release();
        ui.setCall(CallState.ERROR, errorMessage(err, `Could not connect to ${server.http}`));
        return;
      }
      ws.binaryType = "arraybuffer";
      let connected = false;
      let openedAt = 0;
      let lastServerAt = 0;
      let lastAudioAt = 0;
      ws.onopen = () => {
        connected = true;
        openedAt = lastServerAt = performance.now();
        redials = 0;
        ui.setCall(CallState.CONNECTED, "on call");
        ui.addNote(redialing ? "Call reconnected" : "Call started");
      };
      let noticed: { code: number; reason: string } | null = null; // from the server's `closing` message
      ws.onmessage = ({ data }) => {
        lastServerAt = performance.now();
        if (typeof data === "string" && data.startsWith('{"type":"audio"')) lastAudioAt = lastServerAt;
        const closing = parseClosing(data);
        if (closing) noticed = closing;
        else handleCallMessage(ui, data);
      };
      // The connection is lost, not ended: say so to the server (diagnosis), keep the microphone open and dial again.
      let lostHandled = false;
      const lost = (eventCode: number, wasClean: boolean) => {
        if (lostHandled || current !== attempt.current) return;
        lostHandled = true;
        stopWatching();
        // The chat socket is separate, so the server can be told what the page knew (a refused redial attempt, where the
        // server spoke before closing, is not a loss).
        if (connected && !noticed) {
          const now = performance.now();
          const rtt = (navigator as Navigator & { connection?: { rtt?: number } }).connection?.rtt;
          sendDiagnostic({
            type: ChatClientMessageType.CALL_LOST,
            code: eventCode,
            wasClean,
            secondsOnCall: Math.round((now - openedAt) / 1000),
            sinceServerMs: Math.round(now - lastServerAt),
            ...(lastAudioAt ? { sinceAgentAudioMs: Math.round(now - lastAudioAt) } : {}),
            ...(typeof rtt === "number" ? { rttMs: rtt } : {}),
            onLine: navigator.onLine,
            visibility: document.visibilityState,
            audioState: currentAudioContext()?.state ?? "none",
          });
        }
        if (!redialing) ui.addNote("Connection lost, reconnecting…");
        ui.setCall(CallState.CONNECTING, "reconnecting…");
        wsRef.current = null;
        const delay = REDIAL_DELAYS_MS[redials++] ?? 8000;
        setTimeout(() => {
          if (current === attempt.current) dial(true);
        }, delay);
      };
      // The server sends a heartbeat every few seconds. Silence for longer than this means the connection is dead even
      // though the browser has not been told (a proxy can drop the server's side and leave this one open).
      const watching = setInterval(() => {
        if (current !== attempt.current) return stopWatching(); // hung up
        if (connected && performance.now() - lastServerAt > HEARTBEAT_TIMEOUT_MS) {
          closeQuietly(ws);
          lost(1006, false);
        }
      }, 3000);
      const stopWatching = () => clearInterval(watching);
      ws.onclose = (event) => {
        stopWatching();
        // A proxy may replace the server's close code (Render does), so the code in the `closing` message wins.
        const code = noticed?.code ?? event.code;
        const reason = noticed?.reason ?? event.reason;
        if (
          shouldRedial({ connected, redialing, noticedCode: noticed?.code ?? null, eventCode: event.code, attempts: redials })
        ) {
          lost(event.code, event.wasClean);
          return;
        }
        release();
        const refused = callCloseMessage(code);
        if (connected && refused) {
          // The server completed the upgrade only to say why it can't take the call (protocol.md §6).
          ui.setCall(CallState.ENDED, "no call");
          ui.addNote(refused);
        } else if (connected) {
          ui.setCall(CallState.ENDED, "call ended");
          ui.addNote(reason === "silence" ? "Call ended: no one spoke for a while" : "Call ended");
        } else if (redialing) {
          ui.setCall(CallState.ENDED, "call ended");
          ui.addNote("The connection was lost and could not be restored. Tap the phone to call again.");
        } else {
          ui.setCall(CallState.ERROR, `Could not connect to ${server.http}`);
        }
      };
      wsRef.current = ws;
    };
    dial(false);
  }, [ui, server, release, sendFrame]);

  const hangUp = useCallback(() => {
    release();
    ui.setCall(CallState.ENDED, "call ended");
    ui.addNote("You hung up");
  }, [ui, release]);

  const controls = useMemo(() => ({ start, hangUp }), [start, hangUp]);

  return controls;
}
