import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { BuildError } from './chat';
import { missingKeyMessage, type ProviderInfo } from './provider';

/** Turn any build failure into a message the user can act on. */
export function userMessage(err: unknown, provider: ProviderInfo, doing = 'building'): string {
  if (
    err instanceof Anthropic.APIUserAbortError ||
    err instanceof OpenAI.APIUserAbortError ||
    (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError'))
  ) {
    return 'Took too long. Try a smaller change.';
  }
  if (err instanceof BuildError) return err.message;
  // Checked before APIError: connection failures are APIErrors without a status.
  if (err instanceof Anthropic.APIConnectionError || err instanceof OpenAI.APIConnectionError) {
    return 'Could not reach the AI service. Check your internet connection.';
  }
  if (err instanceof Anthropic.APIError || err instanceof OpenAI.APIError) {
    const status = err.status ?? 0;
    if (status === 401) return missingKeyMessage(provider.name);
    if (status === 402) return 'The AI account is out of credit. Top it up in the provider console and try again.';
    if (status === 403 || status === 404) return `This API key can't use ${provider.model}. Check the key's access in the provider console.`;
    if (status === 400 || status === 413) return 'The AI rejected this request. Select less, or crop the image, and try again.';
    if (status === 429) return 'The AI is busy right now. Wait a moment and try again.';
    if (status >= 500) return 'The AI service is overloaded right now. Wait a minute and try again.';
  }
  return `Something went wrong while ${doing}. Please try again.`;
}
