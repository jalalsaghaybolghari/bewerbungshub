import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatesReviewModal } from './DuplicatesReviewModal';
import type { Application, DuplicateGroupsResponse } from './types';

let pairsData: DuplicateGroupsResponse | undefined;
let isLoading = false;
let isError = false;
const mergeMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('./api', () => ({
  useDuplicatePairs: () => ({ data: pairsData, isLoading, isError }),
  useMergeApplications: () => ({ mutate: mergeMock }),
  useDeleteApplication: () => ({ mutate: deleteMock }),
}));

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

describe('DuplicatesReviewModal', () => {
  afterEach(() => {
    vi.clearAllMocks();
    pairsData = undefined;
    isLoading = false;
    isError = false;
  });

  it('renders a pair with both applications (happy path)', () => {
    pairsData = {
      pairs: [
        {
          a: makeApplication({ _id: 'app-1', jobTitle: 'Backend Engineer' }),
          b: makeApplication({ _id: 'app-2', jobTitle: 'Backend Engineer, Senior' }),
          titleSimilarity: 0.7,
          companySimilarity: 1,
          locationSimilarity: 1,
        },
      ],
    };
    render(<DuplicatesReviewModal onClose={vi.fn()} />);

    expect(screen.getByText('Backend Engineer')).toBeInTheDocument();
    expect(screen.getByText('Backend Engineer, Senior')).toBeInTheDocument();
    expect(screen.getByText(/70%/)).toBeInTheDocument();
    expect(screen.getByText(/100%/)).toBeInTheDocument();
  });

  it('merges into side A and removes the pair from view on success (happy path)', async () => {
    pairsData = {
      pairs: [
        {
          a: makeApplication({ _id: 'app-1' }),
          b: makeApplication({ _id: 'app-2' }),
          titleSimilarity: 0.9,
          companySimilarity: 1,
          locationSimilarity: 1,
        },
      ],
    };
    mergeMock.mockImplementation((_vars, { onSuccess }: { onSuccess: () => void }) => onSuccess());
    render(<DuplicatesReviewModal onClose={vi.fn()} />);

    await userEvent.click(screen.getAllByRole('button', { name: /keep this one/i })[0]);

    expect(mergeMock).toHaveBeenCalledWith(
      { keepId: 'app-1', mergeId: 'app-2' },
      expect.anything(),
    );
    expect(screen.getByText(/no likely duplicates found/i)).toBeInTheDocument();
  });

  it('deletes one side and removes the pair from view on success (edge case)', async () => {
    pairsData = {
      pairs: [
        {
          a: makeApplication({ _id: 'app-1' }),
          b: makeApplication({ _id: 'app-2' }),
          titleSimilarity: 0.9,
          companySimilarity: 1,
          locationSimilarity: 1,
        },
      ],
    };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    deleteMock.mockImplementation((_id, { onSuccess }: { onSuccess: () => void }) => onSuccess());
    render(<DuplicatesReviewModal onClose={vi.fn()} />);

    await userEvent.click(screen.getAllByRole('button', { name: /^delete$/i })[0]);

    expect(deleteMock).toHaveBeenCalledWith('app-1', expect.anything());
    expect(screen.getByText(/no likely duplicates found/i)).toBeInTheDocument();
  });

  it('resolving one pair leaves other pairs untouched (edge case)', async () => {
    pairsData = {
      pairs: [
        {
          a: makeApplication({ _id: 'app-1', jobTitle: 'Backend Engineer' }),
          b: makeApplication({ _id: 'app-2', jobTitle: 'Backend Engineer' }),
          titleSimilarity: 1,
          companySimilarity: 1,
          locationSimilarity: 1,
        },
        {
          a: makeApplication({ _id: 'app-3', jobTitle: 'Frontend Engineer' }),
          b: makeApplication({ _id: 'app-4', jobTitle: 'Frontend Engineer' }),
          titleSimilarity: 1,
          companySimilarity: 1,
          locationSimilarity: 1,
        },
      ],
    };
    mergeMock.mockImplementation((_vars, { onSuccess }: { onSuccess: () => void }) => onSuccess());
    render(<DuplicatesReviewModal onClose={vi.fn()} />);

    await userEvent.click(screen.getAllByRole('button', { name: /keep this one/i })[0]);

    expect(screen.getAllByText('Frontend Engineer')).toHaveLength(2);
    expect(screen.queryByText(/no likely duplicates found/i)).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no pairs (negative case)', () => {
    pairsData = { pairs: [] };
    render(<DuplicatesReviewModal onClose={vi.fn()} />);

    expect(screen.getByText(/no likely duplicates found/i)).toBeInTheDocument();
  });

  it('shows an error state when the query fails (negative case)', () => {
    isError = true;
    render(<DuplicatesReviewModal onClose={vi.fn()} />);

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });
});
