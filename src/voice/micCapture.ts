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
  // Firefox requires the context to run at the mic's own rate.
  const rate = stream.getAudioTracks()[0]?.getSettings().sampleRate;
  const context = new AudioContext(rate ? { sampleRate: rate } : undefined);
  const release = () => {
    stream.getTracks().forEach((t) => t.stop());
    void context.close();
  };
  try {
    const url = URL.createObjectURL(new Blob([PROCESSOR], { type: 'application/javascript' }));
    try {
      await context.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, 'drawai-capture');
    node.port.onmessage = (e: MessageEvent<Float32Array>) => onSamples(e.data, context.sampleRate);
    source.connect(node);
    if (context.state === 'suspended') await context.resume();
    return {
      stop() {
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
