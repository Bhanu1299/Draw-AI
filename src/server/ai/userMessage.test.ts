import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { describe, expect, it } from 'vitest';
import { BuildError } from './chat';
import { userMessage } from './userMessage';

const deepseek = { name: 'deepseek' as const, model: 'deepseek-flash' };
const anthropic = { name: 'anthropic' as const, model: 'claude-opus-5' };
const claudeError = (status: number) => Anthropic.APIError.generate(status, { type: 'error' }, 'boom', new Headers());
const deepseekError = (status: number) => OpenAI.APIError.generate(status, { message: 'boom' }, 'boom', new Headers());

describe('userMessage', () => {
  it('passes BuildError messages through', () => {
    expect(userMessage(new BuildError('Too big'), deepseek)).toBe('Too big');
  });
  it('names the right key when it is rejected', () => {
    expect(userMessage(deepseekError(401), deepseek)).toContain('DEEPSEEK_API_KEY');
    expect(userMessage(claudeError(401), anthropic)).toContain('ANTHROPIC_API_KEY');
  });
  it('says the account is out of credit on 402', () => {
    expect(userMessage(deepseekError(402), deepseek)).toMatch(/out of credit/i);
  });
  it('explains a key that cannot use the model', () => {
    expect(userMessage(claudeError(403), anthropic)).toContain('claude-opus-5');
    expect(userMessage(deepseekError(404), deepseek)).toContain('deepseek-flash');
  });
  it('asks for a smaller selection on a rejected request', () => {
    expect(userMessage(deepseekError(400), deepseek)).toMatch(/select less|crop/i);
  });
  it('says the service is busy on rate limits, overload and server errors', () => {
    for (const status of [429, 500, 503]) expect(userMessage(deepseekError(status), deepseek)).toMatch(/busy|overloaded/i);
    expect(userMessage(claudeError(529), anthropic)).toMatch(/overloaded/i);
  });
  it('explains connection failures from either SDK', () => {
    expect(userMessage(new Anthropic.APIConnectionError({ message: 'down' }), anthropic)).toContain('internet connection');
    expect(userMessage(new OpenAI.APIConnectionError({ message: 'down' }), deepseek)).toContain('internet connection');
  });
  it('falls back to a generic message', () => {
    expect(userMessage(new Error('???'), deepseek)).toBe('Something went wrong while building. Please try again.');
  });
  it('explains a timeout', () => {
    expect(userMessage(new OpenAI.APIUserAbortError(), deepseek)).toBe('Took too long. Try a smaller change.');
    expect(userMessage(Object.assign(new Error('t'), { name: 'TimeoutError' }), deepseek)).toBe('Took too long. Try a smaller change.');
  });
  it('names the action in the generic fallback', () => {
    expect(userMessage(new Error('???'), deepseek, 'editing')).toBe('Something went wrong while editing. Please try again.');
  });
});
