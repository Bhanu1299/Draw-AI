import { describe, expect, it, vi } from 'vitest';
import { toPcm16Base64 } from './pcm';
import { MIC_DENIED, startRecording, VoiceError, type RecorderDeps, type SttEvents, type SttSocket } from './recorder';
import type { SttWord } from './words';

function harness(over: Partial<RecorderDeps> = {}, onCommit?: (events: SttEvents) => void) {
  let events: SttEvents | undefined;
  let feed: ((samples: Float32Array, rate: number) => void) | undefined;
  const sent: string[] = [];
  const socket: SttSocket = {
    send: vi.fn((chunk: string) => void sent.push(chunk)),
    commit: vi.fn(() => onCommit?.(events!)),
    close: vi.fn(),
  };
  const mic = { stop: vi.fn() };
  const deps: RecorderDeps = {
    fetchToken: async () => ({ ok: true, token: 'single-use' }),
    connect: (_token, e) => ((events = e), socket),
    startMic: async (onSamples) => ((feed = onSamples), mic),
    now: () => 10_000,
    finalWordsTimeoutMs: 30,
    ...over,
  };
  const callbacks = { onPartial: vi.fn(), onFailure: vi.fn() };
  return { deps, callbacks, socket, sent, mic, feed: (s: Float32Array, rate = 16_000) => feed!(s, rate), events: () => events! };
}

const word = (text: string, start: number, end: number): SttWord => ({ text, start, end, type: 'word' });

describe('startRecording', () => {
  it('buffers audio from the click until the session opens, then sends it in order at 16 kHz', async () => {
    const h = harness();
    await startRecording(h.deps, h.callbacks);
    h.feed(new Float32Array(4800), 48_000); // 100 ms of 48 kHz audio
    expect(h.sent).toEqual([]);
    h.events().onOpen();
    expect(h.sent).toEqual([toPcm16Base64(new Float32Array(1600))]);
  });
  it('puts word times on the stroke clock, counted from the first sample', async () => {
    const h = harness({}, (e) => e.onWords([word('smaller', 0.5, 0.8), { text: ' ', start: 0.8, end: 0.9, type: 'spacing' }]));
    const rec = await startRecording(h.deps, h.callbacks);
    h.feed(new Float32Array(1600)); // 100 ms arriving at 10 000 ms: audio started at 9 900 ms
    h.events().onOpen();
    expect(await rec.stop()).toEqual([{ text: 'smaller', t0: 10_400, t1: 10_700 }]);
  });
  it('sends the unsent tail and commits on Stop, then releases everything', async () => {
    const h = harness({}, (e) => e.onWords([]));
    const rec = await startRecording(h.deps, h.callbacks);
    h.events().onOpen();
    h.feed(new Float32Array(500));
    expect(h.sent).toHaveLength(0);
    await rec.stop();
    expect(h.sent).toHaveLength(1);
    expect(h.socket.commit).toHaveBeenCalledOnce();
    expect(h.socket.close).toHaveBeenCalled();
    expect(h.mic.stop).toHaveBeenCalled();
  });
  it('waits for a slow session to open when Stop comes early', async () => {
    const h = harness({}, (e) => e.onWords([word('hi', 0, 0.2)]));
    const rec = await startRecording(h.deps, h.callbacks);
    h.feed(new Float32Array(1600));
    const words = rec.stop();
    h.events().onOpen();
    expect(await words).toHaveLength(1);
    expect(h.sent).toHaveLength(1);
  });
  it('never hangs: returns what it has when the final words never come', async () => {
    const h = harness();
    const rec = await startRecording(h.deps, h.callbacks);
    h.feed(new Float32Array(1600));
    h.events().onOpen();
    expect(await rec.stop()).toEqual([]);
  });
  it('fails Stop with a clear message when the session never opens', async () => {
    const h = harness();
    const rec = await startRecording(h.deps, h.callbacks);
    await expect(rec.stop()).rejects.toThrow("didn't respond");
  });
  it('treats "no speech" from the service as an empty result', async () => {
    const h = harness({}, (e) => e.onError({ kind: 'no-speech' }));
    const rec = await startRecording(h.deps, h.callbacks);
    h.feed(new Float32Array(1600));
    h.events().onOpen();
    expect(await rec.stop()).toEqual([]);
  });
  it('forwards the live partial transcript', async () => {
    const h = harness();
    await startRecording(h.deps, h.callbacks);
    h.events().onPartial('make these');
    expect(h.callbacks.onPartial).toHaveBeenCalledWith('make these');
  });
  it('explains a blocked microphone', async () => {
    const h = harness({
      startMic: async () => {
        throw new DOMException('denied', 'NotAllowedError');
      },
    });
    await expect(startRecording(h.deps, h.callbacks)).rejects.toThrow(MIC_DENIED);
  });
  it('releases the mic and passes on the reason when no token is available', async () => {
    const h = harness({ fetchToken: async () => ({ ok: false, error: 'Voice is not set up.' }) });
    await expect(startRecording(h.deps, h.callbacks)).rejects.toThrow('Voice is not set up.');
    expect(h.mic.stop).toHaveBeenCalled();
  });
  it('releases the mic and explains when the voice connection cannot be opened', async () => {
    const h = harness({
      connect: () => {
        throw new Error('bad url');
      },
    });
    await expect(startRecording(h.deps, h.callbacks)).rejects.toSatisfy(
      (e) => e instanceof VoiceError && e.message.includes("Couldn't connect"),
    );
    expect(h.mic.stop).toHaveBeenCalled();
  });
  it('cancels and reports when the session breaks mid-recording', async () => {
    const h = harness();
    const rec = await startRecording(h.deps, h.callbacks);
    h.events().onError({ kind: 'failed', message: 'Voice credits ran out.' });
    expect(h.callbacks.onFailure).toHaveBeenCalledWith('Voice credits ran out.');
    expect(h.mic.stop).toHaveBeenCalled();
    expect(h.socket.close).toHaveBeenCalled();
    await expect(rec.stop()).rejects.toBeInstanceOf(VoiceError);
  });
  it('reports a dropped connection while recording, but not the close it causes itself', async () => {
    const h = harness({}, (e) => e.onWords([]));
    const rec = await startRecording(h.deps, h.callbacks);
    h.events().onOpen();
    await rec.stop();
    h.events().onClose(); // our own close after Stop
    expect(h.callbacks.onFailure).not.toHaveBeenCalled();

    const h2 = harness();
    await startRecording(h2.deps, h2.callbacks);
    h2.events().onClose();
    expect(h2.callbacks.onFailure).toHaveBeenCalledWith(expect.stringContaining('connection'));
  });
});
