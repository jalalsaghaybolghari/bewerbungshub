import { afterEach, describe, expect, it, vi } from 'vitest';
import { BewerbungsHubApiError, bewerbungsHubFetch } from './bewerbungshub-client';

describe('bewerbungsHubFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects with a helpful message when no auth header is given (negative case)', async () => {
    await expect(bewerbungsHubFetch(undefined, '/applications')).rejects.toThrow(
      /No BewerbungsHub API key was provided/,
    );
  });

  it('forwards the auth header and returns the parsed JSON body on success (happy path)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await bewerbungsHubFetch(
      'Bearer bwh_abc',
      '/applications?favorite=true',
    );

    expect(result).toEqual({ items: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/applications?favorite=true'),
      { headers: { Authorization: 'Bearer bwh_abc' } },
    );
  });

  it('throws a BewerbungsHubApiError carrying the status and server message on failure (negative case)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: 'Application not found' }),
      }),
    );

    const error = await bewerbungsHubFetch('Bearer bwh_abc', '/applications/missing').catch(
      (err: unknown) => err,
    );

    expect(error).toBeInstanceOf(BewerbungsHubApiError);
    expect((error as BewerbungsHubApiError).status).toBe(404);
    expect((error as Error).message).toBe('Application not found');
  });

  it('falls back to a generic message when the error body is not JSON (edge case)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('not json')),
      }),
    );

    const error = await bewerbungsHubFetch('Bearer bwh_abc', '/applications').catch(
      (err: unknown) => err,
    );

    expect(error).toBeInstanceOf(BewerbungsHubApiError);
    expect((error as Error).message).toMatch(/status 500/);
  });
});
