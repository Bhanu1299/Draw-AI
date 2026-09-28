export const MISSING_KEY_MESSAGE = 'The server AI key is missing or invalid. Check ANTHROPIC_API_KEY in .env.local.';

/**
 * With no credentials at all the SDK throws a plain Error before sending anything, which the route
 * can't tell apart from other failures, so check up front and return a message the user can act on.
 */
export function missingCredentialsError(env: Record<string, string | undefined>): string | null {
  const hasKey = Boolean(env.ANTHROPIC_API_KEY?.trim()) || Boolean(env.ANTHROPIC_AUTH_TOKEN?.trim());
  return hasKey ? null : MISSING_KEY_MESSAGE;
}
