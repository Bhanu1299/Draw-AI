import { describe, expect, it } from 'vitest';
import { createDownsampler, toPcm16Base64 } from './pcm';

describe('createDownsampler', () => {
  it('passes 16 kHz audio through unchanged', () => {
    expect(Array.from(createDownsampler(16_000)(Float32Array.from([0.1, 0.2])))).toEqual([0.1, 0.2].map(Math.fround));
  });
  it('averages 48 kHz audio down to 16 kHz', () => {
    expect(Array.from(createDownsampler(48_000)(Float32Array.from([1, 1, 1, 0, 0, 0, 0.5, 0.5, 0.5])))).toEqual([1, 0, 0.5]);
  });
  it('keeps time exact across chunks at 44.1 kHz, so word timings never drift', () => {
    const down = createDownsampler(44_100);
    const chunks = 10_336; // ~30 s of 128-sample worklet frames
    let out = 0;
    for (let i = 0; i < chunks; i++) out += down(new Float32Array(128)).length;
    expect(Math.abs(out - Math.floor((chunks * 128 * 16_000) / 44_100))).toBeLessThanOrEqual(1);
  });
  it('refuses to upsample', () => {
    expect(() => createDownsampler(8_000)).toThrow();
  });
});

describe('toPcm16Base64', () => {
  it('writes little-endian signed 16-bit samples, clipped to ±1', () => {
    expect(toPcm16Base64(Float32Array.from([0, 1, -1]))).toBe('AAD/fwCA');
    expect(toPcm16Base64(Float32Array.from([2, -2]))).toBe(toPcm16Base64(Float32Array.from([1, -1])));
  });
});
