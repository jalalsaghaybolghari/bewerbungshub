import { useEffect, useState } from 'react';
import { captureActiveTab, CaptureError, type CaptureResult } from '../lib/capture';
import { CaptureForm } from './CaptureForm';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; result: CaptureResult };

export function CaptureView() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    captureActiveTab()
      .then((result) => {
        if (!cancelled) setState({ status: 'ready', result });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof CaptureError ? err.message : 'Could not read this page.';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return <p className="p-4 text-sm text-slate">Reading this page…</p>;
  }

  if (state.status === 'error') {
    return <p className="p-4 text-sm text-danger">{state.message}</p>;
  }

  return <CaptureForm url={state.result.url} extraction={state.result.extraction} />;
}
