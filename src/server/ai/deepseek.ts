import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { BuildError, type ChatMessage, type Generate } from './chat';

/** DeepSeek's only model with image input. */
export const DEEPSEEK_MODEL = 'deepseek-flash';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

export function toOpenAIMessages(system: string, messages: ChatMessage[]): ChatCompletionMessageParam[] {
  const converted = messages.map((message): ChatCompletionMessageParam => {
    if (typeof message.content === 'string' || message.role === 'assistant') {
      const text =
        typeof message.content === 'string'
          ? message.content
          : message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');
      return { role: message.role, content: text };
    }
    return {
      role: 'user',
      content: message.content.map((part) =>
        part.type === 'text'
          ? { type: 'text' as const, text: part.text }
          : { type: 'image_url' as const, image_url: { url: `data:image/png;base64,${part.pngBase64}`, detail: 'high' as const } },
      ),
    };
  });
  return [{ role: 'system', content: system }, ...converted];
}

export function createDeepSeekGenerate(apiKey: string): Generate {
  // DeepSeek's API is OpenAI-compatible.
  const client = new OpenAI({ apiKey, baseURL: DEEPSEEK_BASE_URL });
  return async ({ system, messages, signal }) => {
    const completion = await client.chat.completions.create(
      { model: DEEPSEEK_MODEL, max_tokens: 32000, messages: toOpenAIMessages(system, messages) },
      { signal },
    );
    const choice = completion.choices[0];
    if (!choice) throw new BuildError('The AI returned an empty answer. Please try again.');
    if (choice.finish_reason === 'content_filter') {
      throw new BuildError('The AI declined to build this. Try a different sketch or screenshot.');
    }
    if (choice.finish_reason === 'length') {
      throw new BuildError('That page is too big to build in one go. Try a smaller section.');
    }
    return choice.message.content ?? '';
  };
}
