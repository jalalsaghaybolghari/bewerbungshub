import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationQuickViewModal } from './ApplicationQuickViewModal';
import type { Application } from './types';

let cvsData: { _id: string; label: string }[] | undefined;

vi.mock('../cvs/api', () => ({
  useCvs: () => ({ data: cvsData }),
  openCvFile: vi.fn(),
}));

function renderModal(application: Application, onClose = vi.fn()) {
  return render(
    <MemoryRouter>
      <ApplicationQuickViewModal application={application} onClose={onClose} />
    </MemoryRouter>,
  );
}

function makeApplication(overrides: Partial<Application>): Application {
  return {
    _id: 'app-1',
    jobTitle: 'Backend Engineer',
    company: { name: 'Acme' },
    location: { raw: 'Berlin' },
    jobDescription: 'Build the thing.',
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

describe('ApplicationQuickViewModal', () => {
  afterEach(() => {
    vi.clearAllMocks();
    cvsData = undefined;
  });

  it('shows a separate "original posting" link when sourceUrl differs from applyLink (happy path)', () => {
    renderModal(
      makeApplication({
        applyLink: 'https://acme.example.com/careers/backend-engineer',
        sourceUrl: 'https://www.linkedin.com/jobs/view/123',
      }),
    );

    expect(screen.getByRole('link', { name: /apply link/i })).toHaveAttribute(
      'href',
      'https://acme.example.com/careers/backend-engineer',
    );
    expect(screen.getByRole('link', { name: /original posting/i })).toHaveAttribute(
      'href',
      'https://www.linkedin.com/jobs/view/123',
    );
  });

  it('still shows the original-posting field even when sourceUrl matches applyLink (edge case)', () => {
    // True for every thin adapter (AMS/Xing/StepStone/Indeed never find a
    // distinct off-site apply URL) — consistency beats deduping here, so
    // this must show regardless, not just when the two happen to differ.
    renderModal(
      makeApplication({
        applyLink: 'https://jobs.ams.at/public/emps/jobs/abc',
        sourceUrl: 'https://jobs.ams.at/public/emps/jobs/abc',
      }),
    );

    expect(screen.getByRole('link', { name: /original posting/i })).toHaveAttribute(
      'href',
      'https://jobs.ams.at/public/emps/jobs/abc',
    );
  });

  it('does not show an original-posting link when sourceUrl is absent (negative case)', () => {
    renderModal(makeApplication({}));

    expect(screen.queryByRole('link', { name: /original posting/i })).not.toBeInTheDocument();
  });

  it('shows the CV label and a "no CV" message when none is attached (edge case)', () => {
    cvsData = [{ _id: 'cv-1', label: 'Main resume' }];
    const { rerender } = render(
      <MemoryRouter>
        <ApplicationQuickViewModal
          application={makeApplication({ cvId: 'cv-1' })}
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /main resume/i })).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <ApplicationQuickViewModal application={makeApplication({})} onClose={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/no cv attached/i)).toBeInTheDocument();
  });

  it('shows each related link as a clickable link with its label (happy path)', () => {
    renderModal(
      makeApplication({
        relatedLinks: [
          { label: 'Recruiter LinkedIn', url: 'https://linkedin.com/in/x' },
          { label: 'Company site', url: 'https://acme.example.com' },
        ],
      }),
    );

    expect(screen.getByRole('link', { name: /recruiter linkedin/i })).toHaveAttribute(
      'href',
      'https://linkedin.com/in/x',
    );
    expect(screen.getByRole('link', { name: /company site/i })).toHaveAttribute(
      'href',
      'https://acme.example.com',
    );
  });

  it('does not show a related links section when there are none (negative case)', () => {
    renderModal(makeApplication({}));

    expect(screen.queryByText(/related links/i)).not.toBeInTheDocument();
  });

  it('does not render a related link with a javascript: URL as clickable (negative case — stored XSS guard)', () => {
    renderModal(
      makeApplication({
        relatedLinks: [{ label: 'Looks safe', url: 'javascript:alert(document.cookie)' }],
      }),
    );

    expect(screen.queryByRole('link', { name: /looks safe/i })).not.toBeInTheDocument();
    expect(screen.getByText(/looks safe/i)).toBeInTheDocument();
  });

  it('does not render the apply link as clickable when it has an unsafe scheme (negative case — stored XSS guard)', () => {
    renderModal(makeApplication({ applyLink: 'javascript:alert(1)' }));

    expect(screen.queryByRole('link', { name: /apply link/i })).not.toBeInTheDocument();
  });

  it('shows related links before the CV section when both are present (happy path)', () => {
    renderModal(
      makeApplication({
        relatedLinks: [{ label: 'Recruiter LinkedIn', url: 'https://linkedin.com/in/x' }],
      }),
    );

    const relatedLinksHeading = screen.getByText(/related links/i);
    const cvHeading = screen.getByText(/^cv$/i);
    expect(
      relatedLinksHeading.compareDocumentPosition(cvHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows an edit link in the header that opens the edit page in a new tab (happy path)', () => {
    renderModal(makeApplication({ _id: 'app-42' }));

    const editLink = screen.getByRole('link', { name: /edit/i });
    expect(editLink).toHaveAttribute('href', '/applications/app-42/edit');
    expect(editLink).toHaveAttribute('target', '_blank');
    expect(editLink).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('shows the location as a link to Google Maps (happy path)', () => {
    renderModal(makeApplication({ location: { raw: 'Berlin, Germany' } }));

    const mapsLink = screen.getByRole('link', { name: /berlin, germany/i });
    expect(mapsLink).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=Berlin%2C%20Germany',
    );
    expect(mapsLink).toHaveAttribute('target', '_blank');
  });
});
