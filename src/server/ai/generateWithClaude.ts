import Anthropic from '@anthropic-ai/sdk';
import type { Generate } from '@/server/build/buildProject';

export const BUILD_MODEL = 'claude-opus-5';

/** An AI failure whose message is safe to show the user. */
export class BuildError extends Error {}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // Created lazily so importing this module never requires credentials (e.g. in tests).
  client ??= new Anthropic();
  return client;
}

export const generateWithClaude: Generate = async ({ system, messages }) => {
  const stream = getClient().beta.messages.stream({
    model: BUILD_MODEL,
    max_tokens: 64000,
    thinking: { type: 'adaptive' },
    system,
    messages,
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
