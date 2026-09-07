import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './SettingsPage';

const updateMock = vi.fn();
let settingsData:
  | {
      followUpDefaultDays: number;
      ghostedAfterDays: number;
      gmailSyncIntervalMinutes: number;
      gmailAutoApprove: boolean;
    }
  | undefined;
let isLoading = false;

vi.mock('./api', () => ({
  useSettings: () => ({ data: settingsData, isLoading }),
  useUpdateSettings: () => ({ mutateAsync: updateMock }),
  useApiKeyStatus: () => ({ data: { hasKey: false }, isLoading: false }),
  useGenerateApiKey: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useRevokeApiKey: () => ({ mutate: vi.fn(), isPending: false }),
  useGmailStatus: () => ({ data: { connected: false, needsReconnect: false }, isLoading: false }),
  useDisconnectGmail: () => ({ mutate: vi.fn(), isPending: false }),
  connectGmail: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

function baseSettings() {
  return {
    followUpDefaultDays: 7,
    ghostedAfterDays: 21,
    gmailSyncIntervalMinutes: 60,
    gmailAutoApprove: false,
  };
}

describe('SettingsPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
    settingsData = undefined;
    isLoading = false;
  });

  it('shows a loading state while settings are being fetched (edge case)', () => {
    isLoading = true;
    renderPage();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('rejects an out-of-range value and does not submit (negative case)', async () => {
    settingsData = baseSettings();
    renderPage();

    const input = await screen.findByLabelText(/default follow-up reminder/i);
    await userEvent.clear(input);
    await userEvent.type(input, '999');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await vi.waitFor(() => expect(screen.getByRole('button', { name: /^save$/i })).toBeEnabled());
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('saves updated settings and shows a confirmation (happy path)', async () => {
    settingsData = baseSettings();
    updateMock.mockResolvedValueOnce(undefined);
    renderPage();

    const input = await screen.findByLabelText(/default follow-up reminder/i);
    await userEvent.clear(input);
    await userEvent.type(input, '14');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await vi.waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith({
        followUpDefaultDays: 14,
        ghostedAfterDays: 21,
        gmailSyncIntervalMinutes: 60,
        gmailAutoApprove: false,
      }),
    );
    expect(await screen.findByText(/saved\./i)).toBeInTheDocument();
  });

  it('submits the Gmail sync interval and auto-approve fields when changed (happy path)', async () => {
    settingsData = baseSettings();
    updateMock.mockResolvedValueOnce(undefined);
    renderPage();

    await screen.findByLabelText(/default follow-up reminder/i);
    await userEvent.selectOptions(screen.getByLabelText(/check gmail for updates/i), '180');
    await userEvent.click(
      screen.getByRole('checkbox', { name: /automatically apply status changes/i }),
    );
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await vi.waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ gmailSyncIntervalMinutes: 180, gmailAutoApprove: true }),
      ),
    );
  });
});
