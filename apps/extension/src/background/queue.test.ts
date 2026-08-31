import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api-client';
import { enqueue, flushQueue } from './queue';

const apiFetchMock = vi.fn();
vi.mock('./api', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

describe('offline retry queue', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
  });

  it('does nothing when the queue is empty (negative case)', async () => {
    await flushQueue();

    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('flushes a queued request successfully, clearing it from the queue (happy path)', async () => {
    await enqueue('/applications', 'POST', { jobTitle: 'Engineer' });
    apiFetchMock.mockResolvedValueOnce({ _id: 'app-1' });

    await flushQueue();

    expect(apiFetchMock).toHaveBeenCalledWith('/applications', {
      method: 'POST',
      body: { jobTitle: 'Engineer' },
    });

    // Flushing again shouldn't retry anything — the queue is empty now.
    apiFetchMock.mockClear();
    await flushQueue();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('keeps a request queued (in order) when still offline (edge case)', async () => {
    await enqueue('/applications', 'POST', { jobTitle: 'First' });
    await enqueue('/applications', 'POST', { jobTitle: 'Second' });
    apiFetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await flushQueue();
    apiFetchMock.mockClear();
    apiFetchMock.mockResolvedValueOnce({ _id: 'app-1' }).mockResolvedValueOnce({ _id: 'app-2' });

    await flushQueue();

    expect(apiFetchMock).toHaveBeenNthCalledWith(1, '/applications', {
      method: 'POST',
      body: { jobTitle: 'First' },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, '/applications', {
      method: 'POST',
      body: { jobTitle: 'Second' },
    });
  });

  it('drops a queued request that fails with a real ApiError instead of retrying forever (negative case)', async () => {
    await enqueue('/applications', 'POST', { jobTitle: 'Bad' });
    await enqueue('/applications', 'POST', { jobTitle: 'Good' });
    apiFetchMock
      .mockRejectedValueOnce(new ApiError(400, 'jobTitle is required'))
      .mockResolvedValueOnce({ _id: 'app-2' });

    await flushQueue();

    expect(apiFetchMock).toHaveBeenCalledTimes(2);

    // Nothing left to retry — the bad one was dropped, the good one saved.
    apiFetchMock.mockClear();
    await flushQueue();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
