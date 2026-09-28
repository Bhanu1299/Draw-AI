import { describe, expect, it } from 'vitest';
import type { ChatMessage } from './chat';
import { toAnthropicMessages } from './anthropic';
import { toOpenAIMessages } from './deepseek';

const messages: ChatMessage[] = [
  { role: 'user', content: [{ type: 'image', pngBase64: 'AAAA' }, { type: 'text', text: 'Build it' }] },
  { role: 'assistant', content: 'first try' },
  { role: 'user', content: 'fix it' },
];

describe('toOpenAIMessages', () => {
  it('puts the system prompt first and sends images as high-detail PNG data URLs', () => {
    expect(toOpenAIMessages('SYS', messages)).toEqual([
      { role: 'system', content: 'SYS' },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA', detail: 'high' } },
          { type: 'text', text: 'Build it' },
        ],
      },
      { role: 'assistant', content: 'first try' },
      { role: 'user', content: 'fix it' },
    ]);
  });
});

describe('toAnthropicMessages', () => {
  it('sends images as base64 PNG blocks', () => {
    expect(toAnthropicMessages(messages)[0]).toEqual({
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
        { type: 'text', text: 'Build it' },
      ],
    });
    expect(toAnthropicMessages(messages).slice(1)).toEqual(messages.slice(1));
  });
});
