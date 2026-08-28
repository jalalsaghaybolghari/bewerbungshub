import { resolveJobPosting } from '@bewerber/scrapers';

// This file is injected via chrome.scripting.executeScript({ files: [...] }),
// not declared as a manifest content script. Its result is read from
// InjectionResult.result, which Chrome sets to the completion value of the
// injected script — so this call must stay the last top-level expression
// statement (no wrapping function, no export).
resolveJobPosting(location.href, document);
