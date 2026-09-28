import Anthropic from '@anthropic-ai/sdk';
import { MISSING_KEY_MESSAGE } from './credentials';
import { BUILD_MODEL, BuildError } from './generateWithClaude';

/** Turn any build failure into a message the user can act on. */
export function userMessage(err: unknown): string {
  if (err instanceof BuildError) return err.message;
  // Checked before APIError: connection failures are APIErrors without a status.
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the AI service. Check your internet connection.';
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? 0;
    if (status === 401) return MISSING_KEY_MESSAGE;
    if (status === 403 || status === 404) return `This API key can't use ${BUILD_MODEL}. Check the key's access in the Anthropic Console.`;
    if (status === 400 || status === 413) return 'The AI rejected this request. Select less, or crop the image, and try again.';
    if (status === 429) return 'The AI is busy right now. Wait a moment and try again.';
    if (status >= 500) return 'The AI service is overloaded right now. Wait a minute and try again.';
  }
  return 'Something went wrong while building. Please try again.';
}
