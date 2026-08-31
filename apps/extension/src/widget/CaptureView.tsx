import type { ExtractedJobPosting } from '@bewerber/scrapers';
import { CaptureForm } from './CaptureForm';

// Purely presentational now — extraction happens synchronously in
// content.tsx (it runs in the same page context the widget is mounted
// into, no chrome.scripting.executeScript round-trip needed), so there's
// nothing left here to wait on.
export function CaptureView({
  url,
  extraction,
  error,
  onClose,
}: {
  url: string;
  extraction?: ExtractedJobPosting;
  error?: string;
  onClose: () => void;
}) {
  if (error) {
    return <p className="p-4 text-sm text-danger">{error}</p>;
  }

  return <CaptureForm url={url} extraction={extraction ?? {}} onClose={onClose} />;
}
