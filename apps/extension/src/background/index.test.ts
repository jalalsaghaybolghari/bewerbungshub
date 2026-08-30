import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api-client';

const apiFetchMock = vi.fn();
const setAccessTokenMock = vi.fn();
vi.mock('./api', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  setAccessToken: (...args: unknown[]) => setAccessTokenMock(...args),
}));

const executeScriptMock = vi.fn();
const onClickedAddListenerMock = vi.fn();
const onMessageAddListenerMock = vi.fn();
Object.assign(globalThis.chrome, {
  scripting: { executeScript: executeScriptMock },
  action: { onClicked: { addListener: onClickedAddListenerMock } },
  runtime: { onMessage: { addListener: onMessageAddListenerMock } },
});

type SendResponse = (response: unknown) => void;
type OnMessageHandler = (
  message: unknown,
  sender: unknown,
  sendResponse: SendResponse,
) => boolean | undefined;

let onClicked: (tab: { id?: number }) => void;
let onMessage: OnMessageHandler;

beforeAll(async () => {
  await import('./index');
  onClicked = onClickedAddListenerMock.mock.calls[0][0] as typeof onClicked;
  onMessage = onMessageAddListenerMock.mock.calls[0][0] as OnMessageHandler;
});

describe('background', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
    setAccessTokenMock.mockReset();
    executeScriptMock.mockReset();
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
  });
});
