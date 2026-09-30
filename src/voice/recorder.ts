import type { Word } from '@/marks/types';
import type { MicStream } from './micCapture';
import { createDownsampler, STT_SAMPLE_RATE, toPcm16Base64 } from './pcm';
import type { SttError } from './sttErrors';
import { toWords, type SttWord } from './words';

export const MAX_RECORDING_MS = 60_000;
export const FINAL_WORDS_TIMEOUT_MS = 5_000;
/** Audio goes out in 100 ms chunks. */
const CHUNK_SAMPLES = STT_SAMPLE_RATE / 10;

export const MIC_DENIED =
  'Microphone access is blocked. Allow it for this site (the icon left of the address bar), or type your instruction below.';
export const NO_MIC = 'No microphone found. Connect one, or type your instruction below.';
export const DIDNT_CATCH = "Didn't catch that. Press ● Start and try again, or type below.";
export const NO_RESPONSE = "The voice service didn't respond. Press ● Start to try again, or type below.";
const LOST = 'Lost the connection to the voice service. Press ● Start to try again.';
const NO_CONNECT = "Couldn't connect to the voice service. Press ● Start to try again, or type below.";
const NO_TOKEN = "Couldn't reach the server for voice. Check that it is running, or type your instruction.";

export class VoiceError extends Error {
  override name = 'VoiceError';
}

/** The STT session as the recorder sees it: the ElevenLabs adapter (scribeSocket.ts), or a fake in tests. */
export interface SttEvents {
  onOpen(): void;
  onPartial(text: string): void;
  onWords(words: SttWord[]): void;
  onError(error: SttError): void;
  onClose(): void;
}

export interface SttSocket {
  send(pcm16Base64: string): void;
  commit(): void;
  close(): void;
}

export interface RecorderDeps {
  fetchToken(): Promise<{ ok: true; token: string } | { ok: false; error: string }>;
  connect(token: string, events: SttEvents): SttSocket;
  startMic(onSamples: (samples: Float32Array, sampleRate: number) => void): Promise<MicStream>;
  /** The stroke clock (Date.now). */
  now(): number;
  finalWordsTimeoutMs?: number;
}

export interface RecorderCallbacks {
  onPartial(text: string): void;
  /** The session broke while recording. The recording is already cancelled. */
  onFailure(message: string): void;
}

export interface Recording {
  /** Stop listening and return every word said, on the stroke clock. Never hangs. */
  stop(): Promise<Word[]>;
  cancel(): void;
}

/** Start the mic right away (buffering), mint a token and open the STT session in parallel. */
export async function startRecording(deps: RecorderDeps, callbacks: RecorderCallbacks): Promise<Recording> {
  const token = deps.fetchToken().catch(() => ({ ok: false as const, error: NO_TOKEN }));
  const outbox: string[] = [];
  const pcm: number[] = [];
  const raw: SttWord[] = [];
  const waiters = new Set<() => void>();
  let downsample: ((chunk: Float32Array) => Float32Array) | null = null;
  let audioStart: number | null = null;
  let socket: SttSocket | null = null;
  let open = false;
  let closed = false;
  let stopping = false;
  let done = false;
  let noSpeech = false;
  let failure: string | null = null;
  let wordEvents = 0;

  const notify = () => waiters.forEach((w) => w());
  function until(cond: () => boolean, ms: number): Promise<void> {
    if (cond()) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        waiters.delete(check);
        resolve();
      };
      const check = () => {
        if (cond()) finish();
      };
      const timer = setTimeout(finish, ms);
      waiters.add(check);
    });
  }
  function flush() {
    if (!socket || !open || closed) return;
    for (const chunk of outbox.splice(0)) socket.send(chunk);
  }
  function pack(all: boolean) {
    while (pcm.length >= CHUNK_SAMPLES || (all && pcm.length > 0)) {
      outbox.push(toPcm16Base64(Float32Array.from(pcm.splice(0, CHUNK_SAMPLES))));
    }
    flush();
  }

  let mic: MicStream;
  try {
    mic = await deps.startMic((samples, rate) => {
      if (stopping || done) return;
      audioStart ??= deps.now() - (samples.length / rate) * 1000;
      downsample ??= createDownsampler(rate);
      for (const s of downsample(samples)) pcm.push(s);
      pack(false);
    });
  } catch (err) {
    throw new VoiceError(micMessage(err));
  }
  const minted = await token;
  if (!minted.ok) {
    mic.stop();
    throw new VoiceError(minted.error);
  }

  function cancel() {
    if (done) return;
    done = true;
    mic.stop();
    socket?.close();
  }
  function fail(message: string) {
    if (done) return;
    if (stopping) {
      failure ??= message; // stop() is waiting: let it report this
      notify();
      return;
    }
    failure = message;
    cancel();
    callbacks.onFailure(message);
  }

  try {
    socket = deps.connect(minted.token, {
      onOpen: () => {
        open = true;
        flush();
        notify();
      },
      onPartial: (text) => callbacks.onPartial(text),
      onWords: (words) => {
        raw.push(...words);
        wordEvents++;
        notify();
      },
      onError: (e) => {
        if (e.kind === 'no-speech') {
          noSpeech = true;
          notify();
        } else fail(e.message);
      },
      onClose: () => {
        closed = true;
        notify();
        if (!stopping) fail(LOST);
      },
    });
  } catch {
    mic.stop();
    throw new VoiceError(NO_CONNECT);
  }

  async function stop(): Promise<Word[]> {
    if (done) throw new VoiceError(failure ?? DIDNT_CATCH);
    stopping = true;
    mic.stop();
    pack(true);
    const wait = deps.finalWordsTimeoutMs ?? FINAL_WORDS_TIMEOUT_MS;
    try {
      await until(() => open || closed || failure !== null, wait);
      if (failure) throw new VoiceError(failure);
      if (!open) throw new VoiceError(NO_RESPONSE);
      const start = audioStart;
      if (start === null) return [];
      if (!closed) {
        flush();
        const before = wordEvents;
        socket?.commit();
        await until(() => wordEvents > before || noSpeech || closed || failure !== null, wait);
        if (failure) throw new VoiceError(failure);
      }
      return toWords(raw, start);
    } finally {
      done = true;
      socket?.close();
    }
  }

  return { stop, cancel };
}

function micMessage(err: unknown): string {
  const name = (err as { name?: unknown } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return MIC_DENIED;
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return NO_MIC;
  return "Couldn't start the microphone. Try again, or type your instruction below.";
}
