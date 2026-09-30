// Posts each 128-frame block of channel 0 to the main thread. Loaded from a Blob URL: no extra file to serve.
const PROCESSOR = `
class DrawaiCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor('drawai-capture', DrawaiCapture);
`;

export interface MicStream {
  stop(): void;
}

/** Stream mono mic samples to onSamples. Rejects with the browser's DOMException (e.g. NotAllowedError) on failure. */
export async function startMicCapture(onSamples: (samples: Float32Array, sampleRate: number) => void): Promise<MicStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: { ideal: 16_000 } },
  });
  let context: AudioContext | undefined;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    stream.getTracks().forEach((t) => t.stop());
    if (context && context.state !== 'closed') context.close().catch(() => {});
  };
  try {
    // Firefox requires the context to run at the mic's own rate.
    const rate = stream.getAudioTracks()[0]?.getSettings().sampleRate;
    const ctx = new AudioContext(rate ? { sampleRate: rate } : undefined);
    context = ctx;
    const url = URL.createObjectURL(new Blob([PROCESSOR], { type: 'application/javascript' }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, 'drawai-capture');
    node.port.onmessage = (e: MessageEvent<Float32Array>) => onSamples(e.data, ctx.sampleRate);
    source.connect(node);
    if (ctx.state === 'suspended') await ctx.resume();
    return {
      stop() {
        if (released) return;
        node.port.onmessage = null;
        source.disconnect();
        node.disconnect();
        release();
      },
    };
  } catch (err) {
    release();
    throw err;
  }
}
