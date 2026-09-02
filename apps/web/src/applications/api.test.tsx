import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDuplicatePairs, useMergeApplications, useMoveApplicationStatus } from './api';
import type { Application, ApplicationsListResponse, DuplicateGroupsResponse } from './types';

function jsonResponse(body: unknown, init: { status?: number; ok?: boolean } = {}) {
  const status = init.status ?? 200;
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function makeApplication(overrides: Partial<Application>): Application {
  return {
    _id: 'app-1',
    jobTitle: 'Backend Engineer',
    company: { name: 'Acme' },
    location: { raw: 'Berlin' },
    jobDescription: '',
    applyLink: 'https://example.com/jobs/1',
    applyType: 'linkedin',
    status: 'applied',
    statusChangedAt: '2026-01-01T00:00:00.000Z',
    statusSetBy: 'user',
    followUpCount: 0,
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const listQueryKey = ['applications', { q: '', page: 1, pageSize: 500 }];

function seedClient(items: Application[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const list: ApplicationsListResponse = { items, total: items.length, page: 1, pageSize: 500 };
  client.setQueryData(listQueryKey, list);
  return client;
}

function renderMoveHook(client: QueryClient) {
  return renderHook(() => useMoveApplicationStatus(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe('useMoveApplicationStatus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updates the cached status immediately, before the request resolves (happy path)', async () => {
    const client = seedClient([makeApplication({ status: 'applied' })]);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(makeApplication({ status: 'interview' })));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderMoveHook(client);

    result.current.mutate({ id: 'app-1', status: 'interview' });

    // onMutate is itself async (it awaits cancelQueries first), so the cache
    // write isn't synchronous with this call — but it still happens well
    // before the mutationFn's mocked fetch is even invoked, per TanStack
    // Query's mutation lifecycle (onMutate always runs first).
    await waitFor(() => {
      const cached = client.getQueryData<ApplicationsListResponse>(listQueryKey);
      expect(cached?.items[0].status).toBe('interview');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls back to the original status when the request fails (negative case)', async () => {
    const client = seedClient([makeApplication({ status: 'applied' })]);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ message: 'nope' }, { status: 400, ok: false }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderMoveHook(client);

    result.current.mutate({ id: 'app-1', status: 'interview' });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = client.getQueryData<ApplicationsListResponse>(listQueryKey);
    expect(cached?.items[0].status).toBe('applied');
  });

  it('leaves non-list cache entries (e.g. a single application detail) untouched (edge case)', async () => {
    const client = seedClient([makeApplication({ status: 'applied' })]);
    client.setQueryData(['applications', 'app-1'], { note: 'not a paginated list' });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(makeApplication({ status: 'interview' })));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderMoveHook(client);

    result.current.mutate({ id: 'app-1', status: 'interview' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(client.getQueryData(['applications', 'app-1'])).toEqual({
      note: 'not a paginated list',
    });
  });
});

function renderWithClient<T>(
  hook: () => T,
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) {
  return renderHook(hook, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe('useDuplicatePairs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches the duplicate-groups endpoint (happy path)', async () => {
    const pairs: DuplicateGroupsResponse = {
      pairs: [
        {
          a: makeApplication({ _id: 'app-1' }),
          b: makeApplication({ _id: 'app-2' }),
          titleSimilarity: 0.9,
          companySimilarity: 1,
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(pairs));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderWithClient(() => useDuplicatePairs());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(pairs);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/applications/duplicate-groups'),
      expect.anything(),
    );
  });
});

describe('useMergeApplications', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts to the merge endpoint with keepId and mergeId and invalidates the applications cache (happy path)', async () => {
    const client = seedClient([makeApplication({ _id: 'app-1' })]);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(makeApplication({ _id: 'app-1' })));
    vi.stubGlobal('fetch', fetchMock);
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderWithClient(() => useMergeApplications(), client);

    result.current.mutate({ keepId: 'app-1', mergeId: 'app-2' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/applications/app-1/merge/app-2'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['applications'] });
  });
});
