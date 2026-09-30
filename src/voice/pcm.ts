export const STT_SAMPLE_RATE = 16_000;

/**
 * A streaming average-downsampler to 16 kHz (mics usually run at 44.1 or 48 kHz). It keeps the fractional
 * read position between chunks: dropping it would shorten the audio ~1% and push word timings off the strokes.
 */
export function createDownsampler(inRate: number, outRate = STT_SAMPLE_RATE): (chunk: Float32Array) => Float32Array {
  if (inRate < outRate) throw new Error(`Cannot upsample ${inRate} Hz audio to ${outRate} Hz.`);
  if (inRate === outRate) return (chunk) => chunk;
  const ratio = inRate / outRate;
  let pending = new Float32Array(0);
  let pos = 0; // where the next output sample starts, in `pending` (fractional)
  return (chunk) => {
    const buf = new Float32Array(pending.length + chunk.length);
    buf.set(pending);
    buf.set(chunk, pending.length);
    const out: number[] = [];
    while (pos + ratio <= buf.length) {
      const from = Math.floor(pos);
      const to = Math.floor(pos + ratio);
      let sum = 0;
      for (let j = from; j < to; j++) sum += buf[j];
      out.push(sum / Math.max(1, to - from));
      pos += ratio;
    }
    const used = Math.floor(pos);
    pending = buf.slice(used);
    pos -= used;
    return Float32Array.from(out);
  };
}

/** Float samples → base64 of little-endian signed 16-bit PCM, the format Scribe expects. */
export function toPcm16Base64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((s, i) => {
    const c = Math.max(-1, Math.min(1, s));
    view.setInt16(i * 2, c < 0 ? c * 0x8000 : c * 0x7fff, true);
  });
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
