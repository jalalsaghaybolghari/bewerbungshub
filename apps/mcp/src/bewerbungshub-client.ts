// Talks to the BewerbungsHub API from inside the docker network — the
// same host nginx normally proxies to at bewerbungshub.com/api/v1, but
// calling the api container directly here skips an unnecessary hop back
// out through the public internet and TLS termination.
const API_BASE = process.env.BEWERBUNGSHUB_API_BASE ?? 'http://api:3000/api/v1';

export class BewerbungsHubApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// Every tool call forwards the caller's own bearer token as-is — this
// server never stores or validates credentials itself, it only relays
// them. BewerbungsHub's JwtAuthGuard accepts either a login JWT or a
// personal API key here, and scopes every response to whichever user
// that token resolves to.
export async function bewerbungsHubFetch<T>(
  authHeader: string | undefined,
  path: string,
): Promise<T> {
  if (!authHeader) {
    throw new BewerbungsHubApiError(
      401,
      'No BewerbungsHub API key was provided. Add your personal API key ' +
        '(generated at bewerbungshub.com/settings) as this connector\'s bearer token.',
    );
  }

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: authHeader },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => undefined) as { message?: string } | undefined;
    throw new BewerbungsHubApiError(
      res.status,
      body?.message ?? `BewerbungsHub API request failed with status ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}
