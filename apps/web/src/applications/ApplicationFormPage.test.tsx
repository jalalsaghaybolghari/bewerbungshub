import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationFormPage } from './ApplicationFormPage';
import type { Application, ApplicationDetailResponse } from './types';

let detailData: ApplicationDetailResponse | undefined;
const createMock = vi.fn();
const updateMock = vi.fn();

vi.mock('./api', () => ({
  useApplication: () => ({ data: detailData }),
  useCreateApplication: () => ({ mutateAsync: createMock, error: null }),
  useUpdateApplication: () => ({ mutateAsync: updateMock, error: null }),
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
    relatedLinks: [],
    favorite: false,
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

  it('adds a related link row that accepts a label and url (happy path)', async () => {
    renderAt('/applications/new');

    await userEvent.click(screen.getByRole('button', { name: /add link/i }));
    await userEvent.type(screen.getByPlaceholderText(/label/i), 'Recruiter LinkedIn');
    await userEvent.type(screen.getByPlaceholderText(/^url$/i), 'https://linkedin.com/in/x');

    expect(screen.getByDisplayValue('Recruiter LinkedIn')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://linkedin.com/in/x')).toBeInTheDocument();
  });

  it('hides the "Add link" button once the 5-link maximum is reached (edge case)', async () => {
    detailData = {
      application: makeApplication({
        relatedLinks: Array.from({ length: 5 }, (_, i) => ({
          label: `Link ${i}`,
          url: `https://example.com/${i}`,
        })),
      }),
      events: [],
      interviews: [],
      followUps: [],
    };
    renderAt('/applications/app-1/edit');

    expect(await screen.findByDisplayValue('Link 4')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add link/i })).not.toBeInTheDocument();
  });

  it('removes a related link row when its remove button is clicked (happy path)', async () => {
    detailData = {
      application: makeApplication({
        relatedLinks: [{ label: 'Recruiter LinkedIn', url: 'https://linkedin.com/in/x' }],
      }),
      events: [],
      interviews: [],
      followUps: [],
    };
    renderAt('/applications/app-1/edit');

    expect(await screen.findByDisplayValue('Recruiter LinkedIn')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /remove link/i }));

    expect(screen.queryByDisplayValue('Recruiter LinkedIn')).not.toBeInTheDocument();
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

  it('loads an existing HTML job description into the rich-text editor (happy path)', async () => {
    detailData = {
      application: makeApplication({
        jobDescription: '<p>Ship <strong>features</strong>.</p>',
      }),
      events: [],
      interviews: [],
      followUps: [],
    };
    renderAt('/applications/app-1/edit');

    // Two async hops before it lands: ApplicationFormPage's own reset()
    // effect, then RichTextEditor's own resync effect reacting to that.
    // Custom matcher, not the plain string form: ProseMirror renders
    // "Ship "/"features"/"." as sibling text nodes around <strong>, so no
    // single node's own text content equals the full sentence.
    expect(
      await screen.findByText(
        (_, el) => el?.tagName === 'P' && el.textContent === 'Ship features.',
      ),
    ).toBeInTheDocument();
  });

  it('loads an existing Markdown-ish job description (from the extension) with real formatting (happy path)', async () => {
    detailData = {
      application: makeApplication({ jobDescription: '## Responsibilities\n\n- Ship features' }),
      events: [],
      interviews: [],
      followUps: [],
    };
    renderAt('/applications/app-1/edit');

    expect(await screen.findByRole('heading', { name: 'Responsibilities' })).toBeInTheDocument();
    expect(screen.queryByText(/## Responsibilities/)).not.toBeInTheDocument();
  });
});
