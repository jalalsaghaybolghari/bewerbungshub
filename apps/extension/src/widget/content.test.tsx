import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveJobPostingMock = vi.fn();
vi.mock('@bewerber/scrapers', () => ({
  resolveJobPosting: (...args: unknown[]) => resolveJobPostingMock(...args),
}));

vi.mock('./index.css?inline', () => ({ default: '/* widget styles */' }));

const widgetPropsSpy = vi.fn();
vi.mock('./Widget', () => ({
  Widget: (props: unknown) => {
    widgetPropsSpy(props);
    return null;
  },
}));

beforeEach(() => {
  document.body.innerHTML = '';
  vi.resetModules();
  resolveJobPostingMock.mockReset();
  widgetPropsSpy.mockReset();
});

describe('widget content script', () => {
  it('mounts a shadow-DOM host and passes the extraction to Widget on first injection (happy path)', async () => {
    resolveJobPostingMock.mockReturnValue({
      jobTitle: { value: 'Engineer', confidence: 0.9, source: 'json-ld' },
    });

    await import('./content');

    const host = document.getElementById('bewerber-widget-host');
    expect(host).not.toBeNull();
    expect(host?.shadowRoot).not.toBeNull();
    // createRoot's initial render isn't necessarily flushed synchronously
    // within the same microtask as the import, and StrictMode
    // double-invokes it in development — assert on the latest call rather
    // than an exact count.
    await vi.waitFor(() => expect(widgetPropsSpy).toHaveBeenCalled());
    expect(widgetPropsSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      extraction: { jobTitle: { value: 'Engineer', confidence: 0.9, source: 'json-ld' } },
    });
  });

  it('removes the host on a second injection instead of mounting a second one (toggle off, happy path)', async () => {
    resolveJobPostingMock.mockReturnValue({});

    await import('./content');
    expect(document.getElementById('bewerber-widget-host')).not.toBeNull();

    vi.resetModules();
    await import('./content');

    expect(document.getElementById('bewerber-widget-host')).toBeNull();
  });

  it('the onClose handler passed to Widget also unmounts and removes the host (happy path)', async () => {
    resolveJobPostingMock.mockReturnValue({});
    await import('./content');
    await vi.waitFor(() => expect(widgetPropsSpy).toHaveBeenCalled());

    const props = widgetPropsSpy.mock.calls.at(-1)?.[0] as { onClose: () => void };
    props.onClose();

    expect(document.getElementById('bewerber-widget-host')).toBeNull();
  });

  it('passes an error to Widget instead of throwing when extraction fails (negative case)', async () => {
    resolveJobPostingMock.mockImplementation(() => {
      throw new Error('boom');
    });

    await import('./content');

    expect(document.getElementById('bewerber-widget-host')).not.toBeNull();
    await vi.waitFor(() => expect(widgetPropsSpy).toHaveBeenCalled());
    expect(widgetPropsSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      extractionError: 'Could not read this page. Try a regular job posting page.',
    });
  });
});
