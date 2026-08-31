import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api-client';

const apiFetchMock = vi.fn();
const setAccessTokenMock = vi.fn();
vi.mock('./api', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  setAccessToken: (...args: unknown[]) => setAccessTokenMock(...args),
}));

const enqueueMock = vi.fn();
const flushQueueMock = vi.fn();
vi.mock('./queue', () => ({
  enqueue: (...args: unknown[]) => enqueueMock(...args),
  flushQueue: (...args: unknown[]) => flushQueueMock(...args),
}));

const executeScriptMock = vi.fn();
const onClickedAddListenerMock = vi.fn();
const onMessageAddListenerMock = vi.fn();
const alarmsCreateMock = vi.fn();
const onAlarmAddListenerMock = vi.fn();
Object.assign(globalThis.chrome, {
  scripting: { executeScript: executeScriptMock },
  action: { onClicked: { addListener: onClickedAddListenerMock } },
  runtime: { onMessage: { addListener: onMessageAddListenerMock } },
  alarms: { create: alarmsCreateMock, onAlarm: { addListener: onAlarmAddListenerMock } },
});

type SendResponse = (response: unknown) => void;
type OnMessageHandler = (
  message: unknown,
  sender: unknown,
  sendResponse: SendResponse,
) => boolean | undefined;
type OnToggleWidgetHandler = (message: unknown, sender: { tab?: { id?: number } }) => void;

let onClicked: (tab: { id?: number }) => void;
let onMessage: OnMessageHandler;
let onToggleWidgetMessage: OnToggleWidgetHandler;
let onAlarm: (alarm: { name: string }) => void;

beforeAll(async () => {
  await import('./index');
  onClicked = onClickedAddListenerMock.mock.calls[0][0] as typeof onClicked;
  // Registration order in background/index.ts: TOGGLE_WIDGET listener
  // first, then API_FETCH.
  onToggleWidgetMessage = onMessageAddListenerMock.mock.calls[0][0] as OnToggleWidgetHandler;
  onMessage = onMessageAddListenerMock.mock.calls[1][0] as OnMessageHandler;
  onAlarm = onAlarmAddListenerMock.mock.calls[0][0] as typeof onAlarm;
});

