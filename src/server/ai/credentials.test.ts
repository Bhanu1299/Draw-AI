import { describe, expect, it } from 'vitest';
import { missingCredentialsError } from './credentials';

describe('missingCredentialsError', () => {
  it('explains how to fix a missing key', () => {
    expect(missingCredentialsError({})).toContain('ANTHROPIC_API_KEY');
  });
  it('treats a blank key as missing', () => {
    expect(missingCredentialsError({ ANTHROPIC_API_KEY: '   ' })).toContain('ANTHROPIC_API_KEY');
  });
  it('accepts an API key or an auth token', () => {
    expect(missingCredentialsError({ ANTHROPIC_API_KEY: 'sk-ant-test' })).toBeNull();
    expect(missingCredentialsError({ ANTHROPIC_AUTH_TOKEN: 'token' })).toBeNull();
  });
});
