import { ANTHROPIC_MODEL, createAnthropicGenerate } from './anthropic';
import type { Generate } from './chat';
import { createDeepSeekGenerate, DEEPSEEK_MODEL } from './deepseek';

export type ProviderName = 'deepseek' | 'anthropic';

export interface ProviderInfo {
  name: ProviderName;
  model: string;
}

export interface Provider extends ProviderInfo {
  generate: Generate;
}

const KEY_VAR: Record<ProviderName, string> = { deepseek: 'DEEPSEEK_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };

export function missingKeyMessage(name: ProviderName): string {
  return `The server AI key is missing or invalid. Check ${KEY_VAR[name]} in .env.local.`;
}

type Env = Record<string, string | undefined>;

/** Pick the AI provider from AI_PROVIDER (default: deepseek) and check its key before any request. */
export function selectProvider(env: Env): { ok: true; provider: Provider } | { ok: false; error: string } {
  const name = (env.AI_PROVIDER?.trim() || 'deepseek').toLowerCase();
  if (name === 'deepseek') {
    const key = env.DEEPSEEK_API_KEY?.trim();
    if (!key) return { ok: false, error: missingKeyMessage('deepseek') };
    return { ok: true, provider: { name, model: DEEPSEEK_MODEL, generate: createDeepSeekGenerate(key) } };
  }
  if (name === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY?.trim() && !env.ANTHROPIC_AUTH_TOKEN?.trim()) {
      return { ok: false, error: missingKeyMessage('anthropic') };
    }
    return { ok: true, provider: { name, model: ANTHROPIC_MODEL, generate: createAnthropicGenerate() } };
  }
  return { ok: false, error: `Unknown AI_PROVIDER "${name}" in .env.local. Use "deepseek" or "anthropic".` };
}
