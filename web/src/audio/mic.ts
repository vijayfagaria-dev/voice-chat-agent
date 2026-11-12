import { MIC_FRAME_MS, MIC_SAMPLE_RATE } from "@voice-chat-agent/shared/protocol";
import { CAPTURE_PROCESSOR, type CaptureFrame, type CaptureOptions } from "./capture";
import { closeAudioContext, currentAudioContext, openAudioContext } from "./context";
import { stopPlayback } from "./playback";
import workletUrl from "./captureWorklet?worker&url";

export type FrameHandler = (pcm: ArrayBuffer, level: number) => void;

const MIC_ERRORS: Record<string, string> = {
  NotAllowedError: "Microphone permission denied. Allow it in the browser's site settings.",
  SecurityError: "Microphone blocked by the browser. Serve the page from http://localhost or https.",
  NotFoundError: "No microphone found.",
  NotReadableError: "The microphone is in use by another app.",
};

let stream: MediaStream | null = null;
let worklet: AudioWorkletNode | null = null;
let unwatch: (() => void) | null = null;

// A browser may suspend the page's audio while a native dialog (the file picker) or another window has the focus. Capture
// then stops until the context runs again; this brings it back as soon as the page does.
function keepRunning(context: AudioContext): () => void {
  const resume = () => {
    if (context.state === "suspended" || (context.state as string) === "interrupted") void context.resume().catch(() => {});
  };
  context.addEventListener("statechange", resume);
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("focus", resume);
  return () => {
    context.removeEventListener("statechange", resume);
    document.removeEventListener("visibilitychange", resume);
    window.removeEventListener("focus", resume);
  };
}

// Safari/iOS: call synchronously from a click.
export async function startMic(onFrame: FrameHandler): Promise<void> {
  if (!navigator.mediaDevices || !window.AudioWorkletNode) {
    throw new Error("This browser needs getUserMedia and AudioWorklet (use recent Chrome or Safari).");
  }
  stopMic();
  const context = openAudioContext();
  try {
    const media = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    if (currentAudioContext() !== context) {
      media.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = media;
    unwatch = keepRunning(context);
    await context.audioWorklet.addModule(workletUrl);
    if (currentAudioContext() !== context) return;
    const options: CaptureOptions = { processorOptions: { targetRate: MIC_SAMPLE_RATE, frameMs: MIC_FRAME_MS } };
    worklet = new AudioWorkletNode(context, CAPTURE_PROCESSOR, options);
    worklet.port.onmessage = ({ data }: MessageEvent<CaptureFrame>) => onFrame(data.pcm, data.level);
    // Some browsers only run a worklet connected to the destination; keep it silent.
    const mute = context.createGain();
    mute.gain.value = 0;
    context.createMediaStreamSource(media).connect(worklet).connect(mute).connect(context.destination);
  } catch (err) {
    if (currentAudioContext() === context) stopMic();
    throw new Error(micErrorMessage(err));
  }
}

export function stopMic(): void {
  stopPlayback();
  unwatch?.();
  unwatch = null;
  if (worklet) worklet.port.onmessage = null;
  stream?.getTracks().forEach((track) => track.stop());
  closeAudioContext();
  stream = null;
  worklet = null;
}

function micErrorMessage(err: unknown): string {
  if (err instanceof Error) return MIC_ERRORS[err.name] ?? (err.message || err.name);
  return String(err);
}
