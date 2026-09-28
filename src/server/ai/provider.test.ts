import { describe, expect, it } from 'vitest';
import { selectProvider } from './provider';

describe('selectProvider', () => {
  it('defaults to DeepSeek flash', () => {
    const result = selectProvider({ DEEPSEEK_API_KEY: 'sk-test' });
    expect(result.ok && result.provider.name).toBe('deepseek');
    expect(result.ok && result.provider.model).toBe('deepseek-flash');
  });
  it('can switch to Anthropic', () => {
    const result = selectProvider({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-test' });
    expect(result.ok && result.provider.name).toBe('anthropic');
    expect(result.ok && result.provider.model).toBe('claude-opus-5');
  });
  it('explains which key is missing for the chosen provider', () => {
    const deepseek = selectProvider({ DEEPSEEK_API_KEY: '  ' });
    expect(!deepseek.ok && deepseek.error).toContain('DEEPSEEK_API_KEY');
    const anthropic = selectProvider({ AI_PROVIDER: 'anthropic' });
    expect(!anthropic.ok && anthropic.error).toContain('ANTHROPIC_API_KEY');
  });
  it('rejects an unknown provider name', () => {
    const result = selectProvider({ AI_PROVIDER: 'gpt', DEEPSEEK_API_KEY: 'x' });
    expect(!result.ok && result.error).toContain('AI_PROVIDER');
  });
});
