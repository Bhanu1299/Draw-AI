import { describe, expect, it } from 'vitest';
import { parsePreviewMessage } from './previewMessages';

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
});
