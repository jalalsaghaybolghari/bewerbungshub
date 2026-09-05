import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './SettingsPage';

const updateMock = vi.fn();
let settingsData: { followUpDefaultDays: number; ghostedAfterDays: number } | undefined;
let isLoading = false;

vi.mock('./api', () => ({
  useSettings: () => ({ data: settingsData, isLoading }),
  useUpdateSettings: () => ({ mutateAsync: updateMock }),
  useApiKeyStatus: () => ({ data: { hasKey: false }, isLoading: false }),
  useGenerateApiKey: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useRevokeApiKey: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('SettingsPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
    settingsData = undefined;
    isLoading = false;
  });

  it('shows a loading state while settings are being fetched (edge case)', () => {
    isLoading = true;
    render(<SettingsPage />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('rejects an out-of-range value and does not submit (negative case)', async () => {
    settingsData = { followUpDefaultDays: 7, ghostedAfterDays: 21 };
    render(<SettingsPage />);

    const input = await screen.findByLabelText(/default follow-up reminder/i);
    await userEvent.clear(input);
    await userEvent.type(input, '999');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await vi.waitFor(() => expect(screen.getByRole('button', { name: /^save$/i })).toBeEnabled());
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('saves updated settings and shows a confirmation (happy path)', async () => {
    settingsData = { followUpDefaultDays: 7, ghostedAfterDays: 21 };
    updateMock.mockResolvedValueOnce(undefined);
    render(<SettingsPage />);

    const input = await screen.findByLabelText(/default follow-up reminder/i);
    await userEvent.clear(input);
    await userEvent.type(input, '14');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await vi.waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith({ followUpDefaultDays: 14, ghostedAfterDays: 21 }),
    );
    expect(await screen.findByText(/saved\./i)).toBeInTheDocument();
  });
});
