import { resolveJobPosting } from '@bewerber/scrapers';

// This file is injected via chrome.scripting.executeScript({ files: [...] }),
// not declared as a manifest content script. Its result is read from
// InjectionResult.result, which Chrome sets to the completion value of the
// injected script.
//
// This MUST stay a single top-level expression statement (an IIFE, here) —
// splitting it into a `const extraction = ...` statement followed by a
// separate expression statement was tried and broke completion-value
// capture entirely (verified live: every field came back empty, not just
// postedAt). Chrome's completion-value tracking for chrome.scripting results
// doesn't reliably follow strict multi-statement ECMAScript completion
// semantics the way a script run in a normal page context would. Statements
// *inside* the IIFE's body are unaffected by this — it's only the top level
// that has to stay a single expression.
(() => {
  const extraction = resolveJobPosting(location.href, document);

  // chrome.scripting.executeScript's result serialization does not preserve
  // Date objects at all — verified live: a returned Date arrives on the
  // receiving end as a plain empty object `{}` (Date has no own enumerable
  // properties; only its prototype methods carry the actual value, and those
  // don't survive whatever copy chrome.scripting uses). The original value
  // is unrecoverably lost by then, so this is the only place it can
  // actually be fixed — converting to an ISO string here, before the value
  // leaves this context, since plain strings do cross the boundary intact.
  return extraction.postedAt
    ? {
        ...extraction,
        postedAt: { ...extraction.postedAt, value: extraction.postedAt.value.toISOString() },
      }
    : extraction;
})();
