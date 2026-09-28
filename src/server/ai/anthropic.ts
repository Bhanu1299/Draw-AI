import Anthropic from '@anthropic-ai/sdk';
import { BuildError, type ChatMessage, type Generate } from './chat';

export const ANTHROPIC_MODEL = 'claude-opus-5';

export function toAnthropicMessages(messages: ChatMessage[]): Anthropic.Beta.BetaMessageParam[] {
  return messages.map((message) => ({
    role: message.role,
    content:
      typeof message.content === 'string'
        ? message.content
        : message.content.map((part) =>
            part.type === 'text'
              ? { type: 'text' as const, text: part.text }
              : { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/png' as const, data: part.pngBase64 } },
          ),
  }));
}

export function createAnthropicGenerate(): Generate {
  const client = new Anthropic();
  return async ({ system, messages }) => {
    const stream = client.beta.messages.stream({
      model: ANTHROPIC_MODEL,
      max_tokens: 64000,
      thinking: { type: 'adaptive' },
      system,
      messages: toAnthropicMessages(messages),
      // On a safety decline, the API re-runs the request on Anthropic's recommended fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') {
      throw new BuildError('The AI declined to build this. Try a different sketch or screenshot.');
    }
    if (message.stop_reason === 'max_tokens') {
      throw new BuildError('That page is too big to build in one go. Try a smaller section.');
    }
    return message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
  };
}
