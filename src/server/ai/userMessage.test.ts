import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { BuildError } from './generateWithClaude';
import { userMessage } from './userMessage';

const apiError = (status: number) => Anthropic.APIError.generate(status, { type: 'error' }, 'boom', new Headers());

describe('userMessage', () => {
  it('passes BuildError messages through', () => {
    expect(userMessage(new BuildError('Too big'))).toBe('Too big');
  });
  it('explains a bad key', () => {
    expect(userMessage(apiError(401))).toContain('ANTHROPIC_API_KEY');
  });
  it('explains a key that cannot use the model', () => {
    expect(userMessage(apiError(403))).toContain('claude-opus-5');
    expect(userMessage(apiError(404))).toContain('claude-opus-5');
  });
  it('asks for a smaller selection on a rejected request', () => {
    expect(userMessage(apiError(400))).toMatch(/select less|crop/i);
  });
  it('says the service is busy on rate limits, overload and server errors', () => {
    for (const status of [429, 500, 529]) expect(userMessage(apiError(status))).toMatch(/busy|overloaded/i);
  });
  it('explains connection failures', () => {
    expect(userMessage(new Anthropic.APIConnectionError({ message: 'down' }))).toContain('internet connection');
  });
  it('falls back to a generic message', () => {
    expect(userMessage(new Error('???'))).toBe('Something went wrong while building. Please try again.');
  });
});
