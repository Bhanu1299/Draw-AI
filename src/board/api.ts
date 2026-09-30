/** POST JSON to one of our API routes. A network failure becomes a readable error instead of a throw. */
export async function postApi<T extends { ok: boolean }>(url: string, body: unknown): Promise<T | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return (await res.json()) as T;
  } catch {
    return { ok: false, error: 'Could not reach the server. Check that it is running and try again.' };
  }
}
