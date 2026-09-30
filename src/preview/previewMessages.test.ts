import { describe, expect, it } from 'vitest';
import { MAX_ELEMENTS, parsePreviewMessage } from './previewMessages';
import { PREVIEW_SOURCE } from './runtimeHtml';

describe('parsePreviewMessage', () => {
  it('parses a height message', () => {
    expect(parsePreviewMessage({ source: 'drawai-preview', type: 'height', height: 912 })).toEqual({
      type: 'height',
      height: 912,
    });
  });
  it('parses a runtime error', () => {
    expect(parsePreviewMessage({ source: 'drawai-preview', type: 'runtime-error', message: 'boom' })).toEqual({
      type: 'runtime-error',
      message: 'boom',
    });
  });
  it('ignores messages from other sources and malformed data', () => {
    expect(parsePreviewMessage({ source: 'other', type: 'height', height: 1 })).toBeNull();
    expect(parsePreviewMessage({ source: 'drawai-preview', type: 'height', height: 'tall' })).toBeNull();
    expect(parsePreviewMessage('hello')).toBeNull();
    expect(parsePreviewMessage(null)).toBeNull();
  });
  it('parses an element map', () => {
    const elements = [
      { src: 'App.tsx:6:5', tag: 'main', text: '', rect: { x: 0, y: 0, w: 1280, h: 900 }, parent: -1 },
      { src: 'components/Hero.tsx:6:7', tag: 'h1', text: 'Hi', rect: { x: 40, y: 80, w: 300, h: 60 }, parent: 0 },
    ];
    expect(parsePreviewMessage({ source: PREVIEW_SOURCE, type: 'elements', elements })).toEqual({ type: 'elements', elements });
  });
  it('rejects an element map with a malformed entry or a forward parent', () => {
    const good = { src: 'App.tsx:6:5', tag: 'main', text: '', rect: { x: 0, y: 0, w: 10, h: 10 }, parent: -1 };
    const badRect = { ...good, rect: { x: 0, y: 0, w: 'wide', h: 10 } };
    const forward = { ...good, parent: 1 };
    expect(parsePreviewMessage({ source: PREVIEW_SOURCE, type: 'elements', elements: [good, badRect] })).toBeNull();
    expect(parsePreviewMessage({ source: PREVIEW_SOURCE, type: 'elements', elements: [forward, good] })).toBeNull();
  });
  it('caps the element map', () => {
    const one = { src: 'App.tsx:6:5', tag: 'div', text: '', rect: { x: 0, y: 0, w: 10, h: 10 }, parent: -1 };
    const msg = parsePreviewMessage({ source: PREVIEW_SOURCE, type: 'elements', elements: Array(MAX_ELEMENTS + 5).fill(one) });
    expect(msg?.type === 'elements' && msg.elements.length).toBe(MAX_ELEMENTS);
  });
});