describe('background', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
    setAccessTokenMock.mockReset();
    executeScriptMock.mockReset();
    enqueueMock.mockReset();
    flushQueueMock.mockReset();
  });

  describe('offline queue wiring', () => {
    it('creates a periodic alarm to flush the queue (happy path)', () => {
      expect(alarmsCreateMock).toHaveBeenCalledWith('flush-offline-queue', {
        periodInMinutes: 2,
      });
    });

    it('flushes the queue when the matching alarm fires (happy path)', () => {
      onAlarm({ name: 'flush-offline-queue' });

      expect(flushQueueMock).toHaveBeenCalled();
    });

    it('ignores an unrelated alarm (negative case)', () => {
      onAlarm({ name: 'some-other-alarm' });

      expect(flushQueueMock).not.toHaveBeenCalled();
    });
  });

  describe('toolbar click', () => {
    it('injects widget.js into the clicked tab (happy path)', () => {
      onClicked({ id: 42 });

      expect(executeScriptMock).toHaveBeenCalledWith({
        target: { tabId: 42 },
        files: ['widget.js'],
      });
    });

    it('does nothing when the clicked tab has no id, e.g. a devtools panel (edge case)', () => {
      onClicked({});

      expect(executeScriptMock).not.toHaveBeenCalled();
    });
  });

  describe('TOGGLE_WIDGET messages (from the always-on launcher tab)', () => {
    it('injects widget.js into the sending tab (happy path)', () => {
      onToggleWidgetMessage({ type: 'TOGGLE_WIDGET' }, { tab: { id: 7 } });

      expect(executeScriptMock).toHaveBeenCalledWith({
        target: { tabId: 7 },
        files: ['widget.js'],
      });
    });

    it('does nothing when the message has no sending tab, e.g. from the popup context (edge case)', () => {
      onToggleWidgetMessage({ type: 'TOGGLE_WIDGET' }, {});

      expect(executeScriptMock).not.toHaveBeenCalled();
    });

    it('ignores messages of an unrelated type (negative case)', () => {
      onToggleWidgetMessage({ type: 'SOME_OTHER_MESSAGE' }, { tab: { id: 7 } });

      expect(executeScriptMock).not.toHaveBeenCalled();
    });
  });

  describe('API_FETCH messages', () => {
    it('responds with the fetched data on success (happy path)', async () => {
      apiFetchMock.mockResolvedValueOnce({ _id: 'app-1' });
      const sendResponse = vi.fn();

      const keepChannelOpen = onMessage(
        { type: 'API_FETCH', path: '/applications', method: 'POST', body: { jobTitle: 'x' } },
        {},
        sendResponse,
      );

      expect(keepChannelOpen).toBe(true);
      await vi.waitFor(() =>
        expect(sendResponse).toHaveBeenCalledWith({ ok: true, data: { _id: 'app-1' } }),
      );
      expect(apiFetchMock).toHaveBeenCalledWith('/applications', {
        method: 'POST',
        body: { jobTitle: 'x' },
      });
    });

    it('caches the access token after a successful /auth/login call (happy path)', async () => {
      apiFetchMock.mockResolvedValueOnce({ accessToken: 'tok-123', user: { id: '1' } });
      const sendResponse = vi.fn();

      onMessage({ type: 'API_FETCH', path: '/auth/login', method: 'POST' }, {}, sendResponse);

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(setAccessTokenMock).toHaveBeenCalledWith('tok-123');
    });

    it('clears the access token after a successful /auth/logout call (happy path)', async () => {
      apiFetchMock.mockResolvedValueOnce(undefined);
      const sendResponse = vi.fn();

      onMessage({ type: 'API_FETCH', path: '/auth/logout', method: 'POST' }, {}, sendResponse);

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(setAccessTokenMock).toHaveBeenCalledWith(null);
    });

    it('still clears the access token when /auth/logout itself fails (edge case)', async () => {
      apiFetchMock.mockRejectedValueOnce(new ApiError(500, 'Server error'));
      const sendResponse = vi.fn();

      onMessage({ type: 'API_FETCH', path: '/auth/logout', method: 'POST' }, {}, sendResponse);

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(setAccessTokenMock).toHaveBeenCalledWith(null);
    });

    it('serializes an ApiError into a plain response object (negative case)', async () => {
      apiFetchMock.mockRejectedValueOnce(new ApiError(401, 'Invalid credentials'));
      const sendResponse = vi.fn();

      onMessage({ type: 'API_FETCH', path: '/auth/me' }, {}, sendResponse);

      await vi.waitFor(() =>
        expect(sendResponse).toHaveBeenCalledWith({
          ok: false,
          status: 401,
          message: 'Invalid credentials',
          body: undefined,
        }),
      );
    });

    it('falls back to a generic error for a non-ApiError failure, e.g. a network drop (negative case)', async () => {
      apiFetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const sendResponse = vi.fn();

      onMessage({ type: 'API_FETCH', path: '/auth/me' }, {}, sendResponse);

      await vi.waitFor(() =>
        expect(sendResponse).toHaveBeenCalledWith({
          ok: false,
          status: 0,
          message: 'Something went wrong.',
        }),
      );
    });

    it('ignores messages of an unrelated type (negative case)', () => {
      const sendResponse = vi.fn();

      const result = onMessage({ type: 'SOME_OTHER_MESSAGE' }, {}, sendResponse);

      expect(result).toBeUndefined();
      expect(sendResponse).not.toHaveBeenCalled();
      expect(apiFetchMock).not.toHaveBeenCalled();
    });

    it('queues a network failure instead of erroring, when the sender opted in (happy path)', async () => {
      apiFetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const sendResponse = vi.fn();

      onMessage(
        {
          type: 'API_FETCH',
          path: '/applications',
          method: 'POST',
          body: { jobTitle: 'x' },
          queueOnNetworkFailure: true,
        },
        {},
        sendResponse,
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ queued: true }));
      expect(enqueueMock).toHaveBeenCalledWith('/applications', 'POST', { jobTitle: 'x' });
    });

    it('does not queue a real ApiError even when the sender opted in (edge case)', async () => {
      apiFetchMock.mockRejectedValueOnce(new ApiError(400, 'jobTitle is required'));
      const sendResponse = vi.fn();

      onMessage(
        { type: 'API_FETCH', path: '/applications', method: 'POST', queueOnNetworkFailure: true },
        {},
        sendResponse,
      );

      await vi.waitFor(() =>
        expect(sendResponse).toHaveBeenCalledWith({
          ok: false,
          status: 400,
          message: 'jobTitle is required',
          body: undefined,
        }),
      );
      expect(enqueueMock).not.toHaveBeenCalled();
    });

    it('does not queue a network failure when the sender did not opt in (negative case)', async () => {
      apiFetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const sendResponse = vi.fn();

      onMessage({ type: 'API_FETCH', path: '/auth/me' }, {}, sendResponse);

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(enqueueMock).not.toHaveBeenCalled();
    });
  });
});
