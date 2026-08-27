import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, ApiError, setAccessToken } from './api-client';

function jsonResponse(body: unknown, init: { status?: number; ok?: boolean } = {}) {
  const status = init.status ?? 200;
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('apiFetch', () => {
  beforeEach(() => {
    setAccessToken(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed JSON on a successful request (happy path)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ hello: 'world' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiFetch<{ hello: string }>('/ping');

    expect(result).toEqual({ hello: 'world' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/ping',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('sends the access token as a Bearer header when set (happy path)', async () => {
    setAccessToken('token-123');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/me');

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>).Authorization).toBe('Bearer token-123');
  });

  it('throws an ApiError with the server message on a non-ok response (negative case)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ message: 'Invalid email or password' }, { status: 401, ok: false }));
    vi.stubGlobal('fetch', fetchMock);

    // no refresh cookie will be sent in this environment, so the refresh
    // attempt itself will also fail — the original error should still surface
    await expect(apiFetch('/auth/login', { method: 'POST', skipRefresh: true })).rejects.toMatchObject({
      status: 401,
      message: 'Invalid email or password',
    });
  });

  it('retries once after a successful silent refresh on 401 (edge case)', async () => {
    const fetchMock = vi
      .fn()
      // 1) original request: 401
      .mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, { status: 401, ok: false }))
      // 2) refresh call: succeeds with a new token
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'new-token' }))
      // 3) retried original request: succeeds
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiFetch<{ ok: boolean }>('/applications');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/auth/refresh');
  });

  it('does not retry forever if refresh also fails (edge case)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, { status: 401, ok: false }))
      .mockResolvedValueOnce(jsonResponse({ message: 'refresh failed' }, { status: 401, ok: false }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/applications')).rejects.toBeInstanceOf(ApiError);
    // original + refresh attempt only — never an infinite loop
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
