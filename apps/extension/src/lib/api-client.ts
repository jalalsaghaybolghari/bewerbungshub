// TODO: point this at the deployed web app origin before shipping past dev.
export const WEB_APP_URL = 'http://localhost:5173';

// Kept here (rather than only in background/api.ts, where the real fetch
// logic now lives) since the widget's own code needs to construct/catch
// this class too — see lib/messenger.ts, which reconstructs one from the
// plain object that crosses the chrome.runtime.sendMessage boundary.
export class ApiError extends Error {
  status: number;
  body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}
