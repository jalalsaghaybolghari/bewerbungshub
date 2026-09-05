import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api-client';
import { ApiKeySection } from './ApiKeySection';

const generateMock = vi.fn();
const revokeMock = vi.fn();
let statusData: { hasKey: boolean; createdAt?: string } | undefined;
let isLoading = false;
let generateData: { apiKey: string; createdAt: string } | undefined;
let generateError: unknown;

vi.mock('./api', () => ({
  useApiKeyStatus: () => ({ data: statusData, isLoading }),
  useGenerateApiKey: () => ({
    mutate: generateMock,
    data: generateData,
    isPending: false,
    isError: !!generateError,
    error: generateError,
  }),
  useRevokeApiKey: () => ({ mutate: revokeMock, isPending: false }),
}));

describe('ApiKeySection', () => {
  afterEach(() => {
    vi.clearAllMocks();
    statusData = undefined;
    isLoading = false;
    generateData = undefined;
    generateError = undefined;
  });

  it('renders nothing while status is loading (edge case)', () => {
    isLoading = true;
    const { container } = render(<ApiKeySection />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows no-key state with only a generate button when the user has no key (happy path)', () => {
    statusData = { hasKey: false };
    render(<ApiKeySection />);

    expect(screen.getByText(/don't have an api key yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate api key/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /revoke/i })).not.toBeInTheDocument();
  });

  it('shows the creation date and a revoke button when a key already exists (happy path)', () => {
    statusData = { hasKey: true, createdAt: '2026-01-01T00:00:00.000Z' };
    render(<ApiKeySection />);

    expect(screen.getByText(/api key created/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /regenerate api key/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /revoke/i })).toBeInTheDocument();
  });

  it('calls generate when the button is clicked (happy path)', async () => {
    statusData = { hasKey: false };
    render(<ApiKeySection />);

    await userEvent.click(screen.getByRole('button', { name: /generate api key/i }));

    expect(generateMock).toHaveBeenCalled();
  });

  it('shows the raw key exactly once after generating, with a warning it will not be shown again (happy path)', () => {
    statusData = { hasKey: true, createdAt: '2026-01-01T00:00:00.000Z' };
    generateData = { apiKey: 'bwh_abc123', createdAt: '2026-01-01T00:00:00.000Z' };
    render(<ApiKeySection />);

    expect(screen.getByDisplayValue('bwh_abc123')).toBeInTheDocument();
    expect(screen.getByText(/won't be able to see it again/i)).toBeInTheDocument();
  });

  it('calls revoke when the revoke button is clicked (happy path)', async () => {
    statusData = { hasKey: true, createdAt: '2026-01-01T00:00:00.000Z' };
    render(<ApiKeySection />);

    await userEvent.click(screen.getByRole('button', { name: /revoke/i }));

    expect(revokeMock).toHaveBeenCalled();
  });

  it('shows the server error message when generating fails (negative case)', () => {
    statusData = { hasKey: false };
    generateError = new ApiError(500, 'Something broke');
    render(<ApiKeySection />);

    expect(screen.getByText('Something broke')).toBeInTheDocument();
  });
});
