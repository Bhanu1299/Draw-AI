/** Provider-neutral conversation types: the build pipeline speaks these, each provider adapter maps them. */
export type ChatPart = { type: 'text'; text: string } | { type: 'image'; pngBase64: string };

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | ChatPart[];
}

/** Sends a conversation to the model and returns its text. Injected so tests never call an API. */
export type Generate = (args: { system: string; messages: ChatMessage[]; signal?: AbortSignal }) => Promise<string>;

/** An AI failure whose message is safe to show the user. */
export class BuildError extends Error {}
