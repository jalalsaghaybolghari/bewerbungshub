import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildQueryString, makeGetApplicationHandler, makeListApplicationsHandler } from './tools';

describe('buildQueryString', () => {
  it('omits keys whose value is undefined (edge case)', () => {
    expect(buildQueryString({ a: '1', b: undefined, c: 'x' })).toBe('?a=1&c=x');
  });

  it('returns an empty string when every value is undefined (edge case)', () => {
    expect(buildQueryString({ a: undefined })).toBe('');
  });
});

describe('makeListApplicationsHandler', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards filters as query params and returns the result as text (happy path)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [{ jobTitle: 'Engineer' }], total: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const handler = makeListApplicationsHandler('Bearer bwh_abc');
    const result = await handler({ favorite: true, status: 'applied', pageSize: 5 });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/applications?');
    expect(url).toContain('status=applied');
    expect(url).toContain('favorite=true');
    expect(url).toContain('pageSize=5');
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Engineer');
  });

  it('returns an error result instead of throwing when the API call fails (negative case)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Invalid or expired credentials' }),
      }),
    );

    const handler = makeListApplicationsHandler('Bearer bad-key');
    const result = await handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Invalid or expired credentials');
  });
});

describe('makeGetApplicationHandler', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('url-encodes the id and returns the application as text (happy path)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ application: { _id: 'abc 123' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const handler = makeGetApplicationHandler('Bearer bwh_abc');
    const result = await handler({ id: 'abc 123' });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/applications/abc%20123');
    expect(result.content[0].text).toContain('abc 123');
  });

  it('surfaces a not-found error as a tool error instead of throwing (negative case)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: 'Application not found' }),
      }),
    );

    const handler = makeGetApplicationHandler('Bearer bwh_abc');
    const result = await handler({ id: 'missing' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Application not found');
  });
});
