import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationsListPage } from './ApplicationsListPage';
import type { Application, ApplicationsListResponse } from './types';

let listData: ApplicationsListResponse | undefined;
let isLoading = false;
let isError = false;
const deleteMock = vi.fn();
const useApplicationsMock = vi.fn();
const updateMock = vi.fn();

vi.mock('./api', () => ({
  useApplications: (...args: unknown[]) => {
    useApplicationsMock(...args);
    return { data: listData, isLoading, isError };
  },
  useDeleteApplication: () => ({ mutate: deleteMock }),
  useUpdateApplication: () => ({ mutate: updateMock, isPending: false }),
  // DuplicatesReviewModal only mounts once "Find similar" is clicked, but
  // it shares this same './api' module — an empty result is enough for the
  // one test below that opens it.
  useDuplicatePairs: () => ({ data: { pairs: [] }, isLoading: false, isError: false }),
  useMergeApplications: () => ({ mutate: vi.fn() }),
}));

// ApplicationQuickViewModal (rendered for real, not mocked) pulls in
// useCvs — without this it'd hit react-query with no QueryClientProvider
// in scope, since useApplications/useDeleteApplication above are mocked
// away entirely and no provider is set up for this test file.
vi.mock('../cvs/api', () => ({
  useCvs: () => ({ data: [] }),
  openCvFile: vi.fn(),
}));

function makeApplication(overrides: Partial<Application>): Application {
  return {
    _id: 'app-1',
    jobTitle: 'Backend Engineer',
    company: { name: 'Acme' },
    location: { raw: 'Berlin' },
    jobDescription: '',
    applyLink: 'https://example.com/job',
    applyType: 'linkedin',
    status: 'applied',
    statusChangedAt: '2026-01-01T00:00:00.000Z',
    statusSetBy: 'user',
    followUpCount: 0,
    tags: [],
    relatedLinks: [],
    favorite: false,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ApplicationsListPage />
    </MemoryRouter>,
  );
}

describe('ApplicationsListPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
    listData = undefined;
    isLoading = false;
    isError = false;
  });

  it('shows the created date and an apply link for each application (happy path)', () => {
    listData = {
      items: [
        makeApplication({
          _id: 'app-1',
          applyLink: 'https://example.com/jobs/123',
          createdAt: '2026-01-02T00:00:00.000Z',
        }),
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    };
    renderPage();

    expect(
      screen.getByText(new Date('2026-01-02T00:00:00.000Z').toLocaleDateString()),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /apply link/i });
    expect(link).toHaveAttribute('href', 'https://example.com/jobs/123');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('does not render the apply link icon when the stored URL has an unsafe scheme (negative case — stored XSS guard)', () => {
    listData = {
      items: [makeApplication({ applyLink: 'javascript:alert(1)' })],
      total: 1,
      page: 1,
      pageSize: 20,
    };
    renderPage();

    expect(screen.queryByRole('link', { name: /apply link/i })).not.toBeInTheDocument();
  });

  it('shows a dash in the Sent column for a draft application, not a fabricated date (edge case)', () => {
    listData = {
      items: [makeApplication({ status: 'draft', sentAt: undefined })],
      total: 1,
      page: 1,
      pageSize: 20,
    };
    renderPage();

    // Both Sent and Posted are unset here, so two dashes are expected —
    // this just confirms neither column invents a date from createdAt.
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('deletes an application after the user confirms (happy path)', async () => {
    listData = { items: [makeApplication({})], total: 1, page: 1, pageSize: 20 };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(deleteMock).toHaveBeenCalledWith('app-1');
  });

  it('does not delete when the user cancels the confirmation (negative case)', async () => {
    listData = { items: [makeApplication({})], total: 1, page: 1, pageSize: 20 };
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('opens the quick-view modal with the job description when the view icon is clicked (happy path)', async () => {
    listData = {
      items: [makeApplication({ jobDescription: 'We build great software.' })],
      total: 1,
      page: 1,
      pageSize: 20,
    };
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /view details/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('We build great software.')).toBeInTheDocument();
  });

  it('closes the quick-view modal when the close button is clicked (edge case)', async () => {
    listData = { items: [makeApplication({})], total: 1, page: 1, pageSize: 20 };
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /view details/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /close/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('defaults to sorting by newest-created first (happy path)', () => {
    listData = { items: [makeApplication({})], total: 1, page: 1, pageSize: 20 };
    renderPage();

    expect(useApplicationsMock).toHaveBeenCalledWith(
      expect.objectContaining({ sort: '-createdAt' }),
    );
  });

  it('defaults the status filter to Draft (happy path)', () => {
    listData = { items: [makeApplication({ status: 'draft' })], total: 1, page: 1, pageSize: 20 };
    renderPage();

    expect(useApplicationsMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft' }));
    expect(screen.getByRole('combobox')).toHaveValue('draft');
  });

  it('switching the status filter updates the query (happy path)', async () => {
    listData = { items: [makeApplication({})], total: 1, page: 1, pageSize: 20 };
    renderPage();

    await userEvent.selectOptions(screen.getByRole('combobox'), '');

    expect(useApplicationsMock).toHaveBeenLastCalledWith(expect.objectContaining({ status: '' }));
  });

  it('clicking a sortable column header sorts descending by that column first (happy path)', async () => {
    listData = { items: [makeApplication({})], total: 1, page: 1, pageSize: 20 };
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Location' }));

    expect(useApplicationsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: '-location.raw' }),
    );
  });

  it('opens the duplicates review modal when "Find similar" is clicked (happy path)', async () => {
    listData = { items: [makeApplication({})], total: 1, page: 1, pageSize: 20 };
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /find similar/i }));

    expect(screen.getByText(/possible duplicates/i)).toBeInTheDocument();
  });

  it('clicking the already-descending column a second time flips to ascending (edge case)', async () => {
    listData = { items: [makeApplication({})], total: 1, page: 1, pageSize: 20 };
    renderPage();

    // Created starts descending by default (the page's initial sort).
    await userEvent.click(screen.getByRole('button', { name: 'Created' }));

    expect(useApplicationsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'createdAt' }),
    );
  });

  it('favorites an application when its star is clicked (happy path)', async () => {
    listData = { items: [makeApplication({ favorite: false })], total: 1, page: 1, pageSize: 20 };
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /add to favorites/i }));

    expect(updateMock).toHaveBeenCalledWith({ favorite: true });
  });

  it('unfavorites an already-favorited application when its star is clicked (edge case)', async () => {
    listData = { items: [makeApplication({ favorite: true })], total: 1, page: 1, pageSize: 20 };
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /remove from favorites/i }));

    expect(updateMock).toHaveBeenCalledWith({ favorite: false });
  });

  it('requests favorite=true from the API when the favorites filter is toggled on (happy path)', async () => {
    listData = { items: [makeApplication({})], total: 1, page: 1, pageSize: 20 };
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /^favorites$/i }));

    expect(useApplicationsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ favorite: true }),
    );
  });

  it('drops the favorite filter when toggled back off (negative case)', async () => {
    listData = { items: [makeApplication({})], total: 1, page: 1, pageSize: 20 };
    renderPage();

    const toggle = screen.getByRole('button', { name: /^favorites$/i });
    await userEvent.click(toggle);
    await userEvent.click(toggle);

    expect(useApplicationsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ favorite: undefined }),
    );
  });
});
