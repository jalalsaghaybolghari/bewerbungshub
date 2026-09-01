import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationFormPage } from './ApplicationFormPage';
import type { Application, ApplicationDetailResponse } from './types';

let detailData: ApplicationDetailResponse | undefined;

vi.mock('./api', () => ({
  useApplication: () => ({ data: detailData }),
  useCreateApplication: () => ({ mutateAsync: vi.fn(), error: null }),
  useUpdateApplication: () => ({ mutateAsync: vi.fn(), error: null }),
}));

vi.mock('../cvs/api', () => ({
  useCvs: () => ({ data: [] }),
}));

function makeApplication(overrides: Partial<Application>): Application {
  return {
    _id: 'app-1',
    jobTitle: 'Backend Engineer',
    company: { name: 'Acme' },
    location: { raw: 'Berlin' },
    jobDescription: 'Build things.',
    applyLink: 'https://example.com/job',
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

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/applications/new" element={<ApplicationFormPage />} />
        <Route path="/applications/:id/edit" element={<ApplicationFormPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ApplicationFormPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
    detailData = undefined;
  });

  it('shows the source URL as a read-only, copiable field when editing a captured application (happy path)', () => {
    detailData = {
      application: makeApplication({ sourceUrl: 'https://www.linkedin.com/jobs/view/123' }),
      events: [],
      interviews: [],
      followUps: [],
    };
    renderAt('/applications/app-1/edit');

    const input = screen.getByDisplayValue('https://www.linkedin.com/jobs/view/123');
    expect(input).toHaveAttribute('readonly');
  });

  it('does not show a source URL field when the application has none (edge case)', () => {
    detailData = {
      application: makeApplication({ sourceUrl: undefined }),
      events: [],
      interviews: [],
      followUps: [],
    };
    renderAt('/applications/app-1/edit');

    expect(screen.queryByText(/original posting/i)).not.toBeInTheDocument();
  });

  it('does not show a source URL field when creating a new application (negative case)', () => {
    renderAt('/applications/new');

    expect(screen.queryByText(/original posting/i)).not.toBeInTheDocument();
  });
});
