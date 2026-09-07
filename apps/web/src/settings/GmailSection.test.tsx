import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GmailStatus } from '@bewerber/shared';
import { GmailSection } from './GmailSection';

let statusData: GmailStatus | undefined;
const disconnectMock = vi.fn();
const connectGmailMock = vi.fn();

vi.mock('./api', () => ({
  useGmailStatus: () => ({ data: statusData, isLoading: false }),
  useDisconnectGmail: () => ({ mutate: disconnectMock, isPending: false }),
  connectGmail: () => connectGmailMock(),
}));

function renderSection(initialEntries: string[] = ['/settings']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <GmailSection />
    </MemoryRouter>,
  );
}

describe('GmailSection', () => {
  afterEach(() => {
    vi.clearAllMocks();
    statusData = undefined;
  });

  it('shows a Connect button when Gmail is not connected (happy path)', async () => {
    statusData = { connected: false, needsReconnect: false };
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: /^connect gmail$/i }));

    expect(connectGmailMock).toHaveBeenCalled();
  });

  it('shows the connected state with a Disconnect button (happy path)', async () => {
    statusData = {
      connected: true,
      needsReconnect: false,
      lastSyncedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    renderSection();

    expect(screen.getByText(/last checked/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /disconnect/i }));

    expect(disconnectMock).toHaveBeenCalled();
  });

  it('shows a reconnect prompt and button when the connection needs reconnecting (edge case)', () => {
    statusData = { connected: true, needsReconnect: true };
    renderSection();

    expect(screen.getByText(/gmail connection has expired/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reconnect gmail/i })).toBeInTheDocument();
  });

  it('shows a success banner once, driven by the gmailConnected query param (edge case)', () => {
    statusData = { connected: true, needsReconnect: false };
    renderSection(['/settings?gmailConnected=1']);

    expect(screen.getByText(/^gmail connected\.$/i)).toBeInTheDocument();
  });

  it('shows an error banner driven by the gmailError query param (negative case)', () => {
    statusData = { connected: false, needsReconnect: false };
    renderSection(['/settings?gmailError=connect_failed']);

    expect(screen.getByText(/couldn.t connect gmail/i)).toBeInTheDocument();
  });
});
