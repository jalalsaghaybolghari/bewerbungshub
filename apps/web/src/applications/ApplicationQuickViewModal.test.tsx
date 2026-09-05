import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationQuickViewModal } from './ApplicationQuickViewModal';
import type { Application } from './types';

let cvsData: { _id: string; label: string }[] | undefined;

vi.mock('../cvs/api', () => ({
  useCvs: () => ({ data: cvsData }),
  openCvFile: vi.fn(),
}));

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
    render(
      <ApplicationQuickViewModal
        application={makeApplication({
          applyLink: 'https://acme.example.com/careers/backend-engineer',
          sourceUrl: 'https://www.linkedin.com/jobs/view/123',
        })}
        onClose={vi.fn()}
      />,
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
    render(
      <ApplicationQuickViewModal
        application={makeApplication({
          applyLink: 'https://jobs.ams.at/public/emps/jobs/abc',
          sourceUrl: 'https://jobs.ams.at/public/emps/jobs/abc',
        })}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('link', { name: /original posting/i })).toHaveAttribute(
      'href',
      'https://jobs.ams.at/public/emps/jobs/abc',
    );
  });

  it('does not show an original-posting link when sourceUrl is absent (negative case)', () => {
    render(<ApplicationQuickViewModal application={makeApplication({})} onClose={vi.fn()} />);

    expect(screen.queryByRole('link', { name: /original posting/i })).not.toBeInTheDocument();
  });

  it('shows the CV label and a "no CV" message when none is attached (edge case)', () => {
    cvsData = [{ _id: 'cv-1', label: 'Main resume' }];
    const { rerender } = render(
      <ApplicationQuickViewModal
        application={makeApplication({ cvId: 'cv-1' })}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /main resume/i })).toBeInTheDocument();

    rerender(<ApplicationQuickViewModal application={makeApplication({})} onClose={vi.fn()} />);
    expect(screen.getByText(/no cv attached/i)).toBeInTheDocument();
  });

  it('shows each related link as a clickable link with its label (happy path)', () => {
    render(
      <ApplicationQuickViewModal
        application={makeApplication({
          relatedLinks: [
            { label: 'Recruiter LinkedIn', url: 'https://linkedin.com/in/x' },
            { label: 'Company site', url: 'https://acme.example.com' },
          ],
        })}
        onClose={vi.fn()}
      />,
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
    render(<ApplicationQuickViewModal application={makeApplication({})} onClose={vi.fn()} />);

    expect(screen.queryByText(/related links/i)).not.toBeInTheDocument();
  });

  it('does not render a related link with a javascript: URL as clickable (negative case — stored XSS guard)', () => {
    render(
      <ApplicationQuickViewModal
        application={makeApplication({
          relatedLinks: [{ label: 'Looks safe', url: 'javascript:alert(document.cookie)' }],
        })}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole('link', { name: /looks safe/i })).not.toBeInTheDocument();
    expect(screen.getByText(/looks safe/i)).toBeInTheDocument();
  });

  it('does not render the apply link as clickable when it has an unsafe scheme (negative case — stored XSS guard)', () => {
    render(
      <ApplicationQuickViewModal
        application={makeApplication({ applyLink: 'javascript:alert(1)' })}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole('link', { name: /apply link/i })).not.toBeInTheDocument();
  });

  it('shows related links before the CV section when both are present (happy path)', () => {
    render(
      <ApplicationQuickViewModal
        application={makeApplication({
          relatedLinks: [{ label: 'Recruiter LinkedIn', url: 'https://linkedin.com/in/x' }],
        })}
        onClose={vi.fn()}
      />,
    );

    const relatedLinksHeading = screen.getByText(/related links/i);
    const cvHeading = screen.getByText(/^cv$/i);
    expect(
      relatedLinksHeading.compareDocumentPosition(cvHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
